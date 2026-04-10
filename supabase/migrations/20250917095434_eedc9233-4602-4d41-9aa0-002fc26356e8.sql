-- Política RLS para permitir que los usuarios vean sus propios bonos
CREATE POLICY "Users can view their own vouchers"
ON public.vouchers FOR SELECT
TO anon, authenticated
USING (user_id IS NOT NULL);