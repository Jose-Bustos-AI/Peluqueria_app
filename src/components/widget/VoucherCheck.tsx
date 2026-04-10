import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, AlertCircle, Mail, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getDefaultLocation } from '@/lib/default-location';
import { getVoucherAllowedServices, persistVoucherFlow } from '@/lib/voucher-flow-utils';
import { calculateVoucherBalance } from '@/lib/voucher-utils';

interface VoucherCheckProps {
  voucherTypeId: string;
  professionalId?: string;
  onBack: () => void;
  onVerified: (voucherId: string, userId: string) => void;
  onNeedsVoucher: () => void;
}

interface UserVoucher {
  id: string;
  voucher_type_id: string;
  sessions_remaining: number;
  expiry_date?: string;
  status: string;
  voucher_type: {
    name: string;
    sessions_count: number;
  };
}

export default function VoucherCheck({ 
  voucherTypeId, 
  professionalId, 
  onBack, 
  onVerified, 
  onNeedsVoucher 
}: VoucherCheckProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [eligibleVouchers, setEligibleVouchers] = useState<UserVoucher[]>([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [showVoucherSelection, setShowVoucherSelection] = useState(false);

  // Load saved email from localStorage if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem('reservasPro_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.email) setEmail(parsed.email);
      }
    } catch (e) {
      console.warn('Failed to parse saved user data');
    }
  }, []);

  const handleVerification = async () => {
    if (!email.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa tu email",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Error",
        description: "Por favor ingresa un email válido",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log('[VoucherCheck] email=', email.toLowerCase(), 'voucherTypeId=', voucherTypeId);

    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Step 1: Resolve user by email
      let userId: string;
      const { data: existingUser, error: userError } = await supabase
        .from('users_shadow')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (userError && userError.code !== 'PGRST116') {
        throw userError;
      }

      if (existingUser) {
        userId = existingUser.id;
        console.log('[VoucherCheck] Found existing user:', userId);
      } else {
        // Create new user
        const userName = normalizedEmail.split('@')[0];
        const { data: newUser, error: insertError } = await supabase
          .from('users_shadow')
          .insert({
            email: normalizedEmail,
            name: userName,
            app_user_id: `widget:${normalizedEmail}`
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        userId = newUser.id;
        console.log('[VoucherCheck] Created new user:', userId);
      }

      // Get complete user data from database and fetch from most recent booking
      const { data: userShadow } = await supabase
        .from('users_shadow')
        .select('name, email')
        .eq('id', userId)
        .maybeSingle();
      
      // Try to get more complete user data from the most recent booking
      const { data: recentBooking } = await supabase
        .from('bookings')
        .select('notes')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      let firstName = '';
      let lastName = '';
      let phone = '';
      
      // Parse from booking notes if available
      if (recentBooking?.notes) {
        try {
          // Try to parse JSON format first
          const bookingData = JSON.parse(recentBooking.notes);
          if (bookingData.clientName) {
            const nameParts = bookingData.clientName.split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
          }
          if (bookingData.clientPhone) {
            phone = bookingData.clientPhone;
          }
        } catch {
          // Try to parse text format
          const lines = recentBooking.notes.split('\n');
          for (const line of lines) {
            if (line.includes('Cliente:')) {
              const name = line.replace('Cliente:', '').trim();
              const nameParts = name.split(' ');
              firstName = nameParts[0] || '';
              lastName = nameParts.slice(1).join(' ') || '';
            }
            if (line.includes('Teléfono:')) {
              phone = line.replace('Teléfono:', '').trim();
            }
          }
        }
      }
      
      // Fallback to user shadow name if no booking data
      if (!firstName && !lastName && userShadow?.name) {
        const nameParts = userShadow.name.split(' ');
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
      }
      
      // Save complete user data to localStorage
      const fullName = firstName && lastName ? `${firstName} ${lastName}`.trim() : firstName || normalizedEmail.split('@')[0];
      const userData = {
        email: normalizedEmail,
        name: fullName,
        firstName: firstName || '',
        lastName: lastName || '',
        phone: phone || '',
        userShadowId: userId
      };
      localStorage.setItem('reservasPro_user', JSON.stringify(userData));
      console.log('[VoucherCheck] Saved complete user data:', userData);

      // Step 2: Check eligible vouchers
      const { data: vouchers, error: vouchersError } = await supabase
        .from('vouchers')
        .select(`
          id,
          voucher_type_id,
          sessions_remaining,
          expiry_date,
          status,
          voucher_type:voucher_types(
            name,
            sessions_count
          )
        `)
        .eq('user_id', userId)
        .eq('voucher_type_id', voucherTypeId)
        .eq('status', 'active');

      if (vouchersError) throw vouchersError;

      // Recalculate balances to ensure accuracy
      const withBalances = await Promise.all((vouchers || []).map(async (v) => {
        try {
          const bal = await calculateVoucherBalance(v.id);
          return { ...v, sessions_remaining: bal.remaining };
        } catch {
          return v;
        }
      }));

      // Filter by expiry date and remaining sessions
      const now = new Date().toISOString();
      const validVouchers = withBalances.filter(voucher => 
        voucher.sessions_remaining > 0 &&
        (!voucher.expiry_date || voucher.expiry_date >= now)
      );

      console.log('[VoucherCheck] eligible vouchers=', validVouchers.length);

      if (validVouchers.length === 0) {
        // No eligible vouchers - redirect to purchase
        toast({
          title: "Sin bonos activos",
          description: "No tienes créditos activos para este bono",
          variant: "destructive",
        });
        onNeedsVoucher();
        return;
      }

      // Get allowed services for this voucher type
      const allowedServiceIds = await getVoucherAllowedServices(voucherTypeId);
      
      if (validVouchers.length === 1) {
        // Single voucher - proceed directly
        await persistVoucherFlow(validVouchers[0].id, userId, allowedServiceIds, voucherTypeId, professionalId);
        try {
          localStorage.setItem('reservasPro_verifiedVoucherId', validVouchers[0].id);
        } catch {}
        onVerified(validVouchers[0].id, userId);
      } else {
        // Multiple vouchers - show selection
        setEligibleVouchers(validVouchers);
        setShowVoucherSelection(true);
      }

    } catch (error) {
      console.error('[VoucherCheck] Error:', error);
      toast({
        title: "Error",
        description: "Error al verificar tu bono. Inténtalo de nuevo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVoucherSelection = async () => {
    if (!selectedVoucherId) {
      toast({
        title: "Error",
        description: "Selecciona un bono para continuar",
        variant: "destructive",
      });
      return;
    }

    try {
      const saved = localStorage.getItem('reservasPro_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        
        // Get allowed services for this voucher type
        const allowedServiceIds = await getVoucherAllowedServices(voucherTypeId);
        await persistVoucherFlow(selectedVoucherId, parsed.userShadowId, allowedServiceIds, voucherTypeId, professionalId);
        try {
          localStorage.setItem('reservasPro_verifiedVoucherId', selectedVoucherId);
        } catch {}
        onVerified(selectedVoucherId, parsed.userShadowId);
      }
    } catch (e) {
      console.error('Error reading user data from localStorage');
      toast({
        title: "Error",
        description: "Error al procesar la selección",
        variant: "destructive",
      });
    }
  };

  if (showVoucherSelection) {
    return (
      <div className="min-h-screen bg-widget-primary p-4">
        <Button 
          onClick={() => setShowVoucherSelection(false)} 
          variant="ghost" 
          className="mb-4 text-widget-text hover:bg-white/10"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>

        <div className="space-y-4 max-w-md mx-auto">
          <Card className="bg-white/90 border-0 backdrop-blur-sm shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-center text-gray-900">
                Elige tu bono
              </CardTitle>
              <p className="text-sm text-gray-600 text-center">
                Tienes varios bonos disponibles. Selecciona cuál usar:
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {eligibleVouchers.map((voucher) => (
                <div
                  key={voucher.id}
                  onClick={() => setSelectedVoucherId(voucher.id)}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedVoucherId === voucher.id
                      ? 'border-widget-secondary bg-widget-secondary/10'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">
                        {voucher.voucher_type.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        {voucher.sessions_remaining} / {voucher.voucher_type.sessions_count} créditos
                      </p>
                      {voucher.expiry_date && (
                        <p className="text-xs text-gray-500">
                          Caduca: {new Date(voucher.expiry_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {selectedVoucherId === voucher.id && (
                      <CheckCircle className="h-5 w-5 text-widget-secondary" />
                    )}
                  </div>
                </div>
              ))}

              <Button
                onClick={handleVoucherSelection}
                disabled={!selectedVoucherId}
                className="w-full mt-4"
              >
                Continuar
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-widget-primary p-4">
      <Button 
        onClick={onBack} 
        variant="ghost" 
        className="mb-4 text-widget-text hover:bg-white/10"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver
      </Button>

      <div className="space-y-4 max-w-md mx-auto">
        <Card className="bg-white/90 border-0 backdrop-blur-sm shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-center text-gray-900">
              Verificar bono
            </CardTitle>
            <p className="text-sm text-gray-600 text-center">
              Usamos tu email para comprobar si tienes este bono activo.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email *
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button
              onClick={handleVerification}
              disabled={loading || !email.trim()}
              className="w-full"
            >
              {loading ? 'Verificando...' : 'Continuar'}
            </Button>

            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-800">
                Si tienes bonos activos con créditos disponibles, podrás continuar con la reserva. 
                Si no, te redirigiremos para comprar el bono.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}