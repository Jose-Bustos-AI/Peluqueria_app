import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Calendar, ArrowLeft, Loader2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionSuccessProps {
  sessionId?: string | null;
  onBack: () => void;
  onViewSubscriptions: () => void;
}

interface SubscriptionInfo {
  id: string;
  status: string;
  next_billing_date: string;
  plan: {
    name: string;
    price: number;
    currency: string;
    cycle: string;
    sessions_count?: number;
  };
}

export default function SubscriptionSuccess({ sessionId, onBack, onViewSubscriptions }: SubscriptionSuccessProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);

  useEffect(() => {
    console.log('[Subs.UI] SubscriptionSuccess mounted sessionId=', sessionId);
    
    if (sessionId) {
      // Start polling for subscription
      pollForSubscription();
    } else {
      // No session ID, just show generic success
      setLoading(false);
    }
  }, [sessionId]);

  const pollForSubscription = async () => {
    if (polling) return;
    
    setPolling(true);
    const maxAttempts = 10;
    let attempts = 0;

    console.log('[Subs.UI] Starting polling for subscription...');

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`[Subs.UI] Polling attempt ${attempts}/${maxAttempts}`);
      
      try {
        // Get current user from localStorage
        const savedUser = localStorage.getItem('reservasPro_user');
        const userData = savedUser ? JSON.parse(savedUser) : null;
        const userId = userData?.userShadowId;

        if (!userId) {
          console.error('[Subs.UI] No user ID found');
          break;
        }

        // Check for active subscriptions for this user
        const { data: subscriptions, error } = await supabase
          .from('subscriptions')
          .select(`
            id,
            status,
            next_billing_date,
            subscription_plans (
              name,
              price,
              currency,
              cycle,
              sessions_count
            )
          `)
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error('[Subs.UI] Error checking subscriptions:', error);
          break;
        }

        if (subscriptions && subscriptions.length > 0) {
          const sub = subscriptions[0];
          console.log('[Subs.UI] success session=', sessionId, '-> active');
          
          setSubscription({
            id: sub.id,
            status: sub.status,
            next_billing_date: sub.next_billing_date,
            plan: sub.subscription_plans
          });
          
          toast({
            title: "¡Suscripción activada!",
            description: "Tu suscripción se ha procesado correctamente",
          });
          
          setLoading(false);
          setPolling(false);
          return;
        }

        // Wait 2 seconds before next attempt
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error('[Subs.UI] Polling error:', error);
        break;
      }
    }

    // Polling completed without finding subscription
    console.log('[Subs.UI] Polling completed without finding active subscription');
    setLoading(false);
    setPolling(false);
    
    toast({
      title: "Procesando suscripción",
      description: "Tu suscripción se está procesando. Podrás verla en unos minutos en 'Mis suscripciones'.",
      variant: "default"
    });
  };

  const getCycleText = (cycle: string) => {
    switch (cycle) {
      case 'weekly':
        return 'semanal';
      case 'monthly':
        return 'mensual';
      default:
        return cycle;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading || polling) {
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
            <h1 className="text-lg font-semibold">Procesando suscripción</h1>
          </div>
        </header>

        {/* Loading Content */}
        <div className="p-4 flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
          <h2 className="text-xl font-semibold text-white">Procesando alta...</h2>
          <p className="text-slate-300 text-center max-w-md">
            Estamos verificando tu suscripción. Esto puede tardar unos segundos.
          </p>
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
          <h1 className="text-lg font-semibold">Suscripción activada</h1>
        </div>
      </header>

      {/* Success Content */}
      <div className="p-4 space-y-6">
        {/* Success Icon */}
        <div className="flex flex-col items-center text-center space-y-4 py-8">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">¡Suscripción activa!</h2>
          <p className="text-slate-300 max-w-md">
            Tu suscripción se ha activado correctamente y ya puedes empezar a usarla.
          </p>
        </div>

        {/* Subscription Details */}
        {subscription && (
          <Card className="bg-slate-800 border-slate-700 text-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-xl text-white">{subscription.plan.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-green-400 text-green-400">
                      Activa
                    </Badge>
                    <Badge variant="outline" className="border-blue-400 text-blue-400">
                      {getCycleText(subscription.plan.cycle)}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">
                    {subscription.plan.price}€
                  </div>
                  <div className="text-sm text-slate-300">
                    /{getCycleText(subscription.plan.cycle)}
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="pt-0">
              <div className="space-y-3">
                {subscription.plan.sessions_count && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Calendar className="w-4 h-4" />
                    <span>Incluye {subscription.plan.sessions_count} sesiones por {getCycleText(subscription.plan.cycle)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Calendar className="w-4 h-4" />
                  <span>Próximo cobro: {formatDate(subscription.next_billing_date)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={onViewSubscriptions}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg font-semibold"
          >
            <Eye className="h-4 w-4 mr-2" />
            Ver mis suscripciones
          </Button>
        </div>

        {/* Information Card */}
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="space-y-2 text-sm text-slate-300">
              <h3 className="font-semibold text-white mb-3">¿Qué puedes hacer ahora?</h3>
              <div className="space-y-1">
                <p>• Reservar sesiones incluidas en tu suscripción</p>
                <p>• Ver el estado de tu suscripción en "Mis suscripciones"</p>
                <p>• Gestionar tus reservas desde tu cuenta</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}