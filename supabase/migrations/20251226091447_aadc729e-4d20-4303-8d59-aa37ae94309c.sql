-- Delete all test data in correct order (respecting foreign keys)

-- 1. Delete voucher redemptions (references vouchers and bookings)
DELETE FROM voucher_redemptions;

-- 2. Delete payments (references bookings)
DELETE FROM payments;

-- 3. Delete refunds (references payments - already empty after payments delete)
DELETE FROM refunds;

-- 4. Delete bookings
DELETE FROM bookings;

-- 5. Delete vouchers
DELETE FROM vouchers;

-- 6. Delete subscription invoices (references subscriptions)
DELETE FROM subscription_invoices;

-- 7. Delete subscriptions
DELETE FROM subscriptions;

-- 8. Delete waitlist
DELETE FROM waitlist;

-- 9. Finally delete users
DELETE FROM users_shadow;