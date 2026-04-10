import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Calendar, CreditCard, X, Phone, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface UserSubscription {
  id: string;
  status: string;
  start_date: string;
  next_billing_date: string;
  cancel_at_period_end?: boolean;
  stripe_subscription_id?: string;
  plan: {
    id: string;
    name: string;
    price: number;
    currency: string;
    cycle: string;
    sessions_count?: number;
    cap_per_cycle?: number;
    photo_url?: string;
  };
  usedSessions?: number;
  remainingSessions?: number;
  nextCycleUsedSessions?: number;
  nextCycleStart?: Date;
  nextCycleEnd?: Date;
}

interface UserSubscriptionsProps {
  userId?: string;
  selectedSubscriptionId?: string;
  onNavigateToCalendar?: (subscriptionId: string, planId: string) => void;
}

export default function UserSubscriptions({ userId, selectedSubscriptionId, onNavigateToCalendar }: UserSubscriptionsProps) {
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscriptions();
  }, [userId]);

  const loadSubscriptions = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('[UserSubscriptions] Loading subscriptions for userId:', userId);

      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          id,
          status,
          start_date,
          next_billing_date,
          cancel_at_period_end,
          stripe_subscription_id,
          plan:subscription_plans (
            id,
            name,
            price,
            currency,
            cycle,
            sessions_count,
            cap_per_cycle,
            photo_url
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate sessions usage for each subscription
      const validData = (data || []).filter(sub => sub.plan !== null);
      const subscriptionsWithUsage = await Promise.all(validData.map(async (sub) => {
        if (!sub.plan.sessions_count) {
          return { ...sub, usedSessions: 0, remainingSessions: Infinity };
        }

        try {
          // Calculate current cycle dates with EXACT time from start_date
          const startDate = new Date(sub.start_date);
          const now = new Date();
          
          // Find the current cycle by iterating from start date
          let currentCycleStart = new Date(startDate);
          let currentCycleEnd = new Date(startDate);
          
          // Set initial cycle end based on cycle type
          if (sub.plan.cycle === 'weekly') {
            currentCycleEnd.setDate(currentCycleEnd.getDate() + 7);
          } else {
            currentCycleEnd.setMonth(currentCycleEnd.getMonth() + 1);
          }
          
          // Advance cycle by cycle until we find the one containing "now"
          while (currentCycleEnd <= now) {
            currentCycleStart = new Date(currentCycleEnd);
            if (sub.plan.cycle === 'weekly') {
              currentCycleEnd.setDate(currentCycleEnd.getDate() + 7);
            } else {
              currentCycleEnd.setMonth(currentCycleEnd.getMonth() + 1);
            }
          }

          // Count used sessions in current cycle using EXACT timestamps
      const { count: usedSessions } = await supabase
        .from('bookings')
        .select('id', { head: true, count: 'exact' })
        .eq('origin', 'subscription')
        .or(`notes.like.%"subscriptionId":"${sub.id}"%,notes.like.%"subscriptionId": "${sub.id}"%`)
        .neq('status', 'cancelled')
        .gte('start_at', currentCycleStart.toISOString())
        .lt('start_at', currentCycleEnd.toISOString());

          // Prioritize cap_per_cycle over sessions_count
          const sessionLimit = sub.plan.cap_per_cycle || sub.plan.sessions_count || 0;
          const used = usedSessions || 0;
          const remaining = Math.max(0, sessionLimit - used);

          // Calculate next cycle - starts exactly where current ends
          const nextCycleStart = new Date(currentCycleEnd);
          const nextCycleEnd = new Date(nextCycleStart);
          if (sub.plan.cycle === 'weekly') {
            nextCycleEnd.setDate(nextCycleEnd.getDate() + 7);
          } else {
            nextCycleEnd.setMonth(nextCycleEnd.getMonth() + 1);
          }

          // Count sessions in next cycle using EXACT timestamps
      const { count: nextCycleUsed } = await supabase
        .from('bookings')
        .select('id', { head: true, count: 'exact' })
        .eq('origin', 'subscription')
        .or(`notes.like.%"subscriptionId":"${sub.id}"%,notes.like.%"subscriptionId": "${sub.id}"%`)
        .neq('status', 'cancelled')
        .gte('start_at', nextCycleStart.toISOString())
        .lt('start_at', nextCycleEnd.toISOString());

          console.log(`[SubBooking] Ciclo actual: ${currentCycleStart.toISOString()} - ${currentCycleEnd.toISOString()}`);
          console.log(`[SubBooking] sessionLimit=${sessionLimit}, used=${used}, remaining=${remaining}, nextCycleUsed=${nextCycleUsed || 0}`);

          return {
            ...sub,
            usedSessions: used,
            remainingSessions: remaining,
            nextCycleUsedSessions: nextCycleUsed || 0,
            nextCycleStart,
            nextCycleEnd
          };
        } catch (error) {
          console.error('[UserSubscriptions] Error calculating usage for subscription:', error);
          return {
            ...sub,
            usedSessions: 0,
            remainingSessions: sub.plan.sessions_count
          };
        }
      }));

      setSubscriptions(subscriptionsWithUsage);
      console.log('[UserSubscriptions] Loaded subscriptions:', subscriptionsWithUsage?.length || 0);

      // Filter by selectedSubscriptionId if provided
      if (selectedSubscriptionId) {
        const filteredSubscriptions = subscriptionsWithUsage.filter(sub => sub.id === selectedSubscriptionId);
        setSubscriptions(filteredSubscriptions);
        console.log(`[UserSubscriptions] Filtered to specific subscription: ${selectedSubscriptionId}`);
      } else {
        setSubscriptions(subscriptionsWithUsage);
      }

    } catch (error) {
      console.error('[UserSubscriptions] Error loading subscriptions:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las suscripciones",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Note: handleCancelSubscription removed from widget - users must contact the center to cancel

  const getStatusBadge = (status: string, cancelAtPeriodEnd?: boolean) => {
    if (cancelAtPeriodEnd) {
      return <Badge className="bg-orange-600 text-white">Se cancelará</Badge>;
    }
    
    switch (status) {
      case 'active':
        return <Badge className="bg-green-600 text-white">Activa</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelada</Badge>;
      case 'past_due':
        return <Badge className="bg-orange-600 text-white">Vencida</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getCycleText = (cycle: string) => {
    switch (cycle) {
      case 'weekly':
        return 'semanal';
      case 'monthly':
        return 'mensual';
      case 'yearly':
        return 'anual';
      default:
        return cycle;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-700 rounded w-32 mb-4"></div>
          <div className="h-24 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!subscriptions.length) {
    return (
      <div className="text-center py-8">
        <CreditCard className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">No tienes suscripciones</h3>
        <p className="text-slate-400">Explora nuestros planes de suscripción para acceder a más servicios</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">
        {selectedSubscriptionId ? 'Detalle de Suscripción' : 'Mis Suscripciones'}
      </h3>
      
      {subscriptions.map((subscription) => (
        <Card key={subscription.id} className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Plan Image */}
                {subscription.plan.photo_url && (
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
                    <img 
                      src={subscription.plan.photo_url} 
                      alt={subscription.plan.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div>
                  <CardTitle className="text-white text-lg">
                    {subscription.plan.name}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(subscription.status, subscription.cancel_at_period_end)}
                    <Badge variant="outline" className="border-slate-600 text-slate-300">
                      {subscription.plan.price}€/{getCycleText(subscription.plan.cycle)}
                    </Badge>
                  </div>
                </div>
              </div>
              
              {subscription.status === 'active' && !subscription.cancel_at_period_end && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-slate-800 border-slate-700 max-w-[calc(100%-2rem)] sm:max-w-lg mx-4 p-4 sm:p-6">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white">
                        ¿Deseas cancelar tu suscripción?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-300 space-y-3">
                        <p>
                          Para cancelar tu suscripción <strong className="text-white">{subscription.plan.name}</strong>, 
                          por favor ponte en contacto con nuestro centro.
                        </p>
                        <p>
                          Nuestro equipo te ayudará con el proceso y resolverá cualquier duda que tengas.
                        </p>
                        <div className="bg-slate-700/50 rounded-lg p-3 mt-4 flex items-center gap-2">
                          <Phone className="h-4 w-4 text-slate-400" />
                          <span className="text-sm text-slate-400">
                            Llámanos o escríbenos por WhatsApp
                          </span>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
                        Entendido
                      </AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  Inicio: {format(new Date(subscription.start_date), 'dd MMM yyyy', { locale: es })}
                </span>
              </div>
              
              {/* Show billing/cancellation info based on status */}
              {subscription.status === 'active' && (
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  <span>
                    {subscription.cancel_at_period_end 
                      ? `Se cancelará: ${format(new Date(subscription.next_billing_date), 'dd MMM yyyy', { locale: es })}`
                      : `Próxima renovación: ${format(new Date(subscription.next_billing_date), 'dd MMM yyyy', { locale: es })}`
                    }
                  </span>
                </div>
              )}
              
              {subscription.status === 'cancelled' && (
                <div className="flex items-center gap-2">
                  <X className="h-4 w-4 text-red-400" />
                  <span className="text-red-300">
                    Cancelada: {format(new Date(subscription.next_billing_date), 'dd MMM yyyy', { locale: es })}
                  </span>
                </div>
              )}
              
              {(subscription.plan.cap_per_cycle || subscription.plan.sessions_count) ? (
                <div className="space-y-1">
                  <div className="text-slate-400">
                    Incluye {subscription.plan.cap_per_cycle || subscription.plan.sessions_count} sesiones por {getCycleText(subscription.plan.cycle)}
                  </div>
                  <div className="text-sm">
                    {(() => {
                      // Calcular si está efectivamente bloqueado
                      const isNextCycleExhausted = subscription.nextCycleUsedSessions && subscription.nextCycleUsedSessions >= (subscription.plan.cap_per_cycle || subscription.plan.sessions_count || 0);
                      const daysUntilRenewal = Math.ceil(
                        (new Date(subscription.next_billing_date).getTime() - new Date().getTime()) 
                        / (1000 * 60 * 60 * 24)
                      );
                      const isEffectivelyBlocked = isNextCycleExhausted && (subscription.remainingSessions === 0 || daysUntilRenewal <= 3);
                      
                      // Si está bloqueado, mostrar todas las sesiones como usadas
                      const displayUsed = isEffectivelyBlocked ? (subscription.plan.cap_per_cycle || subscription.plan.sessions_count) : (subscription.usedSessions || 0);
                      const displayRemaining = isEffectivelyBlocked ? 0 : (subscription.remainingSessions || 0);
                      
                      return (
                        <>
                          <span className="text-slate-300">Usadas:</span> {displayUsed} / 
                          <span className="text-slate-300 ml-2">Restantes:</span> {displayRemaining}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="text-slate-400">
                  Sesiones: ilimitadas (sin límite por ciclo)
                </div>
              )}
            </div>
            
            {subscription.status === 'past_due' && (
              <Alert className="mt-3 border-orange-600 bg-orange-950/20">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                <AlertDescription className="text-orange-300">
                  Tu suscripción tiene pagos pendientes. Actualiza tu método de pago para mantenerla activa.
                </AlertDescription>
              </Alert>
            )}

            {/* Alert when sessions are exhausted */}
            {subscription.status === 'active' && 
             !subscription.cancel_at_period_end && 
             subscription.remainingSessions === 0 && (
              <Alert className="mt-3 border-yellow-600 bg-yellow-950/20">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-300">
                  Has agotado las {subscription.plan.sessions_count} sesiones de tu ciclo actual. 
                  Podrás reservar nuevamente a partir del{' '}
                  {format(new Date(subscription.next_billing_date), 'dd MMM yyyy', { locale: es })}.
                </AlertDescription>
              </Alert>
            )}

            {/* Alert when next cycle is exhausted AND (current cycle is exhausted OR less than 3 days remaining) */}
            {subscription.status === 'active' && 
             !subscription.cancel_at_period_end && 
             (subscription.plan.cap_per_cycle || subscription.plan.sessions_count) &&
             subscription.nextCycleUsedSessions && 
             subscription.nextCycleUsedSessions >= (subscription.plan.cap_per_cycle || subscription.plan.sessions_count) && 
             subscription.nextCycleStart && 
             subscription.nextCycleEnd &&
             (() => {
               const daysUntilRenewal = Math.ceil(
                 (new Date(subscription.next_billing_date).getTime() - new Date().getTime()) 
                 / (1000 * 60 * 60 * 24)
               );
               return subscription.remainingSessions === 0 || daysUntilRenewal <= 3;
             })() && (
              <Alert className="mt-3 border-orange-500 bg-orange-950/30">
                <AlertCircle className="h-4 w-4 text-orange-400" />
                <AlertDescription className="text-orange-300">
                  <strong>Próximo ciclo agotado:</strong> Has usado todas las {subscription.plan.cap_per_cycle || subscription.plan.sessions_count} sesiones 
                  del periodo {format(subscription.nextCycleStart, 'dd MMM', { locale: es })} - {format(subscription.nextCycleEnd, 'dd MMM yyyy', { locale: es })}.
                  {' '}No podrás reservar en esas fechas hasta que se renueve el ciclo.
                </AlertDescription>
              </Alert>
            )}
            
            {/* Reserve button for list view */}
            {!selectedSubscriptionId && subscription.status === 'active' && !subscription.cancel_at_period_end && (
              <div className="flex justify-center pt-4 mt-4 border-t border-slate-700">
                {(() => {
                  const isCurrentCycleExhausted = subscription.remainingSessions === 0;
                  const isNextCycleExhausted = subscription.nextCycleUsedSessions && 
                    subscription.nextCycleUsedSessions >= (subscription.plan.cap_per_cycle || subscription.plan.sessions_count || 0);
                  
                  const daysUntilRenewal = Math.ceil(
                    (new Date(subscription.next_billing_date).getTime() - new Date().getTime()) 
                    / (1000 * 60 * 60 * 24)
                  );

                  const isEffectivelyFull = isNextCycleExhausted && daysUntilRenewal <= 3;
                  const shouldDisableBooking = isCurrentCycleExhausted || isEffectivelyFull;
                  
                  return (
                    <Button 
                      size="sm" 
                      onClick={() => onNavigateToCalendar?.(subscription.id, subscription.plan.id)}
                      disabled={shouldDisableBooking}
                      className={shouldDisableBooking 
                        ? "w-full max-w-xs bg-slate-600 hover:bg-slate-600 text-slate-400 font-semibold cursor-not-allowed"
                        : "w-full max-w-xs bg-green-600 hover:bg-green-700 text-white font-semibold"
                      }
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      {isCurrentCycleExhausted ? "Ciclos agotados" : isEffectivelyFull ? "No hay fechas disponibles" : "Reservar"}
                    </Button>
                  );
                })()}
              </div>
            )}
            
            {/* Action buttons for subscription detail view */}
            {selectedSubscriptionId && subscription.status === 'active' && (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {(() => {
                  const isCurrentCycleExhausted = subscription.remainingSessions === 0;
                  const isNextCycleExhausted = subscription.nextCycleUsedSessions && 
                    subscription.nextCycleUsedSessions >= (subscription.plan.cap_per_cycle || subscription.plan.sessions_count || 0);
                  
                  const daysUntilRenewal = Math.ceil(
                    (new Date(subscription.next_billing_date).getTime() - new Date().getTime()) 
                    / (1000 * 60 * 60 * 24)
                  );

                  const isEffectivelyFull = isNextCycleExhausted && daysUntilRenewal <= 3;
                  const shouldDisableBooking = isCurrentCycleExhausted || isEffectivelyFull;

                  return (
                    <Button
                      onClick={() => onNavigateToCalendar?.(subscription.id, subscription.plan.id)}
                      disabled={shouldDisableBooking}
                      className={cn(
                        "w-full sm:flex-1 min-w-0",
                        shouldDisableBooking
                          ? "bg-slate-600 hover:bg-slate-600 text-slate-400 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      )}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      {isCurrentCycleExhausted ? "Ciclos agotados" : isEffectivelyFull ? "No hay fechas disponibles" : "Nueva Reserva"}
                    </Button>
                  );
                })()}
                {!subscription.cancel_at_period_end && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full sm:flex-1 min-w-0 whitespace-normal break-words border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancelar Suscripción
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-slate-800 border-slate-700 max-w-[calc(100%-2rem)] sm:max-w-lg mx-4 p-4 sm:p-6">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">
                          ¿Deseas cancelar tu suscripción?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-300 space-y-3">
                          <p>
                            Para cancelar tu suscripción <strong className="text-white">{subscription.plan.name}</strong>, 
                            por favor ponte en contacto con nuestro centro.
                          </p>
                          <p>
                            Nuestro equipo te ayudará con el proceso y resolverá cualquier duda que tengas.
                          </p>
                          <div className="bg-slate-700/50 rounded-lg p-3 mt-4 flex items-center gap-2">
                            <Phone className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-slate-400">
                              Llámanos o escríbenos por WhatsApp
                            </span>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
                          Entendido
                        </AlertDialogCancel>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}