
-- 1A: Nueva tabla quipu_invoices
CREATE TABLE IF NOT EXISTS quipu_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  quipu_invoice_id text NOT NULL,
  quipu_invoice_number text,
  quipu_contact_id text,
  invoice_type text NOT NULL DEFAULT 'simplified_invoice',
  amount numeric NOT NULL,
  vat_percent numeric NOT NULL,
  status text NOT NULL DEFAULT 'created',
  pdf_url text,
  pdf_url_auth text,
  error_message text,
  created_by_admin_email text,
  is_automatic boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE quipu_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read quipu_invoices"
  ON quipu_invoices FOR SELECT
  USING (is_panel_admin());

CREATE POLICY "Service role can write quipu_invoices"
  ON quipu_invoices FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_quipu_invoices_booking_id ON quipu_invoices(booking_id);
CREATE INDEX idx_quipu_invoices_payment_id ON quipu_invoices(payment_id);

-- 1B: Campos fiscales opcionales en users_shadow
ALTER TABLE users_shadow
  ADD COLUMN IF NOT EXISTS fiscal_name text,
  ADD COLUMN IF NOT EXISTS nif text,
  ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS fiscal_address text,
  ADD COLUMN IF NOT EXISTS fiscal_city text,
  ADD COLUMN IF NOT EXISTS fiscal_zip text;

-- 1C: Configuración de Quipu en settings
INSERT INTO settings (key, value) VALUES
  ('quipu.enabled', 'false'),
  ('quipu.auto_invoice', 'false'),
  ('quipu.app_id', '""'),
  ('quipu.app_secret', '""'),
  ('quipu.vat_percent', '10')
ON CONFLICT (key) DO NOTHING;
