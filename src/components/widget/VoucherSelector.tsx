import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Ticket } from "lucide-react";
import { UserVoucher } from "@/hooks/useVouchers";

interface VoucherSelectorProps {
  vouchers: UserVoucher[];
  selectedVoucherId?: string;
  onVoucherSelect: (voucher: UserVoucher) => void;
  onPayNormal: () => void;
}

export default function VoucherSelector({
  vouchers,
  selectedVoucherId,
  onVoucherSelect,
  onPayNormal
}: VoucherSelectorProps) {
  if (vouchers.length === 0) {
    onPayNormal();
    return null;
  }

  // If only one voucher, select it automatically
  if (vouchers.length === 1 && !selectedVoucherId) {
    const voucher = vouchers[0];
    onVoucherSelect(voucher);
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-white mb-2">Selecciona tu bono</h3>
        <p className="text-white/80 text-sm">Tienes {vouchers.length} bonos disponibles para esta reserva</p>
      </div>

      <div className="space-y-3">
        {vouchers.map((voucher) => (
          <Card 
            key={voucher.id} 
            className={`bg-white/10 border-white/20 cursor-pointer transition-all ${
              selectedVoucherId === voucher.id ? 'ring-2 ring-green-400 bg-green-500/20' : 'hover:bg-white/15'
            }`}
            onClick={() => onVoucherSelect(voucher)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg flex-shrink-0">
                  <Ticket className="h-5 w-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-white mb-1">
                    {voucher.voucher_type.name}
                  </h4>
                  {voucher.voucher_type.description && (
                    <p className="text-white/70 text-sm mb-2">
                      {voucher.voucher_type.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="bg-green-500/20 text-green-300 border-green-500/30">
                      {voucher.sessions_remaining} {voucher.sessions_remaining === 1 ? 'sesión' : 'sesiones'} restantes
                    </Badge>
                    {voucher.expiry_date && (
                      <Badge variant="outline" className="border-white/30 text-white/80">
                        Caduca: {new Date(voucher.expiry_date).toLocaleDateString('es-ES')}
                      </Badge>
                    )}
                  </div>
                </div>
                {selectedVoucherId === voucher.id && (
                  <div className="text-green-400">
                    ✓
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="pt-4 border-t border-white/10">
        <Button 
          onClick={onPayNormal}
          variant="outline"
          className="w-full border-white/30 text-white hover:bg-white/10"
          size="lg"
        >
          Pagar normalmente (no usar bono)
        </Button>
      </div>

      {selectedVoucherId && (
        <div className="mt-4">
          <Button 
            onClick={() => {
              const selectedVoucher = vouchers.find(v => v.id === selectedVoucherId);
              if (selectedVoucher) {
                onVoucherSelect(selectedVoucher);
              }
            }}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="lg"
          >
            Usar bono seleccionado
          </Button>
        </div>
      )}
    </div>
  );
}