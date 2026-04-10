# Plan de Migración Multi-Tenant

## Paso 1 — Base de Datos y Esquema
- Crear tabla `organizations` (slug, name, branding, stripe keys cifradas)
- Añadir `organization_id` a todas las tablas operativas existentes
- Reescribir todas las políticas RLS para aislar datos por organización
- Crear función helper `get_my_organization_id()` para optimizar RLS

## Paso 2 — Edge Functions
- Identificar todas las funciones que usan Stripe
- Reemplazar lectura de env global por clave dinámica desde tabla organizations
- Adaptar webhooks (Stripe, Quipu, n8n) para enrutar al tenant correcto según origen

## Paso 3 — Frontend Admin
- Crear panel super-admin para crear/gestionar organizaciones
- Formulario seguro para ingresar credenciales Stripe por tenant
- Cifrado de claves antes de guardar en DB

## Paso 4 — PWA y Widget
- Widget de reservas acepta parámetro ?slug=X en el script de inicialización
- Carga colores, logo y configuración desde DB según slug
- Genera manifest.json dinámico por organización

## Paso 5 — Sistema de Auth (post-migración)
- Reemplazar el sistema de identificación de usuarios del widget
- Actualmente: app_user_id = 'widget:email' sin cuenta real en Supabase Auth
- Objetivo: registro y login real con Supabase Auth para clientes finales
- Cada usuario Auth pertenece a una organización (organization_id en su perfil)
- Migrar users_shadow a perfiles reales vinculados a auth.uid()
- Flujo: registro → verificación email → acceso al widget con sesión real

## Reglas arquitectónicas
- Aislamiento: organization_id en TODAS las tablas operativas
- RLS estricto: usuario solo accede a datos de su organización
- Stripe independiente por tenant: NO usar Stripe Connect
- Claves Stripe cifradas en DB, nunca en variables de entorno globales
