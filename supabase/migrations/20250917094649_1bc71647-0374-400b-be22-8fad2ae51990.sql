-- Política RLS más específica para vouchers según instrucciones
-- Solo si es necesario para permitir inserts del widget
DROP POLICY IF EXISTS "widget_insert_vouchers" ON public.vouchers;

CREATE POLICY "widget_insert_vouchers"
ON public.vouchers FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IS NOT NULL);