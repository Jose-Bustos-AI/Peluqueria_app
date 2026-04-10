import { supabase } from "@/integrations/supabase/client";

/**
 * Get all service IDs allowed by a voucher type
 * - Includes services explicitly linked via voucher_type_services
 * - Includes services in categories linked via voucher_type_categories
 * - Returns all active services as fallback if no restrictions found
 */
export const getVoucherAllowedServices = async (voucherTypeId: string): Promise<string[]> => {
  try {
    console.log('[getVoucherAllowedServices] Starting for voucherTypeId:', voucherTypeId);
    
    // Get services directly allowed by voucher type
    const { data: vts, error: vtsError } = await supabase
      .from('voucher_type_services')
      .select('service_id')
      .eq('voucher_type_id', voucherTypeId);
    
    if (vtsError) {
      console.error('[getVoucherAllowedServices] Error fetching voucher_type_services:', vtsError);
    }
    
    const explicitServiceIds = (vts || []).map(r => r.service_id).filter(Boolean);
    console.log('[getVoucherAllowedServices] Explicit service IDs:', explicitServiceIds);
    
    // Get services by categories covered by voucher type
    const { data: vtc, error: vtcError } = await supabase
      .from('voucher_type_categories')
      .select('category_id')
      .eq('voucher_type_id', voucherTypeId);
    
    if (vtcError) {
      console.error('[getVoucherAllowedServices] Error fetching voucher_type_categories:', vtcError);
    }
    
    const categoryIds = (vtc || []).map(r => r.category_id).filter(Boolean);
    console.log('[getVoucherAllowedServices] Category IDs:', categoryIds);
    
    let categoryServiceIds: string[] = [];
    
    if (categoryIds.length > 0) {
      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select('id')
        .eq('active', true)
        .in('category_id', categoryIds);
      
      if (servicesError) {
        console.error('[getVoucherAllowedServices] Error fetching services by categories:', servicesError);
      }
      
      categoryServiceIds = (services || []).map(s => s.id);
      console.log('[getVoucherAllowedServices] Category service IDs:', categoryServiceIds);
    }
    
    // If no services found in either explicit or categories, get ALL active services as fallback
    const allAllowedIds = [...new Set([...explicitServiceIds, ...categoryServiceIds])];
    
    if (allAllowedIds.length === 0) {
      console.log('[getVoucherAllowedServices] No services found, using fallback - all active services');
      const { data: allServices, error: allServicesError } = await supabase
        .from('services')
        .select('id')
        .eq('active', true);
      
      if (allServicesError) {
        console.error('[getVoucherAllowedServices] Error fetching all services:', allServicesError);
        return [];
      }
      
      const fallbackIds = (allServices || []).map(s => s.id);
      console.log('[getVoucherAllowedServices] Fallback service IDs:', fallbackIds);
      return fallbackIds;
    }
    
    console.log('[getVoucherAllowedServices] Final allowed service IDs:', allAllowedIds);
    return allAllowedIds;
  } catch (error) {
    console.error('[getVoucherAllowedServices] Unexpected error:', error);
    return [];
  }
};

/**
 * Persist voucher flow state to localStorage
 */
export const persistVoucherFlow = async (
  voucherId: string, 
  userId: string, 
  allowedServiceIds: string[], 
  voucherTypeId: string, 
  professionalId?: string
) => {
  const voucherFlow = {
    origin: 'voucher',
    voucherId,
    voucherTypeId,
    userId,
    allowedServiceIds,
    lockedProfessionalId: professionalId || null,
    timestamp: Date.now()
  };
  
  localStorage.setItem('reservasPro_voucherFlow', JSON.stringify(voucherFlow));
  console.info('[VoucherFlow] Persisted', { 
    userId, 
    voucherId, 
    voucherTypeId, 
    allowedServiceIdsLen: allowedServiceIds.length,
    allowedServiceIds 
  });
};
