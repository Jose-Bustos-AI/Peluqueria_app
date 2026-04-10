import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Calendar, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SubscriptionSuccessMessageProps {
  subscriptionId: string;
  onReserveNow?: () => void;
  onGoToAccount?: () => void;
}

export default function SubscriptionSuccessMessage({
  subscriptionId,
  onReserveNow,
  onGoToAccount
}: SubscriptionSuccessMessageProps) {
  const [sessionsInfo, setSessionsInfo] = useState<{
    remaining: number;
    total: number;
    planName: string;
    isUnlimited: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSessionsInfo = async () => {
      try {
        console.log('[SubSuccess] Loading sessions info for booking with subscriptionId:', subscriptionId);
        
        // Get subscription and plan details
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select(`
            user_id,
            start_date,
            next_billing_date,
            plan:subscription_plans (name, cap_per_cycle, sessions_count)
          `)
          .eq('id', subscriptionId)
          .single();

        if (!subscription?.plan) return;

        const planSessions = subscription.plan.cap_per_cycle ?? subscription.plan.sessions_count;
        if (!planSessions) {
          setSessionsInfo({
            remaining: Infinity,
            total: Infinity,
            planName: subscription.plan.name,
            isUnlimited: true
          });
          return;
        }

        // Calculate current cycle based on start_date and next_billing_date
        const nextBilling = new Date(subscription.next_billing_date);
        const cycleStart = new Date(nextBilling);
        cycleStart.setMonth(cycleStart.getMonth() - 1);
        const cycleEnd = nextBilling;

        // Count used sessions in current cycle (support both JSON and text formats)
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id')
          .eq('origin', 'subscription')
          .like('notes', `%"subscriptionId":"${subscriptionId}"%`)
          .neq('status', 'cancelled')
          .gte('start_at', cycleStart.toISOString())
          .lt('start_at', cycleEnd.toISOString());

        const used = bookings?.length || 0;
        const remaining = Math.max(0, planSessions - used);

        console.log(`[SubSuccess] planSessions=${planSessions}, used=${used}, remaining=${remaining}`);

        setSessionsInfo({
          remaining,
          total: planSessions,
          planName: subscription.plan.name,
          isUnlimited: false
        });

      } catch (error) {
        console.error('[SubSuccess] Error loading sessions info:', error);
      } finally {
        setLoading(false);
      }
    };

    if (subscriptionId) {
      loadSessionsInfo();
    }
  }, [subscriptionId]);

  return (
    <div className="min-h-screen bg-widget-primary p-4">
      <div className="max-w-md mx-auto pt-20">
        <Card className="bg-white/90 backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                ¡Suscripción activada!
              </h1>
              <p className="text-gray-600">
                Tu suscripción se ha activado correctamente
              </p>
            </div>

            {sessionsInfo && (
              <div className="bg-purple-50 rounded-lg p-4 mb-6 border border-purple-200">
                <div className="flex items-center justify-center gap-2 text-purple-700">
                  <CreditCard className="h-5 w-5" />
                  <span className="font-semibold">
                    {loading ? (
                      'Calculando sesiones...'
                    ) : sessionsInfo.isUnlimited ? (
                      'Sesiones ilimitadas'
                    ) : (
                      `Te quedan ${sessionsInfo.remaining} sesiones este ciclo`
                    )}
                  </span>
                </div>
                {sessionsInfo.planName && (
                  <p className="text-sm text-purple-600 mt-2">
                    Plan: {sessionsInfo.planName}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3">
              {onReserveNow && (
                <Button 
                  onClick={onReserveNow}
                  className="w-full bg-widget-secondary hover:bg-widget-secondary/90 text-white"
                  size="lg"
                >
                  <Calendar className="mr-2 h-5 w-5" />
                  Hacer mi primera reserva
                </Button>
              )}

              {onGoToAccount && (
                <Button 
                  onClick={onGoToAccount}
                  variant="outline"
                  className="w-full border-widget-primary text-widget-primary hover:bg-widget-primary hover:text-widget-text"
                  size="lg"
                >
                  Ver mis suscripciones
                </Button>
              )}
            </div>

            <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-blue-700 text-sm">
                💡 <strong>¡Ya puedes reservar!</strong> Tus reservas con esta suscripción están incluidas en tu plan.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}