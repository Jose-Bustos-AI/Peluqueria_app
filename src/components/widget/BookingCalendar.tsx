import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth, addMinutes, isValid, getISODay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useProfessionalAvailability } from '@/hooks/useProfessionalAvailability';
import { useClassAvailability } from '@/hooks/useClassAvailability';
import { cn } from '@/lib/utils';
import { getDefaultLocation } from '@/lib/default-location';
import { fromZonedTime } from 'date-fns-tz';
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';

interface Service {
  id: string;
  name: string;
  duration_min: number;
  photo_url?: string;
  professionals?: Array<{ id: string; name: string; color?: string }>;
}


interface Class {
  id: string;
  name: string;
  duration_min: number;
  photo_url?: string;
  professionals?: Array<{ id: string; name: string; color?: string }>;
}

interface BookingCalendarProps {
  service?: Service | null;
  classItem?: Class | null;
  mode?: 'service' | 'class' | 'subscription';
  onBack: () => void;
}

export default function BookingCalendar({ service, classItem, mode = 'service', onBack }: BookingCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedProfessional, setSelectedProfessional] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationTz, setLocationTz] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Subscription mode state
  const [subscriptionPlan, setSubscriptionPlan] = useState<any>(null);
  const [eligibleClasses, setEligibleClasses] = useState<Class[]>([]);
  const [eligibleServices, setEligibleServices] = useState<Service[]>([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [assignedProfessional, setAssignedProfessional] = useState<string | null>(null);
  const [subscriptionSlots, setSubscriptionSlots] = useState<any[]>([]);
  const [subscriptionCapacity, setSubscriptionCapacity] = useState<number>(1);
  const [hasSessionConfig, setHasSessionConfig] = useState(false);
  const [sessionConfigDuration, setSessionConfigDuration] = useState<number>(60);

  // For session_config mode, currentItem is NOT needed
  const currentItem = mode === 'subscription'
    ? (hasSessionConfig ? null : (eligibleServices[0] || eligibleClasses[0]))
    : (mode === 'class' ? classItem : service);
  const professionals = (mode === 'service' ? currentItem?.professionals : (classItem?.professionals || [])) || [];

  // Use the assigned professional for subscriptions, otherwise first available
  const professionalId = mode === 'subscription' 
    ? assignedProfessional 
    : (selectedProfessional || (mode === 'service' ? professionals[0]?.id || null : null));

  // Initialize location from default location if available  
  useEffect(() => {
    const initializeLocation = async () => {
      const defaultLocation = await getDefaultLocation();
      if (defaultLocation) {
        setLocationId(defaultLocation.id);
        setLocationTz(defaultLocation.timezone || 'Europe/Madrid');
        if (import.meta.env.DEV) {
          console.log('[BookingCalendar] using default location_id=', defaultLocation.id, 'tz=', defaultLocation.timezone);
        }
      }
    };
    
    initializeLocation();
  }, []);
  
  // Load subscription plan and eligible items when in subscription mode
  useEffect(() => {
    if (mode !== 'subscription') return;
    
    const loadSubscriptionData = async () => {
      try {
        setSubscriptionLoading(true);
        
        // Get planId from URL params
        const hash = window.location.hash;
        const urlParams = new URLSearchParams(hash.split('?')[1] || '');
        const planId = urlParams.get('planId');
        
        if (!planId) {
          console.log('[Calendar] subscription mode but no planId, going to subscriptions');
          toast({
            title: 'Error',
            description: 'Plan de suscripción no encontrado',
            variant: 'destructive',
          });
          window.location.hash = '#/suscripciones';
          return;
        }
        
        console.log('[Calendar] subscription filter {planId=', planId, '}');
        
        // Load plan details
        const { data: plan, error: planError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', planId)
          .eq('active', true)
          .single();
          
        if (planError || !plan) {
          console.error('[Calendar] Plan not found:', planError);
          toast({
            title: 'Error',
            description: 'Plan de suscripción no válido',
            variant: 'destructive',
          });
          window.location.hash = '#/suscripciones';
          return;
        }
        
        setSubscriptionPlan(plan);

        // Parse session_config from plan description
        let sessionConfig = null;
        try {
          if (plan.description && typeof plan.description === 'object') {
            sessionConfig = (plan.description as any).session_config;
          } else if (typeof plan.description === 'string' && plan.description) {
            const parsed = JSON.parse(plan.description);
            sessionConfig = parsed.session_config;
          }
        } catch (e) {
          console.warn('[Calendar] Could not parse session_config:', e);
        }

        // Resolve capacity: prefer plan.capacity_per_session, otherwise parent plan's capacity
        try {
          let capacity = plan.capacity_per_session as number | null;
          if ((!capacity || capacity === null) && plan.parent_plan_id) {
            const { data: parent, error: parentError } = await supabase
              .from('subscription_plans')
              .select('id, capacity_per_session')
              .eq('id', plan.parent_plan_id)
              .maybeSingle();
            if (parentError) {
              console.warn('[Calendar] Error loading parent plan for capacity:', parentError);
            }
            if (parent && typeof parent.capacity_per_session === 'number') {
              capacity = parent.capacity_per_session;
            }
          }
          setSubscriptionCapacity(typeof capacity === 'number' && capacity > 0 ? capacity : 1);
        } catch (e) {
          console.warn('[Calendar] Could not resolve subscription capacity, defaulting to 1:', e);
          setSubscriptionCapacity(1);
        }
        
        // Get assigned professional from plan configuration
        let assignedProfId: string | null = null;
        try {
          if (plan.description && typeof plan.description === 'object') {
            assignedProfId = (plan.description as any).professional_id;
          } else if (typeof plan.description === 'string' && plan.description) {
            const parsed = JSON.parse(plan.description);
            assignedProfId = parsed.professional_id;
          }
        } catch (e) {
          console.warn('[Calendar] Could not parse professional from plan:', e);
        }
        
        // Also check session_config.professional_id as override
        if (sessionConfig?.professional_id) {
          assignedProfId = sessionConfig.professional_id;
        }
        
        // Handle "unassigned" value
        if (assignedProfId === 'unassigned') {
          assignedProfId = null;
        }
        
        if (assignedProfId) {
          console.log('[Calendar] Using assigned professional:', assignedProfId);
          setAssignedProfessional(assignedProfId);
        }

        // ---- SESSION_CONFIG MODE: fixed schedule, no classes/services needed ----
        if (sessionConfig && sessionConfig.days_of_week && sessionConfig.time_slots) {
          console.log('[Calendar] session_config mode - using fixed schedule, skipping class/service loading');
          setHasSessionConfig(true);
          // Extract duration from session_config or plan
          const duration = sessionConfig.session_duration_min || plan.sessions_count || 60;
          setSessionConfigDuration(typeof duration === 'number' ? duration : 60);
          return; // Don't load classes/services
        }

        // ---- LEGACY MODE: load by categories/classes ----
        console.log('[Calendar] Legacy mode - loading by categories');
        setHasSessionConfig(false);
        
        // Get allowed categories for this plan
        const { data: planCategories, error: categoriesError } = await supabase
          .from('subscription_plan_categories')
          .select('category_id')
          .eq('plan_id', planId);
          
        if (categoriesError) {
          console.error('[Calendar] Error loading plan categories:', categoriesError);
        }
        
        const allowedCategoryIds = (planCategories?.map(pc => pc.category_id).filter(Boolean) as string[]) || [];
        console.log('[Calendar] allowedCategories=', allowedCategoryIds);

        // If no categories AND no direct class mappings, this plan has no config - show error
        const { data: planClasses } = await supabase
          .from('subscription_plan_classes')
          .select('class_id')
          .eq('plan_id', planId);

        const directClassIds = (planClasses?.map(pc => pc.class_id).filter(Boolean) as string[]) || [];

        if (allowedCategoryIds.length === 0 && directClassIds.length === 0) {
          console.warn('[Calendar] Plan has no categories, no classes, and no session_config - cannot determine eligible items');
          toast({
            title: 'Plan sin configurar',
            description: 'Este plan de suscripción no tiene clases o servicios configurados',
            variant: 'destructive',
          });
          window.location.hash = '#/suscripciones';
          return;
        }
        
        // Load eligible classes (by category OR direct assignment)
        let classQuery = supabase
          .from('classes')
          .select('*')
          .eq('active', true);
          
        if (directClassIds.length > 0) {
          classQuery = classQuery.in('id', directClassIds);
        } else if (allowedCategoryIds.length > 0) {
          classQuery = classQuery.in('category_id', allowedCategoryIds);
        }
        
        const { data: classes, error: classError } = await classQuery;
        if (!classError && classes) {
          console.log('[Calendar] allowedClasses=', classes.length);
          setEligibleClasses(classes);
        }
        
        // Load eligible services (only by category)
        if (allowedCategoryIds.length > 0) {
          const { data: services, error: serviceError } = await supabase
            .from('services')
            .select('*')
            .eq('active', true)
            .in('category_id', allowedCategoryIds);
            
          if (!serviceError && services) {
            console.log('[Calendar] allowedServices=', services.length);
            setEligibleServices(services);
          }
        }
        
        // Check if we have any eligible items (legacy mode only)
        const totalEligible = (classes?.length || 0);
        if (totalEligible === 0) {
          console.log('[Calendar] no eligible items in legacy mode, going to subscriptions');
          toast({
            title: 'Sin opciones disponibles',
            description: 'Esta suscripción no incluye clases o servicios activos',
            variant: 'destructive',
          });
          window.location.hash = '#/suscripciones';
          return;
        }
        
      } catch (error) {
        console.error('[Calendar] Error loading subscription data:', error);
        toast({
          title: 'Error',
          description: 'Error cargando datos de suscripción',
          variant: 'destructive',
        });
        window.location.hash = '#/suscripciones';
      } finally {
        setSubscriptionLoading(false);
      }
    };
    
    loadSubscriptionData();
  }, [mode, toast]);

  // Use availability hooks - always call them, but conditionally use results
  const serviceAvailability = useProfessionalAvailability(
    mode !== 'subscription' ? professionalId : null,
    mode !== 'subscription' ? currentItem?.id || null : null,
    locationId
  );

  const classAvailability = useClassAvailability(
    mode !== 'subscription' ? currentItem?.id || null : null,
    locationId || undefined
  );

  // Load subscription slots when date changes
  useEffect(() => {
    if (mode !== 'subscription' || !subscriptionPlan || !selectedDate || !locationId) {
      setSubscriptionSlots([]);
      return;
    }
    
    const loadSubscriptionSlots = async () => {
      const dayOfWeek = getISODay(selectedDate) === 7 ? 0 : getISODay(selectedDate);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Parse session config from plan description
      let sessionConfig = null;
      try {
        if (subscriptionPlan.description && typeof subscriptionPlan.description === 'object') {
          sessionConfig = subscriptionPlan.description.session_config;
        } else if (typeof subscriptionPlan.description === 'string') {
          const parsed = JSON.parse(subscriptionPlan.description);
          sessionConfig = parsed.session_config;
        }
      } catch (e) {
        console.error('[Subscription] Error parsing session config:', e);
        setSubscriptionSlots([]);
        return;
      }
      
      if (!sessionConfig) {
        console.log('[Subscription] No session config found in plan');
        setSubscriptionSlots([]);
        return;
      }
      
      // Check if this day is available
      const availableDays = sessionConfig.days_of_week || [];
      if (!availableDays.includes(dayOfWeek)) {
        console.log('[Subscription] Day not available:', dayOfWeek, 'available days:', availableDays);
        setSubscriptionSlots([]);
        return;
      }
      
      console.log('[Subscription] Day is available:', dayOfWeek, 'config:', sessionConfig);
      
      // Get capacity from plan (resolved capacity including parent plan)
      const capacity = subscriptionCapacity || 1;
      console.log('[Subscription] Capacity per session:', capacity);
      
      // Check if we have per-day slots first, then fallback to global time_slots
      const daySpecificSlots = sessionConfig.day_slots?.[String(dayOfWeek)];
      const timeSlots = (daySpecificSlots && daySpecificSlots.length > 0) 
        ? daySpecificSlots 
        : (sessionConfig.time_slots || []);
      
      // Backward compatibility: if no time_slots but has default_start_time/default_end_time
      if (timeSlots.length === 0 && sessionConfig.default_start_time && sessionConfig.default_end_time) {
        timeSlots.push({
          start_time: sessionConfig.default_start_time,
          end_time: sessionConfig.default_end_time
        });
      }
      
      // Generate slots for each time slot and check capacity
      const slots = [];
      
      for (const timeSlot of timeSlots) {
        const time = timeSlot.start_time;
        const [hour] = time.split(':').map(Number);
        const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'night';
        
        // Convert time to UTC for database query
        const tz = locationTz || 'Europe/Madrid';
        const localDateTimeStr = `${dateStr}T${time}:00`;
        let startUtc;
        
        try {
          startUtc = fromZonedTime(localDateTimeStr, tz);
        } catch (error) {
          console.error('[Subscription] Error converting time:', error);
          continue;
        }
        
        // Query existing bookings: only count subscription bookings for THIS plan
        const capacityQuery = supabase
          .from('bookings')
          .select('id')
          .eq('start_at', startUtc.toISOString())
          .eq('location_id', locationId)
          .neq('status', 'cancelled')
          .eq('origin', 'subscription')
          .like('notes', `%"planId":"${subscriptionPlan.id}"%`);
        
        const { data: existingBookings, error: bookingError } = await capacityQuery;
        
        if (bookingError) {
          console.error('[Subscription] Error checking bookings:', bookingError);
          // On error, mark as available to not block user
          slots.push({
            time,
            available: true,
            period: period as 'morning' | 'afternoon' | 'night'
          });
          continue;
        }
        
        const currentBookings = existingBookings?.length || 0;
        const remainingSlots = capacity - currentBookings;
        const available = remainingSlots > 0;
        
        console.log('[Subscription] Slot', time, '- bookings:', currentBookings, '/ capacity:', capacity, '- available:', available);
        
        slots.push({
          time,
          available,
          period: period as 'morning' | 'afternoon' | 'night',
          remainingSlots,
          capacity
        });
      }
      
      console.log('[Subscription] Generated slots with capacity check:', slots);
      setSubscriptionSlots(slots);
    };
    
    loadSubscriptionSlots();
  }, [mode, subscriptionPlan, selectedDate, locationId, locationTz, subscriptionCapacity]);


  // Custom subscription availability logic
  const getSubscriptionAvailableSlots = useCallback((date: Date) => {
    // Return cached slots for the selected date
    return subscriptionSlots;
  }, [subscriptionSlots]);

  const isSubscriptionDateAvailable = useCallback((date: Date) => {
    if (mode !== 'subscription' || !subscriptionPlan) return false;
    
    const dayOfWeek = getISODay(date) === 7 ? 0 : getISODay(date);
    
    // Parse session config from plan description
    let sessionConfig = null;
    try {
      if (subscriptionPlan.description && typeof subscriptionPlan.description === 'object') {
        sessionConfig = subscriptionPlan.description.session_config;
      } else if (typeof subscriptionPlan.description === 'string') {
        const parsed = JSON.parse(subscriptionPlan.description);
        sessionConfig = parsed.session_config;
      }
    } catch (e) {
      return false;
    }
    
    if (!sessionConfig) return false;
    
    const availableDays = sessionConfig.days_of_week || [];
    return availableDays.includes(dayOfWeek);
  }, [mode, subscriptionPlan]);

  // Choose which availability to use based on mode
  const isClassContext = (mode === 'class') || (mode === 'subscription' && eligibleServices.length === 0 && eligibleClasses.length > 0);
  const { 
    loading, 
    error, 
    getAvailableSlots: originalGetAvailableSlots, 
    isDateAvailable: originalIsDateAvailable 
  } = isClassContext ? classAvailability : serviceAvailability;

  // Use subscription logic when in subscription mode, otherwise use original hooks
  const getAvailableSlots = mode === 'subscription' ? getSubscriptionAvailableSlots : originalGetAvailableSlots;
  const isDateAvailable = mode === 'subscription' ? isSubscriptionDateAvailable : originalIsDateAvailable;

  // Get available slots for selected date
  const availableSlots = useMemo(() => {
    if (!selectedDate) return [];
    return getAvailableSlots(selectedDate);
  }, [selectedDate, getAvailableSlots]);

  // Group slots by period
  const slotsByPeriod = useMemo(() => {
    // Handle subscription mode separately since slots might still be loading
    if (mode === 'subscription') {
      const available = subscriptionSlots.filter(slot => slot.available);
      return {
        morning: available.filter(slot => slot.period === 'morning'),
        afternoon: available.filter(slot => slot.period === 'afternoon'),
        night: available.filter(slot => slot.period === 'night')
      };
    }
    
    const available = availableSlots.filter(slot => slot.available);
    
    if (mode === 'class') {
      // For classes, group by hour
      return {
        morning: available.filter(slot => {
          const hour = parseInt(slot.time.split(':')[0]);
          return hour < 14;
        }),
        afternoon: available.filter(slot => {
          const hour = parseInt(slot.time.split(':')[0]);
          return hour >= 14 && hour < 20;
        }),
        night: available.filter(slot => {
          const hour = parseInt(slot.time.split(':')[0]);
          return hour >= 20;
        })
      };
    }
    
    return {
      morning: available.filter(slot => 'period' in slot && slot.period === 'morning'),
      afternoon: available.filter(slot => 'period' in slot && slot.period === 'afternoon'),
      night: available.filter(slot => 'period' in slot && slot.period === 'night')
    };
  }, [availableSlots, mode]);

  const isDateDisabled = (date: Date) => {
    return !isDateAvailable(date);
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
  };

  // Auto-select first available date in subscription mode
  useEffect(() => {
    if (mode !== 'subscription') return;
    if (selectedDate) return;
    try {
      const start = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        if (isDateAvailable(d)) {
          setSelectedDate(d);
          setCurrentMonth(new Date(d));
          break;
        }
      }
    } catch (e) {
      // noop
    }
  }, [mode, isDateAvailable, selectedDate]);

  const handleTimeSlotSelect = (time: string, slot?: any) => {
    if (!selectedDate) return;
    
    // In subscription session_config mode, currentItem is null - that's OK
    if (mode !== 'subscription' && !currentItem) return;
    
    if (mode === 'service' && !professionalId) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const durationMin = (mode === 'subscription' && hasSessionConfig) 
      ? sessionConfigDuration 
      : (currentItem?.duration_min || 60);
    const tz = locationTz || 'Europe/Madrid';

    // Normalize time format (remove seconds if present)
    const normalizedTime = time.split(':').slice(0, 2).join(':');
    
    if (mode === 'class') {
      // Class-specific logging
      console.log('[ClassCalendar.slot]', { 
        selectedDate: dateStr, 
        startTime: normalizedTime, 
        durationMin, 
        tz 
      });
    }
    
    // Compute UTC datetimes from location timezone
    const localDateTimeStr = `${dateStr}T${normalizedTime}:00`;
    
    let startUtc, endUtc;
    try {
      startUtc = fromZonedTime(localDateTimeStr, tz);
      endUtc = addMinutes(startUtc, durationMin);
      
      // Validate the dates
      if (!isValid(startUtc) || !isValid(endUtc)) {
        throw new Error('Invalid date after conversion');
      }
      
      if (mode === 'class') {
        console.log('[ClassCalendar.utc]', { 
          startUTC: startUtc.toISOString(), 
          endUTC: endUtc.toISOString() 
        });
      }
    } catch (error) {
      const errorLog = {
        date: dateStr,
        startTime: normalizedTime,
        tz,
        details: error.message
      };
      
      if (mode === 'class') {
        console.error('[ClassClick.error]', errorLog);
      } else {
        console.error('[handleTimeSlotSelect] Date conversion error:', errorLog);
      }
      
      toast({
        title: "Hora inválida (TZ)",
        description: "No se pudo procesar la fecha y hora seleccionada",
        variant: "destructive"
      });
      return;
    }

    if (mode === 'class') {
      // Class mode logic
      const logPayload = {
        classId: currentItem.id,
        date: dateStr,
        startTime: normalizedTime,
        tz,
        startUTC: startUtc.toISOString(),
        endUTC: endUtc.toISOString()
      };
      console.log('[Class→Confirm]', logPayload);
      
      // Navigate to confirmation screen with class details
      const params = new URLSearchParams({
        classId: currentItem.id,
        date: dateStr,
        time: normalizedTime,
        durationMin: String(durationMin),
        mode: 'class'
      });
      if (locationId) params.set('locationId', locationId);
      if (slot?.capacity) params.set('capacity', String(slot.capacity));
      if (classAvailability.classData?.price) params.set('price', String(classAvailability.classData.price));
      if (classAvailability.classData?.currency) params.set('currency', classAvailability.classData.currency);
      
      const target = `#/confirmacion?${params.toString()}`;
      console.log('[Class] Navigating to:', target);
      window.location.hash = target;
    } else if (mode === 'subscription') {
      // Subscription mode logic
      // In session_config mode, no class/service is involved
      const isClassBooking = !hasSessionConfig && eligibleClasses.length > 0 && eligibleClasses[0]?.id === currentItem?.id;
      const isServiceBooking = !hasSessionConfig && !isClassBooking && eligibleServices.length > 0;
      
      const logPayload = {
        subscriptionPlanId: subscriptionPlan?.id,
        hasSessionConfig,
        classId: isClassBooking ? currentItem?.id : null,
        serviceId: isServiceBooking ? currentItem?.id : null,
        professionalId: assignedProfessional,
        date: dateStr,
        startTime: normalizedTime,
        tz,
        startUTC: startUtc.toISOString(),
        endUTC: endUtc.toISOString()
      };
      console.log('[Subscription→Confirm]', logPayload);
      
      // Navigate to confirmation screen with subscription details
      const params = new URLSearchParams({
        mode: 'subscription',
        subscriptionPlanId: subscriptionPlan?.id || '',
        date: dateStr,
        time: normalizedTime,
        durationMin: String(durationMin),
      });
      
      // Add either classId or serviceId (only in legacy mode)
      if (isClassBooking && currentItem) {
        params.set('classId', currentItem.id);
      } else if (isServiceBooking && currentItem) {
        params.set('serviceId', currentItem.id);
      }
      
      if (locationId) params.set('locationId', locationId);
      if (assignedProfessional) params.set('professionalId', assignedProfessional);
      if (subscriptionCapacity) params.set('capacity', String(subscriptionCapacity));
      if (subscriptionPlan?.price) params.set('price', String(subscriptionPlan.price));
      if (subscriptionPlan?.currency) params.set('currency', subscriptionPlan.currency);
      
      const target = `#/confirmacion?${params.toString()}`;
      console.log('[Subscription] Navigating to:', target);
      window.location.hash = target;
    } else {
      // Service mode logic  
      const maybeServiceId = currentItem.id;
      
      // Clear any voucher-related residual state to avoid contaminating service flow
      try {
        localStorage.removeItem('reservasPro_voucherFlow');
        localStorage.removeItem('voucherId');
        localStorage.removeItem('pseudoServiceId');
      } catch {}

      const logPayload = {
        mode: 'service',
        serviceId: maybeServiceId,
        professionalId,
        locationId,
        startUTC: startUtc.toISOString(),
        endUTC: endUtc.toISOString()
      };
      console.log('[Calendar→Confirm.nav]', logPayload);
      
      // Navigate to confirmation screen with booking details (canonical route)
      const params = new URLSearchParams({
        serviceId: maybeServiceId,
        professionalId,
        date: dateStr,
        time: normalizedTime,
        durationMin: String(durationMin),
        startUtc: startUtc.toISOString(),
        endUtc: endUtc.toISOString()
      });
      params.set('mode','service');
      if (locationId) params.set('locationId', locationId);
      
      const target = `#/confirmacion?${params.toString()}`;
      console.log('Navigating to:', target);
      window.location.hash = target;

      // Fallback event
      const detail = {
        serviceId: maybeServiceId,
        professionalId,
        locationId: locationId || null,
        date: dateStr,
        time: normalizedTime,
        durationMin,
        startUtc: startUtc.toISOString(),
        endUtc: endUtc.toISOString()
      };
      window.dispatchEvent(new CustomEvent('rpw:navigate.confirmacion', { detail }));
    }
  };
  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  if (mode === 'subscription') {
    if (subscriptionLoading) {
      return (
        <div className="text-center py-8">
          <p className="text-white">Cargando opciones de suscripción...</p>
        </div>
      );
    }
    
    // In session_config mode, we don't need classes/services
    if (!hasSessionConfig && eligibleClasses.length === 0 && eligibleServices.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-white">No hay clases o servicios disponibles en esta suscripción</p>
        </div>
      );
    }
  } else if (!currentItem) {
    return (
      <div className="text-center py-8">
        <p className="text-white">No se ha seleccionado un servicio</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-white text-lg font-semibold">Escoge una fecha y hora</h2>
        {mode === 'subscription' && subscriptionPlan && (
          <div className="bg-primary/20 border border-primary/30 rounded-lg p-3 mt-2">
            <p className="text-white font-medium">Reservando con suscripción:</p>
            <p className="text-white/80 text-sm">{subscriptionPlan.name}</p>
          </div>
        )}
        {mode !== 'subscription' && currentItem && (
          <p className="text-white/80 text-sm">{currentItem.name}</p>
        )}
      </div>
      
      {/* Subscription options - hidden by design (subscription is the product) */}

      {/* Professional Selector - for services and subscriptions */}
      {mode === 'service' && professionals.length > 1 && (
        <div className="space-y-2">
          <p className="text-white text-sm font-medium">Selecciona especialista:</p>
          <div className="flex flex-wrap gap-2">
            {professionals.map((prof) => (
              <Button
                key={prof.id}
                variant={selectedProfessional === prof.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedProfessional(prof.id)}
                className={cn(
                  "text-xs",
                  selectedProfessional === prof.id 
                    ? "bg-white text-gray-900" 
                    : "border-white/20 text-white hover:bg-white/10"
                )}
              >
                {prof.name}
              </Button>
            ))}
          </div>
        </div>
      )}


      {/* Class info display */}
      {mode === 'class' && classAvailability.classData && (
        <div className="bg-white/10 rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white font-medium">{classAvailability.classData.name}</p>
              <p className="text-white/80 text-sm">{classAvailability.classData.duration_min} min</p>
            </div>
            <div className="text-right">
              <p className="text-white font-semibold">{classAvailability.classData.price}€</p>
              <p className="text-white/60 text-xs">Capacidad: {classAvailability.classData.capacity}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mini Calendar */}
      <div className="bg-white/10 rounded-lg p-4">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateMonth('prev')}
            className="text-white hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-white font-semibold">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateMonth('next')}
            className="text-white hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Calendar Grid */}
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          locale={es}
          disabled={isDateDisabled}
          className="text-white [&_.rdp-day_button]:text-white [&_.rdp-day_button:hover]:bg-white/20 [&_.rdp-day_button.rdp-day_selected]:bg-red-500 [&_.rdp-day_button.rdp-day_selected]:text-white [&_.rdp-day_button:disabled]:text-white/30 [&_.rdp-day_button:disabled]:opacity-50"
          classNames={{
            months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
            month: "space-y-4",
            caption: "flex justify-center pt-1 relative items-center hidden", // Hide default navigation
            caption_label: "text-sm font-medium text-white",
            nav: "space-x-1 flex items-center hidden", // Hide default navigation
            table: "w-full border-collapse space-y-1",
            head_row: "flex",
            head_cell: "text-white rounded-md w-8 font-normal text-[0.8rem] text-center",
            row: "flex w-full mt-2",
            cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
            day: cn(
              "h-8 w-8 p-0 font-normal aria-selected:opacity-100 text-white hover:bg-white/20",
              "rounded-md hover:bg-accent hover:text-accent-foreground",
              "focus:bg-accent focus:text-accent-foreground"
            ),
            day_selected: "bg-red-500 text-white hover:bg-red-600 hover:text-white focus:bg-red-500 focus:text-white",
            day_today: "bg-white/20 text-white font-semibold",
            day_outside: "day-outside text-white/50 opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
            day_disabled: "text-white/30 opacity-50",
            day_hidden: "invisible",
          }}
        />
      </div>

      {/* Time Slots */}
      {selectedDate && (
        <div className="space-y-4">
          <h3 className="text-white font-semibold bg-red-500 text-center py-2 rounded-lg">
            Horas disponibles
          </h3>

          {loading && <p className="text-white/80 text-center">Cargando horarios...</p>}
          {error && <p className="text-red-400 text-center">Error: {error}</p>}

          {!loading && !error && (
            <div className="space-y-4">
              {/* Morning */}
              {slotsByPeriod.morning.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="bg-white/20 text-white">
                      Mañana
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {slotsByPeriod.morning.map((slot) => (
                      <Button
                        key={slot.time}
                        variant="outline"
                        size="sm"
                        onClick={() => handleTimeSlotSelect(slot.time, slot)}
                        className={cn(
                          "border-white/30 text-white hover:bg-white/10 bg-transparent",
                          (mode === 'class' || mode === 'subscription') && 'remainingSlots' in slot && slot.remainingSlots !== undefined && slot.remainingSlots <= 3 && "border-amber-400/50"
                        )}
                        disabled={!slot.available}
                      >
                        <div className="flex flex-col items-center">
                          <span>{slot.time}</span>
                          {(mode === 'class' || mode === 'subscription') && 'remainingSlots' in slot && slot.remainingSlots !== undefined && (
                            <span className="text-xs text-white/60">
                              {slot.remainingSlots === 0 ? 'Completo' : `${slot.remainingSlots} plazas`}
                            </span>
                          )}
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Afternoon */}
              {slotsByPeriod.afternoon.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="bg-white/20 text-white">
                      Tarde
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {slotsByPeriod.afternoon.map((slot) => (
                      <Button
                        key={slot.time}
                        variant="outline"
                        size="sm"
                        onClick={() => handleTimeSlotSelect(slot.time, slot)}
                        className={cn(
                          "border-white/30 text-white hover:bg-white/10 bg-transparent",
                          (mode === 'class' || mode === 'subscription') && 'remainingSlots' in slot && slot.remainingSlots !== undefined && slot.remainingSlots <= 3 && "border-amber-400/50"
                        )}
                        disabled={!slot.available}
                      >
                        <div className="flex flex-col items-center">
                          <span>{slot.time}</span>
                          {(mode === 'class' || mode === 'subscription') && 'remainingSlots' in slot && slot.remainingSlots !== undefined && (
                            <span className="text-xs text-white/60">
                              {slot.remainingSlots === 0 ? 'Completo' : `${slot.remainingSlots} plazas`}
                            </span>
                          )}
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Night */}
              {slotsByPeriod.night.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="bg-white/20 text-white">
                      Tarde / Noche
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {slotsByPeriod.night.map((slot) => (
                      <Button
                        key={slot.time}
                        variant="outline"
                        size="sm"
                        onClick={() => handleTimeSlotSelect(slot.time, slot)}
                        className={cn(
                          "border-white/30 text-white hover:bg-white/10 bg-transparent",
                          (mode === 'class' || mode === 'subscription') && 'remainingSlots' in slot && slot.remainingSlots !== undefined && slot.remainingSlots <= 3 && "border-amber-400/50"
                        )}
                        disabled={!slot.available}
                      >
                        <div className="flex flex-col items-center">
                          <span>{slot.time}</span>
                          {(mode === 'class' || mode === 'subscription') && 'remainingSlots' in slot && slot.remainingSlots !== undefined && (
                            <span className="text-xs text-white/60">
                              {slot.remainingSlots === 0 ? 'Completo' : `${slot.remainingSlots} plazas`}
                            </span>
                          )}
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* No slots available */}
              {Object.values(slotsByPeriod).every(slots => slots.length === 0) && (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-white/50 mx-auto mb-2" />
                  <p className="text-white/80">No hay horarios disponibles para este día</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}