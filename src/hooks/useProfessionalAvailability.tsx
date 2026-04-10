import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, getISODay, addMinutes, parseISO, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { toZonedTime, formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { getDefaultLocation } from '@/lib/default-location';

interface ProfessionalHour {
  id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

interface ProfessionalException {
  id: string;
  date: string;
  open_time?: string;
  close_time?: string;
  is_closed: boolean;
  note?: string;
}

interface OpenInterval {
  start: string;
  end: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
  period: 'morning' | 'afternoon' | 'night';
}

interface BookingSettings {
  min_advance_hours: number;
  max_advance_days: number;
  booking_window_days: number;
}

interface ProfessionalAvailabilityResult {
  loading: boolean;
  error: string | null;
  professionalTimezone: string;
  getOpenIntervals: (date: Date) => OpenInterval[];
  getAvailableSlots: (date: Date) => TimeSlot[];
  isClosed: (date: Date) => boolean;
  isDateAvailable: (date: Date) => boolean;
}

export function useProfessionalAvailability(
  professionalId: string | null,
  serviceId: string | null,
  locationId: string | null = null,
  overrideDuration?: number, // Optional duration for vouchers/subscriptions
  excludeBookingId?: string, // Exclude this booking from conflict checks (for rescheduling)
  slotStepMinutes?: number // Optional: override slot step (e.g. 30 for admin granularity)
): ProfessionalAvailabilityResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [professionalHours, setProfessionalHours] = useState<ProfessionalHour[]>([]);
  const [professionalExceptions, setProfessionalExceptions] = useState<ProfessionalException[]>([]);
  const [professionalTimezone, setProfessionalTimezone] = useState<string>('Europe/Madrid');
  const [businessHours, setBusinessHours] = useState<Record<string, any>>({});
  const [locationHours, setLocationHours] = useState<any>(null);
  const [service, setService] = useState<any>(null);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings>({
    min_advance_hours: 2,
    max_advance_days: 30,
    booking_window_days: 30
  });
  const [existingBookings, setExistingBookings] = useState<any[]>([]);
  const [resolvedLocationId, setResolvedLocationId] = useState<string | null>(locationId);

  // Resolve location ID if null/undefined and exactly 1 active location exists
  useEffect(() => {
    if (locationId) {
      setResolvedLocationId(locationId);
      return;
    }

    const resolveDefaultLocation = async () => {
      const defaultLocation = await getDefaultLocation();
      if (defaultLocation) {
        setResolvedLocationId(defaultLocation.id);
        if (import.meta.env.DEV) {
          console.log('[ProfessionalAvailability] using default location_id=', defaultLocation.id);
        }
      } else {
        setResolvedLocationId(null);
      }
    };

    resolveDefaultLocation();
  }, [locationId]);

  // Load all data when dependencies change
  useEffect(() => {
    if (professionalId) {
      loadProfessionalData();
    }
  }, [professionalId, serviceId, resolvedLocationId]);

  const loadProfessionalData = async () => {
    if (!professionalId) return;
    
    setLoading(true);
    setError(null);

    try {
      console.log('Loading professional data for:', { professionalId, serviceId, locationId });
      
      // Load professional data and settings
      const professionalRes = await supabase
        .from('professionals')
        .select('business_hours, timezone')
        .eq('id', professionalId)
        .single();
      
      // Only load service data if serviceId is provided
      let serviceRes = null;
      if (serviceId) {
        serviceRes = await supabase
          .from('services')
          .select('duration_min, buffer_min')
          .eq('id', serviceId)
          .single();
      }
      
      const settingsRes = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['bookings.min_advance_hours', 'bookings.max_advance_days']);

      if (professionalRes.error) {
        console.error('Professional query error:', professionalRes.error);
        throw professionalRes.error;
      }
      if (serviceRes?.error) {
        console.error('Service query error:', serviceRes.error);
        throw serviceRes.error;
      }

      console.log('Loaded data:', { 
        professional: professionalRes.data, 
        service: serviceRes?.data, 
        settings: settingsRes.data 
      });

      // Set professional timezone and business hours
      const timezone = professionalRes.data?.timezone || 'Europe/Madrid';
      const bh = (professionalRes.data?.business_hours as Record<string, any>) || {};
      setProfessionalTimezone(timezone);
      setBusinessHours(bh);
      setService(serviceRes?.data || null);

      // Parse settings
      const settings = settingsRes.data || [];
      const minAdvanceHours = settings.find(s => s.key === 'bookings.min_advance_hours')?.value || 2;
      const maxAdvanceDays = settings.find(s => s.key === 'bookings.max_advance_days')?.value || 30;
      
      setBookingSettings({
        min_advance_hours: Number(minAdvanceHours),
        max_advance_days: Number(maxAdvanceDays),
        booking_window_days: Number(maxAdvanceDays) // Use same value for now
      });

      // Load professional hours and exceptions if business_hours is empty (fallback)
      if (!bh || Object.keys(bh).length === 0) {
        const [hoursRes, exceptionsRes] = await Promise.all([
          supabase
            .from('professional_hours')
            .select('*')
            .eq('professional_id', professionalId)
            .order('day_of_week'),
          supabase
            .from('professional_hours_exceptions')
            .select('*')
            .eq('professional_id', professionalId)
            .order('date')
        ]);

        if (hoursRes.error) throw hoursRes.error;
        if (exceptionsRes.error) throw exceptionsRes.error;

        setProfessionalHours(hoursRes.data || []);
        setProfessionalExceptions(exceptionsRes.data || []);
      } else {
        // Load only exceptions when using business_hours
        const exceptionsRes = await supabase
          .from('professional_hours_exceptions')
          .select('*')
          .eq('professional_id', professionalId)
          .order('date');

        if (exceptionsRes.error) throw exceptionsRes.error;
        setProfessionalExceptions(exceptionsRes.data || []);
      }

      // Load location hours if locationId is provided
      if (resolvedLocationId) {
        const locationRes = await supabase
          .from('locations')
          .select('business_hours, timezone')
          .eq('id', resolvedLocationId)
          .single();

        if (!locationRes.error) {
          setLocationHours({
            business_hours: locationRes.data?.business_hours || {},
            timezone: locationRes.data?.timezone || timezone
          });
        }
      }

      // Load existing bookings for the professional in the visible range
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + bookingSettings.booking_window_days);

      const bookingsRes = await supabase
        .from('bookings')
        .select('id, start_at, end_at, status')
        .eq('professional_id', professionalId)
        .gte('start_at', today.toISOString())
        .lte('start_at', endDate.toISOString())
        .in('status', ['confirmed', 'pending']); // Blocking statuses

      if (!bookingsRes.error) {
        setExistingBookings(bookingsRes.data || []);
      }

    } catch (err) {
      console.error('Error loading professional availability data:', err);
      setError(err instanceof Error ? err.message : 'Error loading availability');
    } finally {
      setLoading(false);
    }
  };

  const getOpenIntervals = useCallback((date: Date): OpenInterval[] => {
    if (!professionalId) return [];

    const tz = professionalTimezone;
    const dateLabelStr = format(date, 'yyyy-MM-dd');
    
    // Check for exceptions first
    const exception = professionalExceptions.find(e => e.date === dateLabelStr);
    if (exception) {
      if (exception.is_closed) return [];
      if (exception.open_time && exception.close_time) {
        return [{ start: exception.open_time, end: exception.close_time }];
      }
    }

    // Get professional intervals
    let professionalIntervals: OpenInterval[] = [];
    
    if (businessHours && Object.keys(businessHours).length > 0) {
      // Use business_hours JSON
      const isoDay = getISODay(date); // 1=Mon, 7=Sun
      const dayData = businessHours[isoDay.toString()];
      
      if (dayData?.open && dayData?.intervals) {
        professionalIntervals = dayData.intervals.map((int: any) => ({
          start: int.start,
          end: int.end
        }));
      }
    } else {
      // Fallback to professional_hours table
      const isoDay = getISODay(date);
      const dayHours = professionalHours.filter(h => h.day_of_week === isoDay && !h.is_closed);
      professionalIntervals = dayHours.map(h => ({
        start: h.open_time,
        end: h.close_time
      }));
    }

    if (professionalIntervals.length === 0) return [];

    // Intersect with location hours if location has business_hours configured
    if (resolvedLocationId && locationHours) {
      const locationBusinessHours = locationHours.business_hours;
      const hasLocationBH = locationBusinessHours && Object.keys(locationBusinessHours).length > 0;

      // If the location has no schedule configured, do not restrict availability by location
      if (!hasLocationBH) {
        return professionalIntervals;
      }

      const isoDay = getISODay(date);
      const locationDayData = locationBusinessHours?.[isoDay.toString()];

      if (!locationDayData?.open || !locationDayData?.intervals) {
        return []; // Location is closed this day
      }

      const locationIntervals = locationDayData.intervals.map((int: any) => ({
        start: int.start,
        end: int.end
      }));

      // Calculate intersection of professional and location intervals
      const intersectedIntervals: OpenInterval[] = [];
      
      for (const profInterval of professionalIntervals) {
        for (const locInterval of locationIntervals) {
          const start = profInterval.start > locInterval.start ? profInterval.start : locInterval.start;
          const end = profInterval.end < locInterval.end ? profInterval.end : locInterval.end;
          
          if (start < end) {
            intersectedIntervals.push({ start, end });
          }
        }
      }

      return intersectedIntervals;
    }

    return professionalIntervals;
  }, [professionalId, professionalTimezone, professionalExceptions, businessHours, professionalHours, resolvedLocationId, locationHours]);

  const getAvailableSlots = useCallback((date: Date): TimeSlot[] => {
    // Use override duration if provided (for vouchers), otherwise require service
    const effectiveDuration = overrideDuration || service?.duration_min;
    const effectiveBuffer = service?.buffer_min || 0;
    
    if (!effectiveDuration) return [];

    const intervals = getOpenIntervals(date);
    if (intervals.length === 0) return [];

    const slots: TimeSlot[] = [];
    const serviceDuration = effectiveDuration;
    const step = slotStepMinutes || serviceDuration; // Use custom step if provided, otherwise service duration
    const now = new Date();
    const tz = professionalTimezone;

    // Check if date is within booking window
    const today = startOfDay(new Date());
    const maxBookingDate = new Date();
    maxBookingDate.setDate(today.getDate() + bookingSettings.booking_window_days);
    
    if (date < today || date > maxBookingDate) {
      return [];
    }

    // Calculate minimum advance time
    const minAdvanceMs = bookingSettings.min_advance_hours * 60 * 60 * 1000;
    const minBookingTime = new Date(now.getTime() + minAdvanceMs);

    for (const interval of intervals) {
      const [startHour, startMin] = interval.start.split(':').map(Number);
      const [endHour, endMin] = interval.end.split(':').map(Number);
      
      let currentTime = startHour * 60 + startMin; // minutes from midnight
      const endTime = endHour * 60 + endMin;

      while (currentTime + serviceDuration <= endTime) {
        const hour = Math.floor(currentTime / 60);
        const minute = currentTime % 60;
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        // Create full datetime for this slot
        const slotDateTime = new Date(date);
        slotDateTime.setHours(hour, minute, 0, 0);
        
        // Check if slot meets minimum advance requirement
        const meetsAdvanceReq = slotDateTime >= minBookingTime;
        
        // Check if slot conflicts with existing bookings
        const slotEnd = new Date(slotDateTime.getTime() + serviceDuration * 60 * 1000);
        const hasConflict = existingBookings.filter(b => !excludeBookingId || b.id !== excludeBookingId).some(booking => {
          const bookingStart = parseISO(booking.start_at);
          const bookingEnd = parseISO(booking.end_at);
          
          // Check for overlap
          return (slotDateTime < bookingEnd && slotEnd > bookingStart);
        });

        const isAvailable = meetsAdvanceReq && !hasConflict;

        // Determine period
        let period: 'morning' | 'afternoon' | 'night' = 'morning';
        if (hour >= 13 && hour < 19) period = 'afternoon';
        else if (hour >= 19) period = 'night';

        slots.push({
          time: timeString,
          available: isAvailable,
          period
        });

        currentTime += step;
      }
    }

    return slots;
  }, [service, getOpenIntervals, professionalTimezone, bookingSettings, existingBookings, overrideDuration, excludeBookingId]);

  const isClosed = useCallback((date: Date): boolean => {
    const dateLabelStr = format(date, 'yyyy-MM-dd');
    const exception = professionalExceptions.find(e => e.date === dateLabelStr);
    
    if (exception) {
      return exception.is_closed;
    }

    const intervals = getOpenIntervals(date);
    return intervals.length === 0;
  }, [professionalExceptions, getOpenIntervals]);

  const isDateAvailable = useCallback((date: Date): boolean => {
    // Check if date is in the past
    const today = startOfDay(new Date());
    const checkDate = startOfDay(date);
    if (checkDate < today) return false;
    
    if (isClosed(date)) return false;
    
    const slots = getAvailableSlots(date);
    return slots.some(slot => slot.available);
  }, [isClosed, getAvailableSlots]);

  return {
    loading,
    error,
    professionalTimezone,
    getOpenIntervals,
    getAvailableSlots,
    isClosed,
    isDateAvailable,
  };
}