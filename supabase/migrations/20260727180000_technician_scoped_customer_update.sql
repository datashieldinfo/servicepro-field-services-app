-- Fix silent failure: TechnicianDashboard updates customers.next_appointment after
-- completing a job, but no RLS policy allowed 'technician' to write to public.customers
-- at all, so the update was being rejected by RLS while the UI reported success.
--
-- Grant technicians a narrowly scoped ability to bump next_appointment / last_service_date
-- on customers they have an assigned appointment for — not full edit access to the
-- customer's master record (name/phone/email/address/contract/warranty stay
-- admin/owner/manager-only, enforced below via trigger since RLS is row- not
-- column-scoped).

CREATE OR REPLACE FUNCTION public.restrict_technician_customer_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acting_role text;
BEGIN
  SELECT role INTO acting_role FROM public.profiles WHERE id = auth.uid();

  IF acting_role = 'technician' THEN
    IF NEW.name IS DISTINCT FROM OLD.name
       OR NEW.phone IS DISTINCT FROM OLD.phone
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.address IS DISTINCT FROM OLD.address
       OR NEW.contract_type IS DISTINCT FROM OLD.contract_type
       OR NEW.warranty_expires IS DISTINCT FROM OLD.warranty_expires
       OR NEW.device_install_date IS DISTINCT FROM OLD.device_install_date
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'Technicians may only update next_appointment and last_service_date on customers';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restrict_technician_customer_update_trigger ON public.customers;
CREATE TRIGGER restrict_technician_customer_update_trigger
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_technician_customer_update();

DROP POLICY IF EXISTS "Technicians can update their customers next appointment" ON public.customers;
CREATE POLICY "Technicians can update their customers next appointment"
  ON public.customers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments
      WHERE appointments.customer_id = customers.id
        AND appointments.technician_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.appointments
      WHERE appointments.customer_id = customers.id
        AND appointments.technician_id = auth.uid()
    )
  );
