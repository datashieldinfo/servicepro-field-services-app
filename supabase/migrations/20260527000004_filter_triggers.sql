/*
  # Filter Trigger Function

  Creates check_filter_triggers() SECURITY DEFINER function that:
  - part_due medium: filter next_due <= today+14
  - part_due high: filter health_percent < 25
  - unknown_history medium: customers with no filter_status
  - warranty medium: warranty_expires <= today+30

  Trigger fires AFTER INSERT OR UPDATE on filter_status FOR EACH STATEMENT.
  SECURITY DEFINER so it can insert without RLS.
*/

CREATE OR REPLACE FUNCTION check_filter_triggers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- part_due (medium): next_due within 14 days
  INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by)
  SELECT DISTINCT fs.customer_id,
    'part_due', 'medium',
    'Filter ' || fs.filter_type || ' at ' || fs.location || ' needs replacement soon',
    'system'
  FROM filter_status fs
  WHERE fs.next_due IS NOT NULL
    AND fs.next_due <= CURRENT_DATE + INTERVAL '14 days'
    AND NOT EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.customer_id = fs.customer_id
        AND sr.trigger_type = 'part_due'
        AND sr.urgency = 'medium'
        AND sr.status = 'pending'
        AND sr.created_at > NOW() - INTERVAL '7 days'
    );

  -- part_due (high): health < 25%
  INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by)
  SELECT DISTINCT fs.customer_id,
    'part_due', 'high',
    'Filter ' || fs.filter_type || ' is in critical condition (' || fs.health_percent || '% health remaining)',
    'system'
  FROM filter_status fs
  WHERE fs.health_percent < 25
    AND NOT EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.customer_id = fs.customer_id
        AND sr.trigger_type = 'part_due'
        AND sr.urgency = 'high'
        AND sr.status = 'pending'
        AND sr.created_at > NOW() - INTERVAL '7 days'
    );

  -- unknown_history (medium): customers with no filter_status rows
  INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by)
  SELECT c.id,
    'unknown_history', 'medium',
    'No filter history on record for this customer - assessment visit recommended',
    'system'
  FROM customers c
  WHERE NOT EXISTS (SELECT 1 FROM filter_status fs WHERE fs.customer_id = c.id)
    AND NOT EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.customer_id = c.id
        AND sr.trigger_type = 'unknown_history'
        AND sr.status = 'pending'
        AND sr.created_at > NOW() - INTERVAL '30 days'
    );

  -- warranty (medium): expires within 30 days
  INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by)
  SELECT c.id,
    'warranty', 'medium',
    'Device warranty expires on ' || TO_CHAR(c.warranty_expires, 'DD/MM/YYYY'),
    'system'
  FROM customers c
  WHERE c.warranty_expires IS NOT NULL
    AND c.warranty_expires <= CURRENT_DATE + INTERVAL '30 days'
    AND c.warranty_expires >= CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.customer_id = c.id
        AND sr.trigger_type = 'warranty'
        AND sr.status = 'pending'
        AND sr.created_at > NOW() - INTERVAL '14 days'
    );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS check_triggers_on_filter_change ON filter_status;

CREATE TRIGGER check_triggers_on_filter_change
  AFTER INSERT OR UPDATE ON filter_status
  FOR EACH STATEMENT
  EXECUTE FUNCTION check_filter_triggers();
