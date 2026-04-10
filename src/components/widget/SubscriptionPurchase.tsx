import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User, Clock, CreditCard, Banknote, Loader2, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getDefaultLocation } from '@/lib/default-location';

interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  cycle: string;
  sessions_count?: number;
  sessions_per_week?: number;
  photo_url?: string;
}

interface Location {
  id: string;
  name: string;
  timezone?: string;
}

interface SubscriptionPurchaseProps {
  planId: string;
  onBack: () => void;
  onPurchaseSuccess: (subscriptionId: string) => void;
}

export default function SubscriptionPurchase({
  planId,
  onBack,
  onPurchaseSuccess
}: SubscriptionPurchaseProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Data states
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
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

  console.log('[SubscriptionPurchase] mounted planId=', planId);

  useEffect(() => {
    loadData();
    loadUserFromStorage();
  }, [planId]);

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
      console.error('[SubscriptionPurchase] Error loading user from storage:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      console.log('[SubscriptionPurchase] loading plan data for planId=', planId);
      
      // Load subscription plan
      const { data: planData, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (planError) throw planError;
      setPlan(planData);

      console.log('[SubscriptionPurchase] plan loaded:', planData);

      // Load default location
      const defaultLocation = await getDefaultLocation();
      if (defaultLocation) {
        setLocation(defaultLocation);
      }
      
    } catch (error) {
      console.error('Error loading subscription data:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos de la suscripción",
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
    
    if (!validateForm() || !plan || !location) return;
    
    try {
      setSubmitting(true);
      
      console.log('[SubscriptionPurchase] submitting purchase for plan:', plan.id, 'payment method:', paymentMethod);
      
      // Upsert user into users_shadow
      let shadowUserId: string | null = null;
      try {
        const fullName = `${firstName} ${lastName}`.trim();
        const { data: existing } = await supabase
          .from('users_shadow')
          .select('id')
          .eq('email', email.toLowerCase())
          .maybeSingle();
          
        const formattedPhone = phone.trim() ? '+34' + phone.trim().replace(/\D/g, '').slice(0, 9) : null;
        
        if (existing?.id) {
          // Update existing user
          const { error: updateError } = await supabase
            .from('users_shadow')
            .update({ 
              name: fullName, 
              app_user_id: `widget:${email.toLowerCase()}`,
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
              email: email.toLowerCase(), 
              app_user_id: `widget:${email.toLowerCase()}`,
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
        console.error('[SubscriptionPurchase] users_shadow upsert failed:', e);
        throw new Error('Error al crear/actualizar el usuario');
      }

      // Save user data to localStorage for future use
      localStorage.setItem('reservasPro_user', JSON.stringify({
        userShadowId: shadowUserId,
        name: `${firstName} ${lastName}`,
        email: email.toLowerCase(),
        phone
      }));

      // If payment method is card, redirect to Stripe
      if (paymentMethod === 'card') {
        console.log('[SubscriptionPurchase] Redirecting to Stripe for card payment');
        
        const WIDGET_BASE = window.location.origin + window.location.pathname;
        const success_url = `${WIDGET_BASE}#/exito-suscripcion?session_id={CHECKOUT_SESSION_ID}`;
        const cancel_url = `${WIDGET_BASE}#/subscription-purchase`;
        
        const { data, error } = await supabase.functions.invoke('create-subscription-checkout', {
          body: { 
            plan_id: plan.id,
            user_id: shadowUserId,
            success_url,
            cancel_url
          }
        });

        const redirectUrl = data?.checkout_url || data?.url;
        if (error || !redirectUrl) {
          console.error('[Stripe] create-subscription-checkout error', { error, data });
          toast({
            title: "Error de pago",
            description: "No se pudo iniciar el pago con tarjeta",
            variant: "destructive"
          });
          setSubmitting(false);
          return;
        }

        console.log('[SubscriptionPurchase] Redirecting to Stripe:', redirectUrl);
        
        // Redirect to Stripe
        try {
          const inIframe = window.top && window.top !== window.self;
          if (inIframe) {
            window.top!.location.href = redirectUrl as string;
          } else {
            window.location.assign(redirectUrl as string);
          }
        } catch {
          window.location.href = redirectUrl as string;
        }
        return;
      }

      // If payment method is cash, create subscription directly
      console.log('[SubscriptionPurchase] Creating subscription with cash payment');

      // Calculate subscription dates
      const now = new Date();
      const startDate = now.toISOString();
      const nextBillingDate = new Date();
      
      if (plan.cycle === 'monthly') {
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      } else if (plan.cycle === 'weekly') {
        nextBillingDate.setDate(nextBillingDate.getDate() + 7);
      } else if (plan.cycle === 'yearly') {
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      } else {
        // Default to monthly
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      }

      // Create subscription
      const subscriptionData = {
        user_id: shadowUserId,
        plan_id: plan.id,
        status: 'active',
        start_date: startDate,
        next_billing_date: nextBillingDate.toISOString(),
        cap_remaining_in_cycle: plan.sessions_count || null,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };

      console.log('[SubscriptionPurchase] Creating subscription:', subscriptionData);

      const { data: createdSubscription, error: subscriptionError } = await supabase
        .from('subscriptions')
        .insert([subscriptionData])
        .select('id')
        .single();

      if (subscriptionError) {
        console.error('Subscription creation error:', subscriptionError);
        throw subscriptionError;
      }

      const subscriptionId = createdSubscription?.id;
      if (!subscriptionId) {
        throw new Error('No se pudo obtener el ID de la suscripción');
      }

      console.log('[SubscriptionPurchase] subscription created successfully:', subscriptionId);

      toast({
        title: "¡Suscripción creada!",
        description: "Tu suscripción se ha activado correctamente",
      });

      onPurchaseSuccess(subscriptionId);
      
    } catch (error) {
      console.error('[SubscriptionPurchase] Error during purchase:', error);
      toast({
        title: "Error en la compra",
        description: error instanceof Error ? error.message : "Hubo un problema al procesar tu suscripción",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const parseSubscriptionDescription = (description: string) => {
    if (!description) return '';
    try {
      const parsed = JSON.parse(description);
      return parsed.text || description;
    } catch {
      return description;
    }
  };

  const getCycleText = (cycle: string) => {
    switch (cycle) {
      case 'weekly': return 'semanal';
      case 'monthly': return 'mensual';
      case 'yearly': return 'anual';
      default: return cycle;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <header className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-white hover:bg-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold">Comprar suscripción</h1>
          </div>
        </header>
        
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <p className="text-slate-300 mb-4">Plan no encontrado</p>
          <Button onClick={onBack} variant="outline" className="text-slate-300 border-slate-600">
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-white hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Comprar suscripción</h1>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Plan Summary */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Calendar className="h-5 w-5" />
              Resumen de suscripción
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium text-white">{plan.name}</h3>
              {plan.description && (
                <p className="text-sm text-slate-300 mt-1">{parseSubscriptionDescription(plan.description)}</p>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Precio:</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-blue-600 text-white">
                  {plan.price} {plan.currency}
                </Badge>
                <span className="text-sm text-slate-400">/ {getCycleText(plan.cycle)}</span>
              </div>
            </div>

            {plan.sessions_count && (
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Incluye:</span>
                <span className="text-slate-200">{plan.sessions_count} sesiones</span>
              </div>
            )}

            {plan.sessions_per_week && (
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Frecuencia:</span>
                <span className="text-slate-200">{plan.sessions_per_week} por semana</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Purchase Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Form - Solo visible si NO está reconocido */}
          {!isRecognizedUser && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <User className="h-5 w-5" />
                  Datos del suscriptor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName" className="text-slate-300">Nombre *</Label>
                    <Input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="mt-1 bg-slate-700 border-slate-600 text-white"
                      placeholder="Tu nombre"
                    />
                    {errors.firstName && <p className="text-red-400 text-sm mt-1">{errors.firstName}</p>}
                  </div>
                  
                  <div>
                    <Label htmlFor="lastName" className="text-slate-300">Apellidos *</Label>
                    <Input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="mt-1 bg-slate-700 border-slate-600 text-white"
                      placeholder="Tus apellidos"
                    />
                    {errors.lastName && <p className="text-red-400 text-sm mt-1">{errors.lastName}</p>}
                  </div>
                </div>

                <div>
                  <Label htmlFor="phone" className="text-slate-300">Teléfono *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 bg-slate-700 border-slate-600 text-white"
                    placeholder="+34 600 000 000"
                  />
                  {errors.phone && <p className="text-red-400 text-sm mt-1">{errors.phone}</p>}
                </div>

                <div>
                  <Label htmlFor="email" className="text-slate-300">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 bg-slate-700 border-slate-600 text-white"
                    placeholder="tu@email.com"
                  />
                  {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email}</p>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment Method */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <CreditCard className="h-5 w-5" />
                Método de pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                  className={`h-auto p-4 ${paymentMethod === 'cash' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                  }`}
                  onClick={() => setPaymentMethod('cash')}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Banknote className="h-6 w-6" />
                    <span>Pago en la clínica</span>
                  </div>
                </Button>

                <Button
                  type="button"
                  variant={paymentMethod === 'card' ? 'default' : 'outline'}
                  className={`h-auto p-4 ${paymentMethod === 'card' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                  }`}
                  onClick={() => setPaymentMethod('card')}
                >
                  <div className="flex flex-col items-center gap-2">
                    <CreditCard className="h-6 w-6" />
                    <span>Pago en la app</span>
                  </div>
                </Button>
              </div>
              {errors.paymentMethod && <p className="text-red-400 text-sm mt-2">{errors.paymentMethod}</p>}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            size="lg"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              `Suscribirse por ${plan.price} ${plan.currency}`
            )}
          </Button>
        </form>

        {/* Info Text */}
        <div className="text-center">
          <p className="text-slate-400 text-sm">
            Al suscribirse, acepta nuestros términos y condiciones. Su suscripción se renovará automáticamente.
          </p>
        </div>
      </div>
    </div>
  );
}