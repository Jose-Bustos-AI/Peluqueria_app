# Proyecto: Clínica SaaS → Plataforma Multi-Tenant

## Stack
- Frontend: React 18, TypeScript 5, Vite 5, Tailwind CSS v3, shadcn/ui
- Mobile/PWA: Capacitor
- Backend: Supabase Cloud (PostgreSQL, Auth, Storage)
- Edge Functions: Deno (en /supabase/functions/)
- Integraciones: Stripe, n8n, Quipu
- Origen del código: generado con Lovable

## Objetivo activo
Migrar de single-tenant a plataforma white-label multi-tenant.
Ver /docs/migration-plan.md para el plan completo.

## Reglas de trabajo obligatorias
- NUNCA ejecutar migraciones SQL sin confirmación explícita del usuario
- NUNCA borrar código existente sin mostrar primero qué se va a borrar
- Avanzar un bloque a la vez, esperar confirmación antes del siguiente
- Si detectas un riesgo de seguridad, reportarlo ANTES de escribir código
- Mostrar siempre el script completo antes de ejecutarlo