-- =============================================================
-- SCRIPT 5A: Auth real para clientes del widget
-- =============================================================

-- 1. Añadir columna auth_user_id a users_shadow
ALTER TABLE public.users_shadow
  ADD COLUMN auth_user_id UUID REFERENCES auth.users(id);

-- 2. Índice único parcial (un auth user = un shadow user)
CREATE UNIQUE INDEX idx_users_shadow_auth_user_id
  ON public.users_shadow(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- 3. Corregir políticas RLS para usar auth_user_id

DROP POLICY IF EXISTS "user_select_own_shadow" ON public.users_shadow;
DROP POLICY IF EXISTS "user_update_own_shadow" ON public.users_shadow;

CREATE POLICY "user_select_own_shadow"
  ON public.users_shadow FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "user_update_own_shadow"
  ON public.users_shadow FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "user_insert_own_shadow"
  ON public.users_shadow FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "anon_insert_shadow_legacy"
  ON public.users_shadow FOR INSERT
  TO anon
  WITH CHECK (auth_user_id IS NULL);
