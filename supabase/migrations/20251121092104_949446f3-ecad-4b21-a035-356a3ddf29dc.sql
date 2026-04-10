-- Cancel the excess booking from the next cycle (Dec 10th)
-- There are 9 bookings in the next cycle (Nov 22 - Dec 22) when the limit is 8
UPDATE bookings
SET status = 'cancelled',
    updated_at = now()
WHERE id = 'ceb2888a-d71a-474f-bc42-eddeb9594508'
  AND origin = 'subscription'
  AND status != 'cancelled';