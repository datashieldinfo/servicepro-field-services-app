/*
  # Contracts count their own visits

  `contracts.visits_used` was a number somebody had to remember to type. It is
  now derived: every completed visit that falls inside a contract's period
  counts against that contract, recomputed whenever a visit or the contract
  itself changes.

  That makes "visits remaining" trustworthy, which is what the expiry and
  last-visit alerts are built on.
*/

CREATE OR REPLACE FUNCTION refresh_contract_usage(cust uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE contracts c
     SET visits_used = (
       SELECT count(*)
         FROM appointments a
        WHERE a.customer_id   = c.customer_id
          AND a.status        = 'completed'
          AND a.scheduled_at >= c.start_date::timestamptz
          AND a.scheduled_at  < (c.end_date + 1)::timestamptz
     )
   WHERE c.customer_id = cust;
$$;

/* A visit changing state re-counts that customer's contracts. */
CREATE OR REPLACE FUNCTION sync_contract_usage_from_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_contract_usage(OLD.customer_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_contract_usage(NEW.customer_id);

  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM refresh_contract_usage(OLD.customer_id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_contract_usage_trg ON appointments;
CREATE TRIGGER sync_contract_usage_trg
  AFTER INSERT OR UPDATE OF status, scheduled_at, customer_id OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION sync_contract_usage_from_appointment();

/* A new contract, or one whose dates moved, counts itself immediately. */
CREATE OR REPLACE FUNCTION sync_contract_usage_from_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM refresh_contract_usage(NEW.customer_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_contract_usage_on_contract_trg ON contracts;
CREATE TRIGGER sync_contract_usage_on_contract_trg
  AFTER INSERT OR UPDATE OF start_date, end_date, customer_id ON contracts
  FOR EACH ROW EXECUTE FUNCTION sync_contract_usage_from_contract();

/* Count what is already on the books. */
UPDATE contracts c
   SET visits_used = (
     SELECT count(*)
       FROM appointments a
      WHERE a.customer_id   = c.customer_id
        AND a.status        = 'completed'
        AND a.scheduled_at >= c.start_date::timestamptz
        AND a.scheduled_at  < (c.end_date + 1)::timestamptz
   );
