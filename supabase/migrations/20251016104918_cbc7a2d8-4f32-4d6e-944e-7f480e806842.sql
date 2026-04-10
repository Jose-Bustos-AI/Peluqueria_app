-- Delete all data from tables in correct order to avoid foreign key violations

-- Delete voucher redemptions (references bookings)
DELETE FROM voucher_redemptions;

-- Delete refunds (references payments)
DELETE FROM refunds;

-- Delete payments (references bookings and subscription_invoices)
DELETE FROM payments;

-- Delete subscription invoices (references subscriptions)
DELETE FROM subscription_invoices;

-- Delete waitlist (references users)
DELETE FROM waitlist;

-- Delete bookings (references users)
DELETE FROM bookings;

-- Delete subscriptions (references users)
DELETE FROM subscriptions;

-- Delete vouchers (references users)
DELETE FROM vouchers;

-- Delete shadow users
DELETE FROM users_shadow;