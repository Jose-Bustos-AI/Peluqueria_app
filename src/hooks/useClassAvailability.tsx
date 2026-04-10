import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, startOfDay, parse, isWithinInterval, isSameDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { getDefaultLocation } from '@/lib/default-location';

interface ClassData {
  id: string;
  name: string;
  duration_min: number;
  capacity: number;
  days_of_week: number[];
  default_start_time: string | null;
  default_end_time: string | null;
  currency: string;
  price: number;
}

interface ClassSession {
  id: string;
  class_id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  location_id: string;
  professional_id: string;
}

interface Location {
  id: string;
  name: string;
  timezone: string;
}

interface TimeSlot {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  startUTC: Date;
  endUTC: Date;
  available: boolean;
  capacity: number;
  remainingSlots: number;
}

interface ClassAvailabilityResult {
  loading: boolean;
  error: string | null;
  locationTimezone: string;
  getAvailableSlots: (date: Date) => TimeSlot[];
  isDateAvailable: (date: Date) => boolean;
  classData: ClassData | null;
  location: Location | null;
  refreshAvailability: () => void;
}

export function useClassAvailability(
  classId?: string,
  locationId?: string
): ClassAvailabilityResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [classSessions, setClassSessions] = useState<ClassSession[]>([]);
  const [existingBookings, setExistingBookings] = useState<any[]>([]);
  const [resolvedLocationId, setResolvedLocationId] = useState<string | null>(null);

  // Resolve location if not provided
  useEffect(() => {
    const resolveLocation = async () => {
      if (locationId) {
        setResolvedLocationId(locationId);
      } else {
        try {
          const defaultLoc = await getDefaultLocation();
          setResolvedLocationId(defaultLoc?.id || null);
        } catch (e) {
          console.warn('[useClassAvailability] failed to resolve default location');
          setResolvedLocationId(null);
        }
      }
    };
    resolveLocation();
  }, [locationId]);

  const loadClassData = useCallback(async () => {
    if (!classId || !resolvedLocationId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[ClassCalendar] Loading class data', { classId, locationId: resolvedLocationId });

      // Load class data
      const { data: classResult, error: classError } = await supabase
        .from('classes')
        .select('id, name, duration_min, capacity, days_of_week, default_start_time, default_end_time, currency, price')
        .eq('id', classId)
        .maybeSingle();

      if (classError) throw classError;
      if (!classResult) throw new Error('Clase no encontrada');

      setClassData(classResult);

      // Load location data
      const { data: locationResult, error: locationError } = await supabase
        .from('locations')
        .select('id, name, timezone')
        .eq('id', resolvedLocationId)
        .maybeSingle();

      if (locationError) throw locationError;
      if (!locationResult) throw new Error('Ubicación no encontrada');

      setLocation(locationResult);

      // Load explicit class sessions if any exist
      const { data: sessionsResult, error: sessionsError } = await supabase
        .from('class_sessions')
        .select('id, class_id, start_at, end_at, capacity, location_id, professional_id')
        .eq('class_id', classId)
        .eq('location_id', resolvedLocationId)
        .gte('start_at', new Date().toISOString());

      if (sessionsError) {
        console.warn('[useClassAvailability] sessions fetch error:', sessionsError);
      } else {
        setClassSessions(sessionsResult || []);
      }

      // Load existing bookings for this class
      const { data: bookingsResult, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, class_id, start_at, end_at, status, payment_status')
        .eq('type', 'class')
        .eq('class_id', classId)
        .eq('location_id', resolvedLocationId)
        .gte('start_at', new Date().toISOString())
        .neq('status', 'cancelled');

      if (bookingsError) {
        console.warn('[useClassAvailability] bookings fetch error:', bookingsError);
      } else {
        console.log('[ClassAvailability] loaded bookings:', bookingsResult?.length || 0);
        setExistingBookings(bookingsResult || []);
      }

      console.log('[ClassCalendar] Data loaded', {
        class: classResult.name,
        sessions: sessionsResult?.length || 0,
        bookings: bookingsResult?.length || 0,
        timezone: locationResult.timezone
      });

    } catch (err: any) {
      console.error('[useClassAvailability] load error:', err);
      setError(err.message || 'Error cargando datos de la clase');
    } finally {
      setLoading(false);
    }
  }, [classId, resolvedLocationId]);

  // Refresh function to be called after successful bookings
  const refreshAvailability = useCallback(() => {
    console.log('[ClassAvailability] refreshing data after booking');
    loadClassData();
  }, [loadClassData]);

  useEffect(() => {
    loadClassData();
  }, [loadClassData]);

  // Generate available slots for a specific date
  const getAvailableSlots = useCallback((date: Date): TimeSlot[] => {
    if (!classData || !location) return [];

    const timezone = location.timezone || 'Europe/Madrid';
    const targetDate = format(date, 'yyyy-MM-dd');
    const dayOfWeek = date.getDay();

    // Convert JavaScript dayOfWeek (0=Sunday, 1=Monday...) to database format (1=Monday, 7=Sunday)
    const dbDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

    if (import.meta.env.DEV) {
      console.log('[ClassAvail.input]', {
        classId: classData.id,
        daysOfWeek: classData.days_of_week,
        defaultStartTime: classData.default_start_time,
        durationMin: classData.duration_min,
        capacity: classData.capacity,
        locationTz: timezone,
        jsDayOfWeek: dayOfWeek,
        dbDayOfWeek: dbDayOfWeek
      });
    }

    console.log(`[ClassCalendar] getAvailableSlots for ${targetDate}, dayOfWeek=${dayOfWeek}, dbDayOfWeek=${dbDayOfWeek}`);

    // Check if we have explicit sessions for this date
    const sessionsForDate = classSessions.filter(session => {
      const sessionDate = format(new Date(session.start_at), 'yyyy-MM-dd');
      return sessionDate === targetDate;
    });

    if (sessionsForDate.length > 0) {
      console.log(`[ClassCalendar] source=sessions slots=${sessionsForDate.length} tz=${timezone}`);
      const validSessions = sessionsForDate.filter(s => {
        const st = new Date(s.start_at);
        const en = new Date(s.end_at);
        const ok = !isNaN(st.getTime()) && !isNaN(en.getTime());
        if (!ok) console.warn('[ClassCalendar] Skipping invalid session times', s);
        return ok;
      });
      
      const slots = validSessions.map(session => {
        const startUTC = new Date(session.start_at);
        const endUTC = new Date(session.end_at);
        const startLocal = toZonedTime(startUTC, timezone);
        
    // Count existing bookings for this session using DB count
        const bookingsCount = existingBookings.filter(booking => {
          if (!booking.start_at) return false;
          
          const bookingStart = new Date(booking.start_at);
          if (isNaN(bookingStart.getTime())) return false;
          
          // Exact time match for class bookings
          const isExactMatch = bookingStart.getTime() === startUTC.getTime();
          
          return isExactMatch;
        }).length;

        console.log('[ClassCalendar]', `cap=${session.capacity} used=${bookingsCount} remaining=${session.capacity - bookingsCount} slot=${startUTC.toISOString()} loc=${resolvedLocationId}`);

        const remainingSlots = session.capacity - bookingsCount;

        return {
          date: targetDate,
          time: format(startLocal, 'HH:mm'),
          startUTC,
          endUTC,
          available: remainingSlots > 0,
          capacity: session.capacity,
          remainingSlots
        };
      });

      if (import.meta.env.DEV) {
        console.log('[ClassAvail.generated]', 'slots=', slots);
        console.log('[ClassAvail.result]', `date=${targetDate}`, 'times=', 
          slots.map(s => ({ time: s.time, remaining: s.remainingSlots }))
        );
      }

      return slots;
    }

    // Generate slots from recurrence pattern
    // Check if the class is scheduled for this day of the week
    if (!classData.days_of_week?.includes(dbDayOfWeek) || !classData.default_start_time) {
      console.log(`[ClassCalendar] No slots for ${targetDate}: daysOfWeek=${JSON.stringify(classData.days_of_week)}, dbDayOfWeek=${dbDayOfWeek}, startTime=${classData.default_start_time}`);
      return [];
    }

    console.log(`[ClassCalendar] source=recurrence slots=1 tz=${timezone}`);

    // Parse default times
    const startTimeRaw = classData.default_start_time;
    const durationMin = classData.duration_min;

    // Create slot time in location timezone (normalize to HH:mm:ss)
    const normalizedTime = startTimeRaw
      ? (startTimeRaw.length === 5 ? `${startTimeRaw}:00` : startTimeRaw)
      : '00:00:00';
    const localDateTimeStr = `${targetDate}T${normalizedTime}`;
    const startUTC = fromZonedTime(localDateTimeStr, timezone);
    if (isNaN(startUTC.getTime())) {
      console.warn('[ClassCalendar] Invalid startUTC from', { localDateTimeStr, timezone, startTimeRaw });
      return [];
    }
    const endUTC = new Date(startUTC.getTime() + durationMin * 60000);

    // Count existing bookings for this time slot
    const bookingsCount = existingBookings.filter(booking => {
      if (!booking.start_at) return false;
      
      const bookingStart = new Date(booking.start_at);
      if (isNaN(bookingStart.getTime())) return false;
      
      // Exact time match for class bookings
      const isExactMatch = bookingStart.getTime() === startUTC.getTime();
      
      return isExactMatch;
    }).length;

    console.log('[ClassCalendar]', `cap=${classData.capacity} used=${bookingsCount} remaining=${classData.capacity - bookingsCount} slot=${startUTC.toISOString()} loc=${resolvedLocationId}`);

    const remainingSlots = classData.capacity - bookingsCount;
    
    const slots = [{
      date: targetDate,
      time: normalizedTime.slice(0,5),
      startUTC,
      endUTC,
      available: remainingSlots > 0,
      capacity: classData.capacity,
      remainingSlots
    }];

    if (import.meta.env.DEV) {
      console.log('[ClassAvail.generated]', 'slots=', slots);
      console.log('[ClassAvail.result]', `date=${targetDate}`, 'times=', 
        slots.map(s => ({ time: s.time, remaining: s.remainingSlots }))
      );
    }

    return slots;
  }, [classData, location, classSessions, existingBookings]);

  // Check if a date has any available slots
  const isDateAvailable = useCallback((date: Date): boolean => {
    const slots = getAvailableSlots(date);
    return slots.some(slot => slot.available);
  }, [getAvailableSlots]);

  return {
    loading,
    error,
    locationTimezone: location?.timezone || 'Europe/Madrid',
    getAvailableSlots,
    isDateAvailable,
    classData,
    location,
    refreshAvailability
  };
}