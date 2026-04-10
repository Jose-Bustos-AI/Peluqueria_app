import React, { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useUserVouchers, useVoucherEligibility } from "@/hooks/useVouchers";

interface VoucherGuardProps {
  serviceId?: string;
  categoryId?: string;
  children: React.ReactNode;
  onRedirectToPurchase: (voucherTypeId: string) => void;
}

export default function VoucherGuard({
  serviceId,
  categoryId,
  children,
  onRedirectToPurchase
}: VoucherGuardProps) {
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Get user ID from localStorage
  useEffect(() => {
    const userData = localStorage.getItem('reservasPro_user');
    if (userData) {
      const parsed = JSON.parse(userData);
      setUserId(parsed.userShadowId);
    }
    setChecking(false);
  }, []);

  const { eligible, userCredits, applicableVouchers } = useVoucherEligibility(
    serviceId,
    categoryId,
    userId || undefined
  );

  console.log('[VoucherGuard] Check eligibility:', {
    serviceId,
    categoryId,
    userId,
    eligible,
    userCredits,
    applicableVouchers: applicableVouchers.length
  });

  // If still checking or user has valid vouchers, render children
  if (checking || (eligible && userCredits > 0 && applicableVouchers.length > 0)) {
    return <>{children}</>;
  }

  // If no applicable vouchers, find which voucher type covers this service/category
  useEffect(() => {
    const findAndRedirect = async () => {
      if (checking) return;
      
      try {
        let eligibleVoucherTypeIds: string[] = [];

        if (serviceId) {
          const { supabase } = await import('@/integrations/supabase/client');
          const { data: serviceVouchers } = await supabase
            .from('voucher_type_services')
            .select('voucher_type_id')
            .eq('service_id', serviceId);
          
          if (serviceVouchers) {
            eligibleVoucherTypeIds.push(...serviceVouchers.map(v => v.voucher_type_id));
          }
        }

        if (categoryId && eligibleVoucherTypeIds.length === 0) {
          const { supabase } = await import('@/integrations/supabase/client');
          const { data: categoryVouchers } = await supabase
            .from('voucher_type_categories')
            .select('voucher_type_id')
            .eq('category_id', categoryId);
          
          if (categoryVouchers) {
            eligibleVoucherTypeIds.push(...categoryVouchers.map(v => v.voucher_type_id));
          }
        }

        if (eligibleVoucherTypeIds.length > 0) {
          const voucherTypeId = eligibleVoucherTypeIds[0]; // Use first available
          
          toast({
            title: "Bono requerido",
            description: "Necesitas comprar el bono para reservar con créditos.",
            variant: "default"
          });

          console.log('[VoucherGuard] Redirecting to purchase:', voucherTypeId);
          onRedirectToPurchase(voucherTypeId);
        } else {
          console.error('[VoucherGuard] No eligible voucher types found');
          toast({
            title: "Error",
            description: "No se encontraron bonos disponibles para este servicio.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('[VoucherGuard] Error finding voucher types:', error);
        toast({
          title: "Error",
          description: "Error al verificar bonos disponibles.",
          variant: "destructive"
        });
      }
    };

    findAndRedirect();
  }, [checking, eligible, userCredits, applicableVouchers.length, serviceId, categoryId, onRedirectToPurchase, toast]);

  // Show loading while checking
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-4 flex items-center justify-center">
      <div className="text-center text-white">
        <p>Verificando bonos disponibles...</p>
      </div>
    </div>
  );
}