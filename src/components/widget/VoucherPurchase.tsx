import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User, Clock, CreditCard, Banknote, Loader2, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from '@/hooks/use-mobile';
import { getDefaultLocation } from '@/lib/default-location';

interface VoucherType {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  sessions_count: number;
  validity_days?: number;
  validity_end_date?: string;
  session_duration_min?: number;
  photo_url?: string;
}

interface Location {
  id: string;
  name: string;
  timezone?: string;
}

interface VoucherPurchaseProps {
  voucherTypeId: string;
  onBack: () => void;
  onPurchaseSuccess: (voucherId: string) => void;
}

export default function VoucherPurchase({
  voucherTypeId,
  onBack,
  onPurchaseSuccess
}: VoucherPurchaseProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Data states
  const [voucherType, setVoucherType] = useState<VoucherType | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  
  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | null>(null);
  
  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Auto-recognition state
  const [isRecognizedUser, setIsRecognizedUser] = useState(false);

  useEffect(() => {
    loadData();
    loadUserFromStorage();
  }, [voucherTypeId]);

  const loadUserFromStorage = async () => {
    try {
      const stored = localStorage.getItem('reservasPro_user');
      if (!stored) return;
      
      const userData = JSON.parse(stored);
      if (!userData.email) return;
      
      // Verify user exists in database with complete data
      const { data: dbUser } = await supabase
        .from('users_shadow')
        .select('id, name, phone, email')
        .eq('email', userData.email.toLowerCase())
        .maybeSingle();
      
      if (dbUser && dbUser.name && dbUser.phone) {
        const nameParts = dbUser.name.split(' ');
        setFirstName(nameParts[0] || '');
        setLastName(nameParts.slice(1).join(' ') || '');
        setPhone(dbUser.phone.replace('+34', ''));
        setEmail(dbUser.email);
        setIsRecognizedUser(true);
      }
    } catch (error) {
      console.error('[VoucherPurchase] Error loading user from storage:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load voucher type
      const { data: voucherData, error: voucherError } = await supabase
        .from('voucher_types')
        .select('*')
        .eq('id', voucherTypeId)
        .single();

      if (voucherError) throw voucherError;
      setVoucherType(voucherData);

      // Load default location
      const defaultLocation = await getDefaultLocation();
      if (defaultLocation) {
        setLocation(defaultLocation);
      }
      
    } catch (error) {
      console.error('Error loading voucher data:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos del bono",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!firstName.trim()) newErrors.firstName = 'El nombre es obligatorio';
    if (!lastName.trim()) newErrors.lastName = 'Los apellidos son obligatorios';
    if (!phone.trim()) newErrors.phone = 'El teléfono es obligatorio';
    if (!email.trim()) newErrors.email = 'El email es obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'El email no es válido';
    }
    if (!paymentMethod) newErrors.paymentMethod = 'Selecciona un método de pago';
    
    // Phone validation (soft)
    if (phone && !/^[\d\s\+\-\(\)]+$/.test(phone)) {
      newErrors.phone = 'El teléfono contiene caracteres no válidos';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !voucherType || !location) return;
    
    try {
      setSubmitting(true);
      
      // Upsert user into users_shadow
      let shadowUserId: string | null = null;
      try {
        const fullName = `${firstName} ${lastName}`.trim();
        const { data: existing } = await supabase
          .from('users_shadow')
          .select('id')
          .eq('email', email)
          .maybeSingle();
          
        const formattedPhone = phone.trim() ? '+34' + phone.trim().replace(/\D/g, '').slice(0, 9) : null;
        
        if (existing?.id) {
          // Update existing user
          const { error: updateError } = await supabase
            .from('users_shadow')
            .update({ 
              name: fullName, 
              app_user_id: `widget:${email}`,
              phone: formattedPhone,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
            
          if (updateError) throw updateError;
          shadowUserId = existing.id;
        } else {
          // Insert new user
          const { data: inserted, error: insertError } = await supabase
            .from('users_shadow')
            .insert([{ 
              name: fullName, 
              email, 
              app_user_id: `widget:${email}`,
              phone: formattedPhone
            }])
            .select('id')
            .single();
            
          if (insertError) throw insertError;
          shadowUserId = inserted?.id || null;
        }
        
        if (!shadowUserId) {
          throw new Error('No se pudo obtener el ID del usuario');
        }
        
      } catch (e) {
        console.error('[VoucherPurchase] users_shadow upsert failed:', e);
        throw new Error('Error al crear/actualizar el usuario');
      }

      if (paymentMethod === 'card') {
        // Handle Stripe checkout for card payments  
        console.log('[VoucherPurchase] Payment method is card, calling handleStripeCheckout');
        await handleStripeCheckout(shadowUserId);
      } else {
        // Handle cash payment (existing logic)
        console.log('[VoucherPurchase] Payment method is cash, calling handleCashPayment');
        await handleCashPayment(shadowUserId);
      }
      
    } catch (error) {
      console.error('Error purchasing voucher:', error);
      console.log('[VoucherPurchase] Payment method was:', paymentMethod);
      toast({
        title: "Error",
        description: "No se pudo comprar el bono. Inténtalo de nuevo.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStripeCheckout = async (shadowUserId: string) => {
    if (!voucherType) return;

    console.log('[VoucherPurchase] Creating Stripe checkout for voucher:', voucherType.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-voucher-checkout', {
        body: {
          voucher_type_id: voucherType.id,
          user_id: shadowUserId,
          // Use the same base as services to keep the widget page (not the admin app)
          success_url: `${window.location.origin}${window.location.pathname}#/exito-bono?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}${window.location.pathname}#/bonos`
        }
      });

      if (error) {
        console.error('[VoucherPurchase] Stripe checkout error:', error);
        throw new Error('Error al crear la sesión de pago');
      }

      if (!data?.checkout_url) {
        console.error('[VoucherPurchase] No checkout_url in response:', data);
        throw new Error('No se pudo obtener la URL de pago');
      }

      // Save user data to localStorage for post-checkout use
      const userData = {
        userShadowId: shadowUserId,
        email: email,
        name: `${firstName} ${lastName}`.trim(),
        savedAt: new Date().toISOString()
      };
      localStorage.setItem('reservasPro_user', JSON.stringify(userData));

      console.log('[VoucherPurchase] Redirecting to Stripe checkout:', data.checkout_url);
      
      // Redirect to Stripe checkout with mobile/iframe detection
      const inIframe = window.top && window.top !== window.self;
      if (isMobile || inIframe) {
        (inIframe ? window.top! : window).location.href = data.checkout_url;
      } else {
        window.location.href = data.checkout_url;
      }
    } catch (stripeError) {
      console.error('[VoucherPurchase] Stripe checkout failed:', stripeError);
      throw stripeError; // Re-throw to be caught by the main catch block
    }
  };

  const handleCashPayment = async (shadowUserId: string) => {
    if (!voucherType) return;

    // Calculate expiry date
    let expiryDate: Date | null = null;
    if (voucherType.validity_days) {
      expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + voucherType.validity_days);
    } else if (voucherType.validity_end_date) {
      expiryDate = new Date(voucherType.validity_end_date);
    }

    // Create voucher
    const voucherData = {
      voucher_type_id: voucherType.id,
      user_id: shadowUserId,
      sessions_remaining: voucherType.sessions_count,
      status: 'active',
      expiry_date: expiryDate?.toISOString(),
      purchase_date: new Date().toISOString()
    };

    console.log('[VoucherPurchase] Creating voucher:', voucherData);

    const { error: voucherError } = await supabase
      .from('vouchers')
      .insert([voucherData]);

    if (voucherError) {
      console.error('Voucher creation error:', voucherError);
      throw voucherError;
    }

    // Create payment record for cash
    const paymentData = {
      amount: voucherType.price,
      currency: voucherType.currency,
      method: 'cash',
      status: 'requires_payment',
      booking_id: null
    };

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert([paymentData])
      .select()
      .single();

    if (paymentError) {
      console.error('Payment creation error:', paymentError);
      console.log(`[VoucherPurchase] rollback voucher for user=${shadowUserId} type=${voucherType.id}`);
      
      // Rollback voucher creation
      await supabase.from('vouchers').delete().eq('user_id', shadowUserId).eq('voucher_type_id', voucherType.id);
      
      toast({
        title: "Error",
        description: "No se pudo completar la compra, inténtalo de nuevo.",
        variant: "destructive"
      });
      throw paymentError;
    }

    console.log('[VoucherPurchase] Voucher and payment created successfully');
    
    // Save user data to localStorage for future use
    const userData = {
      userShadowId: shadowUserId,
      email: email,
      name: `${firstName} ${lastName}`.trim(),
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('reservasPro_user', JSON.stringify(userData));
    
    // Show success message
    const sessionsText = voucherType.sessions_count === 1 ? 'sesión' : 'sesiones';
    toast({
      title: "¡Bono activado!",
      description: `Te quedan ${voucherType.sessions_count} de ${voucherType.sessions_count} ${sessionsText}. ¡Ya puedes reservar!`,
      variant: "default"
    });

    // Marcar que se acaba de comprar un bono
    localStorage.setItem('reservasPro_voucherPurchased', 'true');

    // Navigate to success
    onPurchaseSuccess(voucherType.id);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-widget-primary p-4 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-widget-text" />
      </div>
    );
  }

  if (!voucherType) {
    return (
      <div className="min-h-screen bg-widget-primary p-4 flex items-center justify-center">
        <div className="text-center text-widget-text">
          <p>Bono no encontrado</p>
          <Button 
            variant="outline" 
            onClick={onBack}
            className="mt-4 border-widget-text/30 text-widget-text hover:bg-white/10"
          >
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-widget-primary p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pt-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-white/10 flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-white">Comprar bono</h1>
          </div>
        </div>

        {/* Voucher Summary */}
        <Card className="bg-white/95 backdrop-blur-sm mb-6">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-lg flex-shrink-0">
                <Ticket className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-gray-900 mb-1">{voucherType.name}</h2>
                {voucherType.description && (
                  <p className="text-gray-600 text-sm mb-3">{voucherType.description}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                  <div className="flex items-center gap-1">
                    <Ticket className="h-4 w-4" />
                    <span>{voucherType.sessions_count} {voucherType.sessions_count === 1 ? 'sesión' : 'sesiones'}</span>
                  </div>
                  {voucherType.session_duration_min && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{voucherType.session_duration_min} min</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Precio:</span>
                  <div className="text-lg font-semibold">
                    {voucherType.price}€
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Form */}
        <Card className="bg-white/95 backdrop-blur-sm">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Customer Form - Solo visible si NO está reconocido */}
              {!isRecognizedUser && (
                <>
                  {/* Name Fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="firstName">Nombre *</Label>
                      <Input
                        id="firstName"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className={errors.firstName ? "border-red-500" : ""}
                        placeholder="Jose"
                      />
                      {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
                    </div>
                    <div>
                      <Label htmlFor="lastName">Apellidos *</Label>
                      <Input
                        id="lastName"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className={errors.lastName ? "border-red-500" : ""}
                        placeholder="Rodriguez"
                      />
                      {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <Label htmlFor="phone">Teléfono *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={errors.phone ? "border-red-500" : ""}
                      placeholder="+34611301264"
                    />
                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={errors.email ? "border-red-500" : ""}
                      placeholder="criptobustos@espartax.com"
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>
                </>
              )}

              {/* Payment Method */}
              <div>
                <Label>Método de pago *</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button
                    type="button"
                    variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('cash')}
                    className="h-12 flex items-center gap-2"
                  >
                    <Banknote className="h-4 w-4" />
                    Pago en la clínica
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === 'card' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('card')}
                    className="h-12 flex items-center gap-2"
                  >
                    <CreditCard className="h-4 w-4" />
                    Pago en la app
                  </Button>
                </div>
                {errors.paymentMethod && <p className="text-red-500 text-xs mt-1">{errors.paymentMethod}</p>}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full h-12 text-base font-medium bg-green-600 hover:bg-green-700"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Comprando bono...
                  </>
                ) : (
                  `Comprar bono por ${voucherType.price}€`
                )}
              </Button>

              <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-gray-900 text-sm text-center">
                  💡 Una vez comprado, podrás reservar sesiones sin pasar por pago
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}