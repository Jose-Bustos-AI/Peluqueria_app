# Voucher Flow - Email Verification and Booking System

## Overview
This document describes the voucher verification and booking flow that allows users to verify their vouchers by email and make bookings using voucher credits.

## Flow Diagram

```
1. Voucher Detail → "Reservar con este bono" 
2. Voucher Check (#/bonos/:voucherTypeId/verificar)
3. Email verification + voucher eligibility check
4. Service/Category selection
5. Calendar (no blocking redirects)
6. Confirmation (final validation + credit consumption)
7. Success
```

## Routes

### New Routes
- `#/bonos/:voucherTypeId/verificar` - Email verification screen (VoucherCheck component)

### Route Parameters
- `voucherTypeId` - The ID of the voucher type being verified
- Optional query params: `professionalId`, `locationId`

## Components

### VoucherCheck.tsx
- Handles email verification
- Resolves or creates user in `users_shadow` table
- Checks for eligible vouchers of the specified type
- Shows voucher selection modal if multiple vouchers exist
- Persists voucher flow state to localStorage

### VoucherBookingCalendar.tsx
- Checks voucher flow state for allowed services
- Removes blocking redirects to purchase
- Shows informational warnings instead of blocking
- Allows navigation to confirmation for final validation

### BookingConfirmation.tsx
- Final voucher eligibility validation
- Anti-double-click protection with `hasSubmitted` state
- Prioritizes specific `voucherId` from voucher flow
- Creates booking with `origin='voucher'` and `payment_method='none'`
- Consumes 1 credit via `voucher_redemptions` table
- Includes rollback logic if redemption fails

## State Management

### localStorage Keys
- `reservasPro_user` - User data (email, name, userShadowId)
- `reservasPro_voucherFlow` - Voucher flow state

### VoucherFlow State Structure
```typescript
{
  origin: 'voucher',
  voucherId: string,
  voucherTypeId: string,
  allowedServiceIds: string[],
  lockedProfessionalId?: string,
  timestamp: number
}
```

## Database Operations

### Voucher Eligibility Check
1. Resolve user by email in `users_shadow`
2. Query active vouchers for user and voucher type
3. Check service compatibility via:
   - `voucher_type_services` (direct service mapping)
   - `voucher_type_categories` → `services` (category-based mapping)
4. Filter by credits remaining and expiry date

### Booking Creation
1. Create booking record with `origin='voucher'`
2. Insert voucher redemption record
3. Rollback booking if redemption fails

## Key Features

### Anti-Double-Click Protection
- `hasSubmitted` state prevents multiple submissions
- Button shows "Reserva procesada" after submission
- Existing redemption check prevents double credit consumption

### Soft Calendar Guards
- Calendar shows warnings instead of blocking navigation
- Final validation happens in confirmation screen
- Service compatibility checked against `allowedServiceIds`

### Error Handling
- Graceful fallbacks for missing voucher flow state
- Clear error messages for expired or invalid vouchers
- Rollback mechanisms for failed operations

## Logging

### Key Log Messages
- `[VoucherCheck] email=<email> userId=<id>`
- `[VoucherCheck] eligible vouchers=<count> chosen=<voucherId>`
- `[VoucherFlow] set voucherId=<id> allowedServiceIds=<count>`
- `[Calendar] slotClick service=<id> allowed=<bool> origin=voucher`
- `[Confirm] voucher revalidate ok user=<id> voucher=<id>`
- `[Voucher] redemption booking=<id> voucher=<id>`

## Testing Scenarios

### A. Valid Voucher Flow
1. User has active voucher with credits
2. Email verification succeeds
3. Service selection allowed
4. Calendar navigation works
5. Confirmation creates booking and consumes credit

### B. Invalid Service
1. User selects service not covered by voucher
2. Calendar shows "Servicio no incluido" toast
3. User redirected to service selection

### C. Expired/Invalid Voucher
1. Verification finds no eligible vouchers
2. User redirected to voucher purchase

### D. Double Submission Protection
1. User clicks confirm button multiple times
2. Only one booking and redemption created
3. Button shows "Reserva procesada" state

### E. Missing State Recovery
1. User refreshes page during flow
2. Missing voucher flow detected
3. User redirected to verification screen

## API Endpoints

No new API endpoints required. Uses existing:
- `users_shadow` table for user resolution
- `vouchers` table for eligibility checks
- `voucher_redemptions` table for credit consumption
- `bookings` table for reservation creation

## Security Considerations

- Email normalization (lowercase, trim)
- Voucher ownership validation
- Expiry date checking
- Double redemption prevention
- Rollback mechanisms for failed operations