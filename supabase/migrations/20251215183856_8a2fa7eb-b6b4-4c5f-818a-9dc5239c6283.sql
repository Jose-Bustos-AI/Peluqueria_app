DROP VIEW IF EXISTS vw_bookings_complete;

CREATE VIEW vw_bookings_complete AS
SELECT 
  b.id,
  b.start_at,
  b.end_at,
  b.status,
  b.type,
  b.origin,
  b.payment_status,
  b.payment_method,
  b.notes,
  b.created_at,
  b.updated_at,
  b.reminder_1h_sent,
  b.reminder_1h_sent_at,
  b.reminder_1h_message_id,
  b.user_id as customer_id,
  u.name as customer_name,
  u.email as customer_email,
  u.phone as customer_phone,
  b.service_id,
  s.name as service_name,
  b.class_id,
  c.name as class_name,
  b.professional_id,
  p.name as professional_name,
  b.location_id,
  l.name as location_name
FROM bookings b
LEFT JOIN users_shadow u ON b.user_id = u.id
LEFT JOIN services s ON b.service_id = s.id
LEFT JOIN classes c ON b.class_id = c.id
LEFT JOIN professionals p ON b.professional_id = p.id
LEFT JOIN locations l ON b.location_id = l.id;