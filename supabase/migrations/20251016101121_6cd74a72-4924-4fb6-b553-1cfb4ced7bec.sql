-- Delete all bookings and users data
-- This will clean up all user-related records and bookings

-- Delete voucher redemptions first (references bookings)
DELETE FROM voucher_redemptions;

-- Delete refunds (references payments)
DELETE FROM refunds;

-- Delete payments (references bookings)
DELETE FROM payments;

-- Delete subscription invoices (references subscriptions)
DELETE FROM subscription_invoices;

-- Delete waitlist entries (references users)
DELETE FROM waitlist;

-- Delete bookings (references users)
DELETE FROM bookings;

-- Delete subscriptions (references users)
DELETE FROM subscriptions;

-- Delete vouchers (references users)
DELETE FROM vouchers;

-- Delete all users
DELETE FROM users_shadow;
