import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Booking {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  payment_method: string;
  payment_status: string;
  notes?: string;
  professional?: { name: string; color?: string };
  location?: { name: string };
  service?: { name: string; duration_min: number };
}

interface CancelBookingModalProps {
  booking: Booking;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CancelBookingModal({ booking, isOpen, onClose, onSuccess }: CancelBookingModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [selectedReason, setSelectedReason] = useState('');

  const predefinedReasons = [
    'Cambio de planes',
    'Problema de horarios',
    'Enfermedad',
    'Emergencia familiar',
    'Viaje imprevisto',
    'Otro'
  ];

  const handleCancel = async () => {
    try {
      setLoading(true);

      // Comprobar antelación mínima (2 horas)
      const now = new Date();
      const bookingDate = new Date(booking.start_at);
      const minAdvanceMs = 2 * 60 * 60 * 1000;
      if (bookingDate.getTime() - now.getTime() < minAdvanceMs) {
        toast({
          title: "No se puede cancelar",
          description: "La reserva no se puede cancelar con menos de 2 horas de antelación",
          variant: "destructive"
        });
        return;
      }

      // Obtener email del usuario guardado en el widget
      let email = '';
      try {
        const saved = localStorage.getItem('reservasPro_user');
        email = saved ? (JSON.parse(saved)?.email || '') : '';
      } catch (_) {}

      // Llamar a Edge Function segura (funciona aunque el usuario no esté autenticado)
      const { data, error } = await supabase.functions.invoke('cancel-booking-public', {
        body: {
          bookingId: booking.id,
          email,
          reason: selectedReason || reason
        }
      });

      if (error) throw error;
      if (!data || data.status !== 'cancelled') {
        console.warn('[Cancel] Respuesta inesperada', data);
      }

      // Enviar webhook (solo informativo, la cancelación ya se ha realizado en el backend)
      await sendCancellationWebhook(booking, selectedReason || reason);

      toast({
        title: "Reserva cancelada",
        description: "Tu reserva ha sido cancelada correctamente",
        variant: "default"
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast({
        title: "Error",
        description: "No se pudo cancelar la reserva. Inténtalo de nuevo.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const sendCancellationWebhook = async (booking: Booking, reason: string) => {
    try {
      // Check if webhooks are enabled
      const { data: enabledSettings, error: enabledError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'webhooks.enabled')
        .maybeSingle();

      if (enabledError) {
        console.error('[Webhook] Error checking webhooks enabled:', enabledError);
        return;
      }

      if (!enabledSettings?.value) {
        console.log('[Webhook] Webhooks disabled, skipping');
        return;
      }

      // Get webhook URL
      const { data: urlSettings } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'webhooks.booking_cancelled_url')
        .maybeSingle();

      let webhookUrl = urlSettings?.value as string;
      
      if (!webhookUrl) {
        // Fallback to general webhook URL
        const { data: fallbackSettings } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'webhooks.booking_created_url')
          .maybeSingle();
        webhookUrl = fallbackSettings?.value as string;
      }

      if (!webhookUrl) {
        webhookUrl = 'https://n8n-n8ninnovagastro.zk6hny.easypanel.host/webhook-test/5d254150-f0e9-4f79-a89c-34d8b33bd559';
        console.log('[Webhook] No URL configured, using test endpoint');
      }

      webhookUrl = webhookUrl.trim().replace(/^["']|["']$/g, '');

      if (!webhookUrl || (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://'))) {
        console.error('[Webhook] Invalid URL:', webhookUrl);
        return;
      }

      const webhookPayload = {
        event: 'booking.cancelled',
        environment: 'production',
        source: 'widget',
        timestamp: new Date().toISOString(),
        booking: {
          id: booking.id,
          start_at: booking.start_at,
          end_at: booking.end_at,
          status: 'cancelled',
          payment_method: booking.payment_method,
          payment_status: booking.payment_status,
          cancellation_reason: reason
        },
        professional: {
          name: booking.professional?.name
        },
        location: {
          name: booking.location?.name
        },
        meta: {
          external_ref: `bk_${booking.id}`,
          widget_version: '1.0.0',
          ua: navigator.userAgent
        }
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ReservasPro-Event': 'booking.cancelled'
        },
        body: JSON.stringify(webhookPayload)
      });

      console.log(`[Webhook] Cancellation webhook sent, status: ${response.status}`);
    } catch (error) {
      console.error('[Webhook] Error sending cancellation webhook:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="bg-white max-w-md w-full">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Cancelar Reserva
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Reserva a cancelar:</p>
            <p className="font-medium">{booking.service?.name}</p>
            <p className="text-sm text-gray-500">
              {new Date(booking.start_at).toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="reason">Motivo de cancelación (opcional)</Label>
            
            <div className="grid grid-cols-2 gap-2">
              {predefinedReasons.map((reasonOption) => (
                <button
                  key={reasonOption}
                  type="button"
                  onClick={() => {
                    setSelectedReason(reasonOption);
                    if (reasonOption !== 'Otro') setReason('');
                  }}
                  className={`text-xs p-2 rounded border transition-colors ${
                    selectedReason === reasonOption
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                  }`}
                >
                  {reasonOption}
                </button>
              ))}
            </div>

            {(selectedReason === 'Otro' || selectedReason === '') && (
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe el motivo de la cancelación..."
                rows={3}
              />
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
            <p className="text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 inline mr-1" />
              Esta acción no se puede deshacer. La reserva será cancelada y se enviará una notificación.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Mantener reserva
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelando...
                </>
              ) : (
                'Cancelar reserva'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}