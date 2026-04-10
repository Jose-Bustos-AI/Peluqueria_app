# Despliegue Híbrido - Frontend en Vercel, Backend en Supabase

## Arquitectura
- **Frontend**: Desplegado en Vercel
- **Backend**: Edge Functions, Base de Datos y Auth en Supabase
- **Webhooks**: Stripe webhooks apuntan a Supabase Edge Functions

## Configuración de Variables de Entorno en Vercel

### Production Environment
```
VITE_SUPABASE_URL=https://gxofivnfnzefpfkzwqpe.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4b2Zpdm5mbnplZnBma3p3cXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2ODk4ODUsImV4cCI6MjA3MzI2NTg4NX0.gwJoN-KHIbDmAq8KWCmMECEzMSqObvaoIpH9QjTDXN8
VITE_SUPABASE_PROJECT_ID=gxofivnfnzefpfkzwqpe
```

### Preview Environment
Configurar las mismas variables para que las ramas pre-release funcionen.

## Estrategia de Despliegue

### Branch Strategy
- **Main**: Producción estable
- **release/vercel-hybrid**: Branch específico para despliegues híbridos
- **Preview**: Cualquier PR o branch temporal

### CORS Configuration
Los dominios permitidos en Edge Functions incluyen:
- Dominio personalizado (si aplica)
- *.vercel.app (para previews)
- localhost (para desarrollo)

## Checklist de Verificación Post-Deploy

### Funcionalidad Frontend
- [ ] Rutas internas (/admin, /dashboard) no devuelven 404 al refrescar
- [ ] Widget público accesible en `/widget-embed.v2.js`
- [ ] Assets servidos con cache inmutable desde `/assets/*`

### Integración Backend
- [ ] Llamadas a Edge Functions funcionan desde Vercel
- [ ] CORS configurado correctamente para todos los dominios
- [ ] Stripe webhooks siguen apuntando a Supabase (no a Vercel)
- [ ] Autenticación funciona correctamente

### Performance
- [ ] Cache headers configurados para assets estáticos
- [ ] SPA routing funciona sin 404
- [ ] Tiempos de carga optimizados

## URLs Finales
- **Frontend**: https://tu-app.vercel.app
- **API/Backend**: https://gxofivnfnzefpfkzwqpe.supabase.co/functions/v1/
- **Database**: https://gxofivnfnzefpfkzwqpe.supabase.co
- **Widget**: https://tu-app.vercel.app/widget-embed.v2.js

## Notas Importantes
- Los secretos de Stripe y Service Role Key permanecen SOLO en Supabase
- Las variables públicas (VITE_*) se configuran en Vercel
- Los webhooks de Stripe deben apuntar a Supabase Edge Functions, no a Vercel