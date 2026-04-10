-- Drop the existing constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

-- Add the updated constraint with all valid payment methods
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check 
CHECK (payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'stripe'::text, 'voucher'::text, 'none'::text]));