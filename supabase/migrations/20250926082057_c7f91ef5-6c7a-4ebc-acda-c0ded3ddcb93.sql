-- Delete all test data in the correct order to avoid foreign key violations

-- First delete voucher redemptions
DELETE FROM voucher_redemptions;

-- Delete payments related to bookings
DELETE FROM payments WHERE booking_id IS NOT NULL;

-- Delete refunds related to payments
DELETE FROM refunds;

-- Finally delete all bookings
DELETE FROM bookings;