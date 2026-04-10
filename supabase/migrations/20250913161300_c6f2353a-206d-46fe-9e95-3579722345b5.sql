-- Add RLS policies for voucher management by panel admins

-- VOUCHER_TYPES - Allow panel admins to manage voucher types
CREATE POLICY "Panel admins can manage voucher_types"
ON public.voucher_types
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

-- VOUCHERS - Allow panel admins to read, update and delete vouchers
CREATE POLICY "Panel admins can read vouchers"
ON public.vouchers
FOR SELECT
TO authenticated
USING (is_panel_admin());

CREATE POLICY "Panel admins can update vouchers"
ON public.vouchers
FOR UPDATE
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

CREATE POLICY "Panel admins can delete vouchers"
ON public.vouchers
FOR DELETE
TO authenticated
USING (is_panel_admin());

-- VOUCHER_TYPE_CATEGORIES - Allow panel admins to manage relationships
CREATE POLICY "Panel admins can manage voucher_type_categories"
ON public.voucher_type_categories
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

-- VOUCHER_TYPE_SERVICES - Allow panel admins to manage relationships  
CREATE POLICY "Panel admins can manage voucher_type_services"
ON public.voucher_type_services
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

-- VOUCHER_REDEMPTIONS - Allow panel admins to manage redemptions
CREATE POLICY "Panel admins can manage voucher_redemptions"
ON public.voucher_redemptions
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());