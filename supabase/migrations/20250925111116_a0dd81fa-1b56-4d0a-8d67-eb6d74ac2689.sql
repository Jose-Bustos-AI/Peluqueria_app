-- Clean up test data from database
-- Delete in proper order to respect foreign key constraints

-- Delete voucher redemptions first
DELETE FROM voucher_redemptions;

-- Delete refunds
DELETE FROM refunds;

-- Delete payments
DELETE FROM payments;

-- Delete subscription invoices
DELETE FROM subscription_invoices;

-- Delete bookings
DELETE FROM bookings;

-- Delete subscriptions
DELETE FROM subscriptions;

-- Delete vouchers
DELETE FROM vouchers;

-- Delete users_shadow (test users)
DELETE FROM users_shadow;

-- Delete waitlist entries
DELETE FROM waitlist;

-- Delete outbound webhooks (test webhook calls)
DELETE FROM outbound_webhooks;