/*
  # Where the stock is, where it came from, and who moved it

  `inventory.quantity` was a single number somebody edited in place. It could
  not answer the questions the store actually gets asked: how many are in which
  branch, when was this last filled and by whom, who took the last four out, and
  when does this batch expire.

  1. `branches`
    Stock locations — a main store seeded here, more added from the screen
    (second store, a technician's van). Every movement belongs to one.

  2. `inventory_transactions`
    The ledger: direction (in/out), a reason, the branch, the quantity, who
    performed it, who it came from or went to, an optional batch and expiry, and
    a free note. Existing stock is carried in as an opening balance so the
    ledger and the counter agree from the first day.

  3. `inventory_branch_stock`
    Per-branch quantity, last fill and nearest expiry, derived from the ledger.
    `security_invoker` so the caller's RLS still applies.

  4. `inventory.quantity` stays true
    A movement recomputes the item's total. A quantity typed directly into the
    old inventory screen writes its own 'adjustment' row, so the two can never
    drift apart.
*/

/* ── 1. branches ─────────────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS branches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  name_ar    text,
  kind       text NOT NULL DEFAULT 'store' CHECK (kind IN ('store', 'van', 'workshop')),
  address    text DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS branches_name_key ON branches (name);
/* Exactly one default branch: it is where opening balances and untargeted
   movements land. */
CREATE UNIQUE INDEX IF NOT EXISTS branches_single_default ON branches (is_default) WHERE is_default;

INSERT INTO branches (name, name_ar, kind, is_default)
SELECT 'Main Store', 'المستودع الرئيسي', 'store', true
WHERE NOT EXISTS (SELECT 1 FROM branches);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_branches" ON branches;
CREATE POLICY "staff_manage_branches" ON branches
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'))
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "staff_read_branches" ON branches;
CREATE POLICY "staff_read_branches" ON branches
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('admin', 'owner', 'manager', 'technician'));

/* ── 2. the ledger ───────────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  branch_id      uuid NOT NULL REFERENCES branches(id),
  direction      text NOT NULL CHECK (direction IN ('in', 'out')),
  reason         text NOT NULL DEFAULT 'purchase'
                      CHECK (reason IN ('opening', 'purchase', 'return', 'transfer',
                                        'issue', 'consumption', 'damage', 'adjustment')),
  quantity       integer NOT NULL CHECK (quantity > 0),
  unit_cost      numeric(10,2),
  /* the supplier it came from, or the technician / customer it went to */
  counterparty   text DEFAULT '',
  reference      text DEFAULT '',
  batch_no       text DEFAULT '',
  expiry_date    date,
  note           text DEFAULT '',
  performed_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_tx_item_idx    ON inventory_transactions (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_tx_branch_idx  ON inventory_transactions (branch_id);
CREATE INDEX IF NOT EXISTS inventory_tx_expiry_idx  ON inventory_transactions (expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_inventory_tx" ON inventory_transactions;
CREATE POLICY "staff_manage_inventory_tx" ON inventory_transactions
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'))
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "technicians_read_inventory_tx" ON inventory_transactions;
CREATE POLICY "technicians_read_inventory_tx" ON inventory_transactions
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('admin', 'owner', 'manager', 'technician'));

/* A technician consuming parts on a job records the movement itself. */
DROP POLICY IF EXISTS "technicians_log_consumption" ON inventory_transactions;
CREATE POLICY "technicians_log_consumption" ON inventory_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_role() = 'technician'
    AND direction = 'out'
    AND reason IN ('consumption', 'issue')
    AND performed_by = auth.uid()
  );

/* ── 3. per-branch stock ─────────────────────────────────────────────────── */

DROP VIEW IF EXISTS inventory_branch_stock;
CREATE VIEW inventory_branch_stock
WITH (security_invoker = on) AS
SELECT
  t.item_id,
  t.branch_id,
  b.name    AS branch_name,
  b.name_ar AS branch_name_ar,
  COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.quantity ELSE -t.quantity END), 0)::int AS quantity,
  MAX(t.created_at)  FILTER (WHERE t.direction = 'in') AS last_in_at,
  MIN(t.expiry_date) FILTER (WHERE t.direction = 'in' AND t.expiry_date >= CURRENT_DATE) AS next_expiry
FROM inventory_transactions t
JOIN branches b ON b.id = t.branch_id
GROUP BY t.item_id, t.branch_id, b.name, b.name_ar;

GRANT SELECT ON inventory_branch_stock TO authenticated;

/* ── 4. keeping inventory.quantity honest ────────────────────────────────── */

CREATE OR REPLACE FUNCTION refresh_inventory_quantity(item uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  /* tells the inventory trigger below that this write came from the ledger */
  PERFORM set_config('app.syncing_inventory', 'on', true);

  UPDATE inventory i
     SET quantity = COALESCE((
       SELECT SUM(CASE WHEN t.direction = 'in' THEN t.quantity ELSE -t.quantity END)
         FROM inventory_transactions t
        WHERE t.item_id = i.id
     ), 0)
   WHERE i.id = item;

  PERFORM set_config('app.syncing_inventory', 'off', true);
END $$;

CREATE OR REPLACE FUNCTION sync_inventory_from_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM refresh_inventory_quantity(COALESCE(NEW.item_id, OLD.item_id));
  IF TG_OP = 'UPDATE' AND OLD.item_id IS DISTINCT FROM NEW.item_id THEN
    PERFORM refresh_inventory_quantity(OLD.item_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS sync_inventory_from_transaction_trg ON inventory_transactions;
CREATE TRIGGER sync_inventory_from_transaction_trg
  AFTER INSERT OR UPDATE OR DELETE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION sync_inventory_from_transaction();

/*
  The old inventory screen writes `quantity` straight onto the row. Rather than
  forbid that, turn it into a movement: the difference is booked at the default
  branch as an adjustment, so the ledger explains every number it shows.
*/
CREATE OR REPLACE FUNCTION log_inventory_quantity_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta  int;
  branch uuid;
BEGIN
  IF current_setting('app.syncing_inventory', true) = 'on' THEN
    RETURN NEW;
  END IF;

  delta := NEW.quantity - OLD.quantity;
  IF delta = 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO branch FROM branches WHERE is_default ORDER BY created_at LIMIT 1;
  IF branch IS NULL THEN
    SELECT id INTO branch FROM branches ORDER BY created_at LIMIT 1;
  END IF;
  IF branch IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO inventory_transactions
    (item_id, branch_id, direction, reason, quantity, performed_by, note)
  VALUES
    (NEW.id, branch,
     CASE WHEN delta > 0 THEN 'in' ELSE 'out' END,
     'adjustment', abs(delta), auth.uid(), 'Stock corrected on the inventory screen');

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS log_inventory_quantity_edit_trg ON inventory;
CREATE TRIGGER log_inventory_quantity_edit_trg
  AFTER UPDATE OF quantity ON inventory
  FOR EACH ROW
  WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity)
  EXECUTE FUNCTION log_inventory_quantity_edit();

/* Carry today's stock in, so the ledger starts where the shelves are. */
INSERT INTO inventory_transactions (item_id, branch_id, direction, reason, quantity, note)
SELECT i.id, (SELECT id FROM branches WHERE is_default ORDER BY created_at LIMIT 1),
       'in', 'opening', i.quantity, 'Opening balance'
  FROM inventory i
 WHERE i.quantity > 0
   AND NOT EXISTS (SELECT 1 FROM inventory_transactions t WHERE t.item_id = i.id);
