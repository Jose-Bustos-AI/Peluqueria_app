import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Clock, User, MapPin, Ticket } from "lucide-react";
import { format, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { useProfessionalAvailability } from '@/hooks/useProfessionalAvailability';
import { useVoucherEligibility } from '@/hooks/useVouchers';
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface VoucherType {
  id: string;
  name: string;
  description?: string;
  sessions_count: number;
  session_duration_min?: number;
  price: number;
  currency: string;
  validity_days?: number;
  photo_url?: string;
  professional_id?: string;
}

interface VoucherBookingCalendarProps {
  voucherTypeId: string;
  professionalId: string;
  locationId: string;
  onBack: () => void;
  onTimeSlotSelect: (date: string, time: string, serviceId?: string, durationMin?: number) => void;
}

export default function VoucherBookingCalendar({
  voucherTypeId,
  professionalId,
  locationId,
  onBack,
  onTimeSlotSelect
}: VoucherBookingCalendarProps) {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [voucherType, setVoucherType] = useState<VoucherType | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // Ensure we use a compatible location for the resolved service
  const [effectiveLocationId, setEffectiveLocationId] = useState<string>(locationId);
  // Ensure we always use the voucher's assigned professional
  const [effectiveProfessionalId, setEffectiveProfessionalId] = useState<string>(professionalId);

  useEffect(() => {
    if (voucherType?.professional_id) {
      const locked = voucherType.professional_id;
      if (locked !== effectiveProfessionalId) {
        setEffectiveProfessionalId(locked);
        try {
          const saved = localStorage.getItem('reservasPro_voucherFlow');
          const parsed = saved ? JSON.parse(saved) : {};
          localStorage.setItem('reservasPro_voucherFlow', JSON.stringify({
            ...parsed,
            lockedProfessionalId: locked,
            voucherTypeId,
            timestamp: Date.now(),
          }));
        } catch {}
      }
    } else {
      setEffectiveProfessionalId(professionalId);
    }
  }, [voucherType, professionalId]);

  // Get user ID from localStorage
  useEffect(() => {
    const userData = localStorage.getItem('reservasPro_user');
    if (userData) {
      const parsed = JSON.parse(userData);
      setUserId(parsed.userShadowId);
    }
  }, []);

  // Load voucher flow state
  const [voucherFlow, setVoucherFlow] = useState<any>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('reservasPro_voucherFlow');
      if (saved) {
        const parsed = JSON.parse(saved);
        setVoucherFlow(parsed);
        console.log('[VoucherBookingCalendar] loaded voucherFlow:', parsed);
      }
    } catch (e) {
      console.warn('Failed to parse voucher flow from localStorage');
    }
  }, []);

  // Voucher flow checks and logging
  useEffect(() => {
    if (!voucherFlow) return;

    console.info('[VoucherFlow] Debug info:', {
      userId,
      voucherId: voucherFlow.voucherId,
      voucherTypeId,
      allowedServiceIds: voucherFlow.allowedServiceIds,
      allowedServiceIdsLen: voucherFlow.allowedServiceIds?.length || 0,
      allowedServiceIdsType: typeof voucherFlow.allowedServiceIds,
      fullVoucherFlow: voucherFlow
    });

    if (!voucherFlow.voucherId) {
      toast({
        title: 'Estado perdido',
        description: 'Por favor, vuelve a verificar tu bono',
        variant: 'destructive'
      });
      window.location.hash = `#/bonos/${voucherTypeId}/verificar`;
      return;
    }

    // Remove the blocking condition - let the calendar proceed even with empty allowedServiceIds
    // The service resolution logic will handle the fallback
    
  }, [voucherFlow, userId, voucherTypeId]);

  // Load voucher type info
  useEffect(() => {
    const loadVoucherType = async () => {
      try {
        console.log('[VoucherBookingCalendar] load voucherType', { voucherTypeId });
        const { data, error } = await supabase
          .from('voucher_types')
          .select('*')
          .eq('id', voucherTypeId)
          .eq('active', true)
          .maybeSingle();

        if (error) throw error;
        console.log('[VoucherBookingCalendar] voucherType loaded', data);
        setVoucherType(data);
      } catch (error) {
        console.error('[VoucherBookingCalendar] Error loading voucher type:', error);
      } finally {
        setLoading(false);
      }
    };

    loadVoucherType();
  }, [voucherTypeId]);

  // Resolve a concrete service for this professional based on the voucher coverage
  useEffect(() => {
    const resolveService = async () => {
      try {
        console.log('[VoucherBookingCalendar] Resolving service for voucher', { voucherTypeId, professionalId: effectiveProfessionalId });
        
        // First check if professional has any services assigned (no FK joins assumed)
        const { data: serviceLinks, error: spError } = await supabase
          .from('service_professionals')
          .select('service_id')
          .eq('professional_id', effectiveProfessionalId);
        if (spError) {
          console.error('[VoucherBookingCalendar] Error fetching service_professionals:', spError);
        }
        
        console.log('[VoucherBookingCalendar] Professional service links:', serviceLinks);
        
        const linkedServiceIds: string[] = (serviceLinks || [])
          .map((r: any) => r.service_id)
          .filter(Boolean);
        
        if (linkedServiceIds.length === 0) {
          console.warn('[VoucherBookingCalendar] Professional has no services assigned');
          setSelectedServiceId(null);
          return;
        }

        // Fetch ACTIVE services from the services table using the IDs
        const { data: activeServices, error: svcError } = await supabase
          .from('services')
          .select('id, name, active, category_id')
          .in('id', linkedServiceIds)
          .eq('active', true);
        if (svcError) {
          console.error('[VoucherBookingCalendar] Error fetching services:', svcError);
        }
        
        const activeServiceIds: string[] = (activeServices || []).map((s: any) => s.id);

        if (activeServiceIds.length === 0) {
          console.warn('[VoucherBookingCalendar] Professional has no active services');
          setSelectedServiceId(null);
          return;
        }

        let chosenServiceId: string | null = null;
        
        // 1) Services explicitly allowed by the voucher type
        const { data: vts } = await supabase
          .from('voucher_type_services')
          .select('service_id')
          .eq('voucher_type_id', voucherTypeId);
        
        console.log('[VoucherBookingCalendar] Voucher type services:', vts);

        const explicitServiceIds = (vts || []).map(r => r.service_id).filter(Boolean);
        if (explicitServiceIds.length > 0) {
          const matchingService = activeServiceIds.find((sid: string) => explicitServiceIds.includes(sid));
          if (matchingService) {
            chosenServiceId = matchingService;
            console.log('[VoucherBookingCalendar] Found explicit service:', chosenServiceId);
          }
        }

        // 2) If no explicit service, use categories covered by the voucher
        if (!chosenServiceId) {
          // Obtener el nombre del tipo de voucher para matching inteligente
          const { data: voucherTypeData } = await supabase
            .from('voucher_types')
            .select('name')
            .eq('id', voucherTypeId)
            .maybeSingle();
          
          const voucherTypeName = voucherTypeData?.name || '';
          console.log('[VoucherBookingCalendar] Voucher type name for matching:', voucherTypeName);
          
          const { data: vtc } = await supabase
            .from('voucher_type_categories')
            .select('category_id')
            .eq('voucher_type_id', voucherTypeId);
          console.log('[VoucherBookingCalendar] Voucher type categories:', vtc);
          
          const categoryIds = (vtc || []).map(r => r.category_id).filter(Boolean);
          if (categoryIds.length > 0) {
            // Obtener servicios con nombre y precio para selección inteligente
            const { data: services } = await supabase
              .from('services')
              .select('id, name, price, category_id')
              .eq('active', true)
              .in('category_id', categoryIds)
              .in('id', activeServiceIds)
              .order('price', { ascending: false }); // Ordenar por precio descendente como fallback
            
            console.log('[VoucherBookingCalendar] Services in categories for this professional:', services);
            
            if (services && services.length > 0) {
              // Intentar encontrar servicio cuyo nombre esté contenido en el nombre del bono
              // Ejemplo: "Bono 6 Sesiones Fisioterapia Integral" contiene "Fisioterapia Integral"
              const matchingService = services.find((s: any) => 
                voucherTypeName.toLowerCase().includes(s.name.toLowerCase())
              );
              
              if (matchingService) {
                chosenServiceId = matchingService.id;
                console.log('[VoucherBookingCalendar] Found service matching voucher name:', matchingService.name, matchingService.price);
              } else {
                // Fallback: usar el de mayor precio (ya ordenados desc)
                chosenServiceId = services[0].id;
                console.log('[VoucherBookingCalendar] Using highest priced service as fallback:', services[0].name, services[0].price);
              }
            }
          }
        }

        // 3) Fallback: use first active service of the professional
        if (!chosenServiceId && activeServiceIds.length > 0) {
          chosenServiceId = activeServiceIds[0];
          console.log('[VoucherBookingCalendar] Using fallback service:', chosenServiceId);
        }

        setSelectedServiceId(chosenServiceId);
        console.log('[VoucherBookingCalendar] Final selectedServiceId:', chosenServiceId);
      } catch (e) {
        console.error('[VoucherBookingCalendar] Error resolving service for voucher', e);
        setSelectedServiceId(null);
      }
    };

    resolveService();
  }, [voucherTypeId, effectiveProfessionalId]);

  // Ensure the selected location is compatible with the resolved service
  useEffect(() => {
    const ensureCompatibleLocation = async () => {
      if (!selectedServiceId) return;
      try {
        // Get all locations where this service is available
        const { data: svcLocs } = await supabase
          .from('service_locations')
          .select('location_id')
          .eq('service_id', selectedServiceId);

        const allowedLocationIds = (svcLocs || []).map((r: any) => r.location_id).filter(Boolean);

        if (allowedLocationIds.length === 0) {
          // If no mapping, keep current
          setEffectiveLocationId(locationId);
          return;
        }

        if (!allowedLocationIds.includes(locationId)) {
          // Pick the first allowed location if current one is not compatible
          const newLoc = allowedLocationIds[0];
          console.log('[VoucherBookingCalendar] Adjusting location to compatible one for service:', newLoc);
          setEffectiveLocationId(newLoc);
        } else {
          setEffectiveLocationId(locationId);
        }
      } catch (e) {
        console.warn('[VoucherBookingCalendar] Could not ensure compatible location', e);
        setEffectiveLocationId(locationId);
      }
    };

    ensureCompatibleLocation();
  }, [selectedServiceId, locationId]);

  // Get professional availability - only call when service is resolved
  const {
    loading: availabilityLoading,
    error,
    professionalTimezone,
    getAvailableSlots,
    isDateAvailable,
    isClosed
  } = useProfessionalAvailability(
    effectiveProfessionalId,
    selectedServiceId, // This will be null until resolved
    effectiveLocationId
  );

  // Check if professional has business hours configured
  const [professionalHasHours, setProfessionalHasHours] = useState<boolean | null>(null);
  
  useEffect(() => {
    const checkProfessionalHours = async () => {
      if (!effectiveProfessionalId) return;
      
      const { data: professional } = await supabase
        .from('professionals')
        .select('business_hours')
        .eq('id', effectiveProfessionalId)
        .maybeSingle();
      
      if (professional) {
        const hasHours = professional.business_hours && Object.keys(professional.business_hours).length > 0;
        setProfessionalHasHours(hasHours);
        console.log('[VoucherBookingCalendar] Professional has hours configured:', hasHours);
      }
    };
    
    checkProfessionalHours();
  }, [effectiveProfessionalId]);

  console.log('[VoucherBookingCalendar] Professional availability hook:', {
    loading: availabilityLoading,
    error,
    professionalTimezone,
    professionalId: effectiveProfessionalId,
    locationId: effectiveLocationId,
    professionalHasHours
  });

  // Get available slots for selected date - only when service is resolved
  const availableSlots = useMemo(() => {
    if (!selectedDate || !voucherType || !selectedServiceId) return [];
    
    const slots = getAvailableSlots(selectedDate);
    console.log('[VoucherBookingCalendar] Available slots for', format(selectedDate, 'yyyy-MM-dd'), ':', {
      totalSlots: slots.length,
      availableSlots: slots.filter(s => s.available).length,
      slots: slots,
      selectedServiceId,
      professionalId: effectiveProfessionalId,
      locationId: effectiveLocationId
    });
    
    return slots;
  }, [selectedDate, getAvailableSlots, voucherType, selectedServiceId, effectiveProfessionalId, effectiveLocationId]);

  // Group only AVAILABLE slots by time period, aligned with hook periods
  const groupedSlots = useMemo(() => {
    const available = availableSlots.filter(slot => slot.available);
    return {
      morning: available.filter(slot => slot.period === 'morning'),
      afternoon: available.filter(slot => slot.period === 'afternoon'),
      night: available.filter(slot => slot.period === 'night'),
    };
  }, [availableSlots]);

  // Handle date selection
  const handleDateSelect = (date: Date | undefined) => {
    console.log('[VoucherBookingCalendar] date selected', date);
    setSelectedDate(date);
  };

  // Handle time slot selection with voucher flow validation
  const handleTimeSlotSelect = (slot: any) => {
    if (!selectedDate) return;
    
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // If no voucher flow state, redirect back to verification
    if (!voucherFlow || !voucherFlow.voucherId) {
      toast({
        title: "Estado perdido",
        description: "Por favor, vuelve a verificar tu bono",
        variant: "destructive"
      });
      window.location.hash = `#/bonos/${voucherTypeId}/verificar`;
      return;
    }

    // Check if selected service is allowed by voucher
    if (selectedServiceId && voucherFlow.allowedServiceIds && 
        !voucherFlow.allowedServiceIds.includes(selectedServiceId)) {
      console.info('[Calendar] slotClick → block=ServiceNotIncluded', { service: selectedServiceId });
      toast({
        title: "Servicio no incluido",
        description: "Este servicio no está incluido en tu bono",
        variant: "destructive"
      });
      // Don't redirect to purchase, go back to service selection
      onBack();
      return;
    }

    // Build complete booking params with all required data for voucher confirmation
    const durationMin = voucherType?.session_duration_min || 60;
    
    // Convert local time to UTC for proper storage
    const timezone = 'Europe/Madrid'; // Will be resolved with actual location timezone in confirmation
    const localDateTime = `${dateStr}T${slot.time}:00`;
    const startAtUtc = new Date(`${localDateTime}Z`); // Temporary - will be properly converted in confirmation
    const endAtUtc = new Date(startAtUtc.getTime() + durationMin * 60000);

    const bookingParams = {
      service_id: selectedServiceId,
      professional_id: effectiveProfessionalId,
      location_id: effectiveLocationId,
      start_at_utc: startAtUtc.toISOString(),
      end_at_utc: endAtUtc.toISOString(), 
      duration_min: durationMin,
      origin: 'voucher',
      voucher_id: voucherFlow.voucherId
    };

    console.log('[Calendar] to Confirm', {
      serviceId: selectedServiceId,
      professionalId: effectiveProfessionalId,
      locationId: effectiveLocationId, 
      startUTC: startAtUtc.toISOString(),
      endUTC: endAtUtc.toISOString(),
      voucherId: voucherFlow.voucherId
    });

    // Navigate to confirmation with voucher mode and voucherId
    window.location.hash = `#/confirmacion?mode=voucher&serviceId=${selectedServiceId || ''}&professionalId=${effectiveProfessionalId}&locationId=${effectiveLocationId}&date=${dateStr}&time=${slot.time}&voucherId=${voucherFlow.voucherId}&durationMin=${durationMin}`;
  };

  // Check for disabled dates
  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // While resolving service or loading availability, only block past dates
    if (!selectedServiceId || availabilityLoading) {
      return date < today;
    }
    
    if (date < today) return true;
    if (!isDateAvailable(date)) return true;
    if (isClosed(date)) return true;
    
    return false;
  };

  // Month navigation
  const handlePrevMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1));
  };

  if (loading || availabilityLoading || professionalHasHours === null) {
    return (
      <div className="min-h-screen bg-widget-primary text-widget-text p-4 max-w-4xl mx-auto">
        <Button onClick={onBack} variant="ghost" className="mb-4 text-widget-text hover:bg-white/10">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-white/10 rounded"></div>
          <div className="h-32 bg-white/10 rounded"></div>
          <div className="h-64 bg-white/10 rounded"></div>
        </div>
      </div>
    );
  }

  // Show loading while checking for services
  if (!loading && !selectedServiceId) {
    return (
      <div className="min-h-screen bg-widget-primary text-widget-text p-4 max-w-4xl mx-auto">
        <Button onClick={onBack} variant="ghost" className="mb-4 text-widget-text hover:bg-white/10">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        <Card className="bg-white border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="text-5xl">⏳</div>
              <h2 className="font-semibold text-xl text-gray-800">Cargando disponibilidad...</h2>
              <p className="text-gray-600">Estamos preparando tu calendario de reservas</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if professional has no working hours configured
  if (professionalHasHours === false) {
    return (
      <div className="min-h-screen bg-widget-primary text-widget-text p-4 max-w-4xl mx-auto">
        <Button onClick={onBack} variant="ghost" className="mb-4 text-widget-text hover:bg-white/10">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        <Card className="bg-white border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="text-5xl">📅</div>
              <h2 className="font-semibold text-xl text-gray-800">El profesional no tiene horarios configurados</h2>
              <p className="text-gray-600">Este profesional aún no ha configurado su disponibilidad horaria.</p>
              <p className="text-gray-600 text-sm">Por favor, contacta con el establecimiento para más información.</p>
              <Button onClick={onBack} className="mt-4">
                Volver
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-brand-bg text-brand-text p-4 max-w-4xl mx-auto">
        <Button onClick={onBack} variant="ghost" className="mb-4 text-brand-text hover:bg-white/10">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        <div className="text-center py-8">
          <div className="text-brand-red mb-2">Error al cargar disponibilidad</div>
          <p className="text-brand-text/70 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!voucherType) {
    return (
    <div className="min-h-screen bg-widget-primary text-widget-text p-4 max-w-4xl mx-auto">
      <Button onClick={onBack} variant="ghost" className="mb-4 text-widget-text hover:bg-white/10">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver
      </Button>
      <div className="text-center py-8">
        <div className="text-widget-secondary mb-2">Bono no encontrado</div>
      </div>
    </div>
    );
  }

  return (
    <div className="min-h-screen bg-widget-primary text-widget-text p-4 max-w-2xl mx-auto">
      {/* Back Button */}
      <Button onClick={onBack} variant="ghost" className="mb-6 text-widget-text hover:bg-white/10">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver
      </Button>

      {/* Title Section */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Escoge una fecha y hora</h1>
        <p className="text-white/80">{voucherType.name}</p>
      </div>

      {/* Calendar Card with Dark Blue Background */}
      <div className="bg-[#3e4e73] rounded-xl p-6 mb-6">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handlePrevMonth} 
            className="text-white hover:bg-white/10 h-8 w-8 p-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-lg font-medium text-white capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleNextMonth} 
            className="text-white hover:bg-white/10 h-8 w-8 p-0"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Calendar */}
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          disabled={isDateDisabled}
          locale={es}
          className="w-full"
          classNames={{
            months: "flex flex-col w-full",
            month: "space-y-4 w-full",
            caption: "hidden",
            nav: "hidden",
            table: "w-full border-collapse",
            head_row: "flex w-full mb-2",
            head_cell: "text-white/70 rounded-md flex-1 font-normal text-sm text-center",
            row: "flex w-full mt-1",
            cell: "flex-1 text-center text-sm p-0.5 relative",
            day: "h-10 w-full p-0 font-normal text-white hover:bg-white/10 rounded-md transition-colors",
            day_selected: "bg-[#ff5252] text-white hover:bg-[#ff5252] focus:bg-[#ff5252] rounded-md font-semibold",
            day_today: "bg-white/5 text-white font-medium",
            day_outside: "text-white/20 opacity-50",
            day_disabled: "text-white/20 opacity-30 hover:bg-transparent cursor-not-allowed",
            day_hidden: "invisible",
          }}
        />
      </div>

      {/* Time Slots */}
      {selectedDate && availableSlots.length > 0 && (
        <div className="space-y-4">
          {/* Horas disponibles header - red button style */}
          <button className="w-full bg-[#ff5252] hover:bg-[#ff6666] rounded-lg py-4 px-6 text-center transition-colors">
            <h3 className="text-white font-semibold text-lg">
              Horas disponibles
            </h3>
          </button>

          <div className="space-y-6">
            {/* Morning Slots */}
            {groupedSlots.morning.length > 0 && (
              <div className="space-y-3">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg py-2 px-4 inline-block">
                  <h4 className="text-white font-medium text-sm">
                    Mañana
                  </h4>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {groupedSlots.morning.map((slot) => (
                    <Button
                      key={slot.time}
                      onClick={() => handleTimeSlotSelect(slot)}
                      className="h-12 text-sm font-medium bg-[#2d3e5f] border border-[#3e4e73] text-white hover:bg-[#3e4e73] transition-colors"
                    >
                      {slot.time}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Afternoon Slots */}
            {groupedSlots.afternoon.length > 0 && (
              <div className="space-y-3">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg py-2 px-4 inline-block">
                  <h4 className="text-white font-medium text-sm">
                    Tarde
                  </h4>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {groupedSlots.afternoon.map((slot) => (
                    <Button
                      key={slot.time}
                      onClick={() => handleTimeSlotSelect(slot)}
                      className="h-12 text-sm font-medium bg-[#2d3e5f] border border-[#3e4e73] text-white hover:bg-[#3e4e73] transition-colors"
                    >
                      {slot.time}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Night Slots */}
            {groupedSlots.night.length > 0 && (
              <div className="space-y-3">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg py-2 px-4 inline-block">
                  <h4 className="text-white font-medium text-sm">
                    Noche
                  </h4>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {groupedSlots.night.map((slot) => (
                    <Button
                      key={slot.time}
                      onClick={() => handleTimeSlotSelect(slot)}
                      className="h-12 text-sm font-medium bg-[#2d3e5f] border border-[#3e4e73] text-white hover:bg-[#3e4e73] transition-colors"
                    >
                      {slot.time}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}