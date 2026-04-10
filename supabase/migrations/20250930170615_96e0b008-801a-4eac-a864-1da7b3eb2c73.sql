-- Añadir campo de capacidad por sesión/franja a subscription_plans
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS capacity_per_session INTEGER DEFAULT NULL;

COMMENT ON COLUMN subscription_plans.capacity_per_session IS 'Máximo de personas que pueden reservar la misma franja horaria con esta suscripción';