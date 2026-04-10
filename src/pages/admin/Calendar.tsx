import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format, startOfWeek, addDays, isSameDay, isToday, startOfDay, endOfDay, addWeeks, subWeeks, set } from "date-fns";
import { useSearchParams } from "react-router-dom";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, MapPin, Users, Filter, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLocationHours } from "@/hooks/useLocationHours";
import { useProfessionalAvailability } from "@/hooks/useProfessionalAvailability";
import { getDefaultLocation, hasSingleActiveLocation } from "@/lib/default-location";
import { usePermissions, shouldFilterByProfessional } from "@/hooks/usePermissions";
import { useCalendarSettings } from "@/hooks/useCalendarSettings";
import BookingDetailsModal from "@/components/admin/BookingDetailsModal";
import ClassSessionDetailsModal from "@/components/admin/ClassSessionDetailsModal";
import SubscriptionSessionDetailsModal from "@/components/admin/SubscriptionSessionDetailsModal";
import GroupedClassCard from "@/components/admin/GroupedClassCard";
import DraggableBooking from "@/components/admin/DraggableBooking";
import DroppableTimeSlot from "@/components/admin/DroppableTimeSlot";
import RescheduleConfirmModal from "@/components/admin/RescheduleConfirmModal";
import EditBookingModal from "@/components/admin/EditBookingModal";
import AdminCancelBookingModal from "@/components/admin/AdminCancelBookingModal";
import CreateBookingModal from "@/components/admin/CreateBookingModal";
import { DndContext, DragEndEvent, DragStartEvent } from "@dnd-kit/core";

type ViewMode = "today" | "3days" | "week";

interface Booking {
  id: string;
  start_at: string;
  end_at: string;
  type: "service" | "class";
  status: "pending" | "confirmed" | "completed" | "cancelled";
  payment_method: string;
  origin: string;
  notes?: string;
  user_id: string;
  professional: {
    id: string;
    name: string;
    color: string;
  };
  service?: {
    id: string;
    name: string;
  };
  class?: {
    id: string;
    name: string;
    capacity?: number;
  };
  location: {
    id: string;
    name: string;
  };
  user: {
    name: string;
    email: string;
  };
}

interface Location {
  id: string;
  name: string;
}

interface Professional {
  id: string;
  name: string;
  color: string;
}

// Calendar display constants - will be dynamically set from settings
// Default values used as fallback
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-green-100 text-green-800 border-green-200", 
  completed: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-red-100 text-red-800 border-red-200"
};

const STATUS_LABELS = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada"
};

