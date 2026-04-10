import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, User, Calendar as CalendarIcon, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useProfessionalAvailability } from "@/hooks/useProfessionalAvailability";
import { useClassAvailability } from "@/hooks/useClassAvailability";
import { format, startOfDay, getISODay } from "date-fns";
import { es } from "date-fns/locale";
import { fromZonedTime } from "date-fns-tz";
import { calculateVoucherBalance } from "@/lib/voucher-utils";
import ServiceMultiProfessionalSlots from "@/components/admin/ServiceMultiProfessionalSlots";
import { OverbookingConfirmModal } from "@/components/admin/OverbookingConfirmModal";
import { Switch } from "@/components/ui/switch";

interface CreateBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  // Optional initial values from calendar double-click
  initialDate?: Date;
  initialTime?: string;
  initialProfessionalId?: string;
  initialLocationId?: string;
}

interface UserShadow {
  id: string;
  name: string;
  email: string;
  app_user_id: string;
}

export default function CreateBookingModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  initialDate,
  initialTime,
  initialProfessionalId,
  initialLocationId
}: CreateBookingModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Type selection
  const [bookingType, setBookingType] = useState<"service" | "class" | "voucher" | "subscription" | null>(null);

  // Step 2: Entity selection
  const [services, setServices] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [entityLoading, setEntityLoading] = useState(false);

  // Step 3: Location & Professional
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(initialLocationId || null);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(initialProfessionalId || null);
  const [locationTz, setLocationTz] = useState<string>("Europe/Madrid");

  // Step 4: Date & Time
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
  const [selectedTime, setSelectedTime] = useState<string | null>(initialTime || null);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);

  // Step 5: Client
  const [clientSearch, setClientSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserShadow[]>([]);
  const [selectedClient, setSelectedClient] = useState<UserShadow | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [generatedInternalEmail, setGeneratedInternalEmail] = useState("");
  const [creatingNewClient, setCreatingNewClient] = useState(false);

  // Step 3.5: Voucher/Subscription Decision (for bonos and suscripciones)
  const [voucherSubscriptionDecision, setVoucherSubscriptionDecision] = useState<'existing' | 'new' | null>(null);
  const [userVouchers, setUserVouchers] = useState<any[]>([]);
  const [userSubscriptions, setUserSubscriptions] = useState<any[]>([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null);
  const [reserveAfterPurchase, setReserveAfterPurchase] = useState<boolean>(false);
  const [loadingUserAssets, setLoadingUserAssets] = useState(false);
  const [voucherServiceDuration, setVoucherServiceDuration] = useState<number>(60); // Default duration for vouchers
  const [subscriptionSlots, setSubscriptionSlots] = useState<any[]>([]);
  const [subscriptionCapacity, setSubscriptionCapacity] = useState<number>(1);
  
  // Overbooking control states
  const [showOverbookingModal, setShowOverbookingModal] = useState(false);
  const [conflictingBookings, setConflictingBookings] = useState<any[]>([]);
  const [pendingBookingData, setPendingBookingData] = useState<any>(null);
  const [pendingPostInsertActions, setPendingPostInsertActions] = useState<(() => Promise<void>) | null>(null);

  // Helper: check if a slot time is in the past (only for today)
  const isSlotInPast = (slotTime: string, selectedDate: Date | undefined) => {
    if (!selectedDate) return false;
    
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(selectedDate);
    checkDate.setHours(0, 0, 0, 0);
    
    // Only filter if selected date is today
    if (checkDate.getTime() !== today.getTime()) return false;
    
    // Parse slot time (format "HH:MM")
    const [hours, minutes] = slotTime.split(':').map(Number);
    const slotDateTime = new Date(selectedDate);
    slotDateTime.setHours(hours, minutes, 0, 0);
    
    return slotDateTime < now;
  };

  // Step 6: Payment
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "none">("cash");

  // For vouchers and subscriptions, we go to client selection first
  const shouldSkipToClient = bookingType === "voucher" || bookingType === "subscription";

  // Get current entity
  const selectedEntity = useMemo(() => {
    if (!selectedEntityId) return null;
    if (bookingType === "service") {
      return services.find(s => s.id === selectedEntityId);
    } else if (bookingType === "class") {
      return classes.find(c => c.id === selectedEntityId);
    } else if (bookingType === "voucher") {
      return vouchers.find(v => v.id === selectedEntityId);
    } else if (bookingType === "subscription") {
      return subscriptions.find(s => s.id === selectedEntityId);
    }
    return null;
  }, [selectedEntityId, bookingType, services, classes, vouchers, subscriptions]);

  // Availability hooks - for vouchers/subscriptions using existing, use voucher duration
  const effectiveServiceId = (voucherSubscriptionDecision === 'existing' && (bookingType === "voucher" || bookingType === "subscription")) 
    ? null  // Don't pass serviceId for vouchers/subscriptions
    : bookingType === "service" ? selectedEntityId : null;
  
  const serviceAvailability = useProfessionalAvailability(
    bookingType === "service" || (voucherSubscriptionDecision === 'existing' && (bookingType === "voucher" || bookingType === "subscription")) 
      ? selectedProfessionalId 
      : null,
    effectiveServiceId,
    selectedLocationId,
    voucherSubscriptionDecision === 'existing' ? voucherServiceDuration : undefined, // Pass duration for vouchers
    undefined, // excludeBookingId
    30 // Admin: show 30-min granularity slots
  );

  const classAvailability = useClassAvailability(
    bookingType === "class" ? selectedEntityId : null,
    selectedLocationId || undefined
  );

  const { getAvailableSlots, isDateAvailable } = 
    (bookingType === "class") 
      ? classAvailability 
      : (voucherSubscriptionDecision === 'existing' || bookingType === "service")
        ? serviceAvailability
        : { getAvailableSlots: () => [], isDateAvailable: () => false };

  // Available time slots for selected date (admin can see all slots, including occupied ones)
  const availableSlots = useMemo(() => {
    if (!selectedDate) return [];
    
    // Use subscription slots when booking with subscription (both new and existing)
    if (bookingType === 'subscription' && subscriptionSlots.length > 0) {
      return subscriptionSlots; // Show all slots for admin
    }
    
    const slots = getAvailableSlots(selectedDate);
    return showOnlyAvailable ? slots.filter(s => s.available) : slots;
  }, [selectedDate, getAvailableSlots, bookingType, subscriptionSlots, showOnlyAvailable]);

  // Load locations on mount
  useEffect(() => {
    const loadLocations = async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, timezone")
        .eq("active", true)
        .order("name");
      
      if (!error && data) {
        setLocations(data);
        // Only set default location if not provided via initialLocationId
        if (data.length > 0 && !initialLocationId) {
          setSelectedLocationId(data[0].id);
          setLocationTz(data[0].timezone || "Europe/Madrid");
        } else if (initialLocationId) {
          const loc = data.find(l => l.id === initialLocationId);
          if (loc) {
            setLocationTz(loc.timezone || "Europe/Madrid");
          }
        }
      }
    };
    
    if (isOpen) {
      loadLocations();
    }
  }, [isOpen]);

  // Load services, classes, vouchers or subscriptions based on type
  useEffect(() => {
    if (!bookingType || !isOpen) return;

    const loadEntities = async () => {
      setEntityLoading(true);
      
      if (bookingType === "service") {
        const { data, error } = await supabase
          .from("services")
          .select("id, name, duration_min, price, currency")
          .eq("active", true)
          .order("name");
        
        if (!error && data) {
          setServices(data);
        }
      } else if (bookingType === "class") {
        const { data, error } = await supabase
          .from("classes")
          .select("id, name, duration_min, price, currency, capacity")
          .eq("active", true)
          .order("name");
        
        if (!error && data) {
          setClasses(data);
        }
      } else if (bookingType === "voucher") {
        const { data, error } = await supabase
          .from("voucher_types")
          .select("id, name, sessions_count, session_duration_min, price, currency")
          .eq("active", true)
          .order("name");
        
        if (!error && data) {
          setVouchers(data);
        }
      } else if (bookingType === "subscription") {
        const { data, error } = await supabase
          .from("subscription_plans")
          .select("id, name, sessions_count, price, currency, cycle, parent_plan_id, description")
          .eq("active", true)
          .order("name");
        
        if (!error && data) {
          setSubscriptions(data);
        }
      }
      
      setEntityLoading(false);
    };

    loadEntities();
  }, [bookingType, isOpen]);

  // Load professionals for selected service, voucher, or subscription
  useEffect(() => {
    if (!selectedLocationId) return;
    if (bookingType === "service") {
      if (!selectedEntityId) return;

      const loadProfessionals = async () => {
        const { data, error } = await supabase
          .from("service_professionals")
          .select("professional_id")
          .eq("service_id", selectedEntityId);

        if (!error && data) {
          const professionalIds = data.map(sp => sp.professional_id);
          
          if (professionalIds.length > 0) {
            const { data: profsData, error: profsError } = await supabase
              .from("professionals")
              .select("id, name")
              .in("id", professionalIds)
              .eq("active", true);
            
            if (!profsError && profsData) {
              setProfessionals(profsData);
              // Only set default professional if not provided via initialProfessionalId
              if (profsData.length > 0 && !initialProfessionalId) {
                setSelectedProfessionalId(profsData[0].id);
              }
            }
          }
        }
      };

      loadProfessionals();
    } else if (voucherSubscriptionDecision === 'existing' && (bookingType === "voucher" || bookingType === "subscription")) {
      // Load professionals for voucher/subscription flow
      const loadProfessionals = async () => {
        if (bookingType === "voucher" && selectedEntityId) {
          // Check if voucher type has a specific professional
          const { data: voucherType } = await supabase
            .from("voucher_types")
            .select("professional_id")
            .eq("id", selectedEntityId)
            .single();

          if (voucherType?.professional_id) {
            // Use the specific professional
            const { data: prof } = await supabase
              .from("professionals")
              .select("id, name")
              .eq("id", voucherType.professional_id)
              .eq("active", true)
              .single();

            if (prof) {
              setProfessionals([prof]);
              setSelectedProfessionalId(prof.id);
              return;
            }
          }
        }

        // Load all active professionals as fallback
        const { data: allProfs, error } = await supabase
          .from("professionals")
          .select("id, name")
          .eq("active", true)
          .order("name");

        if (!error && allProfs && allProfs.length > 0) {
          setProfessionals(allProfs);
          setSelectedProfessionalId(allProfs[0].id);
        }
      };

      loadProfessionals();
    }
  }, [bookingType, selectedEntityId, selectedLocationId, voucherSubscriptionDecision]);

  // Search clients
  const handleClientSearch = async (searchTerm: string) => {
    setClientSearch(searchTerm);
    
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    const { data, error } = await supabase
      .from("users_shadow")
      .select("*")
      .or(`email.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%`)
      .limit(10);

    if (!error && data) {
      setSearchResults(data);
    }
  };

  // Generate unique email for clients without email
  const generateInternalEmail = () => {
    if (!newClientName.trim()) {
      toast({
        title: "Error",
        description: "Introduce el nombre del cliente antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    // Convert name to slug
    const slug = newClientName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
      .trim()
      .replace(/\s+/g, "-"); // Replace spaces with hyphens

    // Generate timestamp
    const timestamp = Date.now();
    
    // Create unique email and store internally (not shown to user)
    const internalEmail = `${slug}+${timestamp}@plenosalud.es`;
    setGeneratedInternalEmail(internalEmail);
  };

  // Create new client
  const handleCreateNewClient = async () => {
    // Use internal email if generated, otherwise use typed email
    const emailToUse = generatedInternalEmail || newClientEmail;
    
    if (!emailToUse || !newClientName) {
      toast({
        title: "Error",
        description: "Email y nombre son requeridos",
        variant: "destructive",
      });
      return;
    }

    setCreatingNewClient(true);

    try {
      // Check if user already exists
      const { data: existing } = await supabase
        .from("users_shadow")
        .select("*")
        .eq("email", emailToUse.toLowerCase().trim())
        .maybeSingle();

      if (existing) {
        setSelectedClient(existing);
        toast({
          title: "Cliente encontrado",
          description: "El cliente ya existe en el sistema",
        });
      } else {
        // Create new shadow user
        const { data: newUser, error } = await supabase
          .from("users_shadow")
          .insert({
            email: emailToUse.toLowerCase().trim(),
            name: newClientName.trim(),
            phone: newClientPhone.trim() ? `+34${newClientPhone.trim()}` : null,
            app_user_id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          })
          .select()
          .single();

        if (error) throw error;

        setSelectedClient(newUser);
        toast({
          title: "Cliente creado",
          description: "Nuevo cliente registrado exitosamente",
        });
      }

      setNewClientEmail("");
      setNewClientName("");
      setNewClientPhone("");
      setGeneratedInternalEmail("");
    } catch (error: any) {
      console.error("Error creating client:", error);
      toast({
        title: "Error",
        description: "No se pudo crear el cliente",
        variant: "destructive",
      });
    } finally {
      setCreatingNewClient(false);
    }
  };

  // Load user vouchers and subscriptions when client is selected (for voucher/subscription flow)
  useEffect(() => {
    if (!selectedClient || !shouldSkipToClient) return;

    const loadUserAssets = async () => {
      setLoadingUserAssets(true);
      
      try {
        if (bookingType === "voucher") {
          // Load ALL user vouchers (not filtered by type) for displaying available vouchers
          const vouchersRes = await supabase
            .from("vouchers")
            .select(`
              id,
              code,
              sessions_remaining,
              expiry_date,
              status,
              voucher_type_id,
              voucher_types!inner (
                id,
                name,
                sessions_count,
                session_duration_min
              )
            `)
            .eq("user_id", selectedClient.id)
            .in("status", ["active", "partially_used"])
            .gt("sessions_remaining", 0);

          if (!vouchersRes.error && vouchersRes.data) {
            // Recalculate remaining sessions from redemptions to ensure accuracy
            const enhanced = await Promise.all(vouchersRes.data.map(async (v) => {
              try {
                const balance = await calculateVoucherBalance(v.id);
                return { ...v, sessions_remaining: balance.remaining };
              } catch (e) {
                console.warn('[CreateBookingModal] balance error for', v.id, e);
                return v; // fallback to existing value
              }
            }));

            // Only keep vouchers with remaining > 0
            const filteredVouchers = enhanced.filter(v => (v.sessions_remaining || 0) > 0);
            setUserVouchers(filteredVouchers);
            
            // If we have a selected entity, set the duration
            if (selectedEntityId && filteredVouchers.length > 0) {
              const voucher = filteredVouchers.find(v => v.voucher_type_id === selectedEntityId);
              if (voucher?.voucher_types?.session_duration_min) {
                setVoucherServiceDuration(voucher.voucher_types.session_duration_min);
                console.log('[CreateBookingModal] Voucher type duration:', voucher.voucher_types.session_duration_min);
              }
            }
          }
        } else if (bookingType === "subscription") {
          // Load ALL active user subscriptions with category info and usage calculation
          const { data: subscriptions, error } = await supabase
            .from("subscriptions")
            .select(`
              id,
              status,
              start_date,
              next_billing_date,
              cap_remaining_in_cycle,
              plan_id,
              subscription_plans!inner (
                id,
                name,
                cycle,
                cap_per_cycle,
                sessions_count
              )
            `)
            .eq("user_id", selectedClient.id)
            .eq("status", "active");

          if (!error && subscriptions) {
            // Get categories for each plan
            const enrichedSubs = await Promise.all(
              subscriptions.map(async (sub) => {
                // Get category info (may have multiple categories; take first for display)
                const { data: planCategoriesArr } = await supabase
                  .from("subscription_plan_categories")
                  .select("categories(name)")
                  .eq("plan_id", sub.plan_id);

                // Calculate used sessions in current cycle for THIS specific subscription
                const { data: bookings } = await supabase
                  .from("bookings")
                  .select("id, notes")
                  .eq("user_id", selectedClient.id)
                  .eq("origin", "subscription")
                  .gte("start_at", sub.start_date)
                  .lte("start_at", sub.next_billing_date)
                  .neq("status", "cancelled");

                // Filter bookings to only count those belonging to THIS subscription
                const subscriptionBookings = bookings?.filter(booking => {
                  try {
                    const notes = booking.notes ? JSON.parse(booking.notes) : {};
                    return notes.subscriptionId === sub.id;
                  } catch {
                    return false;
                  }
                }) || [];

                const usedSessions = subscriptionBookings.length;
                const totalSessions = (sub.subscription_plans?.cap_per_cycle ?? sub.subscription_plans?.sessions_count) ?? null;
                const remainingSessions = sub.cap_remaining_in_cycle ?? (totalSessions !== null ? Math.max(0, totalSessions - usedSessions) : null);
                const categoryName = planCategoriesArr?.[0]?.categories?.name || null;

                console.log('[CreateBookingModal] Subscription enrichment:', {
                  planId: sub.plan_id,
                  categoryName,
                  usedSessions,
                  capRemaining: sub.cap_remaining_in_cycle
                });

                return {
                  ...sub,
                  categoryName,
                  usedSessions,
                  totalSessions,
                  remainingSessions,
                };
              })
            );

            // Filter subscriptions with available credits
            const filteredSubs = enrichedSubs.filter(sub => {
              return sub.cap_remaining_in_cycle === null || sub.cap_remaining_in_cycle > 0;
            });
            setUserSubscriptions(filteredSubs);
          }
        }
      } catch (error) {
        console.error("Error loading user assets:", error);
      } finally {
        setLoadingUserAssets(false);
      }
    };

    loadUserAssets();
  }, [selectedClient, bookingType, selectedEntityId, shouldSkipToClient]);

  // Load subscription slots with capacity info when subscription is selected
  useEffect(() => {
    // Only load slots for subscription bookings
    if (bookingType !== 'subscription') {
      setSubscriptionSlots([]);
      return;
    }

    // For existing subscriptions, need subscription ID
    if (voucherSubscriptionDecision === 'existing' && !selectedSubscriptionId) {
      setSubscriptionSlots([]);
      return;
    }

    // For new subscriptions, need entity (plan) ID
    if (voucherSubscriptionDecision === 'new' && !selectedEntityId) {
      setSubscriptionSlots([]);
      return;
    }

    // Need date and location
    if (!selectedDate || !selectedLocationId) {
      setSubscriptionSlots([]);
      return;
    }

    const loadSubscriptionSlots = async () => {
      try {
        let planId: string;
        
        // Get plan ID from either existing subscription or selected entity (new subscription)
        if (voucherSubscriptionDecision === 'existing') {
          const selectedSub = userSubscriptions.find(s => s.id === selectedSubscriptionId);
          if (!selectedSub || !selectedSub.plan_id) {
            setSubscriptionSlots([]);
            return;
          }
          planId = selectedSub.plan_id;
        } else {
          // For new subscriptions, use the selected plan directly
          planId = selectedEntityId!;
        }

        // Load plan details with session config
        const { data: plan, error: planError } = await supabase
          .from('subscription_plans')
          .select('*, description')
          .eq('id', planId)
          .maybeSingle();

        if (planError || !plan) {
          console.error('[Admin] Error loading subscription plan:', planError);
          setSubscriptionSlots([]);
          return;
        }

        // Resolve capacity from plan or parent plan
        let capacity = plan.capacity_per_session as number | null;
        if ((!capacity || capacity === null) && plan.parent_plan_id) {
          const { data: parent } = await supabase
            .from('subscription_plans')
            .select('capacity_per_session')
            .eq('id', plan.parent_plan_id)
            .maybeSingle();
          
          if (parent && typeof parent.capacity_per_session === 'number') {
            capacity = parent.capacity_per_session;
          }
        }
        
        const finalCapacity = typeof capacity === 'number' && capacity > 0 ? capacity : 1;
        setSubscriptionCapacity(finalCapacity);

        // Parse session config
        let sessionConfig = null;
        try {
          if (plan.description && typeof plan.description === 'object') {
            sessionConfig = (plan.description as any).session_config;
          } else if (typeof plan.description === 'string') {
            sessionConfig = JSON.parse(plan.description).session_config;
          }
        } catch (e) {
          console.error('[Admin] Error parsing session config:', e);
        }

        if (!sessionConfig || !sessionConfig.time_slots) {
          setSubscriptionSlots([]);
          return;
        }

        // Generate slots for the selected date
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const dayOfWeek = getISODay(selectedDate) === 7 ? 0 : getISODay(selectedDate);
        
        // Check if this day is available
        const availableDays = sessionConfig.days_of_week || [];
        if (!availableDays.includes(dayOfWeek)) {
          setSubscriptionSlots([]);
          return;
        }

        const slots = [];
        for (const timeSlot of sessionConfig.time_slots) {
          const time = timeSlot.start_time;
          const localDateTimeStr = `${dateStr}T${time}:00`;
          
          let startUtc;
          try {
            startUtc = fromZonedTime(localDateTimeStr, locationTz || 'Europe/Madrid');
          } catch (error) {
            console.error('[Admin] Error converting time:', error);
            continue;
          }

          // Query existing bookings for this time slot
          const { data: existingBookings, error: bookingError } = await supabase
            .from('bookings')
            .select('id')
            .eq('start_at', startUtc.toISOString())
            .eq('location_id', selectedLocationId)
            .neq('status', 'cancelled');

          if (bookingError) {
            console.error('[Admin] Error checking bookings:', bookingError);
          }

          const currentBookings = existingBookings?.length || 0;
          const remainingSlots = finalCapacity - currentBookings;
          const available = remainingSlots > 0;

          slots.push({
            time,
            available,
            remainingSlots,
            capacity: finalCapacity,
            startUTC: startUtc.toISOString(),
            endUTC: new Date(startUtc.getTime() + 60 * 60000).toISOString() // Default 60 min
          });
        }

        console.log('[Admin] Generated subscription slots:', slots);
        setSubscriptionSlots(slots);
      } catch (error) {
        console.error('[Admin] Error loading subscription slots:', error);
        setSubscriptionSlots([]);
      }
    };

    loadSubscriptionSlots();
  }, [selectedSubscriptionId, selectedEntityId, selectedDate, selectedLocationId, bookingType, voucherSubscriptionDecision, userSubscriptions, locationTz]);

  // Check for conflicting bookings (overbooking detection)
  const checkForConflicts = async (professionalId: string, startUTC: Date, locationId: string) => {
    try {
      const { data: conflicts, error } = await supabase
        .from("bookings")
        .select(`
          id,
          start_at,
          end_at,
          users_shadow!bookings_user_id_fkey(name),
          services(name),
          classes(name)
        `)
        .eq("professional_id", professionalId)
        .eq("start_at", startUTC.toISOString())
        .eq("location_id", locationId)
        .neq("status", "cancelled");

      if (error) throw error;

      return conflicts?.map(c => ({
        id: c.id,
        user_name: (c.users_shadow as any)?.name || "Cliente",
        service_name: (c.services as any)?.name,
        class_name: (c.classes as any)?.name,
        start_at: c.start_at,
        end_at: c.end_at
      })) || [];
    } catch (error) {
      console.error("Error checking conflicts:", error);
      return [];
    }
  };

  // Common booking creation and post-insert logic
  const executeBookingCreation = async (
    bookingData: any,
    postInsertAction?: () => Promise<void>
  ) => {
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert(bookingData)
      .select()
      .single();

    if (bookingError) throw bookingError;

    // Execute post-insert actions if provided
    if (postInsertAction) {
      await postInsertAction();
    }

    return booking;
  };

  // Handle overbooking confirmation
  const handleConfirmOverbooking = async () => {
    if (!pendingBookingData || !pendingPostInsertActions) return;

    setLoading(true);
    try {
      await executeBookingCreation(pendingBookingData, pendingPostInsertActions);

      toast({
        title: "Reserva creada",
        description: "La reserva se ha creado exitosamente (overbooking confirmado)",
      });

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error("Error creating booking with overbooking:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la reserva",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setShowOverbookingModal(false);
      setPendingBookingData(null);
      setPendingPostInsertActions(null);
    }
  };

  // Create booking with existing voucher
  const handleCreateBookingWithVoucher = async () => {
    if (!selectedEntityId || !selectedClient || !selectedVoucherId || !selectedLocationId || !selectedDate || !selectedTime) {
      toast({
        title: "Error",
        description: "Complete todos los campos requeridos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Find the selected slot
      const slot = availableSlots.find(s => s.time === selectedTime);
      // Si el slot no está en el array (franja ocupada), se calculan las horas UTC manualmente

      // Get start and end UTC times
      let startUTC: Date;
      let endUTC: Date;

      if (slot && 'startUTC' in slot && 'endUTC' in slot && slot.startUTC && slot.endUTC) {
        startUTC = new Date(slot.startUTC);
        endUTC = new Date(slot.endUTC);
      } else {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const timeStr = selectedTime!.length === 5 ? `${selectedTime}:00` : selectedTime!;
        const localDateTimeStr = `${dateStr}T${timeStr}`;
        startUTC = fromZonedTime(localDateTimeStr, locationTz || 'Europe/Madrid');
        const voucherType = vouchers.find(v => v.id === selectedEntityId);
        const durationMin = voucherType?.session_duration_min || 60;
        endUTC = new Date(startUTC.getTime() + durationMin * 60000);
      }

      // Get professional (for vouchers, use any professional who can provide the service)
      let professionalIdForBooking = selectedProfessionalId;

      if (!professionalIdForBooking) {
        // Get first available professional
        const { data: voucherType } = await supabase
          .from("voucher_types")
          .select("professional_id")
          .eq("id", selectedEntityId)
          .single();

        if (voucherType?.professional_id) {
          professionalIdForBooking = voucherType.professional_id;
        }
      }

      if (!professionalIdForBooking) {
        throw new Error("No hay profesional disponible");
      }

      // Create booking
      const bookingData: any = {
        type: "service",
        user_id: selectedClient.id,
        location_id: selectedLocationId,
        professional_id: professionalIdForBooking,
        start_at: startUTC.toISOString(),
        end_at: endUTC.toISOString(),
        status: "pending",
        payment_method: "voucher",
        payment_status: "paid",
        origin: "voucher",
        notes: JSON.stringify({
          createdBy: "admin_panel",
          clientName: selectedClient.name,
          clientEmail: selectedClient.email,
          voucherId: selectedVoucherId,
          paymentMethod: "voucher"
        })
      };

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert(bookingData)
        .select()
        .single();

      if (bookingError) throw bookingError;

      // Create redemption record
      await supabase
        .from("voucher_redemptions")
        .insert({
          voucher_id: selectedVoucherId,
          booking_id: booking.id,
          status: "captured",
          credits_used: 1
        });

      // Update voucher sessions_remaining
      const currentVoucher = userVouchers.find(v => v.id === selectedVoucherId);
      const newRemaining = (currentVoucher?.sessions_remaining || 1) - 1;
      
      await supabase
        .from("vouchers")
        .update({
          sessions_remaining: newRemaining,
          status: newRemaining === 0 ? "used" : "active"
        })
        .eq("id", selectedVoucherId);

      toast({
        title: "Reserva creada",
        description: "La reserva con bono se ha creado exitosamente",
      });

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error("Error creating booking with voucher:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la reserva",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Create booking with existing subscription
  const handleCreateBookingWithSubscription = async () => {
    if (!selectedEntityId || !selectedClient || !selectedSubscriptionId || !selectedLocationId || !selectedDate || !selectedTime) {
      toast({
        title: "Error",
        description: "Complete todos los campos requeridos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Find the selected slot
      const slot = availableSlots.find(s => s.time === selectedTime);
      // Si el slot no está en el array (franja ocupada), se calculan las horas UTC manualmente

      // Get start and end UTC times
      let startUTC: Date;
      let endUTC: Date;

      if (slot && 'startUTC' in slot && 'endUTC' in slot && slot.startUTC && slot.endUTC) {
        startUTC = new Date(slot.startUTC);
        endUTC = new Date(slot.endUTC);
      } else {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const timeStr = selectedTime!.length === 5 ? `${selectedTime}:00` : selectedTime!;
        const localDateTimeStr = `${dateStr}T${timeStr}`;
        startUTC = fromZonedTime(localDateTimeStr, locationTz || 'Europe/Madrid');
        const durationMin = 60; // Default duration
        endUTC = new Date(startUTC.getTime() + durationMin * 60000);
      }

      // Double-check capacity availability (prevent overbooking)
      if ('capacity' in slot && slot.capacity !== undefined) {
        const { data: existingBookings, error: checkError } = await supabase
          .from("bookings")
          .select("id")
          .eq("start_at", startUTC.toISOString())
          .eq("location_id", selectedLocationId)
          .neq("status", "cancelled");

        if (checkError) throw checkError;

        const currentBookings = existingBookings?.length || 0;
        if (currentBookings >= slot.capacity) {
          throw new Error(`Sin plazas disponibles. La sesión está completa (${currentBookings}/${slot.capacity})`);
        }

        console.log('[Admin] Capacity check passed:', {
          currentBookings,
          capacity: slot.capacity,
          remainingSlots: slot.capacity - currentBookings
        });
      }

      // Get professional
      let professionalIdForBooking = selectedProfessionalId;

      if (!professionalIdForBooking) {
        throw new Error("No hay profesional disponible");
      }

      // Check for conflicts (overbooking)
      const conflicts = await checkForConflicts(professionalIdForBooking, startUTC, selectedLocationId);

      // Create booking data
      const bookingData: any = {
        type: "service",
        user_id: selectedClient.id,
        location_id: selectedLocationId,
        professional_id: professionalIdForBooking,
        start_at: startUTC.toISOString(),
        end_at: endUTC.toISOString(),
        status: "pending",
        payment_method: "none",
        payment_status: "paid",
        origin: "subscription",
        notes: JSON.stringify({
          createdBy: "admin_panel",
          clientName: selectedClient.name,
          clientEmail: selectedClient.email,
          subscriptionId: selectedSubscriptionId,
          planId: userSubscriptions.find(s => s.id === selectedSubscriptionId)?.plan_id,
          planName: userSubscriptions.find(s => s.id === selectedSubscriptionId)?.subscription_plans?.name,
          paymentMethod: "subscription"
        })
      };

      // Post-insert actions for subscription
      const postInsertAction = async () => {
        const selectedSub = userSubscriptions.find(s => s.id === selectedSubscriptionId);
        if (selectedSub && selectedSub.cap_remaining_in_cycle !== null) {
          await supabase
            .from("subscriptions")
            .update({
              cap_remaining_in_cycle: selectedSub.cap_remaining_in_cycle - 1
            })
            .eq("id", selectedSubscriptionId);
        }
      };

      // If conflicts exist, show overbooking modal
      if (conflicts.length > 0) {
        setConflictingBookings(conflicts);
        setPendingBookingData(bookingData);
        setPendingPostInsertActions(() => postInsertAction);
        setShowOverbookingModal(true);
        return;
      }

      // No conflicts, proceed normally
      await executeBookingCreation(bookingData, postInsertAction);

      toast({
        title: "Reserva creada",
        description: "La reserva con suscripción se ha creado exitosamente",
      });

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error("Error creating booking with subscription:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la reserva",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Create booking, voucher or subscription
  const handleCreateBooking = async () => {
    if (!selectedEntityId || !selectedClient) {
      toast({
        title: "Error",
        description: "Complete todos los campos requeridos",
        variant: "destructive",
      });
      return;
    }

    // For vouchers and subscriptions, we don't need date/time/location
    if (bookingType === "voucher" || bookingType === "subscription") {
      return handleCreateVoucherOrSubscription();
    }

    if (!selectedLocationId || !selectedDate || !selectedTime) {
      toast({
        title: "Error",
        description: "Complete todos los campos requeridos",
        variant: "destructive",
      });
      return;
    }

    if (bookingType === "service" && !selectedProfessionalId) {
      toast({
        title: "Error",
        description: "Seleccione un profesional",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Find the selected slot to get exact UTC times
      const slot = availableSlots.find(s => s.time === selectedTime);
      // Si el slot no está en el array (franja ocupada), se calculan las horas UTC manualmente

      // Get start and end UTC times (compute from selected date/time for services)
      let startUTC: Date;
      let endUTC: Date;

      if (slot && 'startUTC' in slot && 'endUTC' in slot && slot.startUTC && slot.endUTC) {
        startUTC = new Date(slot.startUTC);
        endUTC = new Date(slot.endUTC);
      } else {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const timeStr = selectedTime!.length === 5 ? `${selectedTime}:00` : selectedTime!;
        const localDateTimeStr = `${dateStr}T${timeStr}`;
        startUTC = fromZonedTime(localDateTimeStr, locationTz || 'Europe/Madrid');
        const durationMin = selectedEntity?.duration_min || 60;
        endUTC = new Date(startUTC.getTime() + durationMin * 60000);
      }

      // Double-check availability
      let existingBookings: { id: string }[] = [];
      let checkError: any = null;

      if (bookingType === "class") {
        // Para clases: filtrar por class_id específico para evitar contar reservas de otras clases
        const result = await supabase
          .from("bookings")
          .select("id")
          .eq("class_id", selectedEntityId)
          .eq("start_at", startUTC.toISOString())
          .eq("location_id", selectedLocationId)
          .neq("status", "cancelled");
        
        existingBookings = result.data || [];
        checkError = result.error;
      } else {
        // Para servicios: mantener la lógica actual
        const result = await supabase
          .from("bookings")
          .select("id")
          .eq("start_at", startUTC.toISOString())
          .eq("location_id", selectedLocationId)
          .neq("status", "cancelled");
        
        existingBookings = result.data || [];
        checkError = result.error;
      }

      if (checkError) throw checkError;

      if (bookingType === "class") {
        // Check class capacity
        const capacity = selectedEntity?.capacity || 0;
        if (existingBookings && existingBookings.length >= capacity) {
          throw new Error(`La clase "${selectedEntity?.name}" está llena (${existingBookings.length}/${capacity} plazas ocupadas)`);
        }
      }

      // Determine professional_id for the booking
      let professionalIdForBooking = selectedProfessionalId;
      
      if (bookingType === "class") {
        // For classes, try to get professional from class_sessions or use first available
        const { data: session } = await supabase
          .from("class_sessions")
          .select("professional_id")
          .eq("class_id", selectedEntityId)
          .eq("start_at", startUTC.toISOString())
          .eq("location_id", selectedLocationId)
          .maybeSingle();

        if (session?.professional_id) {
          professionalIdForBooking = session.professional_id;
        } else {
          // Get any professional for this class
          const { data: classProf } = await supabase
            .from("class_professionals")
            .select("professional_id")
            .eq("class_id", selectedEntityId)
            .limit(1)
            .maybeSingle();
          
          professionalIdForBooking = classProf?.professional_id || null;
        }
      }

      if (!professionalIdForBooking) {
        throw new Error("No hay profesional disponible");
      }

      // Create booking
      const bookingData: any = {
        type: bookingType,
        user_id: selectedClient.id,
        location_id: selectedLocationId,
        professional_id: professionalIdForBooking,
        start_at: startUTC.toISOString(),
        end_at: endUTC.toISOString(),
        status: "pending",
        payment_method: paymentMethod,
        payment_status: "unpaid",
        origin: "normal",
        notes: JSON.stringify({
          createdBy: "admin_panel",
          clientName: selectedClient.name,
          clientEmail: selectedClient.email,
          paymentMethod: paymentMethod
        })
      };

      if (bookingType === "service") {
        bookingData.service_id = selectedEntityId;
      } else {
        bookingData.class_id = selectedEntityId;
      }

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert(bookingData)
        .select()
        .single();

      if (bookingError) throw bookingError;

      // Create payment record if cash
      if (paymentMethod === "cash") {
        const amount = selectedEntity?.price || 0;
        const currency = selectedEntity?.currency || "EUR";

        await supabase
          .from("payments")
          .insert({
            booking_id: booking.id,
            amount,
            currency: currency.toLowerCase(),
            method: "cash",
            status: "succeeded",
          });
      }

      toast({
        title: "Reserva creada",
        description: "La reserva se ha creado exitosamente",
      });

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error("Error creating booking:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la reserva",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Create voucher or subscription
  const handleCreateVoucherOrSubscription = async () => {
    setLoading(true);

    try {
      if (bookingType === "voucher") {
        const voucherType = vouchers.find(v => v.id === selectedEntityId);
        if (!voucherType) throw new Error("Tipo de bono no encontrado");

        // Calculate expiry date
        let expiryDate = null;
        if (voucherType.validity_days) {
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + voucherType.validity_days);
          expiryDate = expiry.toISOString();
        } else if (voucherType.validity_end_date) {
          expiryDate = new Date(voucherType.validity_end_date).toISOString();
        }

        // Create voucher
        const { data: voucher, error: voucherError } = await supabase
          .from("vouchers")
          .insert({
            user_id: selectedClient.id,
            voucher_type_id: selectedEntityId,
            sessions_remaining: voucherType.sessions_count,
            expiry_date: expiryDate,
            status: "active",
            code: `MANUAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase()
          })
          .select()
          .single();

        if (voucherError) throw voucherError;

        // Create payment record if cash
        if (paymentMethod === "cash") {
          await supabase
            .from("payments")
            .insert({
              amount: voucherType.price,
              currency: (voucherType.currency || "EUR").toLowerCase(),
              method: "cash",
              status: "succeeded",
            });
        }

        if (reserveAfterPurchase) {
          // Store the newly created voucher ID and continue to booking
          setSelectedVoucherId(voucher.id);
          setVoucherSubscriptionDecision('existing'); // Treat it as existing now
          toast({
            title: "Bono creado",
            description: "Ahora selecciona fecha y hora para la reserva",
          });
          // Load locations if switching to step 4 for vouchers/subscriptions
          if (locations.length === 0) {
            const { data } = await supabase
              .from("locations")
              .select("id, name, timezone")
              .eq("active", true)
              .order("name");
            if (data && data.length > 0) {
              setLocations(data);
              setSelectedLocationId(data[0].id);
              setLocationTz(data[0].timezone || "Europe/Madrid");
            }
          }
          setStep(4); // Go to location/professional step
        } else {
          toast({
            title: "Bono creado",
            description: `Bono creado exitosamente para ${selectedClient.name}`,
          });
          onSuccess();
          handleClose();
        }
      } else if (bookingType === "subscription") {
        const plan = subscriptions.find(s => s.id === selectedEntityId);
        if (!plan) throw new Error("Plan de suscripción no encontrado");

        // Calculate next billing date based on cycle
        const startDate = new Date();
        const nextBillingDate = new Date(startDate);
        
        if (plan.cycle === "monthly") {
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        } else if (plan.cycle === "yearly") {
          nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
        } else if (plan.cycle === "weekly") {
          nextBillingDate.setDate(nextBillingDate.getDate() + 7);
        }

        // Create subscription
        const { data: subscription, error: subscriptionError } = await supabase
          .from("subscriptions")
          .insert({
            user_id: selectedClient.id,
            plan_id: selectedEntityId,
            start_date: startDate.toISOString(),
            next_billing_date: nextBillingDate.toISOString(),
            status: "active",
            cap_remaining_in_cycle: plan.cap_per_cycle || null
          })
          .select()
          .single();

        if (subscriptionError) throw subscriptionError;

        // Create payment record if cash
        if (paymentMethod === "cash") {
          await supabase
            .from("payments")
            .insert({
              amount: plan.price,
              currency: (plan.currency || "EUR").toLowerCase(),
              method: "cash",
              status: "succeeded",
            });
        }

        if (reserveAfterPurchase) {
          // Store the newly created subscription ID and continue to booking
          setSelectedSubscriptionId(subscription.id);
          setVoucherSubscriptionDecision('existing'); // Treat it as existing now
          toast({
            title: "Suscripción creada",
            description: "Ahora selecciona fecha y hora para la reserva",
          });
          // Load locations if switching to step 4 for vouchers/subscriptions
          if (locations.length === 0) {
            const { data } = await supabase
              .from("locations")
              .select("id, name, timezone")
              .eq("active", true)
              .order("name");
            if (data && data.length > 0) {
              setLocations(data);
              setSelectedLocationId(data[0].id);
              setLocationTz(data[0].timezone || "Europe/Madrid");
            }
          }
          setStep(4); // Go to location/professional step
        } else {
          toast({
            title: "Suscripción creada",
            description: `Suscripción creada exitosamente para ${selectedClient.name}`,
          });
          onSuccess();
          handleClose();
        }
      }
    } catch (error: any) {
      console.error("Error creating voucher/subscription:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el elemento",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setBookingType(null);
    setSelectedEntityId(null);
    setSelectedLocationId(null);
    setSelectedProfessionalId(null);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setSelectedClient(null);
    setClientSearch("");
    setSearchResults([]);
    setPaymentMethod("cash");
    setServices([]);
    setClasses([]);
    setVouchers([]);
    setSubscriptions([]);
    setVoucherSubscriptionDecision(null);
    setUserVouchers([]);
    setUserSubscriptions([]);
    setSelectedVoucherId(null);
    setSelectedSubscriptionId(null);
    setReserveAfterPurchase(false);
    onClose();
  };

  const canProceedToStep2 = bookingType !== null;
  const canProceedToStep3 = selectedEntityId !== null;
  const canProceedToStep4 = selectedLocationId !== null && (bookingType === "class" || selectedProfessionalId !== null);
  const canProceedToStep5 = selectedDate !== undefined && selectedTime !== null;
  const canProceedToStep6 = selectedClient !== null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Reserva Manual</DialogTitle>
          <DialogDescription>
            Paso {step} de 6: {
              step === 1 ? "Tipo de reserva" :
              step === 2 && !shouldSkipToClient ? "Seleccionar servicio/clase" :
              step === 2.5 && shouldSkipToClient ? "Seleccionar cliente" :
              step === 3 && shouldSkipToClient && bookingType === "voucher" ? "Seleccionar tipo de bono" :
              step === 3 && shouldSkipToClient && bookingType === "subscription" ? "Suscripciones activas del cliente" :
              step === 3 && !shouldSkipToClient && bookingType === "service" ? "Seleccionar cliente" :
              step === 3 && !shouldSkipToClient && bookingType === "class" ? "Ubicación y profesional" :
              step === 3.5 && shouldSkipToClient && bookingType === "voucher" ? "¿Usar existente o comprar?" :
              step === 3.5 && shouldSkipToClient && bookingType === "subscription" ? "Seleccionar plan de suscripción" :
              step === 4 && shouldSkipToClient ? "Ubicación y profesional" :
              step === 4 && !shouldSkipToClient && bookingType === "service" ? "Seleccionar hora y profesional" :
              step === 4 && !shouldSkipToClient && bookingType === "class" ? "Fecha y hora" :
              step === 5 && shouldSkipToClient ? "Fecha y hora" :
              step === 5 && !shouldSkipToClient ? "Cliente" :
              "Método de pago"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Type Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <Label>Tipo de reserva</Label>
              <div className="grid grid-cols-2 gap-4">
                <Card
                  className={`cursor-pointer transition-all ${
                    bookingType === "service" ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setBookingType("service")}
                >
                  <CardContent className="p-6 text-center">
                    <h3 className="font-semibold mb-2">Servicio</h3>
                    <p className="text-sm text-muted-foreground">
                      Reserva individual con profesional
                    </p>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer transition-all ${
                    bookingType === "class" ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setBookingType("class")}
                >
                  <CardContent className="p-6 text-center">
                    <h3 className="font-semibold mb-2">Clase</h3>
                    <p className="text-sm text-muted-foreground">
                      Clase grupal con capacidad
                    </p>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer transition-all ${
                    bookingType === "voucher" ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setBookingType("voucher")}
                >
                  <CardContent className="p-6 text-center">
                    <h3 className="font-semibold mb-2">Bono</h3>
                    <p className="text-sm text-muted-foreground">
                      Crear bono para el cliente
                    </p>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer transition-all ${
                    bookingType === "subscription" ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setBookingType("subscription")}
                >
                  <CardContent className="p-6 text-center">
                    <h3 className="font-semibold mb-2">Suscripción</h3>
                    <p className="text-sm text-muted-foreground">
                      Crear suscripción para el cliente
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button onClick={() => {
                  if (shouldSkipToClient) {
                    setStep(2.5); // Go to client selection first for vouchers/subscriptions
                  } else {
                    setStep(2); // Go to entity selection for services/classes
                  }
                }} disabled={!canProceedToStep2}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Entity Selection - Only for services/classes */}
          {step === 2 && !shouldSkipToClient && (
            <div className="space-y-4">
              <Label>
                Seleccione {bookingType === "service" ? "un servicio" : "una clase"}
              </Label>
              {entityLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Select value={selectedEntityId || ""} onValueChange={setSelectedEntityId}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Seleccionar ${bookingType === "service" ? "servicio" : "clase"}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {bookingType === "service" && services.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>
                        {entity.name} - {entity.duration_min} min - {entity.price} {entity.currency}
                      </SelectItem>
                    ))}
                    {bookingType === "class" && classes.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>
                        {entity.name} - {entity.duration_min} min - {entity.price} {entity.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button onClick={() => setStep(3)} disabled={!canProceedToStep3}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Step 2.5: Client Selection - Only for vouchers/subscriptions */}
          {step === 2.5 && shouldSkipToClient && (
            <div className="space-y-4">
              <div>
                <Label>Buscar cliente existente</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por email o nombre..."
                    value={clientSearch}
                    onChange={(e) => handleClientSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                {searchResults.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {searchResults.map((user) => (
                      <Card
                        key={user.id}
                        className={`cursor-pointer transition-all ${
                          selectedClient?.id === user.id ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => {
                          setSelectedClient(user);
                          setSearchResults([]);
                          setClientSearch("");
                        }}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {selectedClient && (
                <Card className="bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{selectedClient.name}</p>
                        <p className="text-sm text-muted-foreground">{selectedClient.email}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedClient(null)}
                      >
                        Cambiar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="border-t pt-4">
                <Label>O crear nuevo cliente</Label>
                <div className="space-y-2 mt-2">
                  <Input
                    placeholder="Nombre completo"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email"
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => {
                        setNewClientEmail(e.target.value);
                        // Clear generated internal email if user starts typing
                        if (generatedInternalEmail) setGeneratedInternalEmail("");
                      }}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={generateInternalEmail}
                      type="button"
                    >
                      Sin email
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">+34</span>
                    <Input
                      placeholder="Teléfono (opcional)"
                      type="tel"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCreateNewClient}
                    disabled={creatingNewClient || (!newClientEmail && !generatedInternalEmail) || !newClientName}
                  >
                    {creatingNewClient && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Crear Cliente
                  </Button>
                </div>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button onClick={() => setStep(3)} disabled={!canProceedToStep6}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Show active vouchers for the client */}
          {step === 3 && shouldSkipToClient && bookingType === "voucher" && (
            <div className="space-y-4">
              <Label>Bonos activos del cliente</Label>
              
              {loadingUserAssets ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : userVouchers.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {userVouchers.map((voucher) => (
                      <Card 
                        key={voucher.id} 
                        className={`cursor-pointer transition-all ${
                          selectedVoucherId === voucher.id ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => {
                          setSelectedVoucherId(voucher.id);
                          setSelectedEntityId(voucher.voucher_types.id);
                          setVoucherSubscriptionDecision('existing');
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{voucher.voucher_types?.name}</h4>
                                <Badge variant="default">Activo</Badge>
                              </div>
                              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                <p>
                                  <strong>Usadas:</strong> {(voucher.voucher_types?.sessions_count || 0) - (voucher.sessions_remaining || 0)} / <strong>Restantes:</strong> {voucher.sessions_remaining || 0}
                                </p>
                                {voucher.expiry_date && (
                                  <p>
                                    <strong>Válido hasta:</strong>{" "}
                                    {format(new Date(voucher.expiry_date), "dd/MM/yyyy")}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <div className="flex justify-between gap-2">
                    <Button variant="outline" onClick={() => setStep(2.5)}>
                      Atrás
                    </Button>
                    <Button 
                      onClick={() => setStep(4)} 
                      disabled={!selectedVoucherId}
                    >
                      Siguiente
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Card className="bg-muted/30">
                    <CardContent className="p-6 text-center">
                      <p className="text-muted-foreground mb-4">
                        Este cliente no tiene bonos activos.
                      </p>
                      <Button 
                        onClick={() => {
                          setVoucherSubscriptionDecision('new');
                          setStep(3.5); // Go to voucher type selection
                        }}
                        className="w-full"
                      >
                        Comprar bono
                      </Button>
                    </CardContent>
                  </Card>
                  <div className="flex justify-start gap-2">
                    <Button variant="outline" onClick={() => setStep(2.5)}>
                      Atrás
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Show active subscriptions for the client */}
          {step === 3 && shouldSkipToClient && bookingType === "subscription" && (
            <div className="space-y-4">
              <Label>Suscripciones activas del cliente</Label>
              
              {loadingUserAssets ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : userSubscriptions.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {userSubscriptions.map((sub) => (
                      <Card 
                        key={sub.id} 
                        className={`cursor-pointer transition-all ${
                          selectedSubscriptionId === sub.id ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => {
                          setSelectedSubscriptionId(sub.id);
                          setSelectedEntityId(sub.plan_id);
                          setVoucherSubscriptionDecision('existing');
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              {sub.categoryName && (
                                <p className="text-sm text-muted-foreground mb-1">{sub.categoryName}</p>
                              )}
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{sub.subscription_plans?.name}</h4>
                                <Badge variant="default">Activa</Badge>
                              </div>
                              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                {(() => {
                                  const cycleText = sub.subscription_plans?.cycle === "monthly" ? "mes" : sub.subscription_plans?.cycle === "weekly" ? "semana" : "año";
                                  const included = sub.subscription_plans?.cap_per_cycle ?? sub.subscription_plans?.sessions_count;
                                  if (included != null) {
                                    return (
                                      <>
                                        <p>
                                          Incluye {included} sesiones por {cycleText}
                                        </p>
                                        <p>
                                          <strong>Usadas:</strong> {sub.usedSessions || 0} / <strong>Restantes:</strong> {sub.remainingSessions ?? 0}
                                        </p>
                                      </>
                                    );
                                  }
                                  return <p><strong>Sesiones ilimitadas</strong> en este periodo</p>;
                                })()}
                                <p>
                                  <strong>Próxima renovación:</strong>{" "}
                                  {format(new Date(sub.next_billing_date), "dd/MM/yyyy")}
                                </p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <div className="flex justify-between gap-2">
                    <Button variant="outline" onClick={() => setStep(2.5)}>
                      Atrás
                    </Button>
                    <Button 
                      onClick={() => setStep(4)} 
                      disabled={!selectedSubscriptionId}
                    >
                      Siguiente
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Card className="bg-muted/30">
                    <CardContent className="p-6 text-center">
                      <p className="text-muted-foreground mb-4">
                        Este cliente no tiene suscripciones activas.
                      </p>
                      <Button 
                        onClick={() => {
                          setVoucherSubscriptionDecision('new');
                          setStep(3.5); // Go to plan selection
                        }}
                        className="w-full"
                      >
                        Crear suscripción
                      </Button>
                    </CardContent>
                  </Card>
                  <div className="flex justify-start gap-2">
                    <Button variant="outline" onClick={() => setStep(2.5)}>
                      Atrás
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Location & Professional - Only for services/classes */}
          {step === 3 && !shouldSkipToClient && bookingType === "service" && (
            <div className="space-y-4">
              <div>
                <Label>Cliente</Label>
                <div>
                  <Label>Buscar cliente existente</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por email o nombre..."
                      value={clientSearch}
                      onChange={(e) => handleClientSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  {searchResults.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {searchResults.map((user) => (
                        <Card
                          key={user.id}
                          className={`cursor-pointer transition-all ${
                            selectedClient?.id === user.id ? "ring-2 ring-primary" : ""
                          }`}
                          onClick={() => {
                            setSelectedClient(user);
                            setSearchResults([]);
                            setClientSearch("");
                          }}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <div>
                                <p className="font-medium">{user.name}</p>
                                <p className="text-sm text-muted-foreground">{user.email}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {selectedClient && (
                  <Card className="bg-primary/5 mt-2">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{selectedClient.name}</p>
                          <p className="text-sm text-muted-foreground">{selectedClient.email}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedClient(null)}
                        >
                          Cambiar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="border-t pt-4 mt-4">
                  <Label>O crear nuevo cliente</Label>
                  <div className="space-y-2 mt-2">
                    <Input
                      placeholder="Nombre completo"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Email"
                        type="email"
                        value={newClientEmail}
                        onChange={(e) => {
                          setNewClientEmail(e.target.value);
                          // Clear generated internal email if user starts typing
                          if (generatedInternalEmail) setGeneratedInternalEmail("");
                        }}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        onClick={generateInternalEmail}
                        type="button"
                      >
                        Sin email
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">+34</span>
                      <Input
                        placeholder="Teléfono (opcional)"
                        type="tel"
                        value={newClientPhone}
                        onChange={(e) => setNewClientPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                      />
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleCreateNewClient}
                      disabled={creatingNewClient || (!newClientEmail && !generatedInternalEmail) || !newClientName}
                    >
                      {creatingNewClient && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Crear Cliente
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Atrás
                </Button>
                <Button onClick={() => setStep(4)} disabled={!selectedClient}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Location & Professional - For classes only */}
          {step === 3 && !shouldSkipToClient && bookingType === "class" && (
            <div className="space-y-4">
              <div>
                <Label>Ubicación</Label>
                <Select value={selectedLocationId || ""} onValueChange={(value) => {
                  setSelectedLocationId(value);
                  const loc = locations.find(l => l.id === value);
                  if (loc) setLocationTz(loc.timezone || "Europe/Madrid");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Atrás
                </Button>
                <Button onClick={() => setStep(4)} disabled={!selectedLocationId}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Location & Professional - For vouchers/subscriptions using existing */}
          {step === 4 && shouldSkipToClient && voucherSubscriptionDecision === 'existing' && (
            <div className="space-y-4">
              <div>
                <Label>Ubicación</Label>
                <Select value={selectedLocationId || ""} onValueChange={(value) => {
                  setSelectedLocationId(value);
                  const loc = locations.find(l => l.id === value);
                  if (loc) setLocationTz(loc.timezone || "Europe/Madrid");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Profesional</Label>
                <Select value={selectedProfessionalId || ""} onValueChange={setSelectedProfessionalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar profesional" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        {prof.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStep(3)}>
                  Atrás
                </Button>
                <Button onClick={() => setStep(5)} disabled={!canProceedToStep4}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Multi-professional slot selection - For services only */}
          {step === 4 && !shouldSkipToClient && bookingType === "service" && selectedEntityId && selectedClient && (
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Ubicación</Label>
                <Select value={selectedLocationId || ""} onValueChange={(value) => {
                  setSelectedLocationId(value);
                  const loc = locations.find(l => l.id === value);
                  if (loc) setLocationTz(loc.timezone || "Europe/Madrid");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedLocationId && (
                <ServiceMultiProfessionalSlots
                  serviceId={selectedEntityId}
                  locationId={selectedLocationId}
                  onSlotSelected={(slot, date) => {
                    setSelectedProfessionalId(slot.professionalId);
                    setSelectedDate(date);
                    setSelectedTime(slot.time);
                    setStep(6); // Skip payment step if already set, go to confirm
                  }}
                  onBack={() => setStep(3)}
                />
              )}
            </div>
          )}

          {/* Step 4: Date & Time - For classes only */}
          {step === 4 && !shouldSkipToClient && bookingType === "class" && (
            <div className="space-y-4">
              <div>
                <Label>Fecha</Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={es}
                  disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return date < today || !isDateAvailable(date);
                  }}
                  className="rounded-md border"
                />
              </div>

               {selectedDate && availableSlots.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Hora disponible</Label>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="toggle-available-class" className="text-xs text-muted-foreground cursor-pointer">Solo libres</Label>
                      <Switch id="toggle-available-class" checked={showOnlyAvailable} onCheckedChange={setShowOnlyAvailable} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {availableSlots.filter(slot => !isSlotInPast(slot.time, selectedDate)).map((slot) => {
                      const isFull = slot.remainingSlots <= 0;
                      const isAlmostFull = slot.remainingSlots <= 2 && slot.remainingSlots > 0;
                      const isSelected = selectedTime === slot.time;
                      
                      return (
                        <Button
                          key={slot.time}
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedTime(slot.time)}
                          disabled={isFull}
                          className={`
                            group relative w-full flex items-center justify-between gap-2 py-3 px-3
                            transition-all duration-200 hover:scale-[1.02]
                            ${isSelected 
                              ? 'border-primary bg-primary text-primary-foreground shadow-md scale-[1.02]' 
                              : isFull 
                                ? 'border-destructive/30 bg-destructive/5 text-destructive/60 cursor-not-allowed opacity-50' 
                                : isAlmostFull 
                                  ? 'border-orange-400/60 bg-orange-50 hover:bg-orange-100 hover:border-orange-500 text-orange-800'
                                  : 'hover:border-primary/50 hover:bg-accent'
                            }
                          `}
                        >
                          <div className="flex items-center gap-1.5">
                            <Clock className={`h-3.5 w-3.5 ${isSelected ? 'opacity-100' : 'opacity-70'}`} />
                            <span className="font-semibold text-sm">{slot.time}</span>
                          </div>
                          <div className={`
                            flex items-center gap-1 text-xs font-medium whitespace-nowrap
                            ${isSelected 
                              ? 'opacity-90' 
                              : isFull 
                                ? 'text-destructive/70' 
                                : isAlmostFull 
                                  ? 'text-orange-700'
                                  : 'text-muted-foreground'
                            }
                          `}>
                            {isFull ? (
                              <span>Completo</span>
                            ) : (
                              <>
                                <span className="font-bold">{slot.remainingSlots}</span>
                                <span>/</span>
                                <span>{slot.capacity}</span>
                              </>
                            )}
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedDate && availableSlots.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay horarios disponibles para esta fecha
                </p>
              )}

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStep(voucherSubscriptionDecision === 'existing' ? 4 : 3)}>
                  Atrás
                </Button>
                <Button onClick={() => setStep(5)} disabled={!canProceedToStep5}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Date & Time - For vouchers/subscriptions using existing */}
          {step === 5 && shouldSkipToClient && voucherSubscriptionDecision === 'existing' && (
            <div className="space-y-4">
              <div>
                <Label>Fecha</Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={es}
                  disabled={(date) => {
                    const today = startOfDay(new Date());
                    const checkDate = startOfDay(date);
                    return checkDate < today || !isDateAvailable(date);
                  }}
                  className="rounded-md border"
                />
              </div>

              {selectedDate && availableSlots.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Hora disponible</Label>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="toggle-available-service" className="text-xs text-muted-foreground cursor-pointer">Solo libres</Label>
                      <Switch id="toggle-available-service" checked={showOnlyAvailable} onCheckedChange={setShowOnlyAvailable} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {availableSlots.filter(slot => !isSlotInPast(slot.time, selectedDate)).map((slot) => {
                      const hasCapacity = 'remainingSlots' in slot && slot.remainingSlots !== undefined;
                      const isOutOfCapacity = hasCapacity && slot.remainingSlots === 0;
                      const isOccupied = !slot.available;
                      
                      return (
                        <Button
                          key={slot.time}
                          variant={selectedTime === slot.time ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedTime(slot.time)}
                          className={`w-full flex-col h-auto py-2 ${
                            isOccupied ? 'border-orange-500 bg-orange-50 hover:bg-orange-100 text-orange-700' : ''
                          }`}
                          disabled={isOutOfCapacity}
                          title={isOutOfCapacity ? "Sin plazas disponibles" : isOccupied ? "Slot ocupado - Se pedirá confirmación" : undefined}
                        >
                          <div className="flex items-center gap-1">
                            {isOccupied && <span className="text-xs">⚠️</span>}
                            <Clock className="h-4 w-4" />
                            <span>{slot.time}</span>
                          </div>
                          {isOccupied && (
                            <span className="text-xs mt-1">(Ocupado)</span>
                          )}
                          {hasCapacity && !isOccupied && (
                            <span className="text-xs text-muted-foreground mt-1">
                              {isOutOfCapacity ? 'Sin plazas' : `${slot.remainingSlots} plazas`}
                            </span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedDate && availableSlots.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay horarios disponibles para esta fecha
                </p>
              )}

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStep(4)}>
                  Atrás
                </Button>
                <Button 
                  onClick={() => {
                    // If using existing voucher/subscription, create booking directly
                    if (voucherSubscriptionDecision === 'existing') {
                      if (bookingType === 'voucher') {
                        handleCreateBookingWithVoucher();
                      } else if (bookingType === 'subscription') {
                        handleCreateBookingWithSubscription();
                      }
                    } else {
                      // Normal flow: go to payment step
                      setStep(6);
                    }
                  }} 
                  disabled={!canProceedToStep5 || loading}
                >
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {voucherSubscriptionDecision === 'existing' ? 'Crear Reserva' : 'Siguiente'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Client - Only for services/classes */}
          {step === 5 && !shouldSkipToClient && (
            <div className="space-y-4">
              <div>
                <Label>Buscar cliente existente</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por email o nombre..."
                    value={clientSearch}
                    onChange={(e) => handleClientSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                {searchResults.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {searchResults.map((user) => (
                      <Card
                        key={user.id}
                        className={`cursor-pointer transition-all ${
                          selectedClient?.id === user.id ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => {
                          setSelectedClient(user);
                          setSearchResults([]);
                          setClientSearch("");
                        }}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {selectedClient && (
                <Card className="bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{selectedClient.name}</p>
                        <p className="text-sm text-muted-foreground">{selectedClient.email}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedClient(null)}
                      >
                        Cambiar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="border-t pt-4">
                <Label>O crear nuevo cliente</Label>
                <div className="space-y-2 mt-2">
                  <Input
                    placeholder="Nombre completo"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email"
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => {
                        setNewClientEmail(e.target.value);
                        // Clear generated internal email if user starts typing
                        if (generatedInternalEmail) setGeneratedInternalEmail("");
                      }}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={generateInternalEmail}
                      type="button"
                    >
                      Sin email
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">+34</span>
                    <Input
                      placeholder="Teléfono (opcional)"
                      type="tel"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCreateNewClient}
                    disabled={creatingNewClient || (!newClientEmail && !generatedInternalEmail) || !newClientName}
                  >
                    {creatingNewClient && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Crear Cliente
                  </Button>
                </div>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStep(4)}>
                  Atrás
                </Button>
                <Button 
                  onClick={() => setStep(6)} 
                  disabled={!canProceedToStep6}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Step 3.5: Plan/Voucher Type selection when creating new */}
          {step === 3.5 && shouldSkipToClient && (
            <div className="space-y-4">
              {bookingType === "subscription" && voucherSubscriptionDecision === 'new' ? (
                /* Plan selection for new subscription */
                <>
                  <Label className="text-lg font-semibold mb-3 block">Planes de Suscripción</Label>
                  {entityLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
                      {(() => {
                        // Agrupar por suscripción (plan padre)
                        type SubscriptionType = typeof subscriptions[number];

                        const parents = (subscriptions as SubscriptionType[])
                          .filter((s) => !s.parent_plan_id)
                          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

                        const childrenByParent: Record<string, SubscriptionType[]> = {};
                        (subscriptions as SubscriptionType[]).forEach((s) => {
                          if (s.parent_plan_id) {
                            if (!childrenByParent[s.parent_plan_id]) childrenByParent[s.parent_plan_id] = [];
                            childrenByParent[s.parent_plan_id].push(s);
                          }
                        });

                        return parents.map((parent) => {
                          const plans = (childrenByParent[parent.id] || []) as SubscriptionType[];
                          const first = plans[0] ?? parent;
                          const cycleText = first.cycle === "monthly" ? "Mensual" : first.cycle === "weekly" ? "Semanal" : "Anual";

                          return (
                            <Card key={parent.id} className="border-2 border-muted">
                              <CardContent className="p-5">
                                {/* Título de la suscripción */}
                                <div className="mb-4 pb-3 border-b">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-xl font-bold text-foreground">{parent.name}</h3>
                                    <Badge variant="default" className="bg-primary">Activo</Badge>
                                    <Badge variant="outline">{plans.length || 1} Packs</Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    Ciclo: <span className="font-medium text-foreground">{cycleText}</span>
                                  </p>
                                </div>

                                {/* Planes dentro de la suscripción */}
                                <div>
                                  <p className="text-sm font-semibold text-muted-foreground mb-3">Packs Disponibles</p>
                                  <div className="space-y-2">
                                    {(plans.length ? plans : [parent]).map((plan) => {
                                      const planName = plan.parent_plan_id ? plan.name : parent.name;
                                      const isSelected = selectedEntityId === plan.id;

                                      return (
                                        <Card
                                          key={plan.id}
                                          className={`cursor-pointer transition-all hover:shadow-md ${
                                            isSelected ? "border-2 border-primary bg-primary/10 shadow-sm" : "border border-border hover:border-primary/50"
                                          }`}
                                          onClick={() => setSelectedEntityId(plan.id)}
                                        >
                                          <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-3">
                                                <span className="text-base font-semibold text-foreground">{planName}</span>
                                                {plan.parent_plan_id && (
                                                  <Badge variant="secondary" className="text-xs">
                                                    {planName.toLowerCase()}
                                                  </Badge>
                                                )}
                                              </div>
                                              <div className="text-right">
                                                {plan.sessions_count != null && (
                                                  <p className="text-sm text-muted-foreground">{plan.sessions_count} sesiones</p>
                                                )}
                                                <p className="text-lg font-bold text-foreground">
                                                  {plan.price} {plan.currency}
                                                </p>
                                              </div>
                                            </div>
                                          </CardContent>
                                        </Card>
                                      );
                                    })}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        });
                      })()}
                    </div>
                  )}
                  
                  {selectedEntityId && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <input
                            type="checkbox"
                            id="reserveAfter"
                            checked={reserveAfterPurchase}
                            onChange={(e) => setReserveAfterPurchase(e.target.checked)}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="reserveAfter" className="text-sm cursor-pointer">
                            Reservar después de comprar
                          </Label>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  <div className="flex justify-between gap-2">
                    <Button variant="outline" onClick={() => {
                      setVoucherSubscriptionDecision(null);
                      setSelectedEntityId(null);
                      setStep(3);
                    }}>
                      Atrás
                    </Button>
                    <Button 
                      onClick={() => setStep(6)} 
                      disabled={!selectedEntityId}
                    >
                      Siguiente
                    </Button>
                  </div>
                </>
              ) : bookingType === "voucher" && voucherSubscriptionDecision === 'new' ? (
                /* Voucher type selection for new voucher */
                <>
                  <Label>Seleccione un tipo de bono</Label>
                  {entityLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <Select value={selectedEntityId || ""} onValueChange={setSelectedEntityId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar bono" />
                      </SelectTrigger>
                      <SelectContent>
                        {vouchers.map((entity) => (
                          <SelectItem key={entity.id} value={entity.id}>
                            {entity.name} - {entity.sessions_count} sesiones - {entity.price} {entity.currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  
                  {selectedEntityId && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <input
                            type="checkbox"
                            id="reserveAfter"
                            checked={reserveAfterPurchase}
                            onChange={(e) => setReserveAfterPurchase(e.target.checked)}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="reserveAfter" className="text-sm cursor-pointer">
                            Reservar después de comprar
                          </Label>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  <div className="flex justify-between gap-2">
                    <Button variant="outline" onClick={() => {
                      setVoucherSubscriptionDecision(null);
                      setSelectedEntityId(null);
                      setStep(3);
                    }}>
                      Atrás
                    </Button>
                    <Button 
                      onClick={() => setStep(6)} 
                      disabled={!selectedEntityId}
                    >
                      Siguiente
                    </Button>
                  </div>
                </>
              ) : (
                /* Original voucher/subscription decision flow - Should not happen with new flow */
                <></>
              )}
            </div>
          )}

          {/* Step 6: Payment */}
          {step === 6 && (
            <div className="space-y-4">
              <Label>Método de pago</Label>
              <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta (pendiente)</SelectItem>
                  <SelectItem value="none">Sin pago</SelectItem>
                </SelectContent>
              </Select>

              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-2 text-sm">
                  <h4 className="font-semibold">Resumen</h4>
                  <div className="space-y-1">
                    {voucherSubscriptionDecision === 'existing' && bookingType === 'voucher' ? (
                      <>
                        <p><strong>Tipo:</strong> Reserva con Bono</p>
                        <p><strong>Bono:</strong> {userVouchers.find(v => v.id === selectedVoucherId)?.voucher_types?.name}</p>
                        <p><strong>Sesiones restantes:</strong> {userVouchers.find(v => v.id === selectedVoucherId)?.sessions_remaining}</p>
                        <p><strong>Fecha:</strong> {selectedDate ? format(selectedDate, "dd 'de' MMMM, yyyy", { locale: es }) : ""}</p>
                        <p><strong>Hora:</strong> {selectedTime}</p>
                        <p><strong>Cliente:</strong> {selectedClient?.name}</p>
                      </>
                    ) : voucherSubscriptionDecision === 'existing' && bookingType === 'subscription' ? (
                      <>
                        <p><strong>Tipo:</strong> Reserva con Suscripción</p>
                        <p><strong>Plan:</strong> {userSubscriptions.find(s => s.id === selectedSubscriptionId)?.subscription_plans?.name}</p>
                        <p><strong>Fecha:</strong> {selectedDate ? format(selectedDate, "dd 'de' MMMM, yyyy", { locale: es }) : ""}</p>
                        <p><strong>Hora:</strong> {selectedTime}</p>
                        <p><strong>Cliente:</strong> {selectedClient?.name}</p>
                      </>
                    ) : voucherSubscriptionDecision === 'new' ? (
                      <>
                        <p><strong>Tipo:</strong> {bookingType === "voucher" ? "Compra de Bono" : "Compra de Suscripción"}</p>
                        <p><strong>{bookingType === "voucher" ? "Bono" : "Plan"}:</strong> {selectedEntity?.name}</p>
                        <p><strong>Cliente:</strong> {selectedClient?.name}</p>
                        <p><strong>Precio:</strong> {selectedEntity?.price} {selectedEntity?.currency}</p>
                        <p><strong>Método de pago:</strong> {
                          paymentMethod === "cash" ? "Efectivo" :
                          paymentMethod === "card" ? "Tarjeta (pendiente)" :
                          "Sin pago"
                        }</p>
                        {reserveAfterPurchase && (
                          <p className="text-blue-600"><strong>⚠️ Se continuará con la reserva después de la compra</strong></p>
                        )}
                      </>
                    ) : (
                      <>
                        <p><strong>Tipo:</strong> {bookingType === "service" ? "Servicio" : "Clase"}</p>
                        <p><strong>Servicio/Clase:</strong> {selectedEntity?.name}</p>
                        <p><strong>Fecha:</strong> {selectedDate ? format(selectedDate, "dd 'de' MMMM, yyyy", { locale: es }) : ""}</p>
                        <p><strong>Hora:</strong> {selectedTime}</p>
                        <p><strong>Cliente:</strong> {selectedClient?.name}</p>
                        <p><strong>Precio:</strong> {selectedEntity?.price} {selectedEntity?.currency}</p>
                        <p><strong>Método de pago:</strong> {
                          paymentMethod === "cash" ? "Efectivo" :
                          paymentMethod === "card" ? "Tarjeta (pendiente)" :
                          "Sin pago"
                        }</p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => {
                  if (voucherSubscriptionDecision === 'existing') {
                    setStep(5); // Back to date/time for vouchers/subs
                  } else if (voucherSubscriptionDecision === 'new' && bookingType === 'subscription') {
                    setStep(3.5); // Back to plan selection for subscriptions
                  } else if (voucherSubscriptionDecision === 'new' && bookingType === 'voucher') {
                    setStep(3.5); // Back to decision for vouchers
                  } else {
                    setStep(5); // Back to client for services/classes
                  }
                }}>
                  Atrás
                </Button>
                <Button 
                  onClick={() => {
                    if (voucherSubscriptionDecision === 'new') {
                      // Buying new voucher/subscription
                      handleCreateVoucherOrSubscription();
                    } else if (voucherSubscriptionDecision === 'existing' && bookingType === 'voucher') {
                      // Using existing voucher
                      handleCreateBookingWithVoucher();
                    } else if (voucherSubscriptionDecision === 'existing' && bookingType === 'subscription') {
                      // Using existing subscription
                      handleCreateBookingWithSubscription();
                    } else {
                      // Normal service/class booking
                      handleCreateBooking();
                    }
                  }} 
                  disabled={loading}
                >
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {voucherSubscriptionDecision === 'new' && !reserveAfterPurchase
                    ? `Crear ${bookingType === 'voucher' ? 'Bono' : 'Suscripción'}`
                    : 'Crear Reserva'
                  }
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      <OverbookingConfirmModal
        isOpen={showOverbookingModal}
        onClose={() => {
          setShowOverbookingModal(false);
          setPendingBookingData(null);
          setPendingPostInsertActions(null);
          setConflictingBookings([]);
        }}
        onConfirm={handleConfirmOverbooking}
        conflictingBookings={conflictingBookings}
        isLoading={loading}
      />
    </Dialog>
  );
}
