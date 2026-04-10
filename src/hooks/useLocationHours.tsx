import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, getISODay } from 'date-fns';
import { toZonedTime, formatInTimeZone, fromZonedTime } from 'date-fns-tz';

interface LocationHour {
  id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

interface LocationException {
  id: string;
  date: string;
  open_time?: string;
  close_time?: string;
  is_closed: boolean;
  note?: string;
}

interface OpenHours {
  open_time: string;
  close_time: string;
}

interface LocationHoursResult {
  hours: LocationHour[];
  exceptions: LocationException[];
  loading: boolean;
  featureDisabled: boolean;
  usingLegacyFallback: boolean;
  getOpenHoursForDate: (date: Date) => OpenHours[] | null;
  isLocationOpenAtTime: (date: Date, time: string) => boolean;
  getClosedPeriodsForDate: (date: Date) => { start: string; end: string }[];
}

export function useLocationHours(locationId: string | null): LocationHoursResult {
  const [hours, setHours] = useState<LocationHour[]>([]);
  const [exceptions, setExceptions] = useState<LocationException[]>([]);
  const [loading, setLoading] = useState(false);
  const [featureDisabled, setFeatureDisabled] = useState(true);
  const [usingLegacyFallback, setUsingLegacyFallback] = useState(false);
  const [locationTimezone, setLocationTimezone] = useState<string>('Europe/Madrid');
  const [businessHours, setBusinessHours] = useState<Record<string, { open: boolean; intervals?: { start: string; end: string }[] }>>({});

  useEffect(() => {
    if (locationId && locationId !== 'all') {
      loadLocationData();
    } else {
      setHours([]);
      setExceptions([]);
    }
  }, [locationId]);

const loadLocationData = async () => {
    if (!locationId || locationId === 'all') return;
    setLoading(true);

    try {
      // 1) Leer feature flag (default true si no existe)
      const { data: flagRow, error: flagError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'disable_location_hours')
        .maybeSingle();

      const disabled = flagError ? true : ((flagRow?.value as any)?.enabled ?? true);
      setFeatureDisabled(!!disabled);

      if (import.meta.env.DEV) console.debug('[LocationHours] flag disabled =', disabled);

      if (disabled) {
        // No bloquear: usar defaults y salir
        setHours([]);
        setExceptions([]);
        return;
      }

      // 2) Cargar business_hours + timezone y excepciones
      const [locationRes, exceptionsRes] = await Promise.all([
        supabase
          .from('locations')
          .select('business_hours, timezone')
          .eq('id', locationId)
          .single(),
        supabase
          .from('location_hours_exceptions')
          .select('*')
          .eq('location_id', locationId)
          .order('date')
      ]);

      if (locationRes.error) throw locationRes.error;
      if (exceptionsRes.error) throw exceptionsRes.error;

      const bh = (locationRes.data?.business_hours as Record<string, { open: boolean; intervals?: { start: string; end: string }[] }>) || {};
      const tz = (locationRes.data?.timezone as string) || 'Europe/Madrid';

      let finalBH = bh;

      // Si no hay business_hours en locations, hacer fallback a la tabla legacy location_hours
      if (!finalBH || Object.keys(finalBH).length === 0) {
        const hoursResult = await supabase
          .from('location_hours')
          .select('*')
          .eq('location_id', locationId)
          .order('day_of_week');
        if (hoursResult.error) throw hoursResult.error;
        setHours(hoursResult.data || []);
        setUsingLegacyFallback(true);

        const buildFromRows = (rows: LocationHour[]) => {
          const map: Record<string, { open: boolean; intervals: { start: string; end: string }[] }> = {};
          for (let d = 1; d <= 7; d++) map[String(d)] = { open: false, intervals: [] };
          (rows || []).forEach(r => {
            if (!r.is_closed) {
              const key = String(r.day_of_week === 0 ? 7 : r.day_of_week);
              map[key].open = true;
              map[key].intervals.push({ start: r.open_time, end: r.close_time });
            }
          });
          return map;
        };

        finalBH = buildFromRows(hoursResult.data || []);
        if (import.meta.env.DEV) console.debug('[LocationHours] usando fallback location_hours (legacy)');
      } else {
        setUsingLegacyFallback(false);
      }

      setBusinessHours(finalBH || {});
      setLocationTimezone(tz);
      setExceptions(exceptionsRes.data || []);

      if (import.meta.env.DEV) {
        console.debug('[LocationHours] timezone =', tz);
        console.debug('[LocationHours] business_hours keys =', Object.keys(finalBH || {}));
      }
    } catch (error) {
      console.error('[LocationHours] Error loading data:', error);
      // Defaults seguros
      setFeatureDisabled(true);
      setHours([]);
      setExceptions([]);
    } finally {
      setLoading(false);
    }
  };

const getOpenHoursForDate = (date: Date): OpenHours[] | null => {
    if (!locationId || locationId === 'all') return null;
    if (featureDisabled) return null; // sin restricción

    const tz = locationTimezone || 'UTC';

    // Tomamos el día mostrado en el calendario (sin cambiarlo por la TZ del navegador)
    const dateLabelStr = format(date, 'yyyy-MM-dd');
    // Construimos un instante que representa el mismo día a las 12:00 en la TZ de la ubicación
    const zonedMiddayUTC = fromZonedTime(`${dateLabelStr}T12:00:00`, tz);
    const dateInTZ = toZonedTime(zonedMiddayUTC, tz);

    const jsDay = date.getDay(); // 0..6 (solo para diagnóstico)
    const isoDay = getISODay(dateInTZ); // 1..7 (1=Lun)
    const storeDay = isoDay; // nuestro store usa 1..7 (Lun..Dom)

    // Exceptions first: se comparan por fecha del calendario en TZ de la ubicación
    const exception = exceptions.find(e => e.date === dateLabelStr);
    let exceptionApplied = false;
    if (exception) {
      exceptionApplied = true;
      if (exception.is_closed) {
        if (import.meta.env.DEV) console.debug(`[HoursOverlay] date=${dateLabelStr} tz=${tz} jsDay=${jsDay} isoDay=${isoDay} storeDay=${storeDay} open=false intervals=0 exceptionApplied=true`);
        return []; // Closed all day
      }
      if (exception.open_time && exception.close_time) {
        if (import.meta.env.DEV) console.debug(`[HoursOverlay] date=${dateLabelStr} tz=${tz} jsDay=${jsDay} isoDay=${isoDay} storeDay=${storeDay} open=true intervals=1 exceptionApplied=true`);
        return [{ open_time: exception.open_time, close_time: exception.close_time }];
      }
    }

    const bhEntry = (businessHours as any)[String(storeDay)] ?? (businessHours as any)[storeDay];
    const open = !!bhEntry?.open;
    const intervals = Array.isArray(bhEntry?.intervals) ? (bhEntry.intervals as { start: string; end: string }[]) : [];

    if (!open || intervals.length === 0) {
      if (import.meta.env.DEV) console.debug(`[HoursOverlay] date=${dateLabelStr} tz=${tz} jsDay=${jsDay} isoDay=${isoDay} storeDay=${storeDay} open=false intervals=0 exceptionApplied=${exceptionApplied}`);
      return [];
    }

    if (import.meta.env.DEV) console.debug(`[HoursOverlay] date=${dateLabelStr} tz=${tz} jsDay=${jsDay} isoDay=${isoDay} storeDay=${storeDay} open=true intervals=${intervals.length} exceptionApplied=${exceptionApplied}`);

    return intervals.map(int => ({ open_time: int.start, close_time: int.end }));
  };

  const isLocationOpenAtTime = (date: Date, time: string): boolean => {
    const openHours = getOpenHoursForDate(date);
    
    if (!openHours) return true; // sin restricción
    if (openHours.length === 0) return false; // Closed all day
    
    return openHours.some(period => time >= period.open_time && time <= period.close_time);
  };

  const getClosedPeriodsForDate = (date: Date): { start: string; end: string }[] => {
    const openHours = getOpenHoursForDate(date);
    
    if (!openHours) return []; // No location selected
    if (openHours.length === 0) {
      // Closed all day
      return [{ start: '00:00', end: '23:59' }];
    }

    const closedPeriods: { start: string; end: string }[] = [];
    const sortedHours = [...openHours].sort((a, b) => a.open_time.localeCompare(b.open_time));
    
    // Add period before first opening time
    if (sortedHours[0].open_time > '00:00') {
      closedPeriods.push({ start: '00:00', end: sortedHours[0].open_time });
    }
    
    // Add periods between opening hours
    for (let i = 0; i < sortedHours.length - 1; i++) {
      const currentClose = sortedHours[i].close_time;
      const nextOpen = sortedHours[i + 1].open_time;
      
      if (currentClose < nextOpen) {
        closedPeriods.push({ start: currentClose, end: nextOpen });
      }
    }
    
    // Add period after last closing time
    const lastClose = sortedHours[sortedHours.length - 1].close_time;
    if (lastClose < '23:59') {
      closedPeriods.push({ start: lastClose, end: '23:59' });
    }
    
    return closedPeriods;
  };

  return {
    hours,
    exceptions,
    loading,
    featureDisabled,
    usingLegacyFallback,
    getOpenHoursForDate,
    isLocationOpenAtTime,
    getClosedPeriodsForDate,
  };
}