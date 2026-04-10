import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Mail, User, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionCheckProps {
  planId?: string;
  onBack: () => void;
  onSubscriptionVerified: (subscriptionFlow: {
    origin: string;
    subscriptionId: string;
    planId: string;
    allowedClassIds: string[];
    allowedServiceIds: string[];
    lockedProfessionalId?: string;
    sessionConfig?: {
      days_of_week: number[];
      time_slots: { start_time: string; end_time: string }[];
      professional_id: string;
    };
  }) => void;
  onRedirectToPurchase: (planId: string) => void;
}

interface UserShadow {
  id: string;
  name: string;
  email: string;
}

interface ActiveSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  next_billing_date: string;
  cancel_at_period_end?: boolean;
}

export default function SubscriptionCheck({ planId, onBack, onSubscriptionVerified, onRedirectToPurchase }: SubscriptionCheckProps) {
  const { planId: urlPlanId } = useParams<{ planId: string }>();
  const { toast } = useToast();
  
  // Use passed planId or fallback to URL planId
  const effectivePlanId = planId || urlPlanId;
  
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!effectivePlanId) {
      console.error('[SubscriptionCheck] No planId provided');
      onBack();
      return;
    }
    console.log('[SubscriptionCheck] planId=', effectivePlanId);
  }, [effectivePlanId]);

  const handleVerifySubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !effectivePlanId) {
      toast({
        title: 'Error',
        description: 'Por favor ingresa tu email',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const emailLowercase = email.toLowerCase().trim();
      
      // 1. Resolve/create users_shadow by email
      let userShadow: UserShadow;
      
      const { data: existingUser, error: fetchError } = await supabase
        .from('users_shadow')
        .select('*')
        .eq('email', emailLowercase)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingUser) {
        userShadow = existingUser;
        // Update name if provided and different
        if (name.trim() && name.trim() !== existingUser.name) {
          const { error: updateError } = await supabase
            .from('users_shadow')
            .update({ name: name.trim() })
            .eq('id', existingUser.id);
          
          if (updateError) throw updateError;
          userShadow.name = name.trim();
        }
      } else {
        // Create new user_shadow
        const { data: newUser, error: createError } = await supabase
          .from('users_shadow')
          .insert({
            email: emailLowercase,
            name: name.trim() || emailLowercase,
            app_user_id: emailLowercase, // Use email as app_user_id
          })
          .select()
          .single();

        if (createError) throw createError;
        userShadow = newUser;
      }

      const userId = userShadow.id;

      // 2. Check for active subscription
      const { data: subscriptions, error: subsError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', effectivePlanId)
        .eq('status', 'active');

      if (subsError) throw subsError;

      // Filter subscriptions that are still valid
      const now = new Date();
      const activeSubscriptions = subscriptions.filter(sub => {
        const nextBilling = new Date(sub.next_billing_date);
        // Valid if next billing is in the future
        return nextBilling >= now;
      });

      console.log('[SubscriptionCheck]', { 
        email: emailLowercase, 
        userId, 
        planId: effectivePlanId, 
        hasActive: activeSubscriptions.length > 0 
      });

      if (activeSubscriptions.length === 0) {
        toast({
          title: 'Sin suscripción activa',
          description: 'No tienes una suscripción activa para este plan',
          variant: 'destructive',
        });
        onRedirectToPurchase(effectivePlanId);
        return;
      }

      const subscription = activeSubscriptions[0];

      // 3. Parse plan description for session_config and professional_id
      let sessionConfig = null;
      let lockedProfessionalId: string | undefined = undefined;
      
      // Load plan details to get description
      const { data: planData } = await supabase
        .from('subscription_plans')
        .select('description')
        .eq('id', effectivePlanId)
        .single();
      
      if (planData?.description) {
        try {
          let parsed = planData.description;
          if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
          }
          if (parsed && typeof parsed === 'object') {
            sessionConfig = (parsed as any).session_config || null;
            const profId = (parsed as any).professional_id || sessionConfig?.professional_id;
            if (profId && profId !== 'unassigned') {
              lockedProfessionalId = profId;
            }
          }
        } catch (e) {
          console.warn('[SubscriptionCheck] Could not parse plan description:', e);
        }
      }

      // 4. Get allowed classes and services (only if no session_config)
      let allowedClassIds: string[] = [];
      let allowedServiceIds: string[] = [];

      if (!sessionConfig) {
        // Get plan categories first
        const { data: planCategories, error: categoriesError } = await supabase
          .from('subscription_plan_categories')
          .select('category_id')
          .eq('plan_id', effectivePlanId);

        if (categoriesError) throw categoriesError;

        // Get allowed classes via direct assignment
        const { data: planClasses, error: classesError } = await supabase
          .from('subscription_plan_classes')
          .select('class_id')
          .eq('plan_id', effectivePlanId);

        if (classesError) throw classesError;
        allowedClassIds = (planClasses?.map(pc => pc.class_id).filter(Boolean) as string[]) || [];

        // Get allowed classes and services via categories
        if (planCategories && planCategories.length > 0) {
          const categoryIds = planCategories.map(pc => pc.category_id).filter(Boolean) as string[];
          
          if (categoryIds.length > 0) {
            // Get classes from categories
            const { data: categoryClasses, error: categoryClassesError } = await supabase
              .from('classes')
              .select('id')
              .in('category_id', categoryIds)
              .eq('active', true);

            if (categoryClassesError) throw categoryClassesError;
            
            const categoryClassIds = categoryClasses?.map(c => c.id) || [];
            allowedClassIds = [...allowedClassIds, ...categoryClassIds];

            // Get services from categories
            const { data: categoryServices, error: servicesError } = await supabase
              .from('services')
              .select('id')
              .in('category_id', categoryIds)
              .eq('active', true);

            if (servicesError) throw servicesError;
            allowedServiceIds = categoryServices?.map(s => s.id) || [];
          }
        }
      }

      console.log('[SubscriptionFlow]', { 
        subscriptionId: subscription.id, 
        hasSessionConfig: !!sessionConfig,
        lockedProfessionalId,
        allowedClassIdsLen: allowedClassIds.length, 
        allowedServiceIdsLen: allowedServiceIds.length 
      });

      // 5. Save user to localStorage
      localStorage.setItem('reservasPro_user', JSON.stringify({
        userShadowId: userId,
        email: emailLowercase,
        name: userShadow.name
      }));

      // 6. Create subscription flow
      const subscriptionFlow: any = {
        origin: 'subscription',
        subscriptionId: subscription.id,
        planId: effectivePlanId,
        allowedClassIds,
        allowedServiceIds,
        lockedProfessionalId,
      };
      
      if (sessionConfig) {
        subscriptionFlow.sessionConfig = sessionConfig;
      }

      // Save to localStorage
      localStorage.setItem('reservasPro_subscriptionFlow', JSON.stringify(subscriptionFlow));

      onSubscriptionVerified(subscriptionFlow);

    } catch (error) {
      console.error('[SubscriptionCheck] Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo verificar la suscripción',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-lg font-semibold">Verificar suscripción</h1>
        </div>
      </header>

      {/* Verification Form */}
      <div className="p-4 space-y-6">
        <Card className="bg-slate-800 border-slate-700 text-white">
          <CardHeader>
            <CardTitle className="text-xl text-white flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-400" />
              Verificar suscripción
            </CardTitle>
            <p className="text-slate-300 text-sm">
              Usamos tu email para comprobar si tienes este plan activo.
            </p>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleVerifySubscription} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email *
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-300 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Nombre (opcional)
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Tu nombre completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg font-semibold"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Verificando...
                  </div>
                ) : (
                  'Verificar suscripción'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}