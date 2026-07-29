/*
  # Keep customers.next_appointment / last_service_date in step with visits

  Until now only the technician's completion flow wrote `next_appointment`, so a
  visit booked by the office left the customer row looking untouched — a newly
  registered customer with an installation already booked still showed "—" in
  the customer list.

  A trigger on `appointments` recomputes both dates for the affected customer on
  every insert, update or delete, so every screen that books or cancels a visit
  keeps the customer row honest without having to remember to.

  - `next_appointment`  = the earliest still-open visit from today onwards
  - `last_service_date` = the most recent completed visit
*/

CREATE OR REPLACE FUNCTION refresh_customer_visit_dates(target uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE customers c
     SET next_appointment = (
           SELECT MIN(a.scheduled_at)::date
             FROM appointments a
            WHERE a.customer_id = c.id
              AND a.status IN ('pending', 'in_progress', 'awaiting_approval')
              AND a.scheduled_at >= date_trunc('day', now())
         ),
         last_service_date = (
           SELECT MAX(a.scheduled_at)::date
             FROM appointments a
            WHERE a.customer_id = c.id
              AND a.status = 'completed'
         )
   WHERE c.id = target;
$$;

CREATE OR REPLACE FUNCTION sync_customer_visit_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_customer_visit_dates(OLD.customer_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_customer_visit_dates(NEW.customer_id);

  -- A visit moved to another customer must refresh the old one too.
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM refresh_customer_visit_dates(OLD.customer_id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_customer_visit_dates_trg ON appointments;
CREATE TRIGGER sync_customer_visit_dates_trg
  AFTER INSERT OR UPDATE OF scheduled_at, status, customer_id OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION sync_customer_visit_dates();

/* Backfill every customer that already has visits. */
UPDATE customers c
   SET next_appointment = sub.next_appt,
       last_service_date = sub.last_service
  FROM (
    SELECT cu.id,
           (SELECT MIN(a.scheduled_at)::date FROM appointments a
             WHERE a.customer_id = cu.id
               AND a.status IN ('pending', 'in_progress', 'awaiting_approval')
               AND a.scheduled_at >= date_trunc('day', now())) AS next_appt,
           (SELECT MAX(a.scheduled_at)::date FROM appointments a
             WHERE a.customer_id = cu.id
               AND a.status = 'completed') AS last_service
      FROM customers cu
  ) AS sub
 WHERE c.id = sub.id
   AND (c.next_appointment IS DISTINCT FROM sub.next_appt
        OR c.last_service_date IS DISTINCT FROM sub.last_service);
