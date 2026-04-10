# Verificación por Email al Reservar con Bono

## Descripción
Sistema de verificación por email previo a la reserva con bono que permite comprobar si el usuario tiene créditos activos antes de proceder con la reserva.

## Rutas Implementadas

### Nueva Ruta de Verificación
- **Ruta**: `#/bonos/:voucherTypeId/verificar`
- **Componente**: `VoucherCheck`
- **Parámetros URL**: 
  - `professionalId` (query param)
  - `locationId` (query param)

### Flujo de Navegación
1. **Ficha del Bono** → Botón "Reservar con este bono" → `#/bonos/:voucherTypeId/verificar`
2. **Verificación por Email** → Si tiene créditos → Calendario de reserva
3. **Sin Créditos** → Redirección automática → `#/bonos/:voucherTypeId/comprar`

## Componentes Nuevos

### VoucherCheck
**Ubicación**: `src/components/widget/VoucherCheck.tsx`

**Props**:
- `voucherTypeId: string` - ID del tipo de bono
- `professionalId?: string` - ID del profesional (opcional)
- `onBack: () => void` - Callback para volver
- `onVerified: (voucherId: string, userId: string) => void` - Callback cuando se verifica exitosamente
- `onNeedsVoucher: () => void` - Callback cuando no tiene créditos

**Funcionalidades**:
- Campo de email obligatorio (con validación)
- Campos opcionales de nombre y apellidos
- Resolución/creación automática de usuario en `users_shadow`
- Verificación de bonos elegibles por tipo
- Selector de bono si tiene múltiples opciones
- Guardado automático en localStorage

## Lógica de Verificación

### 1. Resolución de Usuario
```sql
-- Buscar usuario existente
SELECT id FROM users_shadow WHERE email = :email

-- Si no existe, crear nuevo
INSERT INTO users_shadow {
  email: email_normalizado,
  name: nombre_completo || email_usuario,
  app_user_id: 'widget:' + email
}
```

### 2. Verificación de Bonos Elegibles
```sql
SELECT id, voucher_type_id, sessions_remaining, expiry_date, status
FROM vouchers 
WHERE user_id = :userId 
  AND voucher_type_id = :voucherTypeId 
  AND status = 'active'
  AND sessions_remaining > 0
  AND (expiry_date IS NULL OR expiry_date >= now())
```

### 3. Decisión de Flujo
- **✅ Tiene créditos**: Continúa al calendario con `voucherId` específico
- **❌ Sin créditos**: Redirección automática a compra de bono
- **🔄 Múltiples bonos**: Muestra selector para elegir cuál usar

## Consumo de Créditos

### En BookingConfirmation
- Usa `voucherId` específico si viene de verificación
- Crea reserva con `origin: 'voucher'` y `payment_method: 'none'`
- Registra consumo en `voucher_redemptions`
- Rollback automático si falla la redención

### Payload de Reserva
```javascript
{
  service_id: null, // Para vouchers genéricos
  professional_id: "<id>",
  location_id: "<id>",
  user_id: "<userId>",
  start_at: "<UTC>",
  end_at: "<UTC>",
  status: "pending",
  origin: "voucher",
  payment_method: "none",
  payment_status: "unpaid"
}
```

### Registro de Redención
```javascript
{
  voucher_id: "<voucherId>",
  booking_id: "<bookingId>",
  credits_used: 1,
  status: "captured"
}
```

## Eventos y Logs

### Logs de Desarrollo
- `[VoucherCheck] email=<email> voucherTypeId=<id>`
- `[VoucherCheck] eligible vouchers=<n> chosen=<voucherId>`
- `[Booking] origin=voucher payment_method=none`
- `[Voucher] redemption booking=<id> voucher=<id>`

### LocalStorage
- `reservasPro_user`: Datos del usuario (email, nombre, userShadowId)
- `reservasPro_verifiedVoucherId`: ID del voucher verificado específico

## Casos de Prueba

### A. Usuario con Bono Activo
1. Ingresa email válido
2. Sistema encuentra bono con créditos > 0
3. Continúa al calendario
4. Confirma reserva → crea booking + redención

### B. Usuario sin Créditos
1. Ingresa email válido
2. No encuentra bonos o todos sin créditos
3. Muestra toast "Sin bonos activos"
4. Redirección automática a compra

### C. Múltiples Bonos del Mismo Tipo
1. Ingresa email válido
2. Encuentra 2+ bonos elegibles
3. Muestra selector con créditos restantes
4. Usuario elige → continúa con ese `voucherId`

### D. Validación de Parámetros
1. URL sin `voucherId` → Error y redirección
2. Reserva sin voucher verificado → Busca automáticamente

### E. Rollback en Error
1. Falla `voucher_redemptions`
2. Elimina booking creado
3. Muestra error al usuario

## Integraciones

### Sin Cambios en:
- ✅ Lógica de disponibilidad (calendario)
- ✅ Webhooks existentes  
- ✅ Esquema/RLS de base de datos
- ✅ Payloads v1 de bookings

### Modificado:
- 📝 `VoucherDetailView` - Navegación a verificación
- 📝 `Widget.tsx` - Nueva ruta y manejo de estado
- 📝 `BookingConfirmation` - Uso de voucherId específico si existe