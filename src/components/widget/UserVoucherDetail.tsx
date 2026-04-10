import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Gift, Clock, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface VoucherType {
  id: string;
  name: string;
  description?: string;
  sessions_count: number;
  price: number;
  currency: string;
  validity_days?: number;
  photo_url?: string;
}

interface UserVoucher {
  id: string;
  code?: string;
  status: string;
  purchase_date: string;
  expiry_date?: string;
  sessions_remaining: number;
  voucher_type: VoucherType;
  usedSessions?: number;
}

interface UserVoucherDetailProps {
  userId?: string;
  selectedVoucherId?: string;
  onNavigateToCalendar?: (voucherId: string) => void;
}

export default function UserVoucherDetail({ userId, selectedVoucherId, onNavigateToCalendar }: UserVoucherDetailProps) {
  const { toast } = useToast();
  const [voucher, setVoucher] = useState<UserVoucher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVoucherDetail();
  }, [userId, selectedVoucherId]);

  const loadVoucherDetail = async () => {
    if (!selectedVoucherId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('[UserVoucherDetail] Loading voucher details for:', selectedVoucherId, 'userId:', userId);

      // Check if this is a user's voucher or a public voucher type
      if (userId) {
        // Try to load as user's voucher first
        const { data: userVoucherData, error: userVoucherError } = await supabase
          .from('vouchers')
          .select(`
            id,
            code,
            status,
            purchase_date,
            expiry_date,
            sessions_remaining,
            voucher_type:voucher_types (
              id,
              name,
              description,
              sessions_count,
              price,
              currency,
              validity_days,
              photo_url
            )
          `)
          .eq('id', selectedVoucherId)
          .eq('user_id', userId)
          .maybeSingle();

        if (userVoucherData) {
          // It's a user's voucher - get actual usage from redemptions
          const { data: redemptions, error: redemptionsError } = await supabase
            .from('voucher_redemptions')
            .select('credits_used')
            .eq('voucher_id', selectedVoucherId)
            .eq('status', 'captured');

          const usedSessions = redemptions?.reduce((sum, r) => sum + (r.credits_used || 1), 0) || 0;
          const remainingSessions = userVoucherData.voucher_type.sessions_count - usedSessions;

          setVoucher({ 
            ...userVoucherData, 
            usedSessions,
            sessions_remaining: remainingSessions
          });
          console.log('[UserVoucherDetail] User voucher loaded:', { 
            ...userVoucherData, 
            usedSessions, 
            remainingSessions,
            redemptions: redemptions?.length || 0
          });
          return;
        }
      }

      // If not found as user voucher, try as voucher type (for public vouchers)
      const { data: voucherTypeData, error: voucherTypeError } = await supabase
        .from('voucher_types')
        .select(`
          id,
          name,
          description,
          sessions_count,
          price,
          currency,
          validity_days,
          photo_url
        `)
        .eq('id', selectedVoucherId)
        .eq('active', true)
        .maybeSingle();

      if (voucherTypeError) throw voucherTypeError;

      if (voucherTypeData) {
        // Transform voucher type to match voucher interface
        const transformedVoucher = {
          id: voucherTypeData.id,
          code: undefined,
          status: 'active',
          purchase_date: new Date().toISOString(),
          expiry_date: undefined,
          sessions_remaining: voucherTypeData.sessions_count,
          voucher_type: voucherTypeData,
          usedSessions: 0
        };
        setVoucher(transformedVoucher);
        console.log('[UserVoucherDetail] Voucher type loaded:', voucherTypeData);
      }

    } catch (error) {
      console.error('[UserVoucherDetail] Error loading voucher:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los detalles del bono",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReserveNow = () => {
    if (voucher && onNavigateToCalendar) {
      console.log('[UserVoucherDetail] Navigating to calendar for voucher:', voucher.id);
      onNavigateToCalendar(voucher.id);
    }
  };

  const isExpired = voucher?.expiry_date && new Date(voucher.expiry_date) < new Date();
  const isUsed = voucher?.sessions_remaining === 0;
  const canReserve = voucher && !isExpired && !isUsed && voucher.status === 'active';

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (!voucher) {
    return null;
  }

  return (
    <div className="p-4 space-y-4">
      {/* Main Voucher Card with Corporate Colors */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #252b59 0%, #e63c4d 100%)' }}>
        {/* Header with image, title and price/badge */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/20 flex items-center justify-center flex-shrink-0">
            {voucher.voucher_type.photo_url ? (
              <img 
                src={voucher.voucher_type.photo_url} 
                alt={voucher.voucher_type.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Gift className="w-6 h-6 text-white" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white mb-1 truncate">
              {voucher.voucher_type.name}
            </h2>
            <p className="text-white/90 text-sm">
              {voucher.voucher_type.sessions_count} Sesiones
            </p>
            <p className="text-white/90 text-sm">
              {voucher.voucher_type.description || 'Fisioterapia Integral'}
            </p>
          </div>
        </div>

        {/* Price and Badge Row */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xl font-bold text-white">
            {voucher.voucher_type.price.toFixed(2)}€
          </p>
          <Badge 
            className="bg-green-500 hover:bg-green-500 text-white border-none px-2 py-1 text-xs"
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            Activo
          </Badge>
        </div>

        {/* Usage Stats */}
        <div className="bg-white/10 rounded-xl p-3 mb-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-400">
                {voucher.usedSessions || 0}
              </div>
              <div className="text-white/80 text-xs">Usadas</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-300">
                {voucher.sessions_remaining}
              </div>
              <div className="text-white/80 text-xs">Restantes</div>
            </div>
          </div>
        </div>

        {/* Expiry info if applicable */}
        {voucher.expiry_date && (
          <div className="flex items-center gap-2 text-white/80">
            <Clock className="h-3 w-3" />
            <span className="text-xs">
              {isExpired ? 'Expirado: ' : 'Expira: '}
              {format(new Date(voucher.expiry_date), 'dd MMM yyyy', { locale: es })}
            </span>
          </div>
        )}
      </div>

      {/* Action Button with Corporate Colors */}
      <Button 
        onClick={handleReserveNow}
        disabled={!canReserve}
        className="w-full py-3 text-base font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
        style={{ 
          background: canReserve ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#6b7280',
          border: 'none'
        }}
      >
        <Calendar className="w-4 h-4 mr-2" />
        {canReserve ? 'Nueva Reserva' : isExpired ? 'Bono Expirado' : isUsed ? 'Bono Agotado' : 'No Disponible'}
      </Button>
    </div>
  );
}