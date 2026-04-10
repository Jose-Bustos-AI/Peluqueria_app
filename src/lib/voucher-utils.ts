import { supabase } from "@/integrations/supabase/client";

export interface VoucherBalance {
  voucherId: string;
  total: number;
  used: number;
  remaining: number;
}

/**
 * Calculate voucher balance using consistent formula:
 * total = voucher_types.sessions_count
 * used = COUNT(voucher_redemptions WHERE voucher_id=? AND status='captured')
 * remaining = total - used
 */
export async function calculateVoucherBalance(voucherId: string): Promise<VoucherBalance> {
  try {
    console.log(`[VoucherBalance] Calculating balance for voucher ${voucherId}`);
    
    // Get voucher with type data
    const { data: voucherData, error: voucherError } = await supabase
      .from('vouchers')
      .select(`
        id,
        voucher_type_id,
        voucher_types!inner (
          sessions_count
        )
      `)
      .eq('id', voucherId)
      .single();

    if (voucherError) {
      console.error(`[VoucherBalance] Error fetching voucher ${voucherId}:`, voucherError);
      throw voucherError;
    }

    const total = voucherData.voucher_types.sessions_count;
    console.log(`[VoucherBalance] Voucher ${voucherId} total sessions: ${total}`);

    // Count actual redemptions (avoid head:true to ensure count is returned reliably)
    const { data: redemptions, error: redemptionError } = await supabase
      .from('voucher_redemptions')
      .select('id')
      .eq('voucher_id', voucherId)
      .eq('status', 'captured');

    if (redemptionError) {
      console.error(`[VoucherBalance] Error counting redemptions for ${voucherId}:`, redemptionError);
      throw redemptionError;
    }

    const actualUsed = (redemptions?.length || 0);
    const remaining = Math.max(0, total - actualUsed);

    console.log(`[VoucherBalance] Voucher ${voucherId} - Total: ${total}, Used: ${actualUsed}, Remaining: ${remaining}`);

    return {
      voucherId,
      total,
      used: actualUsed,
      remaining
    };
  } catch (error) {
    console.error(`[VoucherBalance] Failed to calculate balance for ${voucherId}:`, error);
    throw error;
  }
}

/**
 * Check if a redemption already exists for a booking to prevent double consumption
 */
export async function checkExistingRedemption(bookingId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('voucher_redemptions')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  } catch (error) {
    console.error('Error checking existing redemption:', error);
    throw error;
  }
}