import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Phone, Calendar, RotateCcw } from 'lucide-react';

interface SubscriptionSessionInfoProps {
  bookingId: string;
}

export function SubscriptionSessionInfo({ bookingId }: SubscriptionSessionInfoProps) {
  const [sessionInfo, setSessionInfo] = useState<{
    used: number;
    remaining: number;
    total: number;
    isUnlimited: boolean;
    planName?: string;
    subscriptionStatus?: string;
    nextBillingDate?: string;
    cancelAtPeriodEnd?: boolean;
    userPhone?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSessionInfo = async () => {
      try {
        // Get booking details with notes and user info
        const { data: booking } = await supabase
          .from('bookings')
          .select('notes, user_id, start_at')
          .eq('id', bookingId)
          .single();

        if (!booking?.notes) {
          setLoading(false);
          return;
        }

        let subscriptionData;
        try {
          subscriptionData = JSON.parse(booking.notes);
        } catch {
          setLoading(false);
          return;
        }

        if (!subscriptionData.subscriptionId || !subscriptionData.planId) {
          setLoading(false);
          return;
        }

        // Get subscription plan and subscription details
        const [planResult, subscriptionResult] = await Promise.all([
          supabase
            .from('subscription_plans')
            .select('name, cap_per_cycle, sessions_count')
            .eq('id', subscriptionData.planId)
            .single(),
          supabase
            .from('subscriptions')
            .select('status, next_billing_date, cancel_at_period_end, start_date')
            .eq('id', subscriptionData.subscriptionId)
            .single()
        ]);

        if (!planResult.data || !subscriptionResult.data) {
          setLoading(false);
          return;
        }

        // Extract phone from booking notes
        const phoneMatch = booking.notes.match(/Teléfono:\s*([+\d\s\-()]+)/);
        const userPhone = phoneMatch ? phoneMatch[1].trim() : undefined;

        // Calculate the cycle for THIS specific booking date
        const bookingDate = new Date(booking.start_at);
        const startDate = new Date(subscriptionResult.data.start_date);

        // Calculate how many months have passed since subscription start
        let monthsSinceStart = 
          (bookingDate.getFullYear() - startDate.getFullYear()) * 12 + 
          (bookingDate.getMonth() - startDate.getMonth());

        // Adjust if booking date is before the day of month of the cycle
        const dayOfMonth = startDate.getDate();
        if (bookingDate.getDate() < dayOfMonth && monthsSinceStart > 0) {
          monthsSinceStart--;
        }

        // Calculate start and end of the cycle where THIS booking falls
        const bookingCycleStart = new Date(startDate);
        bookingCycleStart.setMonth(startDate.getMonth() + monthsSinceStart);

        const bookingCycleEnd = new Date(bookingCycleStart);
        bookingCycleEnd.setMonth(bookingCycleStart.getMonth() + 1);

        // Count used sessions in the cycle of THIS specific booking
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id')
          .eq('origin', 'subscription')
          .like('notes', `%"subscriptionId":"${subscriptionData.subscriptionId}"%`)
          .neq('status', 'cancelled')
          .gte('start_at', bookingCycleStart.toISOString())
          .lt('start_at', bookingCycleEnd.toISOString());

        const used = bookings?.length || 0;
        const total = planResult.data.cap_per_cycle ?? planResult.data.sessions_count ?? 0;
        const remaining = Math.max(0, total - used);

        setSessionInfo({
          used,
          remaining,
          total,
          isUnlimited: !planResult.data.sessions_count,
          planName: planResult.data.name,
          subscriptionStatus: subscriptionResult.data?.status,
          nextBillingDate: subscriptionResult.data?.next_billing_date,
          cancelAtPeriodEnd: subscriptionResult.data?.cancel_at_period_end,
          userPhone
        });

      } catch (error) {
        console.error('Error loading session info:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSessionInfo();
  }, [bookingId]);

  if (loading) {
    return <span className="text-xs text-muted-foreground">Cargando...</span>;
  }

  if (!sessionInfo) {
    return null;
  }

  const getStatusDisplay = () => {
    if (sessionInfo.subscriptionStatus === 'cancelled') {
      return { text: 'Cancelada', color: 'destructive' as const };
    }
    if (sessionInfo.cancelAtPeriodEnd) {
      return { text: 'Se cancelará', color: 'destructive' as const };
    }
    if (sessionInfo.subscriptionStatus === 'active') {
      return { text: 'Activa', color: 'default' as const };
    }
    return { text: sessionInfo.subscriptionStatus || 'Desconocido', color: 'secondary' as const };
  };

  const statusInfo = getStatusDisplay();

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-lg flex items-center gap-2">
        <CreditCard className="h-4 w-4" />
        Información de Suscripción
      </h3>
      
      <div className="bg-purple-50 p-4 rounded-md space-y-3">
        {/* Plan Name and Status */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-muted-foreground">Plan:</span>
            <p className="font-medium">{sessionInfo.planName}</p>
          </div>
          <Badge variant={statusInfo.color}>
            {statusInfo.text}
          </Badge>
        </div>

        {/* Sessions Info */}
        <div>
          <span className="text-sm text-muted-foreground">Sesiones (ciclo actual):</span>
          <p className="font-medium">
            {sessionInfo.isUnlimited ? (
              "Ilimitadas"
            ) : (
              `Usadas: ${sessionInfo.used} / Restantes: ${sessionInfo.remaining} (Total: ${sessionInfo.total})`
            )}
          </p>
        </div>

        {/* Billing Info */}
        {sessionInfo.nextBillingDate && (
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-sm text-muted-foreground">
                {sessionInfo.cancelAtPeriodEnd ? 'Se cancelará:' : 
                 sessionInfo.subscriptionStatus === 'cancelled' ? 'Cancelada:' : 
                 'Próxima renovación:'}
              </span>
              <p className="font-medium">
                {new Date(sessionInfo.nextBillingDate).toLocaleDateString('es-ES')}
              </p>
            </div>
          </div>
        )}

        {/* Phone Info */}
        {sessionInfo.userPhone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-sm text-muted-foreground">Teléfono del cliente:</span>
              <p className="font-medium">{sessionInfo.userPhone}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}