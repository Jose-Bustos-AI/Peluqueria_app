import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Ticket, ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VoucherSuccessProps {
  sessionId?: string;
  onBack: () => void;
  onReserveNow?: () => void;
}

interface VoucherInfo {
  id: string;
  voucher_type_id: string;
  sessions_remaining: number;
  voucher_type: {
    name: string;
    sessions_count: number;
  };
}

export default function VoucherSuccess({
  sessionId,
  onBack,
  onReserveNow
}: VoucherSuccessProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(!!sessionId);
  const [voucher, setVoucher] = useState<VoucherInfo | null>(null);
  const [polling, setPolling] = useState(false);
  const [autoRedirectCountdown, setAutoRedirectCountdown] = useState(5);

  useEffect(() => {
    if (sessionId) {
      // Poll for voucher creation after Stripe success
      pollForVoucher();
    }
  }, [sessionId]);

  // Auto-redirect countdown cuando el voucher ya está cargado
  useEffect(() => {
    if (!loading && !polling && voucher && onReserveNow) {
      const timer = setInterval(() => {
        setAutoRedirectCountdown(prev => {
          if (prev <= 1) {
            // Marcar que se acaba de comprar un bono y redirigir
            localStorage.setItem('reservasPro_voucherPurchased', 'true');
            onReserveNow();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [loading, polling, voucher, onReserveNow]);

  const pollForVoucher = async () => {
    console.log('[Voucher] success view session_id=', sessionId);
    
    if (!sessionId) return;

    setPolling(true);
    let attempts = 0;
    const maxAttempts = 10;
    const pollInterval = 2000; // 2 seconds

    const poll = async () => {
      attempts++;
      console.log('[Voucher] polling attempt', attempts, 'of', maxAttempts);

      try {
        // Get user from localStorage
        const userDataStr = localStorage.getItem('reservasPro_user');
        if (!userDataStr) {
          console.error('[Voucher] No user data in localStorage');
          return;
        }

        const userData = JSON.parse(userDataStr);
        const userId = userData.userShadowId;

        if (!userId) {
          console.error('[Voucher] No user ID found');
          return;
        }

// Get the most recent ACTIVE voucher with sessions available for this user
const { data: vouchers, error } = await supabase
  .from('vouchers')
  .select(`
    id,
    voucher_type_id,
    sessions_remaining,
    voucher_type:voucher_types(name, sessions_count)
  `)
  .eq('user_id', userId)
  .eq('status', 'active')
  .gt('sessions_remaining', 0)
  .order('created_at', { ascending: false })
  .limit(1);

        if (error) {
          console.error('[Voucher] Error fetching vouchers:', error);
          throw error;
        }

if (vouchers && vouchers.length > 0) {
  const voucherData = vouchers[0] as VoucherInfo;
  setVoucher(voucherData);
  try {
    localStorage.setItem('reservasPro_verifiedVoucherId', voucherData.id);
    localStorage.setItem('reservasPro_selectedVoucherTypeId', voucherData.voucher_type_id);
    // Clear voucherFlow after successful purchase
    localStorage.removeItem('reservasPro_voucherFlow');
  } catch {}
  setLoading(false);
  setPolling(false);
  
  console.log('[Voucher] success view voucher_id=', voucherData.id, 'remaining=', voucherData.sessions_remaining);
          
          toast({
            title: "¡Bono comprado con éxito!",
            description: `${voucherData.voucher_type.name} - ${voucherData.sessions_remaining}/${voucherData.voucher_type.sessions_count} créditos disponibles`,
            variant: "default"
          });
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          // Max attempts reached
          setLoading(false);
          setPolling(false);
          toast({
            title: "Pago procesado",
            description: "Tu bono está siendo procesado. Los créditos aparecerán en breve.",
            variant: "default"
          });
        }

      } catch (err) {
        console.error('[Voucher] Polling error:', err);
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          setLoading(false);
          setPolling(false);
          toast({
            title: "Error",
            description: "Error al verificar el estado del bono",
            variant: "destructive"
          });
        }
      }
    };

    poll();
  };

  if (loading || polling) {
    return (
      <div className="min-h-screen bg-widget-primary p-4 flex items-center justify-center">
        <div className="text-center text-widget-text">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">Procesando tu compra...</p>
          <p className="text-sm opacity-80">Esto puede tomar unos segundos</p>
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
            <h1 className="text-xl font-semibold text-white">¡Bono comprado!</h1>
          </div>
        </div>

        {/* Success Card */}
        <Card className="bg-white/95 backdrop-blur-sm mb-6">
          <CardContent className="p-6 text-center">
            <div className="mb-6">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                ¡Compra exitosa!
              </h2>
              <p className="text-gray-600">
                Tu bono ha sido activado correctamente
              </p>
            </div>

            {voucher && (
              <div className="bg-blue-50 rounded-lg p-4 mb-6 border border-blue-200">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Ticket className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-blue-900">
                    {voucher.voucher_type.name}
                  </span>
                </div>
                <p className="text-blue-700 text-sm">
                  <span className="font-semibold">{voucher.sessions_remaining}</span> de{' '}
                  <span className="font-semibold">{voucher.voucher_type.sessions_count}</span> créditos disponibles
                </p>
              </div>
            )}

            <div className="space-y-3">
              {onReserveNow && (
                <>
                  <Button
                    onClick={() => {
                      localStorage.setItem('reservasPro_voucherPurchased', 'true');
                      onReserveNow();
                    }}
                    className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Reservar ahora {autoRedirectCountdown > 0 && autoRedirectCountdown < 5 && `(${autoRedirectCountdown})`}
                  </Button>
                  {autoRedirectCountdown > 0 && autoRedirectCountdown < 5 && (
                    <p className="text-center text-sm text-gray-600">
                      Redirigiendo automáticamente en {autoRedirectCountdown} segundos...
                    </p>
                  )}
                </>
              )}
              
              <Button
                variant="outline"
                onClick={onBack}
                className="w-full h-12 font-medium"
              >
                Volver a bonos
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-white/95 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                <Ticket className="h-4 w-4 text-blue-600" />
              </div>
              <div className="text-sm text-gray-600">
                <p className="font-medium mb-1">¿Qué puedes hacer ahora?</p>
                <ul className="space-y-1 text-xs">
                  <li>• Reservar sesiones sin pasar por pago</li>
                  <li>• Ver tus créditos disponibles en "Mis bonos"</li>
                  <li>• Los créditos se descontarán automáticamente</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}