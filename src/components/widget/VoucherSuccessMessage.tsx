import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Ticket, Calendar } from "lucide-react";
import { calculateVoucherBalance } from '@/lib/voucher-utils';

interface VoucherSuccessMessageProps {
  voucherType: {
    name: string;
    sessions_count: number;
  };
  voucherId?: string; // Add voucherId to calculate accurate balance
  onReserveNow?: () => void;
  onGoToAccount?: () => void;
}

export default function VoucherSuccessMessage({
  voucherType,
  voucherId,
  onReserveNow,
  onGoToAccount
}: VoucherSuccessMessageProps) {
  const [balance, setBalance] = useState<{ remaining: number; total: number } | null>(null);
  const [loading, setLoading] = useState(!!voucherId);

  useEffect(() => {
    if (voucherId) {
      calculateVoucherBalance(voucherId)
        .then((voucherBalance) => {
          setBalance({
            remaining: voucherBalance.remaining,
            total: voucherBalance.total
          });
          console.log(`[UI] VoucherSuccess updated remaining=${voucherBalance.remaining}`);
        })
        .catch((error) => {
          console.error('Error calculating voucher balance:', error);
          // Fallback to voucher type data
          setBalance({
            remaining: voucherType.sessions_count,
            total: voucherType.sessions_count
          });
        })
        .finally(() => setLoading(false));
    } else {
      // Use voucher type data as fallback
      setBalance({
        remaining: voucherType.sessions_count,
        total: voucherType.sessions_count
      });
      setLoading(false);
    }
  }, [voucherId, voucherType.sessions_count]);

  const sessionsText = (balance?.total || voucherType.sessions_count) === 1 ? 'sesión' : 'sesiones';

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
                ¡Bono activado!
              </h1>
              <p className="text-gray-600">
                Tu bono "<strong>{voucherType.name}</strong>" ha sido activado correctamente
              </p>
            </div>

            <div className="bg-widget-secondary/10 rounded-lg p-4 mb-6 border border-widget-secondary/20">
              <div className="flex items-center justify-center gap-2 text-widget-secondary">
                <Ticket className="h-5 w-5" />
                <span className="font-semibold">
                  {loading ? (
                    'Calculando créditos...'
                  ) : balance ? (
                    `Te quedan ${balance.remaining} de ${balance.total} ${sessionsText}`
                  ) : (
                    `Te quedan ${voucherType.sessions_count} de ${voucherType.sessions_count} ${sessionsText}`
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {onReserveNow && (
                <Button 
                  onClick={onReserveNow}
                  className="w-full bg-widget-secondary hover:bg-widget-secondary/90 text-white"
                  size="lg"
                >
                  <Calendar className="mr-2 h-5 w-5" />
                  Reservar ahora
                </Button>
              )}

              {onGoToAccount && (
                <Button 
                  onClick={onGoToAccount}
                  variant="outline"
                  className="w-full border-widget-primary text-widget-primary hover:bg-widget-primary hover:text-widget-text"
                  size="lg"
                >
                  Ver mis bonos
                </Button>
              )}
            </div>

            <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-blue-700 text-sm">
                💡 <strong>¡Ya no necesitas pagar!</strong> Las próximas reservas con este bono no pasarán por checkout.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}