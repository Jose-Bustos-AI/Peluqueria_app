-- Add pack system columns to subscription_plans table
-- These columns allow creating hierarchical plans with different tiers

-- Add parent_plan_id to create hierarchy (nullable for backward compatibility)
ALTER TABLE subscription_plans 
ADD COLUMN parent_plan_id UUID REFERENCES subscription_plans(id) ON DELETE CASCADE;

-- Add pack_type to identify the type of plan/pack
ALTER TABLE subscription_plans 
ADD COLUMN pack_type TEXT DEFAULT NULL;

-- Add index for better query performance
CREATE INDEX idx_subscription_plans_parent_id ON subscription_plans(parent_plan_id);

-- Add comment for documentation
COMMENT ON COLUMN subscription_plans.parent_plan_id IS 'NULL for main plans, or references parent plan for packs';
COMMENT ON COLUMN subscription_plans.pack_type IS 'Type of pack: NULL for regular plans, "main" for parent plans, "basic"/"intermediate"/"premium" for pack variants';