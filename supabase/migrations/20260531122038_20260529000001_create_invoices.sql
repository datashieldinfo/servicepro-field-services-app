-- Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number text UNIQUE NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  technician_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  service_type text NOT NULL DEFAULT '',
  parts_used jsonb DEFAULT '[]'::jsonb NOT NULL,
  labor_cost numeric(10,2) DEFAULT 0 NOT NULL,
  parts_cost numeric(10,2) DEFAULT 0 NOT NULL,
  total_amount numeric(10,2) DEFAULT 0 NOT NULL,
  payment_method text DEFAULT 'cash' NOT NULL
    CHECK (payment_method IN ('cash', 'bank_transfer', 'cliq', 'other')),
  payment_status text DEFAULT 'pending' NOT NULL
    CHECK (payment_status IN ('pending', 'paid', 'partial')),
  notes text DEFAULT '',
  issued_at timestamptz DEFAULT now() NOT NULL,
  paid_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id    ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_appointment_id ON public.invoices(appointment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by     ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_at      ON public.invoices(issued_at DESC);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Technicians can insert invoices they created
CREATE POLICY "Technicians can insert own invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- All authenticated users can read invoices they own (as tech or customer)
CREATE POLICY "Users can read relevant invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.get_my_role() IN ('admin', 'owner')
    OR customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );

-- Admins and owners can update invoices (e.g. mark paid)
CREATE POLICY "Admins and owners can update invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('admin', 'owner'))
  WITH CHECK (public.get_my_role() IN ('admin', 'owner'));

-- Admins and owners can delete invoices
CREATE POLICY "Admins and owners can delete invoices"
  ON public.invoices FOR DELETE TO authenticated
  USING (public.get_my_role() IN ('admin', 'owner'));
