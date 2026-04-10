import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, X, Loader2, CreditCard, Banknote } from "lucide-react";
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
  type: string;
  service_name?: string;
  class_name?: string;
  professional_name?: string;
  location_name?: string;
  user_name?: string;
  price?: number;
  currency?: string;
}

interface AdminCancelBookingModalProps {
  booking: Booking;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AdminCancelBookingModal({ booking, isOpen, onClose, onSuccess }: AdminCancelBookingModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [cancellationType, setCancellationType] = useState<'without_refund' | 'with_refund'>('without_refund');

  const predefinedReasons = [
    'Cancelación del cliente',
    'Problema técnico',
    'Emergencia del profesional',
    'Fuerza mayor',
    'Error administrativo',
    'Otro'
  ];

  const isPaid = booking.payment_status === 'paid';
  const showRefundOption = isPaid;

  const handleCancel = async () => {
    try {
      setLoading(true);
      const shouldRefund = cancellationType === 'with_refund';
      
      console.log(`[Admin.Cancel] action=${shouldRefund ? 'cancel+refund' : 'cancel'} booking=${booking.id}`);

      // Always update booking status to cancelled
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
          notes: (booking.notes || '') + `\n\nCancelado por admin: ${selectedReason || reason || 'Sin motivo especificado'}`
        })
        .eq('id', booking.id);

      if (bookingError) throw bookingError;

      let insertedPayment = false;
      let updatedBooking = false;

      // Handle refund if requested and booking was paid
      if (shouldRefund && isPaid) {
        if (booking.payment_method === 'cash') {
          // Cash refund - manual refund process
          try {
            // Update booking payment status for cash refund
            const { error: paymentStatusError } = await supabase
              .from('bookings')
              .update({
                payment_status: 'refunded',
                updated_at: new Date().toISOString()
              })
              .eq('id', booking.id);

            if (!paymentStatusError) {
              updatedBooking = true;
              insertedPayment = true; // For logging
            }

          } catch (error) {
            console.error('Error processing cash refund:', error);
          }

        } else if (booking.payment_method === 'card') {
          // Card refund - mark as refund pending for now
          try {
            const { error: paymentStatusError } = await supabase
              .from('bookings')
              .update({
                payment_status: 'refund_pending',
                updated_at: new Date().toISOString()
              })
              .eq('id', booking.id);

            if (!paymentStatusError) {
              updatedBooking = true;
            }
          } catch (error) {
            console.error('Error processing card refund:', error);
          }
        }
      }

      console.log(`[Admin.Cancel] action=${shouldRefund ? 'cancel+refund' : 'cancel'} booking=${booking.id} insertedPayment=${insertedPayment} updatedBooking=${updatedBooking}`);

      const successMessage = shouldRefund 
        ? `Reserva cancelada y ${booking.payment_method === 'cash' ? 'marcada para reembolso manual' : 'reembolso iniciado'}`
        : 'Reserva cancelada correctamente';

      toast({
        title: "Reserva cancelada",
        description: successMessage,
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
            <p className="font-medium">{booking.service_name || booking.class_name}</p>
            <p className="text-sm text-gray-500">
              {booking.user_name} - {new Date(booking.start_at).toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
            {isPaid && (
              <div className="flex items-center gap-2 mt-2 text-sm">
                {booking.payment_method === 'card' ? (
                  <CreditCard className="h-4 w-4" />
                ) : (
                  <Banknote className="h-4 w-4" />
                )}
                <span className="text-green-600 font-medium">
                  Pagado {booking.payment_method === 'card' ? 'con tarjeta' : 'en efectivo'}
                </span>
              </div>
            )}
          </div>

          {showRefundOption && (
            <div className="space-y-3">
              <Label>Tipo de cancelación</Label>
              <RadioGroup 
                value={cancellationType} 
                onValueChange={(value) => setCancellationType(value as 'without_refund' | 'with_refund')}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="without_refund" id="without_refund" />
                  <Label htmlFor="without_refund" className="font-normal">
                    Cancelar sin reembolso (mantener ingreso)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="with_refund" id="with_refund" />
                  <Label htmlFor="with_refund" className="font-normal">
                    Cancelar y reembolsar {booking.payment_method === 'cash' ? '(manual)' : '(automático)'}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="space-y-3">
            <Label htmlFor="reason">Motivo de cancelación</Label>
            
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
              {cancellationType === 'with_refund' 
                ? 'Se cancelará la reserva y se procesará el reembolso. Esta acción no se puede deshacer.'
                : 'Se cancelará la reserva liberando la plaza. El ingreso se mantendrá.'
              }
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Cancelar
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
                  Procesando...
                </>
              ) : (
                cancellationType === 'with_refund' ? 'Cancelar y reembolsar' : 'Cancelar sin reembolso'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}