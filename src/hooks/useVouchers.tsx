import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculateVoucherBalance } from '@/lib/voucher-utils';

export interface VoucherType {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  sessions_count: number;
  validity_days?: number;
  validity_end_date?: string;
  active: boolean;
  photo_url?: string;
  professional_id?: string;
  session_duration_min?: number;
  created_at: string;
  updated_at: string;
}

export interface UserVoucher {
  id: string;
  voucher_type_id: string;
  user_id: string;
  code?: string;
  status: string;
  sessions_remaining: number;
  purchase_date: string;
  expiry_date?: string;
  created_at: string;
  updated_at: string;
  voucher_type: VoucherType;
}

export interface VoucherEligibility {
  eligible: boolean;
  userCredits: number;
  applicableVouchers: UserVoucher[];
}

export function usePublicVouchers() {
  const [vouchers, setVouchers] = useState<VoucherType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVouchers = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('voucher_types')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setVouchers(data || []);
    } catch (err) {
      console.error('[usePublicVouchers] Error:', err);
      setError(err instanceof Error ? err.message : 'Error loading vouchers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVouchers();
  }, []);

  return { vouchers, loading, error, refetch: fetchVouchers };
}

export function useUserVouchers(userId?: string) {
  const [vouchers, setVouchers] = useState<UserVoucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserVouchers = async () => {
    if (!userId) {
      console.log('[useUserVouchers] No userId provided, clearing vouchers');
      setVouchers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[useUserVouchers] Fetching vouchers for userId:', userId);

      const { data, error: fetchError } = await supabase
        .from('vouchers')
        .select(`
          *,
          voucher_type:voucher_types(*)
        `)
        .eq('user_id', userId)
        .in('status', ['active', 'partially_used'])
        .order('expiry_date', { ascending: true });

      if (fetchError) {
        console.error('[useUserVouchers] Fetch error:', fetchError);
        throw fetchError;
      }

      console.log('[useUserVouchers] Raw data from DB:', data);

      // Recalculate remaining sessions from redemptions to ensure accuracy
      const enhanced = await Promise.all((data || []).map(async (v) => {
        console.log('[useUserVouchers] Processing voucher:', v.id, 'status:', v.status);
        try {
          const balance = await calculateVoucherBalance(v.id);
          console.log('[useUserVouchers] Balance for', v.id, ':', balance);
          return { ...v, sessions_remaining: balance.remaining };
        } catch (e) {
          console.warn('[useUserVouchers] balance error for', v.id, e);
          return v; // fallback to existing value
        }
      }));

      // Only keep vouchers with remaining > 0
      const filtered = enhanced.filter(v => (v.sessions_remaining || 0) > 0);
      console.log('[useUserVouchers] Final vouchers after filtering:', filtered.length, 'vouchers');
      setVouchers(filtered);
    } catch (err) {
      console.error('[useUserVouchers] Error:', err);
      setError(err instanceof Error ? err.message : 'Error loading user vouchers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserVouchers();
  }, [userId]);

  return { vouchers, loading, error, refetch: fetchUserVouchers };
}

export function useVoucherEligibility(serviceId?: string, categoryId?: string, userId?: string): VoucherEligibility {
  const [eligibility, setEligibility] = useState<VoucherEligibility>({
    eligible: false,
    userCredits: 0,
    applicableVouchers: []
  });

  const { vouchers: userVouchers } = useUserVouchers(userId);

  useEffect(() => {
    const checkEligibility = async () => {
      if (!serviceId && !categoryId) {
        setEligibility({ eligible: false, userCredits: 0, applicableVouchers: [] });
        return;
      }

      try {
        // Get voucher types that cover this service or category
        let eligibleVoucherTypeIds: string[] = [];

        if (serviceId) {
          const { data: serviceVouchers } = await supabase
            .from('voucher_type_services')
            .select('voucher_type_id')
            .eq('service_id', serviceId);
          
          if (serviceVouchers) {
            eligibleVoucherTypeIds.push(...serviceVouchers.map(v => v.voucher_type_id));
          }
        }

        if (categoryId) {
          const { data: categoryVouchers } = await supabase
            .from('voucher_type_categories')
            .select('voucher_type_id')
            .eq('category_id', categoryId);
          
          if (categoryVouchers) {
            eligibleVoucherTypeIds.push(...categoryVouchers.map(v => v.voucher_type_id));
          }
        }

        // Filter user vouchers by eligible types
        const applicableVouchers = userVouchers.filter(voucher => 
          eligibleVoucherTypeIds.includes(voucher.voucher_type_id)
        );

        const totalCredits = applicableVouchers.reduce((sum, voucher) => 
          sum + voucher.sessions_remaining, 0
        );

        setEligibility({
          eligible: eligibleVoucherTypeIds.length > 0,
          userCredits: totalCredits,
          applicableVouchers
        });

      } catch (err) {
        console.error('[useVoucherEligibility] Error:', err);
        setEligibility({ eligible: false, userCredits: 0, applicableVouchers: [] });
      }
    };

    checkEligibility();
  }, [serviceId, categoryId, userVouchers]);

  return eligibility;
}