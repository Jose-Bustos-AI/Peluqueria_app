import React, { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ServiceGuardProps {
  selectedServiceId?: string;
  children: React.ReactNode;
  onRedirectToServices: () => void;
}

interface VoucherFlow {
  origin: string;
  voucherId: string;
  voucherTypeId: string;
  userId?: string;
  allowedServiceIds: string[];
  lockedProfessionalId?: string;
}

export default function ServiceGuard({ 
  selectedServiceId, 
  children, 
  onRedirectToServices 
}: ServiceGuardProps) {
  const { toast } = useToast();
  const [voucherFlow, setVoucherFlow] = useState<VoucherFlow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load voucher flow from localStorage
    try {
      const saved = localStorage.getItem('reservasPro_voucherFlow');
      if (saved) {
        const parsed = JSON.parse(saved);
        
        // Validate userId match
        const userSaved = localStorage.getItem('reservasPro_user');
        if (userSaved && parsed.userId) {
          const userData = JSON.parse(userSaved);
          if (userData.userShadowId && parsed.userId !== userData.userShadowId) {
            console.warn('[ServiceGuard] userId mismatch, clearing voucherFlow');
            localStorage.removeItem('reservasPro_voucherFlow');
            localStorage.removeItem('reservasPro_verifiedVoucherId');
            toast({
              title: "Sesión actualizada",
              description: "Por favor, vuelve a verificar tu bono",
              variant: "destructive"
            });
            onRedirectToServices();
            setLoading(false);
            return;
          }
        }
        
        setVoucherFlow(parsed);
        console.log('[ServiceGuard] loaded voucherFlow:', parsed);
      }
    } catch (e) {
      console.warn('Failed to parse voucher flow from localStorage');
    } finally {
      setLoading(false);
    }
  }, [toast, onRedirectToServices]);

  useEffect(() => {
    if (loading || !voucherFlow || voucherFlow.origin !== 'voucher') {
      return;
    }

    // If no service selected, redirect to service selection
    if (!selectedServiceId) {
      console.log('[ServiceGuard] No service selected, redirecting to services');
      onRedirectToServices();
      return;
    }

    // Check if selected service is allowed by voucher
    const isAllowed = voucherFlow.allowedServiceIds.includes(selectedServiceId);
    console.info('[ServiceGuard]', { selectedServiceId, allowed: isAllowed });

    if (!isAllowed) {
      toast({
        title: "Servicio no incluido",
        description: "Este servicio no está incluido en tu bono. Selecciona un servicio compatible.",
        variant: "destructive"
      });
      onRedirectToServices();
    }
  }, [loading, voucherFlow, selectedServiceId, onRedirectToServices, toast]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-12 bg-white/10 rounded"></div>
        <div className="h-32 bg-white/10 rounded"></div>
      </div>
    );
  }

  return <>{children}</>;
}