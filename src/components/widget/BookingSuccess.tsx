import React, { useEffect, useMemo, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Calendar, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClassAvailability } from '@/hooks/useClassAvailability';
import { calculateVoucherBalance } from '@/lib/voucher-utils';

interface BookingSuccessProps {
  onContinue: () => void;
}

export default function BookingSuccess({ onContinue }: BookingSuccessProps) {
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [status, setStatus] = useState<'unknown' | 'paid' | 'unpaid' | 'processing' | 'pending'>('processing');
  const [bookingData, setBookingData] = useState<any>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [voucherInfo, setVoucherInfo] = useState<any>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);

  // Initialize class availability hook for potential refresh
  const classAvailability = useClassAvailability(
    bookingData?.class_id || undefined,
    bookingData?.location_id || undefined
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const id = params.get('booking_id');
    setBookingId(id);
    if (id) {
      console.log('[Success] start booking=', id);
    }
  }, []);

  const startPolling = () => {
    if (!bookingId || isPolling) return;
    
    setIsPolling(true);
    setPollAttempts(0);
    setStatus('processing');
    
    const interval = setInterval(async () => {
      setPollAttempts(current => {
        const newAttempts = current + 1;
        
        (async () => {
          try {
            // Check booking status
            const { data: booking, error: bookingError } = await supabase
              .from('bookings')
              .select('payment_status, type, class_id, location_id, payment_method, origin, notes, user_id')
              .eq('id', bookingId)
              .maybeSingle();
            
            if (bookingError) throw bookingError;
            setBookingData(booking);

            // If it's a subscription booking, get subscription information
            if (booking?.origin === 'subscription' && booking.notes) {
              try {
                const subscriptionData = JSON.parse(booking.notes);
                if (subscriptionData.subscriptionId && subscriptionData.planId) {
                  // Get plan details
                  const { data: plan } = await supabase
                    .from('subscription_plans')
                    .select('name, sessions_count')
                    .eq('id', subscriptionData.planId)
                    .maybeSingle();

                  if (plan) {
                    // Calculate current cycle usage
                    const now = new Date();
                    const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

                    const { count: usedSessions } = await supabase
                      .from('bookings')
                      .select('id', { head: true, count: 'exact' })
                      .eq('user_id', booking.user_id)
                      .eq('origin', 'subscription')
                      .neq('status', 'cancelled')
                      .gte('start_at', cycleStart.toISOString())
                      .lte('start_at', cycleEnd.toISOString());

                    const used = usedSessions || 0;
                    const remaining = plan.sessions_count ? Math.max(0, plan.sessions_count - used) : Infinity;

                    console.log(`[SubSuccess] planSessions=${plan.sessions_count}, used=${used}, remaining=${remaining}`);

                    setSubscriptionInfo({
                      planName: plan.name,
                      remaining,
                      total: plan.sessions_count,
                      isUnlimited: !plan.sessions_count
                    });
                  }
                }
              } catch (subError) {
                console.warn('[Success] subscription info error', subError);
              }
            }

            // If it's a voucher booking, ensure redemption exists and show info
            if (booking?.origin === 'voucher') {
              try {
                // Ensure voucher redemption exists (idempotent)
                let { data: existingRedemption } = await supabase
                  .from('voucher_redemptions')
                  .select('id, voucher_id')
                  .eq('booking_id', bookingId)
                  .maybeSingle();

                if (!existingRedemption) {
                  let voucherId: string | null = null;
                  try {
                    voucherId = localStorage.getItem('reservasPro_verifiedVoucherId');
                    if (!voucherId) {
                      const savedFlow = localStorage.getItem('reservasPro_voucherFlow');
                      voucherId = savedFlow ? JSON.parse(savedFlow).voucherId : null;
                    }
                  } catch {}
                  
                  if (voucherId) {
                    const { error: redemptionError } = await supabase
                      .from('voucher_redemptions')
                      .insert([{ voucher_id: voucherId, booking_id: bookingId, credits_used: 1, status: 'captured' }]);
                    if (redemptionError) {
                      console.warn('[Success] automatic voucher redemption failed', redemptionError);
                    } else {
                      existingRedemption = { id: 'new', voucher_id: voucherId } as any;
                      console.log('[Success] automatic voucher redemption inserted');
                    }
                  } else {
                    console.warn('[Success] voucherId not found for auto-redeem');
                  }
                }

                if (existingRedemption?.voucher_id) {
                  const balance = await calculateVoucherBalance(existingRedemption.voucher_id as string);
                  const { data: voucherData } = await supabase
                    .from('vouchers')
                    .select('voucher_types(name)')
                    .eq('id', existingRedemption.voucher_id as string)
                    .maybeSingle();
                  const voucherName = voucherData?.voucher_types?.name || 'Bono';
                  console.log('[BookingSuccess] Voucher balance calculated:', balance);
                  setVoucherInfo({ remaining: balance.remaining, total: balance.total, name: voucherName });
                }
              } catch (voucherError) {
                console.warn('[Success] voucher info error', voucherError);
              }
            }

            // Check payments table
            const { count: paymentsCount, error: paymentsError } = await supabase
              .from('payments')
              .select('id', { head: true, count: 'exact' })
              .eq('booking_id', bookingId)
              .in('status', ['paid', 'succeeded']);

            if (paymentsError) {
              console.warn('[Success] payments check error', paymentsError);
            }

            const bookingPaid = booking?.payment_status === 'paid';
            const paymentsPaid = (paymentsCount || 0) > 0;
            const isPaid = bookingPaid || paymentsPaid;

            console.log(`[Success] poll i=${newAttempts} status=${booking?.payment_status || 'null'} payments=${paymentsCount || 0}`);

            if (isPaid) {
              console.log(`[Success] resolved PAID (by ${bookingPaid ? 'booking' : 'payments'})`);
              setStatus('paid');
              setIsPolling(false);
              clearInterval(interval);

              // If payment just became paid and it's a class booking, refresh availability
              if (booking?.type === 'class' && classAvailability?.refreshAvailability) {
                console.log('[BookingSuccess] Payment confirmed, refreshing class availability');
                classAvailability.refreshAvailability();
              }
            } else if (newAttempts >= 5) {
              console.log('[Success] timeout pending');
              setStatus('pending');
              setIsPolling(false);
              clearInterval(interval);
            }
          } catch (e) {
            console.error('[Success] poll error', e);
            if (newAttempts >= 5) {
              setStatus('pending');
              setIsPolling(false);
              clearInterval(interval);
            }
          }
        })();

        return newAttempts;
      });
    }, 2000);

    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  };

  useEffect(() => {
    if (bookingId && !isPolling) {
      startPolling();
    }
  }, [bookingId]);

  const handleRetry = () => {
    startPolling();
  };

  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-white" />
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-white text-2xl font-bold">¡Gracias por tu reserva!</h1>
        {(status === 'paid' || bookingData?.origin === 'voucher' || bookingData?.origin === 'subscription') ? (
          bookingData?.origin === 'subscription' && subscriptionInfo ? (
            <p className="text-white/80">
              ¡Reserva confirmada con tu suscripción! 
              {subscriptionInfo.isUnlimited ? (
                ` Tienes sesiones ilimitadas con ${subscriptionInfo.planName}`
              ) : (
                ` Te quedan ${subscriptionInfo.remaining} sesiones este ciclo (${subscriptionInfo.planName})`
              )}
            </p>
          ) : voucherInfo || bookingData?.origin === 'voucher' ? (
            <p className="text-white/80">
              {voucherInfo
                ? `¡Reserva confirmada con tu bono! Te quedan ${voucherInfo.remaining} de ${voucherInfo.total} sesiones en tu ${voucherInfo.name}`
                : '¡Reserva confirmada con tu bono!'}
            </p>
          ) : (
            <p className="text-white/80">Tu reserva se ha confirmado correctamente.</p>
          )
        ) : status === 'processing' ? (
          <p className="text-white/80 flex items-center gap-2 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Procesando pago…
          </p>
        ) : status === 'pending' ? (
          <p className="text-white/80">Pago pendiente de confirmación.</p>
        ) : (
          <p className="text-white/80">Aún estamos confirmando tu pago.</p>
        )}
      </div>

      <Card className="bg-white/10 border-white/20 p-6">
        <div className="space-y-4 text-left">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-white" />
            <div className="text-white">
              <p className="text-sm text-white/70">Estado de pago:</p>
              <p className="text-sm mt-2">
                {status === 'paid' ? 'Pagado' : 
                 status === 'processing' ? 'Procesando…' :
                 status === 'pending' ? 'Pendiente' : 'Verificando...'}
              </p>
              {/* ID de reserva oculto para mejor estética */}
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <Button
          onClick={onContinue}
          className="w-full h-12 bg-white text-gray-900 hover:bg-gray-100 font-semibold"
        >
          Ir a Mi Cuenta
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
        
        {status === 'pending' ? (
          <Button
            onClick={handleRetry}
            variant="outline"
            className="w-full border-white/20 text-white hover:bg-white/10 bg-transparent"
            disabled={isPolling}
          >
            {isPolling ? 'Verificando...' : 'Reintentar verificación'}
          </Button>
        ) : (
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="w-full border-white/20 text-white hover:bg-white/10 bg-transparent"
          >
            Refrescar estado
          </Button>
        )}
      </div>
    </div>
  );
}