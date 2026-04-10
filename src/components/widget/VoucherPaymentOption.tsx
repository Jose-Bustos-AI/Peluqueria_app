import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Ticket, AlertCircle } from "lucide-react";
import { useVoucherEligibility, UserVoucher } from "@/hooks/useVouchers";

interface VoucherPaymentOptionProps {
  serviceId?: string;
  categoryId?: string;
  userId?: string;
  onUseVoucher: (voucher: UserVoucher) => void;
  onPayNormal: () => void;
}

export default function VoucherPaymentOption({
  serviceId,
  categoryId,
  userId,
  onUseVoucher,
  onPayNormal
}: VoucherPaymentOptionProps) {
  const { eligible, userCredits, applicableVouchers } = useVoucherEligibility(
    serviceId, 
    categoryId, 
    userId
  );

  console.log('[VoucherPaymentOption]', { 
    serviceId, 
    categoryId, 
    userId, 
    eligible, 
    userCredits, 
    applicableVouchers: applicableVouchers.length 
  });

  // If user has no applicable vouchers, show normal payment flow
  if (!eligible || userCredits === 0 || applicableVouchers.length === 0) {
    onPayNormal();
    return null;
  }

  // Select the best voucher (closest to expiry, or first available)
  const selectedVoucher = applicableVouchers.sort((a, b) => {
    if (a.expiry_date && b.expiry_date) {
      return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
    }
    if (a.expiry_date && !b.expiry_date) return -1;
    if (!a.expiry_date && b.expiry_date) return 1;
    return 0;
  })[0];

  const handleUseVoucher = () => {
    console.log('[VoucherPaymentOption] Using voucher:', selectedVoucher);
    onUseVoucher(selectedVoucher);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-4">
      <div className="max-w-md mx-auto pt-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-white mb-2">Método de pago</h1>
          <p className="text-white/80 text-sm">Tienes bonos disponibles para esta reserva</p>
        </div>

        <div className="space-y-4">
          {/* Voucher Option */}
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-green-500/20 rounded-lg flex-shrink-0">
                  <Ticket className="h-5 w-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-white mb-1">
                    Usar mi bono
                  </h3>
                  <p className="text-white/80 text-sm mb-2">
                    {selectedVoucher.voucher_type.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-green-500/20 text-green-300 border-green-500/30">
                      {selectedVoucher.sessions_remaining} {selectedVoucher.sessions_remaining === 1 ? 'sesión' : 'sesiones'} restantes
                    </Badge>
                    {selectedVoucher.expiry_date && (
                      <Badge variant="outline" className="border-white/30 text-white/80">
                        Caduca: {new Date(selectedVoucher.expiry_date).toLocaleDateString('es-ES')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              <Button 
                onClick={handleUseVoucher}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                size="lg"
              >
                <Ticket className="mr-2 h-4 w-4" />
                Usar bono (1 crédito)
              </Button>
            </CardContent>
          </Card>

          {/* Alternative Payment Option */}
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-white mb-1">
                    Pagar normalmente
                  </h3>
                  <p className="text-white/80 text-sm">
                    Mantener el bono para otra ocasión
                  </p>
                </div>
              </div>
              
              <Button 
                onClick={onPayNormal}
                variant="outline"
                className="w-full border-white/30 text-white hover:bg-white/10"
                size="lg"
              >
                Continuar con pago normal
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Info about multiple vouchers */}
        {applicableVouchers.length > 1 && (
          <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
            <p className="text-white/80 text-sm text-center">
              💡 Tienes {applicableVouchers.length} bonos aplicables. Se usará el que caduca antes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}