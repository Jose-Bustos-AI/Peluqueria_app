-- Actualizar constraint para permitir rol superadmin
ALTER TABLE admin_users DROP CONSTRAINT admin_users_role_check;

-- Crear nuevo constraint que permite manager, employee y superadmin
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check 
CHECK (role = ANY (ARRAY['manager'::text, 'employee'::text, 'superadmin'::text]));