export default function Calendar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const calendarGridRef = useRef<HTMLDivElement>(null);
  // Keep latest loadBookings reference to avoid stale closures in debounced calls
  const loadBookingsRef = useRef<() => void>(() => {});
  
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(
    searchParams.get("pro") || localStorage.getItem("calendar.pro") || null
  );
  const [hasInitializedLocation, setHasInitializedLocation] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedClassSession, setSelectedClassSession] = useState<{
    class_id: string;
    start_at: string;
    end_at: string;
  } | null>(null);
  const [selectedSubscriptionSession, setSelectedSubscriptionSession] = useState<{
    planName: string;
    planId: string;
    start_at: string;
    end_at: string;
    capacity: number;
    professionalName: string;
    professionalColor: string;
    locationName: string;
    bookings: Array<{
      id: string;
      user: { name: string; email: string };
      status: string;
    }>;
  } | null>(null);
  const [subscriptionPlanCapacities, setSubscriptionPlanCapacities] = useState<Map<string, number>>(new Map());
  const [subscriptionPlanNames, setSubscriptionPlanNames] = useState<Map<string, string>>(new Map());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showLocationHours, setShowLocationHours] = useState<boolean>(
    localStorage.getItem('calendar.showLocationHours') !== 'false'
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Double-click booking creation states
  const [doubleClickInitialDate, setDoubleClickInitialDate] = useState<Date | undefined>();
  const [doubleClickInitialTime, setDoubleClickInitialTime] = useState<string | undefined>();
  const [doubleClickInitialProfessionalId, setDoubleClickInitialProfessionalId] = useState<string | undefined>();
  const [doubleClickInitialLocationId, setDoubleClickInitialLocationId] = useState<string | undefined>();
  
  // Drag & Drop states
  const [draggedBooking, setDraggedBooking] = useState<Booking | null>(null);
  const [dragStartTime, setDragStartTime] = useState<number>(0);
  const [rescheduleConfirm, setRescheduleConfirm] = useState<{
    booking: Booking;
    newDate: Date;
    newHour: number;
  } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelBookingModal, setCancelBookingModal] = useState<Booking | null>(null);
  const [editBookingModal, setEditBookingModal] = useState<Booking | null>(null);
  
  const { toast } = useToast();
  
  // Get current user permissions
  const { currentUser } = usePermissions();
  const userProfessionalId = shouldFilterByProfessional(currentUser);

  // Get calendar settings (start/end hours)
  const { settings: calendarSettings } = useCalendarSettings();

  // Dynamic calendar time constants based on settings
  const DAY_START_HOUR = calendarSettings.startHour;
  const DAY_END_HOUR = calendarSettings.endHour;
  const DAY_OFFSET_MIN = DAY_START_HOUR * 60;
  const VISIBLE_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  
  const TIME_SLOTS = useMemo(() => 
    Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => {
      const hour = (DAY_START_HOUR + i).toString().padStart(2, '0');
      return `${hour}:00`;
    }),
    [DAY_START_HOUR, DAY_END_HOUR]
  );

  // Use location hours hook
  const { 
    getOpenHoursForDate, 
    getClosedPeriodsForDate: getLocationClosedPeriodsForDate, 
    isLocationOpenAtTime,
    featureDisabled,
    usingLegacyFallback
  } = useLocationHours(selectedLocationId === 'all' ? null : selectedLocationId);

  // Professional availability hook - only when professional is selected
  const {
    loading: professionalAvailabilityLoading,
    getOpenIntervals: getProfessionalOpenIntervals,
    isClosed: isProfessionalClosed
  } = useProfessionalAvailability(
    selectedProfessionalId,
    null, // No specific service for calendar view
    selectedLocationId === 'all' ? null : selectedLocationId
  );

  // Combined closed periods logic
  const getClosedPeriodsForDate = useCallback((date: Date) => {
    if (selectedProfessionalId) {
      // When professional is selected, use professional availability intersected with location
      const professionalIntervals = getProfessionalOpenIntervals(date);
      
      if (professionalIntervals.length === 0) {
        // Professional is closed all day
        return [{ start: '00:00', end: '23:59' }];
      }

      // Calculate closed periods based on professional intervals
      const closedPeriods: { start: string; end: string }[] = [];
      const sortedIntervals = [...professionalIntervals].sort((a, b) => a.start.localeCompare(b.start));
      
      // Add period before first opening time
      if (sortedIntervals[0].start > '00:00') {
        closedPeriods.push({ start: '00:00', end: sortedIntervals[0].start });
      }
      
      // Add periods between intervals
      for (let i = 0; i < sortedIntervals.length - 1; i++) {
        const currentEnd = sortedIntervals[i].end;
        const nextStart = sortedIntervals[i + 1].start;
        
        if (currentEnd < nextStart) {
          closedPeriods.push({ start: currentEnd, end: nextStart });
        }
      }
      
      // Add period after last closing time
      const lastEnd = sortedIntervals[sortedIntervals.length - 1].end;
      if (lastEnd < '23:59') {
        closedPeriods.push({ start: lastEnd, end: '23:59' });
      }
      
      return closedPeriods;
    }
    
    // Fallback to location hours when no professional selected
    return getLocationClosedPeriodsForDate(date);
  }, [selectedProfessionalId, getProfessionalOpenIntervals, getLocationClosedPeriodsForDate]);

  // Handle show location hours toggle
  const handleShowLocationHoursChange = useCallback((show: boolean) => {
    setShowLocationHours(show);
    localStorage.setItem('calendar.showLocationHours', show.toString());
  }, []);

  // Enhanced validation that considers professional hours when selected
  const validateBookingTime = useCallback((date: Date, startTime: string, endTime: string): { valid: boolean; message?: string } => {
    if (selectedProfessionalId) {
      // When professional is selected, validate against professional availability
      const professionalIntervals = getProfessionalOpenIntervals(date);
      
      if (professionalIntervals.length === 0) {
        return { 
          valid: false, 
          message: `El profesional no está disponible el ${format(date, "dd/MM/yyyy", { locale: es })}` 
        };
      }

      // Check if booking time falls within any professional interval
      const isWithinProfessionalHours = professionalIntervals.some(interval => 
        startTime >= interval.start && endTime <= interval.end
      );

      if (!isWithinProfessionalHours) {
        const hoursText = professionalIntervals.map(h => `${h.start}-${h.end}`).join(', ');
        return { 
          valid: false, 
          message: `Fuera del horario del profesional (${format(date, "dd/MM/yyyy", { locale: es })} ${hoursText}). Ajusta la hora.` 
        };
      }

      return { valid: true };
    }

    // Fallback to location validation when no professional selected
    if (selectedLocationId === 'all' || !showLocationHours) {
      return { valid: true };
    }

    const openHours = getOpenHoursForDate(date);
    if (!openHours) {
      return { valid: true }; // No restrictions
    }

    if (openHours.length === 0) {
      return { 
        valid: false, 
        message: `El centro está cerrado el ${format(date, "dd/MM/yyyy", { locale: es })}` 
      };
    }

    // Check if booking falls within any open period
    const isValidSlot = openHours.some(period => 
      startTime >= period.open_time && endTime <= period.close_time
    );

    if (!isValidSlot) {
      const hoursText = openHours.map(h => `${h.open_time}-${h.close_time}`).join(', ');
      return { 
        valid: false, 
        message: `Fuera del horario de la ubicación seleccionada (${format(date, "dd/MM/yyyy", { locale: es })} ${hoursText}). Ajusta la hora.` 
      };
    }

    return { valid: true };
  }, [selectedProfessionalId, getProfessionalOpenIntervals, selectedLocationId, showLocationHours, getOpenHoursForDate]);

  // Calculate visible dates based on view mode
  const visibleDates = useMemo(() => {
    const start = startOfDay(baseDate);
    switch (viewMode) {
      case "today":
        return [start];
      case "3days":
        return [start, addDays(start, 1), addDays(start, 2)];
      case "week":
        const weekStart = startOfWeek(start, { weekStartsOn: 1 }); // Monday
        return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      default:
        return [start];
    }
  }, [baseDate, viewMode]);

  // Load initial data and initialize default location
  useEffect(() => {
    const initializeData = async () => {
      await loadData();
      
      // Initialize default location if single active location exists
      if (!hasInitializedLocation && hasSingleActiveLocation()) {
        const defaultLocation = await getDefaultLocation();
        if (defaultLocation) {
          setSelectedLocationId(defaultLocation.id);
          if (import.meta.env.DEV) {
            console.log('[AdminCalendar] preselected default location_id=', defaultLocation.id);
          }
        }
        setHasInitializedLocation(true);
      }
    };
    
    initializeData();
  }, [hasInitializedLocation]);

  // Handle professional filter change with debounce
  const debouncedLoadBookings = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      loadBookingsRef.current();
    }, 200);
  }, []);

  // Reload bookings when filters change
  useEffect(() => {
    debouncedLoadBookings();
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [visibleDates, selectedLocationId, selectedProfessionalId, selectedStatuses, selectedTypes, debouncedLoadBookings]);

  // Update URL and localStorage when professional filter changes
  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    if (selectedProfessionalId) {
      newSearchParams.set("pro", selectedProfessionalId);
      localStorage.setItem("calendar.pro", selectedProfessionalId);
    } else {
      newSearchParams.delete("pro");
      localStorage.removeItem("calendar.pro");
    }
    setSearchParams(newSearchParams, { replace: true });
  }, [selectedProfessionalId, searchParams, setSearchParams]);

  const loadData = async () => {
    try {
      await Promise.all([loadLocations(), loadProfessionals()]);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Error al cargar los datos",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadLocations = async () => {
    const { data, error } = await supabase
      .from("locations")
      .select("id, name")
      .eq("active", true)
      .order("name");

    if (error) throw error;
    setLocations(data || []);
  };

  const loadProfessionals = async () => {
    const { data, error } = await supabase
      .from("professionals")
      .select("id, name, color")
      .eq("active", true)
      .order("name");

    if (error) throw error;
    setProfessionals(data || []);
  };

  const loadBookings = async () => {
    if (visibleDates.length === 0) return;

    try {
      const startDate = visibleDates[0];
      const endDate = visibleDates[visibleDates.length - 1];
      
      console.log('[Calendar] Loading bookings for dates:', {
        baseDate: baseDate.toISOString(),
        visibleDates: visibleDates.map(d => d.toISOString()),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        endOfEndDate: endOfDay(endDate).toISOString()
      });
      
      // Load bookings
      let bookingsQuery = supabase
        .from("bookings")
        .select(`
          id,
          start_at,
          end_at,
          type,
          status,
          payment_method,
          origin,
          notes,
          user_id,
          professional_id,
          service_id,
          class_id,
          location_id,
          professionals!inner(id, name, color),
          services(id, name),
          classes(id, name, capacity),
          locations!inner(id, name),
          users_shadow(name, email)
        `)
        .gte("start_at", startDate.toISOString())
        .lte("start_at", endOfDay(endDate).toISOString());

      // Load class sessions
      let sessionsQuery = supabase
        .from("class_sessions")
        .select(`
          id,
          start_at,
          end_at,
          professional_id,
          class_id,
          location_id,
          capacity,
          professionals!inner(id, name, color),
          classes!inner(id, name),
          locations!inner(id, name)
        `)
        .gte("start_at", startDate.toISOString())
        .lte("start_at", endOfDay(endDate).toISOString());

      // Apply filters to both queries
      if (selectedLocationId !== "all") {
        bookingsQuery = bookingsQuery.eq("location_id", selectedLocationId);
        sessionsQuery = sessionsQuery.eq("location_id", selectedLocationId);
      }

      // Employees now see ALL bookings (colleagues' schedules) - filter only by UI dropdown
      if (selectedProfessionalId) {
        bookingsQuery = bookingsQuery.eq("professional_id", selectedProfessionalId);
        sessionsQuery = sessionsQuery.eq("professional_id", selectedProfessionalId);
      }

      if (selectedStatuses.length > 0) {
        bookingsQuery = bookingsQuery.in("status", selectedStatuses);
      }

      if (selectedTypes.length > 0) {
        bookingsQuery = bookingsQuery.in("type", selectedTypes);
      }

      // Execute both queries
      const [bookingsResult, sessionsResult] = await Promise.all([
        bookingsQuery.order("start_at"),
        sessionsQuery.order("start_at")
      ]);

      if (bookingsResult.error) throw bookingsResult.error;
      if (sessionsResult.error) throw sessionsResult.error;

      // Transform bookings
      const transformedBookings: Booking[] = (bookingsResult.data || []).map(booking => ({
        id: booking.id,
        start_at: booking.start_at,
        end_at: booking.end_at,
        type: booking.type as "service" | "class",
        status: booking.status as any,
        payment_method: booking.payment_method,
        origin: booking.origin,
        notes: booking.notes,
        user_id: booking.user_id,
        professional: {
          id: booking.professionals.id,
          name: booking.professionals.name,
          color: booking.professionals.color
        },
        service: booking.services ? {
          id: booking.services.id,
          name: booking.services.name
        } : undefined,
        class: booking.classes ? {
          id: booking.classes.id,
          name: booking.classes.name,
          capacity: booking.classes.capacity
        } : undefined,
        location: {
          id: booking.locations.id,
          name: booking.locations.name
        },
        user: {
          name: booking.users_shadow?.name ?? "",
          email: booking.users_shadow?.email ?? ""
        }
      }));

      // For voucher bookings without service/class name, get the voucher type name
      const voucherBookings = transformedBookings.filter(b => b.origin === 'voucher' && !b.service?.name && !b.class?.name);
      if (voucherBookings.length > 0) {
        const voucherIds = voucherBookings
          .map(b => {
            try {
              const notes = typeof b.notes === 'string' ? JSON.parse(b.notes) : b.notes;
              return notes?.voucherId;
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        if (voucherIds.length > 0) {
          const { data: vouchersData } = await supabase
            .from('vouchers')
            .select('id, voucher_types(name)')
            .in('id', voucherIds);

          if (vouchersData) {
            voucherBookings.forEach(booking => {
              try {
                const notes = typeof booking.notes === 'string' ? JSON.parse(booking.notes) : booking.notes;
                const voucherId = notes?.voucherId;
                const voucherInfo = vouchersData.find(v => v.id === voucherId);
                
                if (voucherInfo?.voucher_types?.name) {
                  // Add the voucher type name as the service name
                  booking.service = {
                    id: voucherId,
                    name: voucherInfo.voucher_types.name
                  };
                }
              } catch (e) {
                console.warn('Error parsing voucher notes:', e);
              }
            });
          }
        }
      }

      // Transform class sessions to booking format
      const transformedSessions: Booking[] = (sessionsResult.data || []).map(session => ({
        id: session.id,
        start_at: session.start_at,
        end_at: session.end_at,
        type: "class" as const,
        status: "confirmed" as const,
        payment_method: "none",
        origin: "class_session",
        notes: `Capacidad: ${session.capacity}`,
        user_id: "", // Class sessions don't have a specific user
        professional: {
          id: session.professionals.id,
          name: session.professionals.name,
          color: session.professionals.color
        },
        class: {
          id: session.classes.id,
          name: session.classes.name
        },
        location: {
          id: session.locations.id,
          name: session.locations.name
        },
        user: {
          name: "Sesión de Clase",
          email: ""
        }
      }));

      // Combine and sort all events (exclude cancelled bookings and class_sessions)
      // We'll handle class grouping visually instead of showing empty sessions
      const allEvents = [
        ...transformedBookings.filter(b => b.status !== 'cancelled')
        // Removed transformedSessions - we'll group class bookings visually instead
      ].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );

      setBookings(allEvents);

      // Resolve missing planIds for subscription bookings from subscriptions table
      const subBookings = allEvents.filter(b => b.origin === 'subscription');
      if (subBookings.length > 0) {
        // Find subscription bookings missing planId
        const subsNeedingPlanId = subBookings.filter(b => {
          try {
            const n = typeof b.notes === 'string' ? JSON.parse(b.notes) : b.notes;
            return !n?.planId && n?.subscriptionId;
          } catch { return false; }
        });
        if (subsNeedingPlanId.length > 0) {
          const subIds = [...new Set(subsNeedingPlanId.map(b => {
            const n = typeof b.notes === 'string' ? JSON.parse(b.notes) : b.notes;
            return n.subscriptionId;
          }))];
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('id, plan_id')
            .in('id', subIds);
          const subIdToPlanId = new Map<string, string>();
          subData?.forEach(s => { if (s.plan_id) subIdToPlanId.set(s.id, s.plan_id); });
          
          // Enrich booking notes with resolved planId
          subsNeedingPlanId.forEach(b => {
            try {
              const notes = typeof b.notes === 'string' ? JSON.parse(b.notes) : (b.notes || {});
              const resolvedPlanId = subIdToPlanId.get(notes.subscriptionId);
              if (resolvedPlanId) {
                notes.planId = resolvedPlanId;
                b.notes = JSON.stringify(notes);
              }
            } catch {}
          });
        }

        const planIds = new Set<string>();
        subBookings.forEach(b => {
          try {
            const notes = typeof b.notes === 'string' ? JSON.parse(b.notes) : b.notes;
            if (notes?.planId) planIds.add(notes.planId);
          } catch {}
        });
        if (planIds.size > 0) {
          const { data: plans } = await supabase
            .from('subscription_plans')
            .select('id, capacity_per_session, name, parent_plan_id')
            .in('id', Array.from(planIds));
          if (plans) {
            const capacityMap = new Map<string, number>();
            const nameMap = new Map<string, string>();
            // Primera pasada: capacidades directas
            plans.forEach(p => {
              if (p.capacity_per_session) {
                capacityMap.set(p.id, p.capacity_per_session);
              }
              nameMap.set(p.id, p.name);
            });
            // Segunda pasada: herencia desde plan padre
            const needsParent = plans.filter(p => !p.capacity_per_session && p.parent_plan_id);
            if (needsParent.length > 0) {
              const parentIds = [...new Set(needsParent.map(p => p.parent_plan_id!))];
              const missingParentIds = parentIds.filter(pid => !capacityMap.has(pid));
              if (missingParentIds.length > 0) {
                const { data: parents } = await supabase
                  .from('subscription_plans')
                  .select('id, capacity_per_session')
                  .in('id', missingParentIds);
                parents?.forEach(p => {
                  if (p.capacity_per_session) capacityMap.set(p.id, p.capacity_per_session);
                });
              }
              needsParent.forEach(p => {
                const parentCap = capacityMap.get(p.parent_plan_id!);
                capacityMap.set(p.id, parentCap || 1);
              });
            }
            // Fallback final
            plans.forEach(p => {
              if (!capacityMap.has(p.id)) capacityMap.set(p.id, 1);
            });
            setSubscriptionPlanCapacities(capacityMap);
            setSubscriptionPlanNames(nameMap);
          }
        }
      }
    } catch (error) {
      console.error("Error loading bookings:", error);
      toast({
        title: "Error",
        description: "Error al cargar las reservas",
        variant: "destructive"
      });
    }
  };

  // Keep the debounced caller always pointing to the latest loadBookings
  useEffect(() => {
    loadBookingsRef.current = () => { void loadBookings(); };
  }, [loadBookings]);

  const navigateWeek = (direction: "prev" | "next") => {
    if (viewMode === "today") {
      // In today mode, navigate by days
      setBaseDate(prev => direction === "next" ? addDays(prev, 1) : addDays(prev, -1));
    } else {
      // In other modes, navigate by weeks
      setBaseDate(prev => direction === "next" ? addWeeks(prev, 1) : subWeeks(prev, 1));
    }
  };

  const goToToday = () => {
    const today = new Date();
    setBaseDate(today);
    setSelectedDate(today);
    setViewMode("today");
  };

  const updateBookingStatus = async (bookingId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", bookingId);

      if (error) throw error;

      toast({
        title: "Éxito",
        description: `Reserva ${STATUS_LABELS[newStatus as keyof typeof STATUS_LABELS].toLowerCase()}`,
      });

      await loadBookings();
      setSelectedBooking(null);
    } catch (error) {
      console.error("Error updating booking:", error);
      toast({
        title: "Error",
        description: "Error al actualizar la reserva",
        variant: "destructive"
      });
    }
  };

  const getBookingsForDate = (date: Date) => {
    return bookings.filter(booking => isSameDay(new Date(booking.start_at), date));
  };

  // Group bookings by time slot to handle overlapping bookings
  const getBookingGroups = (dayBookings: Booking[]) => {
    const groups: { [key: string]: Booking[] } = {};
    
    dayBookings.forEach(booking => {
      const startTime = format(new Date(booking.start_at), 'HH:mm');
      const key = `${startTime}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(booking);
    });
    
    return groups;
  };

  const getBookingPosition = useCallback((booking: Booking) => {
    const start = new Date(booking.start_at);
    const end = new Date(booking.end_at);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    
    // Clamp to visible range
    const clampedStart = Math.max(DAY_OFFSET_MIN, Math.min(DAY_OFFSET_MIN + VISIBLE_MINUTES, startMinutes));
    const clampedEnd = Math.max(DAY_OFFSET_MIN, Math.min(DAY_OFFSET_MIN + VISIBLE_MINUTES, endMinutes));
    
    // If booking is completely outside visible range, don't show it
    if (endMinutes <= DAY_OFFSET_MIN || startMinutes >= DAY_OFFSET_MIN + VISIBLE_MINUTES) {
      return {
        top: '0%',
        height: '0%',
        display: 'none'
      };
    }
    
    return {
      top: `${((clampedStart - DAY_OFFSET_MIN) / VISIBLE_MINUTES) * 100}%`,
      height: `${((clampedEnd - clampedStart) / VISIBLE_MINUTES) * 100}%`
    };
  }, [DAY_OFFSET_MIN, VISIBLE_MINUTES]);

  const getBookingLayout = useCallback((booking: Booking, bookingIndex: number, totalBookings: number) => {
    const position = getBookingPosition(booking);
    
    // Calculate card width and position for horizontal layout
    const cardWidth = totalBookings > 1 ? 100 / totalBookings : 90; // Percentage width
    const leftOffset = bookingIndex * cardWidth;
    
    return {
      ...position,
      width: `${cardWidth}%`,
      left: `${leftOffset}%`
    };
  }, [getBookingPosition]);

  const formatTimeRange = (startAt: string, endAt: string) => {
    const start = new Date(startAt);
    const end = new Date(endAt);
    return `${format(start, "HH:mm")} - ${format(end, "HH:mm")}`;
  };

  const getCurrentTimePosition = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    // Only show current time line if within visible hours
    if (totalMinutes < DAY_OFFSET_MIN || totalMinutes > DAY_OFFSET_MIN + VISIBLE_MINUTES) {
      return -1; // Hide the line
    }
    
    return ((totalMinutes - DAY_OFFSET_MIN) / VISIBLE_MINUTES) * 100;
  };

  // Auto-scroll to first open hour
  const scrollToTime = useCallback((time: string) => {
    if (!calendarGridRef.current) return;
    
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    
    // Clamp to visible range
    const clampedMinutes = Math.max(DAY_OFFSET_MIN, Math.min(DAY_OFFSET_MIN + VISIBLE_MINUTES, totalMinutes));
    const scrollPosition = ((clampedMinutes - DAY_OFFSET_MIN) / VISIBLE_MINUTES) * calendarGridRef.current.scrollHeight;
    
    requestAnimationFrame(() => {
      calendarGridRef.current?.scrollTo({
        top: scrollPosition,
        behavior: 'smooth'
      });
    });
  }, []);

  // Drag & Drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const booking = event.active.data.current?.booking;
    if (booking) {
      console.log('[AdminCalendar] drag start bookingId=', booking.id);
      setDraggedBooking(booking);
      setDragStartTime(Date.now());
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    // Check if it was a quick click (less than 200ms) - treat as click, not drag
    const dragDuration = Date.now() - dragStartTime;
    const wasQuickClick = dragDuration < 200;
    
    if (!over || !draggedBooking) {
      setDraggedBooking(null);
      setDragStartTime(0);
      return;
    }

    const newDate = over.data.current?.date;
    const newHour = over.data.current?.hour;

    if (!newDate || newHour === undefined) {
      setDraggedBooking(null);
      setDragStartTime(0);
      return;
    }

    // Check if booking actually moved to a different slot
    const originalDate = new Date(draggedBooking.start_at);
    const originalHour = originalDate.getHours();
    const originalDay = format(originalDate, 'yyyy-MM-dd');
    const newDay = format(newDate, 'yyyy-MM-dd');
    
    // If it was a quick click OR dropped on the same slot, open details modal instead
    if (wasQuickClick || (originalDay === newDay && originalHour === newHour)) {
      console.log('[AdminCalendar] Quick click detected, opening details');
      
      // Check if it's a class booking, open appropriate modal
      if (draggedBooking.type === 'class' && draggedBooking.class?.id) {
        setSelectedClassSession({
          class_id: draggedBooking.class.id,
          start_at: draggedBooking.start_at,
          end_at: draggedBooking.end_at
        });
      } else {
        setSelectedBooking(draggedBooking);
      }
      
      setDraggedBooking(null);
      setDragStartTime(0);
      return;
    }

    console.log('[AdminCalendar] drop on date=', newDate, 'hour=', newHour);
    
    // Show confirmation modal only if actually dragged to different slot
    setRescheduleConfirm({
      booking: draggedBooking,
      newDate,
      newHour
    });
    setDraggedBooking(null);
    setDragStartTime(0);
  };

  const handleRescheduleConfirm = async () => {
    if (!rescheduleConfirm) return;

    const { booking, newDate, newHour } = rescheduleConfirm;
    
    try {
      setRescheduling(true);
      
      // Calculate new start and end times
      const oldStart = new Date(booking.start_at);
      const oldEnd = new Date(booking.end_at);
      const duration = oldEnd.getTime() - oldStart.getTime();
      
      const newStart = set(newDate, { hours: newHour, minutes: 0, seconds: 0, milliseconds: 0 });
      const newEnd = new Date(newStart.getTime() + duration);

      console.log('[AdminCalendar] rescheduling booking=', booking.id, 'to', newStart);

      // Update booking
      const { error } = await supabase
        .from('bookings')
        .update({
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', booking.id);

      if (error) throw error;

      toast({
        title: "Cita reprogramada",
        description: "La cita se ha actualizado correctamente"
      });

      // Reload bookings
      await loadBookings();
      setRescheduleConfirm(null);
      
    } catch (error) {
      console.error('[AdminCalendar] Error rescheduling:', error);
      toast({
        title: "Error",
        description: "No se ha podido reprogramar la cita. El horario ya no está disponible.",
        variant: "destructive"
      });
    } finally {
      setRescheduling(false);
    }
  };


  const handleEditBookingSave = async (newDate: Date, newStartTime: string) => {
    if (!editBookingModal) return;

    try {
      console.log('[AdminCalendar] modifying booking=', editBookingModal.id, 'to date=', newDate, 'time=', newStartTime);
      
      const [hours, minutes] = newStartTime.split(':').map(Number);
      const oldStart = new Date(editBookingModal.start_at);
      const oldEnd = new Date(editBookingModal.end_at);
      const duration = oldEnd.getTime() - oldStart.getTime();
      
      const newStart = set(newDate, { hours, minutes, seconds: 0, milliseconds: 0 });
      const newEnd = new Date(newStart.getTime() + duration);

      const { error } = await supabase
        .from('bookings')
        .update({
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', editBookingModal.id);

      if (error) throw error;

      toast({
        title: "Cita modificada",
        description: "La cita se ha actualizado correctamente"
      });

      await loadBookings();
      setEditBookingModal(null);
      
    } catch (error) {
      console.error('[AdminCalendar] Error modifying:', error);
      toast({
        title: "Error",
        description: "No se ha podido modificar la cita",
        variant: "destructive"
      });
      throw error;
    }
  };

  // Handle double-click on time slot to create booking
  const handleTimeSlotDoubleClick = useCallback((date: Date, hour: number) => {
    console.log('[Calendar] Double-click detected on:', { date, hour });
    
    // Set initial values for the modal
    setDoubleClickInitialDate(date);
    setDoubleClickInitialTime(`${hour.toString().padStart(2, '0')}:00`);
    
    // If professional is selected in calendar filters, pre-select it
    if (selectedProfessionalId) {
      setDoubleClickInitialProfessionalId(selectedProfessionalId);
    }
    
    // If location is selected in calendar filters, pre-select it
    if (selectedLocationId && selectedLocationId !== 'all') {
      setDoubleClickInitialLocationId(selectedLocationId);
    }
    
    // Open the modal
    setIsCreateModalOpen(true);
  }, [selectedProfessionalId, selectedLocationId]);

  // Auto-scroll when location hours are shown and single location selected
  useEffect(() => {
    if (!showLocationHours || selectedLocationId === 'all' || visibleDates.length === 0) return;
    
    const firstDate = visibleDates[0];
    const openHours = getOpenHoursForDate(firstDate);
    
    if (openHours && openHours.length > 0) {
      // Scroll to first open time
      scrollToTime(openHours[0].open_time);
    }
  }, [showLocationHours, selectedLocationId, visibleDates, getOpenHoursForDate, scrollToTime]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Cargando calendario...</div>
      </div>
    );
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Calendario</h1>
          <p className="text-muted-foreground">Vista semanal de todas las reservas</p>
        </div>
        <div className="flex gap-2">
          <Button 
            className="bg-primary hover:bg-primary-hover"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            Nueva reserva
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            {/* View Mode */}
            <div className="flex gap-2">
              <Button
                variant={viewMode === "today" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("today")}
              >
                Hoy
              </Button>
              <Button
                variant={viewMode === "3days" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("3days")}
              >
                3 Próximos Días
              </Button>
              <Button
                variant={viewMode === "week" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("week")}
              >
                Semana Completa
              </Button>
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateWeek("prev")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {viewMode === "today" 
                      ? format(baseDate, "dd MMM yyyy", { locale: es })
                      : `${format(visibleDates[0], "dd MMM", { locale: es })} - ${format(visibleDates[visibleDates.length - 1], "dd MMM yyyy", { locale: es })}`
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date);
                        setBaseDate(date);
                        setCalendarOpen(false);
                      }
                    }}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateWeek("next")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
              >
                Hoy
              </Button>
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Location Filter - hide "All locations" if only one active location */}
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecciona ubicación" />
                </SelectTrigger>
                <SelectContent>
                  {!hasSingleActiveLocation() && (
                    <SelectItem value="all">Todas las ubicaciones</SelectItem>
                  )}
                  {locations.map(location => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Professional Filter */}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Select 
                value={selectedProfessionalId || "all"} 
                onValueChange={(value) => {
                  setSelectedProfessionalId(value === "all" ? null : value);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecciona profesional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los profesionales</SelectItem>
                  {professionals.map(professional => (
                    <SelectItem key={professional.id} value={professional.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: professional.color }}
                        />
                        {professional.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status and Type Filters */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select 
                value={selectedStatuses.length === 1 ? selectedStatuses[0] : "all"} 
                onValueChange={(value) => {
                  if (value === "all") {
                    setSelectedStatuses([]);
                  } else {
                    setSelectedStatuses([value]);
                  }
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="confirmed">Confirmada</SelectItem>
                  <SelectItem value="completed">Completada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Select 
              value={selectedTypes.length === 1 ? selectedTypes[0] : "all"} 
              onValueChange={(value) => {
                if (value === "all") {
                  setSelectedTypes([]);
                } else {
                  setSelectedTypes([value]);
                }
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="service">Servicio</SelectItem>
                <SelectItem value="class">Clase</SelectItem>
              </SelectContent>
            </Select>

            {/* Location Hours Toggle - only show when location is selected */}
            {selectedLocationId !== 'all' && (
              <>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={showLocationHours}
                      onCheckedChange={handleShowLocationHoursChange}
                    />
                    <Label className="text-sm font-medium">Mostrar horario de ubicación</Label>
                  </div>
                  
                  {/* Status Chips */}
                  {featureDisabled && (
                    <Badge variant="secondary" className="text-xs">
                      Horarios desactivados desde Ajustes
                    </Badge>
                  )}
                  {!featureDisabled && usingLegacyFallback && showLocationHours && (
                    <Badge variant="outline" className="text-xs">
                      Usando horario legacy
                    </Badge>
                  )}
                  {selectedProfessionalId && (
                    <Badge variant="default" className="text-xs bg-blue-500">
                      Mostrando disponibilidad del profesional
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-0">
          {/* Scrollable container for both time and days columns */}
          <div className="relative" style={{ maxHeight: `${Math.min((DAY_END_HOUR - DAY_START_HOUR) * 64 + 48, 900)}px`, overflowY: 'auto' }} ref={calendarGridRef}>
            <div className="flex">
              {/* Time column */}
              <div className="w-24 border-r relative bg-background sticky left-0 z-10">
                <div className="h-12 border-b bg-background" /> {/* Header spacer */}
                {TIME_SLOTS.map((time, index) => (
                  <div
                    key={time}
                    className="h-16 flex items-start justify-end pr-2 pt-1 text-xs text-muted-foreground bg-background"
                    style={{ 
                      minHeight: '64px', 
                      maxHeight: '64px',
                      borderBottom: '1px dashed hsl(var(--border) / 0.5)'
                    }}
                  >
                    {time}
                  </div>
                ))}
              </div>

              {/* Days columns */}
              <div className="flex-1 flex">
                {visibleDates.map((date, dateIndex) => {
                  const dayBookings = getBookingsForDate(date);
                  const isCurrentDay = isToday(date);
                  const closedPeriods = getClosedPeriodsForDate(date);
                  
                  console.log('[Calendar] Rendering day:', {
                    date: date.toISOString(),
                    formatted: format(date, "EEE dd", { locale: es }),
                    bookingsCount: dayBookings.length,
                    bookings: dayBookings.map(b => ({ id: b.id, start_at: b.start_at }))
                  });
                   
                  return (
                    <div key={dateIndex} className={cn("flex-1 border-r relative", dateIndex === visibleDates.length - 1 && "border-r-0")}>
                      {/* Day header */}
                      <div className={cn(
                        "h-12 border-b flex flex-col items-center justify-center bg-background sticky top-0 z-10",
                        isCurrentDay && "bg-primary/10"
                      )}>
                        <div className="text-xs text-muted-foreground uppercase">
                          {format(date, "EEE", { locale: es })}
                        </div>
                        <div className={cn(
                          "text-sm font-medium",
                          isCurrentDay && "text-primary font-bold"
                        )}>
                          {format(date, "dd")}
                        </div>
                      </div>

                    {/* Time slots */}
                    <div className="relative" style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR) * 64}px` }}>
                      {/* Always show all time slots */}
                      {TIME_SLOTS.map((time, timeIndex) => {
                        const hour = DAY_START_HOUR + timeIndex;
                        return (
                          <DroppableTimeSlot
                            key={time}
                            id={`${date.toISOString()}-${hour}`}
                            date={date}
                            hour={hour}
                            onDoubleClick={handleTimeSlotDoubleClick}
                          >
                            <div className="h-16 relative" />
                          </DroppableTimeSlot>
                        );
                      })}

                      {/* Closed hours overlay - professional availability when selected, location otherwise */}
                      {(() => {
                        const showOverlay = selectedProfessionalId || (showLocationHours && selectedLocationId !== 'all');
                        if (!showOverlay) return null;

                        const closedPeriods = getClosedPeriodsForDate(date);
                        const openHours = selectedProfessionalId 
                          ? getProfessionalOpenIntervals(date)
                          : (getOpenHoursForDate(date) || []);
                        
                        // Dev diagnostics
                        if (showOverlay) {
                          const source = selectedProfessionalId ? 'professional' : 'location';
                          console.log(`[Overlay] source=${source} date=${format(date, 'yyyy-MM-dd')} segments=${closedPeriods.length}`);
                          if (openHours.length > 0) {
                            const intervals = openHours.map(h => `${h.start || h.open_time}-${h.end || h.close_time}`).join(', ');
                            console.log(`[Overlay] intervals: ${intervals}`);
                          }
                        }
                        
                        return closedPeriods.map((period, index) => {
                          const [sh, sm] = period.start.split(':').map(Number);
                          const [eh, em] = period.end.split(':').map(Number);
                          const startMinutes = sh * 60 + sm;
                          const endMinutes = eh * 60 + em;
                          
                          // Intersect with visible range
                          const clampedStart = Math.max(DAY_OFFSET_MIN, startMinutes);
                          const clampedEnd = Math.min(DAY_OFFSET_MIN + VISIBLE_MINUTES, endMinutes);
                          
                          // Skip if no intersection with visible range
                          if (clampedStart >= clampedEnd || endMinutes <= DAY_OFFSET_MIN || startMinutes >= DAY_OFFSET_MIN + VISIBLE_MINUTES) {
                            return null;
                          }
                          
                          const startPct = ((clampedStart - DAY_OFFSET_MIN) / VISIBLE_MINUTES) * 100;
                          const endPct = ((clampedEnd - DAY_OFFSET_MIN) / VISIBLE_MINUTES) * 100;
                          const heightPct = endPct - startPct;
                          return (
                            <div
                              key={`closed-${index}`}
                              data-testid="hours-overlay"
                              className={cn(
                                "absolute left-0 right-0",
                                selectedProfessionalId ? "hours-off-professional" : "hours-off"
                              )}
                              style={{ top: `${startPct}%`, height: `${heightPct}%` }}
                            >
                              {startMinutes <= DAY_OFFSET_MIN && endMinutes >= DAY_OFFSET_MIN + VISIBLE_MINUTES && (
                                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm font-medium">
                                  {selectedProfessionalId ? 'NO DISPONIBLE' : 'CERRADO'}
                                </div>
                              )}
                            </div>
                          );
                        }).filter(Boolean);
                      })()}


                      {/* Current time line - REMOVED */}

                      {/* Booking cards */}
                      {(() => {
                        const renderedElements: JSX.Element[] = [];
                        
                        // Separate class bookings, subscription bookings, and service bookings
                        const classBookings = dayBookings.filter(b => b.type === 'class' && b.class?.id);
                        const subscriptionBookings = dayBookings.filter(b => b.origin === 'subscription');
                        const serviceBookings = dayBookings.filter(b => b.type === 'service' && b.origin !== 'subscription');
                        
                        // Group class bookings by class_id + start_at + location_id
                        const classGroups = new Map<string, Booking[]>();
                        classBookings.forEach(booking => {
                          const key = `${booking.class!.id}_${booking.start_at}_${booking.location.id}`;
                          if (!classGroups.has(key)) {
                            classGroups.set(key, []);
                          }
                          classGroups.get(key)!.push(booking);
                        });

                        // Group subscription bookings by planId + start_at + location_id
                        const subGroups = new Map<string, { bookings: Booking[]; planId: string; planName: string }>();
                        subscriptionBookings.forEach(booking => {
                          try {
                            const notes = typeof booking.notes === 'string' ? JSON.parse(booking.notes) : booking.notes;
                            const planId = notes?.planId;
                            const planName = (planId && subscriptionPlanNames.get(planId)) || notes?.planName || 'Suscripción';
                            if (planId) {
                              const key = `sub_${planId}_${booking.start_at}_${booking.location.id}`;
                              if (!subGroups.has(key)) {
                                subGroups.set(key, { bookings: [], planId, planName });
                              }
                              subGroups.get(key)!.bookings.push(booking);
                            } else {
                              // No planId resolved - render as individual service booking
                              serviceBookings.push(booking);
                            }
                            
                          } catch {
                            // If notes parsing fails, treat as regular service booking
                            serviceBookings.push(booking);
                          }
                        });
                        
                        // Create unified event structure for layout calculation
                        type CalendarEvent = {
                          type: 'class_group' | 'subscription_group' | 'service';
                          key: string;
                          booking: Booking; // Representative booking for positioning
                          groupBookings?: Booking[]; // For class/subscription groups
                          planId?: string;
                          planName?: string;
                        };
                        
                        // Group all events by start time for unified layout
                        const eventsByStartTime = new Map<string, CalendarEvent[]>();
                        
                        // Add class groups
                        classGroups.forEach((groupBookings, key) => {
                          const firstBooking = groupBookings[0];
                          const startKey = firstBooking.start_at;
                          if (!eventsByStartTime.has(startKey)) {
                            eventsByStartTime.set(startKey, []);
                          }
                          eventsByStartTime.get(startKey)!.push({
                            type: 'class_group',
                            key,
                            booking: firstBooking,
                            groupBookings
                          });
                        });

                        // Add subscription groups
                        subGroups.forEach((group, key) => {
                          const firstBooking = group.bookings[0];
                          const startKey = firstBooking.start_at;
                          if (!eventsByStartTime.has(startKey)) {
                            eventsByStartTime.set(startKey, []);
                          }
                          eventsByStartTime.get(startKey)!.push({
                            type: 'subscription_group',
                            key,
                            booking: firstBooking,
                            groupBookings: group.bookings,
                            planId: group.planId,
                            planName: group.planName
                          });
                        });
                        
                        // Add service bookings
                        serviceBookings.forEach(booking => {
                          const startKey = booking.start_at;
                          if (!eventsByStartTime.has(startKey)) {
                            eventsByStartTime.set(startKey, []);
                          }
                          eventsByStartTime.get(startKey)!.push({
                            type: 'service',
                            key: booking.id,
                            booking
                          });
                        });
                        
                        // Render all events with unified layout
                        eventsByStartTime.forEach((events) => {
                          // Sort events for consistent ordering (groups first, then by name)
                          const sortedEvents = events.sort((a, b) => {
                            const typePriority = { class_group: 0, subscription_group: 1, service: 2 };
                            const pa = typePriority[a.type] ?? 2;
                            const pb = typePriority[b.type] ?? 2;
                            if (pa !== pb) return pa - pb;
                            return a.booking.professional.name.localeCompare(b.booking.professional.name);
                          });
                          
                          sortedEvents.forEach((event, eventIndex) => {
                            // Calculate layout using the same logic as getBookingLayout
                            const layout = getBookingLayout(event.booking, eventIndex, sortedEvents.length);
                            
                            if (layout.display === 'none') {
                              return;
                            }
                            
                            if (event.type === 'class_group') {
                              // Render grouped class card with calculated layout
                              const firstBooking = event.booking;
                              const groupBookings = event.groupBookings!;
                              const capacity = firstBooking.class!.capacity || 10;
                              
                              renderedElements.push(
                                <div
                                  key={event.key}
                                  className="absolute"
                                  style={{
                                    top: layout.top,
                                    height: layout.height,
                                    width: layout.width,
                                    left: layout.left,
                                    minHeight: '48px'
                                  }}
                                >
                                  <GroupedClassCard
                                    className={firstBooking.class!.name}
                                    participantCount={groupBookings.length}
                                    capacity={capacity}
                                    color={firstBooking.professional.color}
                                    onClick={() => {
                                      setSelectedClassSession({
                                        class_id: firstBooking.class!.id,
                                        start_at: firstBooking.start_at,
                                        end_at: firstBooking.end_at
                                      });
                                    }}
                                  />
                                </div>
                              );
                            } else if (event.type === 'subscription_group') {
                              // Render grouped subscription card
                              const firstBooking = event.booking;
                              const groupBookings = event.groupBookings!;
                              const capacity = subscriptionPlanCapacities.get(event.planId!) || 1;
                              
                              renderedElements.push(
                                <div
                                  key={event.key}
                                  className="absolute"
                                  style={{
                                    top: layout.top,
                                    height: layout.height,
                                    width: layout.width,
                                    left: layout.left,
                                    minHeight: '48px'
                                  }}
                                >
                                  <GroupedClassCard
                                    className={event.planName || 'Suscripción'}
                                    participantCount={groupBookings.length}
                                    capacity={capacity}
                                    color={firstBooking.professional.color}
                                    onClick={() => {
                                      setSelectedSubscriptionSession({
                                        planName: event.planName || 'Suscripción',
                                        planId: event.planId!,
                                        start_at: firstBooking.start_at,
                                        end_at: firstBooking.end_at,
                                        capacity,
                                        professionalName: firstBooking.professional.name,
                                        professionalColor: firstBooking.professional.color,
                                        locationName: firstBooking.location.name,
                                        bookings: groupBookings.map(b => ({
                                          id: b.id,
                                          user: b.user,
                                          status: b.status
                                        }))
                                      });
                                    }}
                                  />
                                </div>
                              );
                            } else {
                              // Render service booking
                              const booking = event.booking;
                              const bookingStart = format(new Date(booking.start_at), 'HH:mm');
                              const bookingEnd = format(new Date(booking.end_at), 'HH:mm');
                              const bookingDate = new Date(booking.start_at);
                              const validation = validateBookingTime(bookingDate, bookingStart, bookingEnd);
                              
                              renderedElements.push(
                                <DraggableBooking
                                  key={booking.id}
                                  booking={booking}
                                  layout={layout}
                                  isValid={validation.valid}
                                  totalBookingsInSlot={sortedEvents.filter(e => e.booking && e.booking.professional.id === booking.professional.id).length}
                                  onOpenDetails={() => setSelectedBooking(booking)}
                                  onEdit={() => setEditBookingModal(booking)}
                                  onCancel={() => setCancelBookingModal(booking)}
                                  sortedGroupLength={sortedEvents.length}
                                  isReadOnly={!!userProfessionalId && booking.professional.id !== userProfessionalId}
                                />
                              );
                            }
                          });
                        });
                        
                        return renderedElements;
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Legends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Professional Legend */}
        {professionals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Profesionales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {professionals.map(professional => (
                  <div key={professional.id} className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: professional.color }}
                    />
                    <span className="text-sm">{professional.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hours Legend - only show when location hours are enabled */}
        {showLocationHours && selectedLocationId !== 'all' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Leyenda de Horarios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-background border border-border"></div>
                  <span className="text-sm">Horario laboral</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-muted/60 border border-muted-foreground/20"></div>
                  <span className="text-sm">Fuera de horario</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">⚠️</span>
                  <span className="text-sm">Reserva fuera de horario</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Booking Detail Dialog */}
      {selectedBooking && (
        <BookingDetailsModal
          bookingId={selectedBooking.id}
          isOpen={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onBookingUpdated={() => { void loadBookings(); }}
          onEdit={(!userProfessionalId || selectedBooking.professional.id === userProfessionalId) ? () => {
            setEditBookingModal(selectedBooking);
            setSelectedBooking(null);
          } : undefined}
          onCancel={(!userProfessionalId || selectedBooking.professional.id === userProfessionalId) ? () => {
            setCancelBookingModal(selectedBooking);
            setSelectedBooking(null);
          } : undefined}
        />
      )}

      {/* Class Session Details Modal */}
      {selectedClassSession && (
        <ClassSessionDetailsModal
          sessionData={selectedClassSession}
          isOpen={!!selectedClassSession}
          onClose={() => setSelectedClassSession(null)}
          onParticipantClick={(bookingId) => {
            // Close class session modal and open individual booking modal
            const booking = bookings.find(b => b.id === bookingId);
            if (booking) {
              setSelectedClassSession(null);
              setSelectedBooking(booking);
            }
          }}
          onAddParticipant={(classId, startAt, endAt) => {
            // Close class session modal and open create booking modal
            const sessionDate = new Date(startAt);
            const sessionTime = format(sessionDate, 'HH:mm');
            
            setDoubleClickInitialDate(sessionDate);
            setDoubleClickInitialTime(sessionTime);
            setDoubleClickInitialLocationId(selectedLocationId !== 'all' ? selectedLocationId : undefined);
            
            setSelectedClassSession(null);
            setIsCreateModalOpen(true);
          }}
          onSessionUpdated={() => { void loadBookings(); }}
        />
      )}

      {/* Subscription Session Details Modal */}
      {selectedSubscriptionSession && (
        <SubscriptionSessionDetailsModal
          sessionData={selectedSubscriptionSession}
          isOpen={!!selectedSubscriptionSession}
          onClose={() => setSelectedSubscriptionSession(null)}
          onParticipantClick={(bookingId) => {
            const booking = bookings.find(b => b.id === bookingId);
            if (booking) {
              setSelectedSubscriptionSession(null);
              setSelectedBooking(booking);
            }
          }}
        />
      )}

      {rescheduleConfirm && (
        <RescheduleConfirmModal
          isOpen={true}
          onClose={() => setRescheduleConfirm(null)}
          onConfirm={handleRescheduleConfirm}
          oldDate={new Date(rescheduleConfirm.booking.start_at)}
          newDate={rescheduleConfirm.newDate}
          newHour={rescheduleConfirm.newHour}
          bookingName={rescheduleConfirm.booking.service?.name || rescheduleConfirm.booking.class?.name || "Cita"}
          loading={rescheduling}
        />
      )}

      {/* Edit Booking Modal */}
      {editBookingModal && (
        <EditBookingModal
          booking={{
            ...editBookingModal,
            service: editBookingModal.service ? {
              ...editBookingModal.service,
              duration_min: editBookingModal.type === 'service' ? 60 : 0
            } : undefined,
            class: editBookingModal.class ? {
              ...editBookingModal.class,
              duration_min: editBookingModal.type === 'class' ? 60 : 0
            } : undefined
          }}
          isOpen={true}
          onClose={() => setEditBookingModal(null)}
          onSave={handleEditBookingSave}
        />
      )}

      {/* Cancel Booking Modal */}
      {cancelBookingModal && (
        <AdminCancelBookingModal
          booking={{
            id: cancelBookingModal.id,
            start_at: cancelBookingModal.start_at,
            end_at: cancelBookingModal.end_at,
            status: cancelBookingModal.status,
            payment_method: cancelBookingModal.payment_method,
            payment_status: 'unpaid',
            notes: cancelBookingModal.notes,
            type: cancelBookingModal.type,
            service_name: cancelBookingModal.service?.name,
            class_name: cancelBookingModal.class?.name,
            professional_name: cancelBookingModal.professional.name,
            location_name: cancelBookingModal.location.name,
            user_name: cancelBookingModal.user.name
          }}
          isOpen={true}
          onClose={() => setCancelBookingModal(null)}
          onSuccess={() => {
            setCancelBookingModal(null);
            void loadBookings();
          }}
        />
      )}

      {/* Create Booking Modal */}
      <CreateBookingModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          // Clear double-click context when modal closes
          setDoubleClickInitialDate(undefined);
          setDoubleClickInitialTime(undefined);
          setDoubleClickInitialProfessionalId(undefined);
          setDoubleClickInitialLocationId(undefined);
        }}
        onSuccess={() => {
          void loadBookings();
          setIsCreateModalOpen(false);
          // Clear double-click context after success
          setDoubleClickInitialDate(undefined);
          setDoubleClickInitialTime(undefined);
          setDoubleClickInitialProfessionalId(undefined);
          setDoubleClickInitialLocationId(undefined);
        }}
        initialDate={doubleClickInitialDate}
        initialTime={doubleClickInitialTime}
        initialProfessionalId={doubleClickInitialProfessionalId}
        initialLocationId={doubleClickInitialLocationId}
      />

    </div>
    </DndContext>
  );
}