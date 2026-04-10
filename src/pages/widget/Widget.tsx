import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, MapPin, ChevronRight, Clock, Ticket, RotateCcw, CheckCircle2, Repeat, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BookingCalendar from "@/components/widget/BookingCalendar";
import BookingConfirmation from "@/components/widget/BookingConfirmation";
import BookingSuccess from "@/components/widget/BookingSuccess";
import VoucherDetailView from "@/components/widget/VoucherDetailView";
import VoucherBookingCalendar from "@/components/widget/VoucherBookingCalendar";
import VoucherPurchase from "@/components/widget/VoucherPurchase";
import VoucherPaymentOption from "@/components/widget/VoucherPaymentOption";
import VoucherSuccessMessage from "@/components/widget/VoucherSuccessMessage";
import UserAccount from "@/components/widget/UserAccount";
import WidgetAuth from "@/components/widget/WidgetAuth";
import UserSubscriptions from "@/components/widget/UserSubscriptions";
import UserVoucherDetail from "@/components/widget/UserVoucherDetail";
import SubscriptionSummary from "@/components/widget/SubscriptionSummary";
import SubscriptionCheck from "@/components/widget/SubscriptionCheck";
import SubscriptionPurchase from "@/components/widget/SubscriptionPurchase";
import SubscriptionSuccessMessage from "@/components/widget/SubscriptionSuccessMessage";
import SubscriptionSelector from "@/components/widget/SubscriptionSelector";
import { usePublicVouchers, useUserVouchers, useVoucherEligibility, VoucherType, UserVoucher } from "@/hooks/useVouchers";
import { usePublicSubscriptionPlans, useUserSubscriptions, useSubscriptionEligibility, SubscriptionPlan, UserSubscription } from "@/hooks/useSubscriptions";
import { useSubscriptionFlow, SubscriptionFlow } from "@/hooks/useSubscriptionFlow";
import VoucherCheck from "@/components/widget/VoucherCheck";
import VoucherSuccess from "@/components/widget/VoucherSuccess";
import SubscriptionSuccess from "@/components/widget/SubscriptionSuccess";
import { useWidgetSettings } from "@/hooks/useWidgetSettings";
import { useLocationHours } from "@/hooks/useLocationHours";
import { getDefaultLocation } from "@/lib/default-location";
import { useToast } from "@/hooks/use-toast";
import { calculateVoucherBalance } from '@/lib/voucher-utils';
import { getVoucherAllowedServices, persistVoucherFlow } from '@/lib/voucher-flow-utils';
import { useOrganization } from '@/hooks/useOrganization';

interface Professional {
  id: string;
  name: string;
  specialty?: string;
  color: string;
  photo_url?: string;
  active?: boolean;
}

interface Category {
  id: string;
  name: string;
  description?: string;
  icon_url?: string;
  type?: string;
  sort_order?: number;
  active?: boolean;
}

interface Service {
  id: string;
  name: string;
  description?: string;
  duration_min: number;
  price: number;
  category: string;
  category_id?: string;
  photo_url?: string;
  currency?: string;
  active?: boolean;
  professionals?: Professional[];
}

interface Class {
  id: string;
  name: string;
  description?: string;
  duration_min: number;
  price: number;
  capacity: number;
  active?: boolean;
  category_id?: string;
  photo_url?: string;
  professionals?: Professional[];
}

interface ClassSession {
  id: string;
  class_id: string;
  start_at: string;
  end_at: string;
  professional_id: string;
  location_id: string;
  capacity: number;
}

export default function Widget() {
  const { toast } = useToast();

  // Multi-tenant: leer slug de URL y cargar organizacion
  const slug = new URLSearchParams(window.location.search).get('slug');
  const { organization, loading: orgLoading } = useOrganization(slug);

  // Aplicar branding dinamico via CSS variables
  useEffect(() => {
    if (organization) {
      document.documentElement.style.setProperty('--widget-primary', organization.primary_color);
      document.documentElement.style.setProperty('--widget-secondary', organization.secondary_color);
    }
    return () => {
      document.documentElement.style.removeProperty('--widget-primary');
      document.documentElement.style.removeProperty('--widget-secondary');
    };
  }, [organization]);

  // Auth state
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Check for existing Supabase Auth session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthUserId(session.user.id);
      }
      setIsAuthChecking(false);
    });
  }, []);

  const [currentView, setCurrentView] = useState<'home' | 'location' | 'services' | 'categories' | 'service-detail' | 'class-detail' | 'calendar' | 'confirmation' | 'success' | 'bonos' | 'suscripciones' | 'mis-bonos' | 'mis-suscripciones' | 'subscription-detail' | 'voucher-detail' | 'voucher-calendar' | 'voucher-purchase' | 'voucher-payment' | 'voucher-check' | 'voucher-success' | 'stripe-voucher-success' | 'mi-cuenta' | 'subscription-summary' | 'subscription-check' | 'subscription-selector' | 'subscription-purchase' | 'exito-suscripcion' | 'subscription-success-message'>('home');
  const [initialAccountTab, setInitialAccountTab] = useState<string>('reservas');
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'treatments' | 'specialists' | 'plans'>('info');
  
  // Dynamic professionals state
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalsLoading, setProfessionalsLoading] = useState(true);
  const [professionalsError, setProfessionalsError] = useState<string | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  
  // Dynamic categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  
  // Classes state for category view
  const [classes, setClasses] = useState<Class[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classesError, setClassesError] = useState<string | null>(null);
  
  // Class sessions state
  const [classSessions, setClassSessions] = useState<ClassSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  
  // Cache for professionals (session-based)
  const [professionalsCache, setProfessionalsCache] = useState<{
    data: Professional[];
    timestamp: number;
  } | null>(null);

  // Cache for categories (session-based)
  const [categoriesCache, setCategoriesCache] = useState<{
    data: Category[];
    timestamp: number;
  } | null>(null);

  // Cache duration: 10 minutes
  const CACHE_DURATION = 10 * 60 * 1000;

  // Location state
  const [currentLocation, setCurrentLocation] = useState<{
    id: string;
    name: string;
    description?: string;
    address?: string;
    phone?: string;
    email?: string;
    photo_url?: string;
    business_hours?: any;
  } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  // User state (read from localStorage if available)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [upcomingBookingsCount, setUpcomingBookingsCount] = useState(0);
  
  // Calculated voucher balances for badge display
  const [voucherBalances, setVoucherBalances] = useState<Record<string, number>>({});

  // Load default location
  useEffect(() => {
    const loadLocation = async () => {
      try {
        setLocationLoading(true);
        const defaultLoc = await getDefaultLocation();
        if (defaultLoc) {
          // Fetch full location details
          let locationQuery = supabase
            .from('locations')
            .select('*')
            .eq('id', defaultLoc.id);
          if (organization?.id) {
            locationQuery = locationQuery.eq('organization_id', organization.id);
          }
          const { data: locationData } = await locationQuery.single();
          
          if (locationData) {
            setCurrentLocation(locationData);
            setSelectedLocationId(locationData.id);
          }
        }
      } catch (error) {
        console.error('[Widget] Error loading location:', error);
      } finally {
        setLocationLoading(false);
      }
    };

    loadLocation();
  }, []);

  // Load shadow user from localStorage to avoid invalid UUID queries
  useEffect(() => {
    try {
      const saved = localStorage.getItem('reservasPro_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.userShadowId) setCurrentUserId(parsed.userShadowId);
      }
    } catch (e) {
      console.warn('Failed to parse reservasPro_user from localStorage');
    }

    // Load voucher flow state
    try {
      const voucherFlowSaved = localStorage.getItem('reservasPro_voucherFlow');
      if (voucherFlowSaved) {
        const parsed = JSON.parse(voucherFlowSaved);
        
        // Validate userId match
        const userSaved = localStorage.getItem('reservasPro_user');
        if (userSaved && parsed.userId) {
          const userData = JSON.parse(userSaved);
          if (userData.userShadowId && parsed.userId !== userData.userShadowId) {
            console.warn('[Widget] userId mismatch in voucherFlow, clearing:', {
              voucherFlowUserId: parsed.userId,
              currentUserId: userData.userShadowId
            });
            localStorage.removeItem('reservasPro_voucherFlow');
            localStorage.removeItem('reservasPro_verifiedVoucherId');
            return;
          }
        }
        
        setVoucherFlow(parsed);
      }
    } catch (e) {
      console.warn('Failed to parse voucher flow from localStorage');
    }
  }, []);

  // Initialize hooks for vouchers and subscriptions
  const { vouchers: publicVouchers, loading: vouchersLoading } = usePublicVouchers();
  const { vouchers: userVouchers, loading: userVouchersLoading, refetch: refetchUserVouchers } = useUserVouchers(currentUserId || undefined);
  const { plans: publicPlans, loading: plansLoading } = usePublicSubscriptionPlans();
  const { subscriptions: userSubscriptions, loading: userSubscriptionsLoading, refetch: refetchUserSubscriptions } = useUserSubscriptions(currentUserId || undefined);
  const { subscriptionFlow, saveSubscriptionFlow, clearSubscriptionFlow } = useSubscriptionFlow();
  const { settings: widgetSettings } = useWidgetSettings();
  const { hours: locationHours } = useLocationHours(currentLocation?.id || null);

  // Calculate voucher balances when userVouchers change
  useEffect(() => {
    if (userVouchers.length > 0) {
      const calculateBalances = async () => {
        const balances: Record<string, number> = {};
        
        console.log(`[Widget] Calculating balances for ${userVouchers.length} vouchers`);
        
        for (const voucher of userVouchers) {
          try {
            const balance = await calculateVoucherBalance(voucher.id);
            balances[voucher.id] = balance.remaining;
            console.log(`[Widget] Voucher ${voucher.id} balance: ${balance.remaining}`);
          } catch (error) {
            console.error(`[Widget] Error calculating balance for ${voucher.id}:`, error);
            // Fallback to sessions_remaining
            balances[voucher.id] = voucher.sessions_remaining;
          }
        }
        
        setVoucherBalances(balances);
        const totalVoucherCredits = Object.values(balances).reduce((sum, v) => sum + v, 0);
        console.log(`[Widget] Updated voucher balances:`, balances, 'total=', totalVoucherCredits);
      };

      calculateBalances();
    } else {
      setVoucherBalances({});
      console.log('[Widget] No user vouchers, balances cleared');
    }
  }, [userVouchers]);

  // Fetch upcoming bookings count for badge
  useEffect(() => {
    if (!currentUserId) {
      setUpcomingBookingsCount(0);
      return;
    }
    const fetchUpcomingCount = async () => {
      try {
        const { count, error } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', currentUserId)
          .in('status', ['confirmed', 'pending'])
          .gte('start_at', new Date().toISOString());
        if (!error && count !== null) {
          setUpcomingBookingsCount(count);
        }
      } catch (e) {
        console.error('[Widget] Error fetching upcoming bookings count:', e);
      }
    };
    fetchUpcomingCount();
  }, [currentUserId, currentView]); // re-fetch when view changes (after booking/cancel)

  const hasRefetchedForMisBonos = useRef(false);

  // Refetch vouchers when navigating to "Mis bonos" view
  useEffect(() => {
    if (currentView === 'mis-bonos' && currentUserId && !hasRefetchedForMisBonos.current) {
      console.log('[Widget] Refetching user vouchers for mis-bonos view');
      hasRefetchedForMisBonos.current = true;
      refetchUserVouchers();
    }
    
    // Reset flag when leaving the view
    if (currentView !== 'mis-bonos') {
      hasRefetchedForMisBonos.current = false;
    }
  }, [currentView, currentUserId]);

  const totalVoucherCredits = Object.values(voucherBalances).reduce((sum, remaining) => sum + remaining, 0);
  console.log('[Widget] Badge credits', { voucherBalances, totalVoucherCredits });

  // Fetch professionals from database
  const fetchProfessionals = useCallback(async () => {
    try {
      setProfessionalsLoading(true);
      setProfessionalsError(null);

      // Check cache first
      if (professionalsCache && 
          Date.now() - professionalsCache.timestamp < CACHE_DURATION) {
        setProfessionals(professionalsCache.data);
        setProfessionalsLoading(false);
        return;
      }

      let proQuery = supabase
        .from('professionals')
        .select('id, name, photo_url, color, specialty, active')
        .eq('active', true);
      if (organization?.id) {
        proQuery = proQuery.eq('organization_id', organization.id);
      }
      const { data, error } = await proQuery
        .order('created_at', { ascending: true })
        .limit(6);

      if (error) {
        throw error;
      }

      const professionalData = data || [];
      setProfessionals(professionalData);
      
      // Update cache
      setProfessionalsCache({
        data: professionalData,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('Error fetching professionals:', error);
      setProfessionalsError('No se pudieron cargar los profesionales');
    } finally {
      setProfessionalsLoading(false);
    }
  }, [professionalsCache]);

  // Fetch categories from database
  const fetchCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      setCategoriesError(null);

      // Check cache first
      if (categoriesCache && 
          Date.now() - categoriesCache.timestamp < CACHE_DURATION) {
        setCategories(categoriesCache.data);
        setCategoriesLoading(false);
        return;
      }

      let catQuery = supabase
        .from('categories')
        .select('id, name, description, icon_url, type, sort_order, active')
        .eq('active', true);
      if (organization?.id) {
        catQuery = catQuery.eq('organization_id', organization.id);
      }
      const { data, error } = await catQuery
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      const categoryData = data || [];
      setCategories(categoryData);
      
      // Update cache
      setCategoriesCache({
        data: categoryData,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('Error fetching categories:', error);
      setCategoriesError('No se pudieron cargar los tratamientos');
    } finally {
      setCategoriesLoading(false);
    }
  }, [categoriesCache]);

  // Fetch classes for selected category
  const fetchClasses = useCallback(async (categoryId: string) => {
    try {
      setClassesLoading(true);
      setClassesError(null);

      // First get classes
      let clsQuery = supabase
        .from('classes')
        .select('id, name, description, duration_min, price, capacity, active, category_id, photo_url')
        .eq('category_id', categoryId)
        .eq('active', true);
      if (organization?.id) {
        clsQuery = clsQuery.eq('organization_id', organization.id);
      }
      const { data: classesData, error: classesError } = await clsQuery
        .order('name', { ascending: true });

      if (classesError) {
        throw classesError;
      }

      // Then get professionals for each class
      const classesWithProfessionals = await Promise.all(
        (classesData || []).map(async (classItem) => {
          const { data: classProfessionals, error: profError } = await supabase
            .from('class_professionals')
            .select(`
              professional_id,
              professionals (
                id,
                name,
                photo_url,
                specialty,
                color
              )
            `)
            .eq('class_id', classItem.id);

          if (profError) {
            console.error('Error fetching professionals for class:', profError);
          }

          return {
            ...classItem,
            professionals: classProfessionals?.map(cp => cp.professionals).filter(Boolean) || []
          };
        })
      );

      setClasses(classesWithProfessionals);

      // Fetch upcoming sessions for these classes
      if (classesWithProfessionals.length > 0) {
        const classIds = classesWithProfessionals.map(c => c.id);
        await fetchClassSessions(classIds);
      }
      
    } catch (error) {
      console.error('Error fetching classes:', error);
      setClassesError('No se pudieron cargar las clases');
    } finally {
      setClassesLoading(false);
    }
  }, []);

  // Fetch upcoming sessions for classes
  const fetchClassSessions = useCallback(async (classIds: string[]) => {
    try {
      setSessionsLoading(true);

      const { data, error } = await supabase
        .from('class_sessions')
        .select('id, class_id, start_at, end_at, professional_id, location_id, capacity')
        .in('class_id', classIds)
        .gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(20);

      if (error) {
        throw error;
      }

      setClassSessions(data || []);
      
    } catch (error) {
      console.error('Error fetching class sessions:', error);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  // Clear classes state
  const clearClassesState = useCallback(() => {
    setClasses([]);
    setClassesLoading(false);
    setClassesError(null);
    setClassSessions([]);
    setSessionsLoading(false);
  }, []);

  // Services state
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  
  // Selected service/class for detail view
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [servicesCache, setServicesCache] = useState<Record<string, { data: Service[]; timestamp: number }>>({});
  const [classesCache, setClassesCache] = useState<Record<string, { data: Class[]; timestamp: number }>>({});
  const [vouchersCache, setVouchersCache] = useState<Record<string, { data: any[]; timestamp: number }>>({});
  
  // Voucher success state
  const [purchasedVoucherType, setPurchasedVoucherType] = useState<{ name: string; sessions_count: number } | null>(null);
  
  // Selected subscription plan for navigation
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  
  // Booking params for confirmation screen
  const [bookingParams, setBookingParams] = useState<{
    serviceId: string | null;
    classId?: string | null;
    professionalId: string | null;
    locationId?: string | null;
    date: string;
    time: string;
    mode?: 'service' | 'voucher' | 'class' | 'subscription';
    voucherId?: string | null;
    voucherTypeId?: string;
    durationMin?: number;
    paymentMethod?: string;
    subscriptionPlanId?: string;
  } | null>(null);

  // Voucher check state
  const [voucherCheckParams, setVoucherCheckParams] = useState<{
    voucherTypeId: string;
    professionalId?: string;
    locationId?: string;
  } | null>(null);

  // Voucher flow state
  const [voucherFlow, setVoucherFlow] = useState<{
    origin: string;
    voucherId: string;
    voucherTypeId: string;
    allowedServiceIds: string[];
    lockedProfessionalId?: string;
  } | null>(null);
  
  // Additional voucher states
  const [selectedVoucherTypeId, setSelectedVoucherTypeId] = useState<string | null>(null);
  const [voucherSuccessSessionId, setVoucherSuccessSessionId] = useState<string | null>(null);
  
  // Add header title handling
  const getHeaderTitle = () => {
    if (currentView === 'voucher-check' && voucherCheckParams) {
      return 'Verificar bono';
    }
    // ... existing header logic
    return 'Reservas Pro';
  };

  // Fetch services for a specific category
  const fetchServices = useCallback(async (categoryId: string) => {
    const cacheKey = `services_${categoryId}`;
    const cached = servicesCache[cacheKey];
    const now = Date.now();
    
    // Use cache if less than 10 minutes old
    if (cached && (now - cached.timestamp) < 600000) {
      setServices(cached.data);
      return;
    }

    try {
      setServicesLoading(true);
      setServicesError(null);

      // First get services
      let svcQuery = supabase
        .from('services')
        .select('*')
        .eq('category_id', categoryId)
        .eq('active', true);
      if (organization?.id) {
        svcQuery = svcQuery.eq('organization_id', organization.id);
      }
      const { data: servicesData, error: servicesError } = await svcQuery
        .order('name', { ascending: true });

      if (servicesError) throw servicesError;

      // Then get professionals for each service
      const servicesWithProfessionals = await Promise.all(
        (servicesData || []).map(async (service) => {
          // First get the professional IDs for this service
          const { data: serviceProfessionalIds, error: profIdError } = await supabase
            .from('service_professionals')
            .select('professional_id')
            .eq('service_id', service.id);

          if (profIdError) {
            console.error('Error fetching professional IDs for service:', profIdError);
          }

          // Then get the professional details
          let professionals = [];
          if (serviceProfessionalIds && serviceProfessionalIds.length > 0) {
            const professionalIds = serviceProfessionalIds.map(sp => sp.professional_id);
            const { data: professionalsData, error: profError } = await supabase
              .from('professionals')
              .select('id, name, photo_url, specialty, color')
              .in('id', professionalIds)
              .eq('active', true);

            if (profError) {
              console.error('Error fetching professionals for service:', profError);
            } else {
              professionals = professionalsData || [];
            }
          }

          return {
            id: service.id,
            name: service.name,
            duration_min: service.duration_min,
            price: service.price,
            category: service.description || '',
            description: service.description,
            photo_url: service.photo_url,
            currency: service.currency || 'EUR',
            category_id: service.category_id,
            active: service.active,
            professionals: professionals
          };
        })
      );

      setServices(servicesWithProfessionals);
      
      // Cache the result
      setServicesCache(prev => ({
        ...prev,
        [cacheKey]: { data: servicesWithProfessionals, timestamp: now }
      }));
    } catch (error) {
      console.error('Error fetching services:', error);
      setServicesError(error instanceof Error ? error.message : 'Error al cargar servicios');
      setServices([]);
    } finally {
      setServicesLoading(false);
    }
  }, [servicesCache]);

  // Fetch services for a specific professional
  const fetchServicesForProfessional = useCallback(async (professionalId: string) => {
    const cacheKey = `professional_services_${professionalId}`;
    const cached = servicesCache[cacheKey];
    const now = Date.now();
    
    // Use cache if less than 10 minutes old
    if (cached && (now - cached.timestamp) < 600000) {
      setServices(cached.data);
      setServicesLoading(false);
      return cached.data;
    }

    try {
      setServicesLoading(true);
      setServicesError(null);
      setServices([]);

      // First get service IDs for this professional
      const { data: serviceProfessionalIds, error: profIdError } = await supabase
        .from('service_professionals')
        .select('service_id')
        .eq('professional_id', professionalId);

      if (profIdError) throw profIdError;

      const serviceIds = serviceProfessionalIds?.map(sp => sp.service_id) || [];
      
      if (serviceIds.length === 0) {
        setServices([]);
        setServicesLoading(false);
        // Cache empty result
        setServicesCache(prev => ({
          ...prev,
          [cacheKey]: { data: [], timestamp: now }
        }));
        return [];
      }

      // Then get the services details
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .in('id', serviceIds)
        .eq('active', true)
        .order('name', { ascending: true });

      if (servicesError) throw servicesError;

      // Format services for display
      const formattedServices = (servicesData || []).map(service => ({
        id: service.id,
        name: service.name,
        duration_min: service.duration_min,
        price: service.price,
        category: service.description || '',
        description: service.description,
        photo_url: service.photo_url,
        currency: service.currency || 'EUR',
        category_id: service.category_id,
        active: service.active,
        professionals: [] // Will be populated with current professional if needed
      }));

      setServices(formattedServices);
      
      // Cache the result
      setServicesCache(prev => ({
        ...prev,
        [cacheKey]: { data: formattedServices, timestamp: now }
      }));
    } catch (error) {
      console.error('Error fetching services for professional:', error);
      setServicesError(error instanceof Error ? error.message : 'Error al cargar servicios del profesional');
      setServices([]);
    } finally {
      setServicesLoading(false);
    }
  }, [servicesCache]);

  // Fetch classes for a specific professional
  const fetchClassesForProfessional = useCallback(async (professionalId: string) => {
    const cacheKey = `professional_classes_${professionalId}`;
    const cached = classesCache[cacheKey];
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < 600000) {
      setClasses(cached.data);
      return cached.data;
    }

    try {
      setClassesLoading(true);
      setClassesError(null);

      const { data: classProfessionalIds, error: profIdError } = await supabase
        .from('class_professionals')
        .select('class_id')
        .eq('professional_id', professionalId);

      if (profIdError) throw profIdError;

      const classIds = classProfessionalIds?.map(cp => cp.class_id) || [];
      
      if (classIds.length === 0) {
        setClasses([]);
        setClassesLoading(false);
        
        // Cache empty result
        setClassesCache(prev => ({
          ...prev,
          [cacheKey]: { data: [], timestamp: now }
        }));
        
        return [];
      }

      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('*')
        .in('id', classIds)
        .eq('active', true)
        .order('name', { ascending: true });

      if (classesError) throw classesError;

      const formattedClasses = (classesData || []).map(classItem => ({
        id: classItem.id,
        name: classItem.name,
        duration_min: classItem.duration_min,
        capacity: classItem.capacity,
        price: classItem.price,
        description: classItem.description,
        photo_url: classItem.photo_url,
        currency: classItem.currency || 'EUR',
        category_id: classItem.category_id,
        active: classItem.active
      }));

      setClasses(formattedClasses);
      
      setClassesCache(prev => ({
        ...prev,
        [cacheKey]: { data: formattedClasses, timestamp: now }
      }));

      return formattedClasses;
    } catch (error) {
      console.error('Error fetching classes for professional:', error);
      setClassesError(error instanceof Error ? error.message : 'Error al cargar clases del profesional');
      setClasses([]);
      return [];
    } finally {
      setClassesLoading(false);
    }
  }, [classesCache]);

  // Fetch vouchers for a specific professional
  const fetchVouchersForProfessional = useCallback(async (professionalId: string) => {
    const cacheKey = `professional_vouchers_${professionalId}`;
    const cached = vouchersCache[cacheKey];
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < 600000) {
      return cached.data;
    }

    try {
      const { data: vouchersData, error: vouchersError } = await supabase
        .from('voucher_types')
        .select('*')
        .eq('professional_id', professionalId)
        .eq('active', true)
        .order('name', { ascending: true });

      if (vouchersError) throw vouchersError;

      const formattedVouchers = (vouchersData || []).map(voucher => ({
        id: voucher.id,
        name: voucher.name,
        sessions_count: voucher.sessions_count,
        price: voucher.price,
        description: voucher.description,
        photo_url: voucher.photo_url,
        currency: voucher.currency || 'EUR',
        validity_days: voucher.validity_days,
        active: voucher.active
      }));

      setVouchersCache(prev => ({
        ...prev,
        [cacheKey]: { data: formattedVouchers, timestamp: now }
      }));

      return formattedVouchers;
    } catch (error) {
      console.error('Error fetching vouchers for professional:', error);
      return [];
    }
  }, [vouchersCache]);

  // Clear services when returning to home
  const clearServicesState = useCallback(() => {
    setServices([]);
    setServicesLoading(false);
    setServicesError(null);
  }, []);

  // Load services, classes and vouchers when a professional is selected for the services view
  useEffect(() => {
    if (currentView === 'services' && selectedProfessional?.id) {
      fetchServicesForProfessional(selectedProfessional.id);
      fetchClassesForProfessional(selectedProfessional.id);
      fetchVouchersForProfessional(selectedProfessional.id);
    }
  }, [currentView, selectedProfessional?.id, fetchServicesForProfessional, fetchClassesForProfessional, fetchVouchersForProfessional]);

  // Load professionals and categories on component mount
  useEffect(() => {
    fetchProfessionals();
    fetchCategories();
    
    // Handle URL hash routing
    const handleHashChange = async () => {
      const hash = window.location.hash;
      console.log('Hash changed to:', hash);
      
      if (hash.startsWith('#/confirmar')) {
        const urlParams = new URLSearchParams(hash.split('?')[1] || '');
        const serviceId = urlParams.get('serviceId');
        const professionalId = urlParams.get('professionalId');
        const locationId = urlParams.get('locationId');
        const date = urlParams.get('date');
        const time = urlParams.get('time');
        
        console.log('Confirmation params:', { serviceId, professionalId, locationId, date, time });
        
        if (serviceId && professionalId && date && time) {
          // Set both values at the same time to ensure proper rendering 
          const params = { 
            serviceId, 
            professionalId, 
            locationId, 
            date, 
            time, 
            mode: 'service' as const
          };
          
          console.log('Setting booking params and navigating to confirmation:', params);
          setBookingParams(params);
          setCurrentView('confirmation');
        } else {
          console.error('Missing required parameters for confirmation');
        }
      } else if (hash.startsWith('#/confirmacion')) {
        const urlParams = new URLSearchParams(hash.split('?')[1] || '');
        const bookingId = urlParams.get('booking_id');
        if (bookingId) {
          // Try to recover last booking params from localStorage
          try {
            const saved = localStorage.getItem('reservasPro_lastBooking');
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed.bookingId === bookingId) {
                setBookingParams({
                  serviceId: parsed.serviceId,
                  professionalId: parsed.professionalId,
                  locationId: parsed.locationId,
                  date: parsed.date,
                  time: parsed.time,
                  mode: 'service'
                });
                setCurrentView('confirmation');
                console.log('[Widget] Restored confirmation from localStorage for booking', bookingId);
                return;
              }
            }
          } catch {}
        }
        // Fallback: confirmation handling for service, voucher, class and subscription flows
        const mode = urlParams.get('mode');
        const serviceId2 = urlParams.get('serviceId');
        const classId2 = urlParams.get('classId');
        const professionalId2 = urlParams.get('professionalId');
        const locationId2 = urlParams.get('locationId');
        const date2 = urlParams.get('date');
        const time2 = urlParams.get('time');
        const voucherId2 = urlParams.get('voucherId');
        const durationMin2 = urlParams.get('durationMin');
        const paymentMethod2 = urlParams.get('paymentMethod');
        const subscriptionPlanId2 = urlParams.get('subscriptionPlanId');
        
        console.log('[Widget] Confirmation params:', { mode, serviceId2, classId2, professionalId2, locationId2, date2, time2, voucherId2, durationMin2, paymentMethod2, subscriptionPlanId2 });
        
        const checks = {
          isService: mode === 'service',
          isClass: mode === 'class',
          isSubscription: mode === 'subscription',
          hasServiceId: !!serviceId2,
          hasClassId: !!classId2,
          hasProfessionalId: !!professionalId2,
          hasDate: !!date2,
          hasTime: !!time2,
        };
        console.log('[Widget] Confirmation checks:', checks);
        
        if (checks.isService && checks.hasServiceId && checks.hasProfessionalId && checks.hasDate && checks.hasTime) {
          setBookingParams({
            serviceId: serviceId2!,
            professionalId: professionalId2!,
            locationId: locationId2,
            date: date2!,
            time: time2!,
            mode: 'service',
            durationMin: durationMin2 ? parseInt(durationMin2) : undefined,
            paymentMethod: paymentMethod2 || undefined,
            subscriptionPlanId: subscriptionPlanId2 || undefined
          });
          setCurrentView('confirmation');
          console.log('[Widget] Navigating to service confirmation view');
        } else if (checks.isClass && checks.hasClassId && checks.hasDate && checks.hasTime) {
          setBookingParams({
            serviceId: null,
            professionalId: null,
            classId: classId2!,
            locationId: locationId2,
            date: date2!,
            time: time2!,
            mode: 'class',
            durationMin: durationMin2 ? parseInt(durationMin2) : undefined,
            paymentMethod: paymentMethod2 || undefined,
            subscriptionPlanId: subscriptionPlanId2 || undefined
          });
          setCurrentView('confirmation');
          console.log('[Widget] Navigating to class confirmation view');
        } else if (checks.isSubscription && checks.hasDate && checks.hasTime) {
          setBookingParams({
            serviceId: serviceId2 || null,
            professionalId: professionalId2 || null,
            classId: classId2 || null,
            locationId: locationId2,
            date: date2!,
            time: time2!,
            mode: 'subscription',
            durationMin: durationMin2 ? parseInt(durationMin2) : undefined,
            subscriptionPlanId: subscriptionPlanId2 || undefined
          });
          setCurrentView('confirmation');
          console.log('[Widget] Navigating to subscription confirmation view');
        } else if (professionalId2 && date2 && time2 && mode === 'voucher') {
          setBookingParams({ 
            serviceId: serviceId2 || null, 
            professionalId: professionalId2, 
            locationId: locationId2, 
            date: date2, 
            time: time2, 
            mode: 'voucher',
            voucherId: voucherId2 || undefined,
            durationMin: durationMin2 ? parseInt(durationMin2) : undefined
          });
          setCurrentView('confirmation');
          console.log('[Widget] Navigating to voucher confirmation view');
        } else {
          console.error('[Widget] Missing required parameters for confirmation', { mode, serviceId2, classId2, professionalId2, date2, time2 });
        }
      } else if (hash.startsWith('#/exito-bono')) {
        // Handle voucher success after Stripe checkout
        const params = new URLSearchParams(hash.split('?')[1] || '');
        const sessionId = params.get('session_id');
        
        console.log('[Widget] Voucher success view session_id=', sessionId);
        setCurrentView('stripe-voucher-success');
        setVoucherSuccessSessionId(sessionId);
      } else if (hash.startsWith('#/bonos/') && hash.includes('/verificar')) {
        // Handle #/bonos/:voucherTypeId/verificar
        const pathParts = hash.split('/');
        const voucherTypeId = pathParts[2];
        const queryString = hash.split('?')[1];
        const urlParams = new URLSearchParams(queryString || '');
        const professionalId = urlParams.get('professionalId');
        const locationId = urlParams.get('locationId');
        
        console.log('Navigating to voucher verification:', { voucherTypeId, professionalId, locationId });
        setVoucherCheckParams({ 
          voucherTypeId, 
          professionalId: professionalId || undefined, 
          locationId: locationId || undefined 
        });
        setSelectedVoucherId(voucherTypeId);
        setCurrentView('voucher-check');
      } else if (hash.startsWith('#/bonos/') && hash.includes('/comprar')) {
        // Handle #/bonos/:voucherTypeId/comprar
        const voucherTypeId = hash.split('/')[2];
        console.log('Navigating to voucher purchase:', voucherTypeId);
        setSelectedVoucherId(voucherTypeId);
        setCurrentView('voucher-purchase');
      } else if (hash.startsWith('#/suscripciones/') && hash.includes('/verificar')) {
        // Handle #/suscripciones/:planId/verificar
        const pathParts = hash.split('/');
        const planId = pathParts[2];
        console.log('Navigating to subscription check:', planId);
        setCurrentView('subscription-check');
      } else if (hash.startsWith('#/suscripciones/')) {
        // Handle #/suscripciones/:planId
        const pathParts = hash.split('/');
        const planId = pathParts[2];
        if (planId && !hash.includes('/verificar')) {
          console.log('Navigating to subscription summary:', planId);
          setCurrentView('subscription-summary');
        }
      } else if (hash.startsWith('#/exito-suscripcion')) {
        // Handle subscription success after Stripe checkout
        const params = new URLSearchParams(hash.split('?')[1] || '');
        const sessionId = params.get('session_id');
        
        console.log('[Subs.UI] success session=', sessionId);
        setCurrentView('exito-suscripcion');
        setVoucherSuccessSessionId(sessionId); // Reuse this state for session ID
      } else if (hash.startsWith('#/calendario')) {
        // Handle calendar routes (service, voucher, subscription)
        const urlParams = new URLSearchParams(hash.split('?')[1] || '');
        const mode = urlParams.get('mode');

        // Voucher calendar deep link -> open VoucherBookingCalendar with correct IDs
          if (mode === 'voucher') {
            const voucherTypeId = urlParams.get('voucherTypeId');
            let professionalId = urlParams.get('professionalId');
            let locationId = urlParams.get('locationId');

            console.log('[Calendar] voucher mode params', { voucherTypeId, professionalId, locationId });

            if (!voucherTypeId) {
              console.warn('[Calendar] Missing voucherTypeId in voucher mode');
              setCurrentView('calendar');
              return;
            }

            try {
              // Resolve professional strictly from voucher type; ignore URL/localStorage if voucher defines one
              const { data: vt } = await supabase
                .from('voucher_types')
                .select('professional_id')
                .eq('id', voucherTypeId)
                .maybeSingle();

              if (vt?.professional_id) {
                professionalId = vt.professional_id;
              } else {
                // Fallbacks only if voucher type has no assigned professional
                if (!professionalId) {
                  try {
                    const saved = localStorage.getItem('reservasPro_voucherFlow');
                    if (saved) {
                      const parsed = JSON.parse(saved);
                      if (parsed?.lockedProfessionalId) {
                        professionalId = parsed.lockedProfessionalId;
                      }
                    }
                  } catch {}
                }
              }
              // Resolve location
              if (!locationId) {
                const def = await getDefaultLocation();
                locationId = def?.id || locationId;
                if (!locationId) {
                  const { data: anyLoc } = await supabase
                    .from('locations')
                    .select('id')
                    .eq('active', true)
                    .order('created_at', { ascending: true })
                    .limit(1);
                  locationId = anyLoc?.[0]?.id || null;
                }
              }

              if (voucherTypeId && professionalId && locationId) {
                // Calculate allowedServiceIds for this voucher type
                const allowedServiceIds = await getVoucherAllowedServices(voucherTypeId);
                
                // Get userId from localStorage if available
                let userId = '';
                try {
                  const savedUser = localStorage.getItem('reservasPro_user');
                  if (savedUser) {
                    const parsed = JSON.parse(savedUser);
                    userId = parsed.userShadowId || '';
                  }
                } catch {}

                // Persist complete voucher flow with allowedServiceIds
                await persistVoucherFlow('', userId, allowedServiceIds, voucherTypeId, professionalId);
                
                setSelectedVoucherId(voucherTypeId);
                setSelectedProfessionalId(professionalId);
                setSelectedLocationId(locationId);
                setCurrentView('voucher-calendar');
                // Normalize hash to include resolved params
                window.location.hash = `#/calendario?mode=voucher&voucherTypeId=${voucherTypeId}&professionalId=${professionalId}&locationId=${locationId}`;
                return;
              }

              console.warn('[Calendar] Could not resolve professional or location for voucher mode');
              setCurrentView('calendar');
              return;
            } catch (e) {
              console.warn('[Calendar] Error resolving voucher calendar params', e);
              setCurrentView('calendar');
              return;
            }
          }

        // Subscription calendar filter keeps using generic calendar
        const planId = urlParams.get('planId');
        if (mode === 'subscription' && planId) {
          console.log('[Calendar] subscription filter {planId=', planId, '}');
          setCurrentView('calendar');
        } else {
          setCurrentView('calendar');
        }
      } else if (hash.startsWith('#/exito')) {
        // success may come with ?booking_id=...
        setCurrentView('success');
      } else if (hash === '#/mi-cuenta') {
        setCurrentView('mi-cuenta');
      }
    };
    
    // Listen to hash changes
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Check initial hash
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [fetchProfessionals, fetchCategories]);

  // Memoized onBack for BookingConfirmation to avoid re-render loops
  const confirmationOnBack = useCallback(() => {
    if (!bookingParams) return;
    setCurrentView(bookingParams.mode === 'voucher' ? 'voucher-calendar' : bookingParams.mode === 'class' ? 'class-detail' : 'calendar');
  }, [bookingParams?.mode]);

  // Handle professional click
  const handleProfessionalClick = useCallback((professional: Professional) => {
    // Clear previous states to avoid stale loaders
    clearServicesState();
    clearClassesState();

    setSelectedProfessional(professional);
    setCurrentView('services');
    
    // Emit custom events
    const eventData = { id: professional.id, name: professional.name };
    
    // onProfessionalClick callback (if parent provides it)
    if (typeof (window as any).onProfessionalClick === 'function') {
      (window as any).onProfessionalClick(eventData);
    }
    
    // Custom event for external integration
    const customEvent = new CustomEvent('rpw:professional.click', {
      detail: eventData
    });
    window.dispatchEvent(customEvent);
  }, [clearServicesState, clearClassesState]);

  // Handle category click
  const handleCategoryClick = useCallback((category: Category) => {
    setSelectedCategory(category);
    setCurrentView('categories');
    
    // Clear previous states and fetch new data
    clearServicesState();
    clearClassesState();
    
    // Fetch both services and classes for this category
    fetchServices(category.id);
    fetchClasses(category.id);
    
    // Emit custom events
    const eventData = { id: category.id, name: category.name };
    
    // onCategoryClick callback (if parent provides it)
    if (typeof (window as any).onCategoryClick === 'function') {
      (window as any).onCategoryClick(eventData);
    }
    
    // Custom event for external integration
    const customEvent = new CustomEvent('rpw:category.click', {
      detail: eventData
    });
    window.dispatchEvent(customEvent);
  }, [fetchServices, fetchClasses, clearServicesState, clearClassesState]);

  // Handle service click – always go to resumen primero
  const handleServiceClick = useCallback((service: Service) => {
    console.log('[handleServiceClick] service:', service);
    
    // Selecciona el servicio y, si existe profesional bloqueado por bono, solo lo preselecciona
    setSelectedService(service);
    setSelectedClass(null); // Limpiar clase seleccionada para evitar conflictos
    try {
      const saved = localStorage.getItem('reservasPro_voucherFlow');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.lockedProfessionalId) {
          setSelectedProfessionalId(parsed.lockedProfessionalId);
        }
        // No bloqueamos ni redirigimos al calendario por flujo de bono aquí
      }
    } catch (e) {
      console.warn('[handleServiceClick] voucherFlow parse failed');
    }

    // Ir SIEMPRE a la página de resumen
    setCurrentView('service-detail');

    // Eventos externos
    const eventData = { id: service.id, name: service.name };
    if (typeof (window as any).onServiceClick === 'function') {
      (window as any).onServiceClick(eventData);
    }
    const customEvent = new CustomEvent('rpw:service.click', { detail: eventData });
    window.dispatchEvent(customEvent);
  }, []);

  // Handle class click
  const handleClassClick = useCallback((classItem: Class) => {
    setSelectedClass(classItem);
    setSelectedService(null); // Limpiar servicio seleccionado para evitar conflictos
    setCurrentView('class-detail');
    
    // Emit custom events for external integration
    const eventData = { id: classItem.id, name: classItem.name };
    
    if (typeof (window as any).onClassClick === 'function') {
      (window as any).onClassClick(eventData);
    }
    
    const customEvent = new CustomEvent('rpw:class.click', {
      detail: eventData
    });
    window.dispatchEvent(customEvent);
  }, []);

  // Generate gallery images from location photo
  const galleryImages = currentLocation?.photo_url 
    ? Array(6).fill(currentLocation.photo_url)
    : [
        "/placeholder.svg",
        "/placeholder.svg", 
        "/placeholder.svg",
        "/placeholder.svg",
        "/placeholder.svg",
        "/placeholder.svg"
      ];

  const HomeView = () => (
    <div className="space-y-1">
      {/* Especialistas destacados */}
      {!professionalsError && (professionals.length > 0 || professionalsLoading) && (
        <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
          <div className="bg-secondary px-4 py-2">
            <h2 className="text-white font-semibold text-lg">Especialistas destacados</h2>
          </div>
          <div className="px-4 py-4">
            {professionalsLoading ? (
              // Loading skeleton
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="text-center">
                    <div className="w-16 h-16 mx-auto rounded-full bg-gray-300/50 mb-2 animate-pulse"></div>
                    <div className="h-3 w-12 mx-auto bg-gray-300/50 rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            ) : professionalsError ? (
              // Error state
              <div className="text-center py-4">
                <p className="text-white/80 text-sm">{professionalsError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchProfessionals}
                  className="mt-2 text-white border-white/20 hover:bg-white/10"
                >
                  Reintentar
                </Button>
              </div>
            ) : professionals.length === 0 ? (
              // Empty state
              <div className="text-center py-4">
                <p className="text-white/80 text-sm">Próximamente</p>
              </div>
            ) : (
              // Professionals grid
              <div className="grid grid-cols-3 gap-4">
                {professionals.map((professional) => (
                  <div 
                    key={professional.id} 
                    className="text-center cursor-pointer transition-transform hover:scale-105"
                    onClick={() => handleProfessionalClick(professional)}
                  >
                    <div className="w-16 h-16 mx-auto rounded-full bg-gray-300 mb-2 flex items-center justify-center overflow-hidden">
                      {professional.photo_url ? (
                        <img 
                          src={professional.photo_url} 
                          alt={professional.name} 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to placeholder on image error
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.innerHTML = '<svg class="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
                          }}
                        />
                      ) : (
                        <User className="w-8 h-8 text-gray-600" />
                      )}
                    </div>
                    <p className="text-white text-xs font-medium leading-tight line-clamp-2">
                      {professional.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Centro Pleno */}
      <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
        <div className="bg-secondary px-4 py-2 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Centro Pleno</h2>
          <ChevronRight className="w-5 h-5 text-white" />
        </div>
        <div 
          className="px-4 py-3 cursor-pointer"
          onClick={() => setCurrentView('location')}
        >
          <div className="flex items-center gap-3">
            <div className="grid grid-cols-2 gap-1 w-12 h-12">
              {currentLocation?.photo_url ? (
                Array(4).fill(null).map((_, idx) => (
                  <div key={idx} className="w-5 h-5 bg-gray-300 rounded-sm">
                    <img src={currentLocation.photo_url} alt="" className="w-full h-full object-cover rounded-sm" />
                  </div>
                ))
              ) : (
                galleryImages.slice(0, 4).map((img, idx) => (
                  <div key={idx} className="w-5 h-5 bg-gray-300 rounded-sm">
                    <img src={img} alt="" className="w-full h-full object-cover rounded-sm" />
                  </div>
                ))
              )}
            </div>
            <div>
              <p className="text-white/80 text-sm">{currentLocation?.name || 'Pleno. Salud en Movimiento'}</p>
              {currentLocation?.address && (
                <p className="text-white/80 text-sm">
                  <MapPin className="w-3 h-3 inline mr-1" />
                  {currentLocation.address}
                </p>
              )}
              <p className="text-white/80 text-sm">09:00 - 21:00</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tratamientos */}
      <div id="home-tratamientos" className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
        <div className="bg-secondary px-4 py-2 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Tratamientos</h2>
          <ChevronRight className="w-5 h-5 text-white" />
        </div>
        <div className="px-4 py-4">
          {categoriesLoading ? (
            // Loading skeleton
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-300/50 rounded animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-gray-300/50 rounded animate-pulse mb-1"></div>
                    <div className="h-3 w-24 bg-gray-300/50 rounded animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : categoriesError ? (
            // Error state
            <div className="text-center py-4">
              <p className="text-white/80 text-sm">{categoriesError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchCategories}
                className="mt-2 text-white border-white/20 hover:bg-white/10"
              >
                Reintentar
              </Button>
            </div>
          ) : categories.length === 0 ? (
            // Empty state
            <div className="text-center py-4">
              <p className="text-white/80 text-sm">Aún no hay tratamientos disponibles</p>
            </div>
          ) : (
            // Categories list
            <div className="space-y-3">
              {categories.map((category) => (
                <div 
                  key={category.id}
                  className="flex items-center gap-3 cursor-pointer transition-transform hover:scale-[1.02]"
                  onClick={() => handleCategoryClick(category)}
                  role="button"
                  aria-label={`Abrir categoría ${category.name}`}
                >
                  <div className="w-12 h-12 bg-gray-300 rounded flex items-center justify-center overflow-hidden">
                    {category.icon_url ? (
                      <img 
                        src={category.icon_url} 
                        alt={category.name}
                        className="w-full h-full object-cover rounded"
                        loading="lazy"
                        onError={(e) => {
                          // Fallback to placeholder on image error
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.parentElement!.innerHTML = '<div class="w-8 h-8 bg-gray-400 rounded flex items-center justify-center"><span class="text-gray-600 text-xs font-bold">' + category.name.charAt(0) + '</span></div>';
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gray-400 rounded flex items-center justify-center">
                        <span className="text-gray-600 text-xs font-bold">
                          {category.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-medium text-sm">{category.name}</h3>
                    {category.description && (
                      <p className="text-white/80 text-xs line-clamp-1">
                        {category.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/60" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Planes - only show if enabled and has data */}
      {widgetSettings.show_plans && (publicVouchers.length > 0 || publicPlans.length > 0) && (
        <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
          <div className="bg-secondary px-4 py-2">
            <h2 className="text-white font-semibold text-lg">Planes</h2>
          </div>
          <div className="px-4 py-4 space-y-3">
            {/* Bonos Card */}
            {publicVouchers.length > 0 && (
              <div 
                className="flex items-center gap-3 cursor-pointer transition-transform hover:scale-[1.02]"
                onClick={() => setCurrentView('bonos')}
                role="button"
                aria-label="Ver bonos disponibles"
              >
                <div className="w-12 h-12 bg-amber-500/20 rounded flex items-center justify-center">
                  <Ticket className="w-6 h-6 text-amber-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium text-sm">Bonos</h3>
                  <p className="text-white/80 text-xs">Packs de sesiones con descuento</p>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-xs">Ver bonos</p>
                  <ChevronRight className="w-4 h-4 text-white/60 ml-auto" />
                </div>
              </div>
            )}

            {/* Suscripciones Card */}
            {publicPlans.length > 0 && (
              <div 
                className="flex items-center gap-3 cursor-pointer transition-transform hover:scale-[1.02]"
                onClick={() => setCurrentView('suscripciones')}
                role="button"
                aria-label="Ver suscripciones disponibles"
              >
                <div className="w-12 h-12 bg-blue-500/20 rounded flex items-center justify-center">
                  <RotateCcw className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium text-sm">Suscripciones</h3>
                  <p className="text-white/80 text-xs">Planes mensuales / ilimitados</p>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-xs">Ver suscripciones</p>
                  <ChevronRight className="w-4 h-4 text-white/60 ml-auto" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const ServicesView = () => {
    // Read professional vouchers from cache (keeps minimal state changes)
    const professionalVouchers = selectedProfessional?.id
      ? (vouchersCache[`professional_vouchers_${selectedProfessional.id}`]?.data || [])
      : [];

    // Local helpers (duplicated from CategoriesView)
    const getUpcomingSessions = useCallback((classId: string) => {
      return classSessions
        .filter(session => session.class_id === classId)
        .slice(0, 3);
    }, [classSessions]);

    const formatSessionTime = (dateTime: string) => {
      const date = new Date(dateTime);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      const locale = 'es-ES';
      const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      const day = date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
      return isToday ? `Hoy ${time}` : `${day} ${time}`;
    };

    return (
      <div className="space-y-4">
        {/* Professional Header */}
        {selectedProfessional && (
          <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
            <div className="px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden">
                  {selectedProfessional.photo_url ? (
                    <img 
                      src={selectedProfessional.photo_url} 
                      alt={selectedProfessional.name} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.innerHTML = '<svg class="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
                      }}
                    />
                  ) : (
                    <User className="w-8 h-8 text-gray-600" />
                  )}
                </div>
                <div>
                  <h2 className="text-white font-semibold text-lg">{selectedProfessional.name}</h2>
                  {selectedProfessional.specialty && (
                    <p className="text-white/80 text-sm">{selectedProfessional.specialty}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Services List */}
        <div className="space-y-3">
          <h3 className="text-white font-medium px-2">Servicios disponibles</h3>
          {servicesLoading && services.length > 0 && (
            <div className="text-center py-4">
              <div className="text-white/60">Cargando servicios...</div>
            </div>
          )}
          {servicesError && (
            <div className="text-center py-4">
              <div className="text-red-400">{servicesError}</div>
            </div>
          )}
          {!servicesLoading && !servicesError && services.length === 0 && (
            <div className="text-center py-4">
              <div className="text-white/60">No hay servicios disponibles para este profesional</div>
            </div>
          )}
          {!servicesLoading && !servicesError && services.map((service) => (
            <div 
              key={service.id} 
              className="rounded-lg overflow-hidden cursor-pointer transition-colors hover:bg-white/5" 
              style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
              onClick={() => {
                setSelectedService({
                  ...service,
                  professionals: selectedProfessional ? [selectedProfessional] : []
                });
                setCurrentView('service-detail');
              }}
            >
              <div className="p-4">
                <div className="flex items-start gap-4">
                  {/* Service Image */}
                  <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-300">
                    {service.photo_url ? (
                      <img 
                        src={service.photo_url} 
                        alt={service.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.parentElement!.innerHTML = '<div class="w-full h-full bg-gray-300 flex items-center justify-center"><svg class="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></div>';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-gray-600" />
                      </div>
                    )}
                  </div>
                  {/* Service Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-lg mb-3">{service.name}</h3>
                    {/* Duration and Price */}
                    <div className="flex items-center gap-4 text-white/80">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">{service.duration_min} min</span>
                      </div>
                      <div className="text-lg font-bold text-white">€{service.price}</div>
                    </div>
                  </div>
                  {/* Arrow */}
                  <ChevronRight className="w-5 h-5 text-white/60 flex-shrink-0" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Classes List */}
        <div className="space-y-3">
          <h3 className="text-white font-medium px-2">Clases disponibles</h3>
          {classesLoading && classes.length > 0 ? (
            <div className="text-center py-4"><div className="text-white/60">Cargando clases...</div></div>
          ) : classesError ? (
            <div className="text-center py-4"><div className="text-red-400">{classesError}</div></div>
          ) : classes.length === 0 ? (
            <div className="text-center py-4"><div className="text-white/60">No hay clases disponibles para este profesional</div></div>
          ) : (
            classes.map((classItem) => {
              const upcomingSessions = getUpcomingSessions(classItem.id);
              return (
                <div 
                  key={classItem.id}
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors hover:bg-white/5"
                  style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
                  onClick={() => handleClassClick(classItem)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-300 rounded flex items-center justify-center overflow-hidden">
                      {classItem.photo_url ? (
                        <img src={classItem.photo_url} alt={classItem.name} className="w-full h-full object-cover rounded" />
                      ) : (
                        <Clock className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-white">{classItem.name}</p>
                      <div className="flex items-center gap-4 text-xs text-white/60 mb-1">
                        <span>{classItem.duration_min} min</span>
                        <span>€{classItem.price}</span>
                        <span>{classItem.capacity} plazas</span>
                      </div>
                      {upcomingSessions.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {upcomingSessions.map((session) => (
                            <Badge 
                              key={session.id}
                              variant="outline" 
                              className="text-xs"
                              style={{ borderColor: '#3B82F6', color: '#3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
                            >
                              {formatSessionTime(session.start_at)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/60" />
                </div>
              );
            })
          )}
        </div>

        {/* Vouchers List */}
        <div className="space-y-3">
          <h3 className="text-white font-medium px-2">Bonos disponibles</h3>
          {professionalVouchers.length === 0 ? (
            <div className="text-center py-4"><div className="text-white/60">No hay bonos disponibles para este profesional</div></div>
          ) : (
            professionalVouchers.map((voucher: any) => (
              <div 
                key={voucher.id}
                className="p-4 rounded-lg cursor-pointer transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
                onClick={() => { setSelectedVoucherId(voucher.id); setCurrentView('voucher-detail'); }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-amber-500/20 rounded flex items-center justify-center overflow-hidden">
                    {voucher.photo_url ? (
                      <img src={voucher.photo_url} alt={voucher.name} className="w-full h-full object-cover rounded" />
                    ) : (
                      <Ticket className="w-8 h-8 text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-medium text-sm">{voucher.name}</h3>
                    {voucher.description && (
                      <p className="text-white/80 text-xs mb-1 line-clamp-2">{voucher.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      <span>{voucher.sessions_count} sesiones</span>
                      {voucher.validity_days && <span>• {voucher.validity_days} días</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-medium">{voucher.price}€</p>
                    <p className="text-white/60 text-xs">{voucher.currency}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Book Button */}
        <div className="px-2 pb-4">
          <Button 
            className="w-full"
            style={{ 
              backgroundColor: selectedProfessional?.color || '#3B82F6',
              color: 'white',
              border: 'none'
            }}
          >
            Reservar cita
          </Button>
        </div>
      </div>
    );
  };

  const LocationView = () => (
    <div className="space-y-4">
      {/* Single Location Image */}
      <div className="rounded-lg overflow-hidden">
        <div className="aspect-video bg-gray-300">
          <img 
            src={currentLocation?.photo_url || "/placeholder.svg"} 
            alt={currentLocation?.name || "Ubicación"} 
            className="w-full h-full object-cover" 
          />
        </div>
      </div>

      {/* Reserve Button */}
      <Button className="w-full bg-secondary hover:bg-secondary/90 text-white font-semibold py-3 text-lg rounded-lg">
        Reservar
      </Button>

      {/* Location Info */}
      <div className="text-center mb-4">
        <h2 className="text-white text-xl font-semibold mb-2">{currentLocation?.name || 'Pleno. Salud en Movimiento'}</h2>
        {currentLocation?.address && (
          <p className="text-white/80 text-sm flex items-center justify-center gap-1">
            <MapPin className="w-4 h-4" />
            {currentLocation.address}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-200 rounded-lg p-1">
        {(['info', 'treatments', 'specialists', 'plans'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab 
                ? 'bg-secondary text-white' 
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab === 'info' && 'Info'}
            {tab === 'treatments' && 'Tratamientos...'}
            {tab === 'specialists' && 'Especialistas'}
            {tab === 'plans' && 'Planes'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="text-white text-sm leading-relaxed">
        {activeTab === 'info' && (
          <div className="space-y-4">
            <p>
              {currentLocation?.description || 'Información sobre nuestra ubicación.'}
            </p>
            
            {/* Business Hours */}
            {currentLocation && (
              <div>
                <h4 className="font-semibold mb-3 text-white/90 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Horarios
                </h4>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                  {currentLocation.business_hours ? (
                    // Use modern business_hours from locations table
                    <div className="grid gap-2">
                      {Object.entries(currentLocation.business_hours as Record<string, { open: boolean; intervals?: { start: string; end: string }[] }>)
                        .sort(([a], [b]) => {
                          const dayOrder = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 };
                          return (dayOrder[a as keyof typeof dayOrder] || 8) - (dayOrder[b as keyof typeof dayOrder] || 8);
                        })
                        .map(([dayNum, dayData]) => {
                          const dayNames = { '1': 'Lun', '2': 'Mar', '3': 'Mié', '4': 'Jue', '5': 'Vie', '6': 'Sáb', '7': 'Dom' };
                          const dayName = dayNames[dayNum as keyof typeof dayNames] || dayNum;
                          const isClosed = !dayData.open || !dayData.intervals || dayData.intervals.length === 0;
                          
                          return (
                            <div key={dayNum} className="flex justify-between items-center py-2 px-3 rounded-md hover:bg-white/5 transition-colors">
                              <span className="font-medium text-white text-sm min-w-[40px]">{dayName}</span>
                              <span className={`text-sm font-mono ${isClosed ? 'text-red-400' : 'text-green-400'}`}>
                                {isClosed ? 'Cerrado' : 
                                  dayData.intervals!.map(int => `${int.start} - ${int.end}`).join(', ')
                                }
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    // Fallback to legacy locationHours if available
                    locationHours && locationHours.length > 0 ? (
                      <div className="grid gap-2">
                        {locationHours.map((hour) => {
                          const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                          const dayName = dayNames[hour.day_of_week];
                          
                          return (
                            <div key={hour.id} className="flex justify-between items-center py-2 px-3 rounded-md hover:bg-white/5 transition-colors">
                              <span className="font-medium text-white text-sm min-w-[40px]">{dayName}</span>
                              <span className={`text-sm font-mono ${hour.is_closed ? 'text-red-400' : 'text-green-400'}`}>
                                {hour.is_closed ? 'Cerrado' : `${hour.open_time} - ${hour.close_time}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-white/60 text-sm">
                        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No hay horarios configurados
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'treatments' && (
          <div className="space-y-3">
            {categoriesLoading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-white/80 text-sm">No hay categorías disponibles</p>
              </div>
            ) : (
              categories.map((category) => (
                <div 
                  key={category.id} 
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-white/5 transition-colors" 
                  style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
                  onClick={() => handleCategoryClick(category)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-300 rounded flex items-center justify-center overflow-hidden">
                      {category.icon_url ? (
                        <img src={category.icon_url} alt={category.name} className="w-full h-full object-cover rounded" />
                      ) : (
                        <img src="/placeholder.svg" alt="" className="w-full h-full object-cover rounded" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{category.name}</p>
                      <p className="text-xs text-white/60">{category.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/60" />
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'specialists' && (
          <div className="grid grid-cols-2 gap-4">
            {professionals.map((professional) => (
              <div 
                key={professional.id} 
                className="text-center cursor-pointer transition-transform hover:scale-105"
                onClick={() => handleProfessionalClick(professional)}
              >
                <div className="w-16 h-16 mx-auto rounded-full bg-gray-300 mb-2 flex items-center justify-center overflow-hidden">
                  {professional.photo_url ? (
                    <img src={professional.photo_url} alt={professional.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-gray-600" />
                  )}
                </div>
                <p className="font-medium text-sm">{professional.name}</p>
                <p className="text-white/60 text-xs">{professional.specialty}</p>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'plans' && (
          <div className="space-y-3">
            <div 
              className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-white/5 transition-colors" 
              style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
              onClick={() => setCurrentView('bonos')}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-secondary rounded flex items-center justify-center">
                  <Ticket className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium">Bonos</p>
                  <p className="text-xs text-white/60">Packs de sesiones con descuento</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-white/60" />
            </div>
            
            <div 
              className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-white/5 transition-colors" 
              style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
              onClick={() => setCurrentView('suscripciones')}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-secondary rounded flex items-center justify-center">
                  <Repeat className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium">Suscripciones</p>
                  <p className="text-xs text-white/60">Planes mensuales / ilimitados</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-white/60" />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const CategoriesView = () => {
    // Helper function to get upcoming sessions for a class
    const getUpcomingSessions = (classId: string) => {
      return classSessions
        .filter(session => session.class_id === classId)
        .slice(0, 3); // Show max 3 sessions
    };

    // Helper function to format session time
    const formatSessionTime = (dateTime: string) => {
      const date = new Date(dateTime);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (date.toDateString() === today.toDateString()) {
        return `Hoy ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
      } else if (date.toDateString() === tomorrow.toDateString()) {
        return `Mañana ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        return date.toLocaleDateString('es-ES', { 
          day: '2-digit', 
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    };

    return (
      <div className="space-y-4">
        {/* Category Header */}
        {selectedCategory && (
          <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
            <div className="px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-gray-300 rounded flex items-center justify-center overflow-hidden">
                  {selectedCategory.icon_url ? (
                    <img 
                      src={selectedCategory.icon_url} 
                      alt={selectedCategory.name}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-400 rounded flex items-center justify-center">
                      <span className="text-gray-600 text-sm font-bold">
                        {selectedCategory.name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-white font-semibold text-lg">{selectedCategory.name}</h2>
                  {selectedCategory.description && (
                    <p className="text-white/80 text-sm">{selectedCategory.description}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Services Section */}
        {servicesLoading ? (
          <div className="space-y-3">
            <h3 className="text-white font-medium px-2">Servicios disponibles</h3>
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-300/50 rounded animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-gray-300/50 rounded animate-pulse mb-2"></div>
                    <div className="h-3 w-24 bg-gray-300/50 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : servicesError ? (
          <div className="space-y-3">
            <h3 className="text-white font-medium px-2">Servicios disponibles</h3>
            <div className="text-center py-4 px-3 rounded-lg" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
              <p className="text-white/80 text-sm">{servicesError}</p>
            </div>
          </div>
        ) : services.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-white font-medium px-2">Servicios disponibles</h3>
            {services.map((service) => (
              <div 
                key={service.id} 
                className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors hover:bg-white/5" 
                style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
                onClick={() => handleServiceClick(service)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-300 rounded flex items-center justify-center overflow-hidden">
                    {service.photo_url ? (
                      <img 
                        src={service.photo_url} 
                        alt={service.name}
                        className="w-full h-full object-cover rounded"
                      />
                    ) : (
                      <Clock className="w-5 h-5 text-gray-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-white">{service.name}</p>
                    <div className="flex items-center gap-4 text-xs text-white/60 mb-1">
                      <span>{service.duration_min} min</span>
                      <span>€{service.price}</span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-white/60" />
              </div>
            ))}
          </div>
        )}

        {/* Classes Section */}
        {classesLoading ? (
          <div className="space-y-3">
            <h3 className="text-white font-medium px-2">Clases disponibles</h3>
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-300/50 rounded animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-gray-300/50 rounded animate-pulse mb-2"></div>
                    <div className="h-3 w-24 bg-gray-300/50 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : classesError ? (
          <div className="space-y-3">
            <h3 className="text-white font-medium px-2">Clases disponibles</h3>
            <div className="text-center py-4 px-3 rounded-lg" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
              <p className="text-white/80 text-sm">{classesError}</p>
            </div>
          </div>
        ) : classes.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-white font-medium px-2">Clases disponibles</h3>
            {classes.map((classItem) => {
              const upcomingSessions = getUpcomingSessions(classItem.id);
              return (
                <div 
                  key={classItem.id} 
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors hover:bg-white/5" 
                  style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
                  onClick={() => handleClassClick(classItem)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-300 rounded flex items-center justify-center overflow-hidden">
                      {classItem.photo_url ? (
                        <img 
                          src={classItem.photo_url} 
                          alt={classItem.name}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <Clock className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-white">{classItem.name}</p>
                      <div className="flex items-center gap-4 text-xs text-white/60 mb-1">
                        <span>{classItem.duration_min} min</span>
                        <span>€{classItem.price}</span>
                        <span>{classItem.capacity} plazas</span>
                      </div>
                      {upcomingSessions.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {upcomingSessions.map((session, index) => (
                            <Badge 
                              key={session.id}
                              variant="outline" 
                              className="text-xs"
                              style={{ 
                                borderColor: '#3B82F6',
                                color: '#3B82F6',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)'
                              }}
                            >
                              {formatSessionTime(session.start_at)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/60" />
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state if both services and classes are empty */}
        {!servicesLoading && !classesLoading && services.length === 0 && classes.length === 0 && (
          <div className="text-center py-8 px-3 rounded-lg" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
            <p className="text-white/80 text-sm">No hay servicios ni clases disponibles en esta categoría</p>
          </div>
        )}
      </div>
    );
  };

  // Service Detail View
  const ServiceDetailView = () => {
    if (!selectedService) return null;

    const mainProfessional = selectedService.professionals?.[0];

    return (
      <div className="space-y-4">
        {/* Service Image */}
        <div className="relative h-48 rounded-lg overflow-hidden">
          {selectedService.photo_url ? (
            <img 
              src={selectedService.photo_url} 
              alt={selectedService.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-300 flex items-center justify-center">
              <Clock className="w-12 h-12 text-gray-600" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
            <h2 className="text-white font-semibold text-xl">{selectedService.name}</h2>
            <p className="text-white/90 text-lg">€{selectedService.price}</p>
          </div>
        </div>

        {/* Details Section */}
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-secondary, #ef4444)' }}>
          <h3 className="text-white font-semibold">Detalles</h3>
        </div>
        <div className="space-y-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
          <div className="flex items-center gap-2 text-white">
            <Clock className="w-4 h-4" />
            <span>{selectedService.duration_min} min</span>
          </div>
        </div>

        {/* Specialists Section */}
        {mainProfessional && (
          <>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-secondary, #ef4444)' }}>
              <h3 className="text-white font-semibold">Especialistas</h3>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden">
                  {mainProfessional.photo_url ? (
                    <img 
                      src={mainProfessional.photo_url} 
                      alt={mainProfessional.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-6 h-6 text-gray-600" />
                  )}
                </div>
                <div>
                  <p className="text-white font-medium">{mainProfessional.name}</p>
                  {mainProfessional.specialty && (
                    <p className="text-white/80 text-sm">{mainProfessional.specialty}</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Description Section - REMOVED */}

        {/* Book Button */}
        <Button 
          className="w-full text-white font-semibold py-4 text-lg rounded-lg hover:opacity-90" style={{ backgroundColor: 'var(--widget-secondary, #ef4444)' }}
          onClick={() => {
            setSelectedClass(null); // Asegurar limpieza antes de navegar
            // Limpiar cualquier parámetro de suscripción en la URL
            window.location.hash = '#/calendario';
            setCurrentView('calendar');
          }}
        >
          Reservar
        </Button>
      </div>
    );
  };

  // Class Detail View
  const ClassDetailView = () => {
    if (!selectedClass) return null;

    const mainProfessional = selectedClass.professionals?.[0];

    return (
      <div className="space-y-4">
        {/* Class Image */}
        <div className="relative h-48 rounded-lg overflow-hidden">
          {selectedClass.photo_url ? (
            <img 
              src={selectedClass.photo_url} 
              alt={selectedClass.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-300 flex items-center justify-center">
              <Clock className="w-12 h-12 text-gray-600" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
            <h2 className="text-white font-semibold text-xl">{selectedClass.name}</h2>
            <p className="text-white/90 text-lg">€{selectedClass.price}</p>
          </div>
        </div>

        {/* Details Section */}
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-secondary, #ef4444)' }}>
          <h3 className="text-white font-semibold">Detalles</h3>
        </div>
        <div className="space-y-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
          <div className="flex items-center gap-2 text-white">
            <Clock className="w-4 h-4" />
            <span>{selectedClass.duration_min} min</span>
          </div>
          <div className="flex items-center gap-2 text-white">
            <User className="w-4 h-4" />
            <span>{selectedClass.capacity} plazas</span>
          </div>
        </div>

        {/* Specialists Section */}
        {mainProfessional && (
          <>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-secondary, #ef4444)' }}>
              <h3 className="text-white font-semibold">Especialistas</h3>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden">
                  {mainProfessional.photo_url ? (
                    <img 
                      src={mainProfessional.photo_url} 
                      alt={mainProfessional.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-6 h-6 text-gray-600" />
                  )}
                </div>
                <div>
                  <p className="text-white font-medium">{mainProfessional.name}</p>
                  {mainProfessional.specialty && (
                    <p className="text-white/80 text-sm">{mainProfessional.specialty}</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Description Section */}
        {selectedClass.description && (
          <>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-secondary, #ef4444)' }}>
              <h3 className="text-white font-semibold">Descripción</h3>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
              <p className="text-white/90 text-sm">{selectedClass.description}</p>
            </div>
          </>
        )}

        {/* Book Button */}
        <Button 
          className="w-full text-white font-semibold py-4 text-lg rounded-lg hover:opacity-90" style={{ backgroundColor: 'var(--widget-secondary, #ef4444)' }}
          onClick={() => {
            setSelectedService(null); // Asegurar limpieza antes de navegar
            // Limpiar cualquier parámetro de suscripción en la URL
            window.location.hash = '#/calendario';
            setCurrentView('calendar');
          }}
        >
          Reservar
        </Button>
      </div>
    );
  };

  // Calendar View
  const CalendarView = () => {
    // Detect subscription calendar mode via URL hash
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(hash.split('?')[1] || '');
    const modeParam = urlParams.get('mode');

    if (modeParam === 'subscription') {
      return (
        <BookingCalendar 
          mode="subscription"
          onBack={() => {
            window.location.hash = '#/suscripciones';
          }}
        />
      );
    }

    if (!selectedService && !selectedClass) {
      return (
        <div className="text-center py-8">
          <p className="text-white">No se ha seleccionado un servicio</p>
        </div>
      );
    }

    return <BookingCalendar 
      service={selectedService} 
      classItem={selectedClass}
      mode={selectedClass ? 'class' : 'service'}
      onBack={() => {
        if (selectedService) {
          setCurrentView('service-detail');
        } else if (selectedClass) {
          setCurrentView('class-detail');
        }
      }}
    />;
  };

  // New View Components
  const BonosView = () => (
    <div className="space-y-4">
      {vouchersLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="p-4 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-gray-300/50 rounded"></div>
                <div className="flex-1">
                  <div className="h-4 w-32 bg-gray-300/50 rounded mb-2"></div>
                  <div className="h-3 w-24 bg-gray-300/50 rounded mb-1"></div>
                  <div className="h-3 w-20 bg-gray-300/50 rounded"></div>
                </div>
                <div className="text-right">
                  <div className="h-4 w-16 bg-gray-300/50 rounded mb-1"></div>
                  <div className="h-3 w-12 bg-gray-300/50 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : publicVouchers.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/20 rounded-full flex items-center justify-center">
            <Ticket className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-white font-medium mb-2">No hay bonos disponibles</h3>
          <p className="text-white/80 text-sm">Próximamente tendremos bonos disponibles</p>
        </div>
      ) : (
        <div className="space-y-3">
          {publicVouchers.map((voucher) => (
            <div 
              key={voucher.id} 
              className="p-4 rounded-lg cursor-pointer transition-transform hover:scale-[1.02]" 
              style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
              onClick={() => {
                setSelectedVoucherId(voucher.id);
                setCurrentView('voucher-detail');
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-amber-500/20 rounded flex items-center justify-center overflow-hidden">
                  {voucher.photo_url ? (
                    <img src={voucher.photo_url} alt={voucher.name} className="w-full h-full object-cover rounded" />
                  ) : (
                    <Ticket className="w-8 h-8 text-amber-400" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium text-sm">{voucher.name}</h3>
                  {voucher.description && (
                    <p className="text-white/80 text-xs mb-1 line-clamp-2">{voucher.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <span>{voucher.sessions_count} sesiones</span>
                    {voucher.validity_days && <span>• {voucher.validity_days} días</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-medium">
                    {voucher.price}€
                  </p>
                  <p className="text-white/60 text-xs">{voucher.currency}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const parseSubscriptionDescription = (description: string) => {
    if (!description) return '';
    try {
      const parsed = JSON.parse(description);
      return parsed.text || description;
    } catch {
      return description;
    }
  };

  const SuscripcionesView = () => (
    <div className="space-y-4">
      {plansLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="p-4 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-gray-300/50 rounded"></div>
                <div className="flex-1">
                  <div className="h-4 w-32 bg-gray-300/50 rounded mb-2"></div>
                  <div className="h-3 w-24 bg-gray-300/50 rounded mb-1"></div>
                  <div className="h-3 w-20 bg-gray-300/50 rounded"></div>
                </div>
                <div className="text-right">
                  <div className="h-4 w-16 bg-gray-300/50 rounded mb-1"></div>
                  <div className="h-3 w-12 bg-gray-300/50 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : publicPlans.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-500/20 rounded-full flex items-center justify-center">
            <RotateCcw className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-white font-medium mb-2">No hay suscripciones disponibles</h3>
          <p className="text-white/80 text-sm">Próximamente tendremos planes disponibles</p>
        </div>
      ) : (
        <div className="space-y-3">
          {publicPlans.map((plan) => (
            <div 
              key={plan.id} 
              className="p-4 rounded-lg cursor-pointer transition-colors hover:bg-white/5" 
              style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
              onClick={() => {
                console.log('[SubsList] click planId=', plan.id);
                setSelectedPlanId(plan.id);
                console.log('[Router] to subscription-summary planId=', plan.id);
                setCurrentView('subscription-summary');
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-blue-500/20 rounded flex items-center justify-center overflow-hidden">
                  {plan.photo_url ? (
                    <img src={plan.photo_url} alt={plan.name} className="w-full h-full object-cover rounded" />
                  ) : (
                    <RotateCcw className="w-8 h-8 text-blue-400" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium text-sm">{plan.name}</h3>
                  {plan.description && (
                    <p className="text-white/80 text-xs mb-1 line-clamp-2">
                      {parseSubscriptionDescription(plan.description)}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <span>Ciclo: {plan.cycle === 'monthly' ? 'mensual' : plan.cycle}</span>
                    {plan.sessions_count && <span>• {plan.sessions_count} sesiones</span>}
                  </div>
                </div>
                {/* Solo mostrar precio si NO es un plan principal con packs */}
                {plan.pack_type !== 'main' && (
                  <div className="text-right">
                    <p className="text-white font-medium text-lg">
                      {plan.price}€
                    </p>
                    <p className="text-white/60 text-xs">/{plan.cycle === 'monthly' ? 'mes' : plan.cycle}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const MisBonosView = () => (
    <div className="space-y-4">
      {!currentUserId ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-500/20 rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-white font-medium mb-2">Inicia sesión</h3>
          <p className="text-white/80 text-sm">Inicia sesión para ver tus bonos</p>
        </div>
      ) : userVouchersLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="p-4 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-gray-300/50 rounded"></div>
                <div className="flex-1">
                  <div className="h-4 w-32 bg-gray-300/50 rounded mb-2"></div>
                  <div className="h-3 w-24 bg-gray-300/50 rounded mb-1"></div>
                  <div className="h-3 w-20 bg-gray-300/50 rounded"></div>
                </div>
                <div className="text-right">
                  <div className="h-4 w-16 bg-gray-300/50 rounded mb-1"></div>
                  <div className="h-3 w-12 bg-gray-300/50 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : userVouchers.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/20 rounded-full flex items-center justify-center">
            <Ticket className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-white font-medium mb-2">No tienes bonos activos</h3>
          <p className="text-white/80 text-sm mb-4">Adquiere bonos para obtener descuentos</p>
          <Button
            onClick={() => setCurrentView('bonos')}
            className="bg-secondary hover:bg-secondary/90 text-white"
          >
            Ver bonos disponibles
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {userVouchers.map((voucher) => (
            <div 
              key={voucher.id} 
              className="p-4 rounded-lg cursor-pointer transition-transform hover:scale-[1.02]" 
              style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
              onClick={() => {
                // Use the actual voucher.id (user's voucher instance) for detail view
                setSelectedVoucherId(voucher.id);
                setCurrentView('voucher-detail');
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-amber-500/20 rounded flex items-center justify-center">
                  <Ticket className="w-8 h-8 text-amber-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium text-sm">{voucher.voucher_type.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-white/80 mb-1">
                    <span className="font-medium">{voucher.sessions_remaining} créditos restantes</span>
                    {voucher.voucher_type.sessions_count > voucher.sessions_remaining && (
                      <span>de {voucher.voucher_type.sessions_count}</span>
                    )}
                  </div>
                  {voucher.expiry_date && (
                    <p className="text-white/60 text-xs">
                      Vence: {new Date(voucher.expiry_date).toLocaleDateString('es-ES')}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <Badge 
                    variant={voucher.status === 'active' ? 'default' : 'secondary'} 
                    className="text-xs"
                  >
                    {voucher.status === 'active' ? 'Activo' : 'Parcial'}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const MisSuscripcionesView = () => (
    <div className="space-y-4">
      {!currentUserId ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-500/20 rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-white font-medium mb-2">Inicia sesión</h3>
          <p className="text-white/80 text-sm">Inicia sesión para ver tus suscripciones</p>
        </div>
      ) : userSubscriptionsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="p-4 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-gray-300/50 rounded"></div>
                <div className="flex-1">
                  <div className="h-4 w-32 bg-gray-300/50 rounded mb-2"></div>
                  <div className="h-3 w-24 bg-gray-300/50 rounded mb-1"></div>
                  <div className="h-3 w-20 bg-gray-300/50 rounded"></div>
                </div>
                <div className="text-right">
                  <div className="h-4 w-16 bg-gray-300/50 rounded mb-1"></div>
                  <div className="h-3 w-12 bg-gray-300/50 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : userSubscriptions.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-500/20 rounded-full flex items-center justify-center">
            <RotateCcw className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-white font-medium mb-2">No tienes suscripciones activas</h3>
          <p className="text-white/80 text-sm mb-4">Suscríbete a un plan para acceso ilimitado</p>
          <Button
            onClick={() => setCurrentView('suscripciones')}
            className="bg-secondary hover:bg-secondary/90 text-white"
          >
            Ver planes disponibles
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {userSubscriptions.map((subscription) => (
            <div 
              key={subscription.id} 
              className="p-4 rounded-lg cursor-pointer transition-colors hover:bg-white/5" 
              style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}
              onClick={() => {
                setSelectedSubscriptionId(subscription.id);
                setCurrentView('subscription-detail');
              }}
            >
              <div className="flex items-center gap-3">
                {/* Plan Image or Default Icon */}
                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                  {subscription.plan.photo_url ? (
                    <img 
                      src={subscription.plan.photo_url} 
                      alt={subscription.plan.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.parentElement!.innerHTML = `<div class="w-16 h-16 bg-blue-500/20 rounded flex items-center justify-center"><svg class="w-8 h-8 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3Z"/><path d="M12 21c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.66-1.34 3-3 3s-3-1.34-3-3Z"/><path d="M3 12c0-1.66 1.34-3 3-3s3 1.34 3 3-1.34 3-3 3-3-1.34-3-3Z"/><path d="M12 3c0 1.66-1.34 3-3 3S6 4.66 6 3s1.34-3 3-3 3 1.34 3 3Z"/></svg></div>`;
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 bg-blue-500/20 rounded flex items-center justify-center">
                      <RotateCcw className="w-8 h-8 text-blue-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium text-sm">{subscription.plan.name}</h3>
                  <p className="text-white/80 text-xs mb-1">
                    {/* Status-based text */}
                    {subscription.status === 'cancelled' 
                      ? `Cancelada: ${new Date(subscription.next_billing_date).toLocaleDateString('es-ES')}`
                      : subscription.cancel_at_period_end 
                        ? `Se cancelará: ${new Date(subscription.next_billing_date).toLocaleDateString('es-ES')}`
                        : `Próxima renovación: ${new Date(subscription.next_billing_date).toLocaleDateString('es-ES')}`
                    }
                  </p>
                  {subscription.cap_remaining_in_cycle !== null && (
                    <p className="text-white/60 text-xs">
                      {subscription.cap_remaining_in_cycle} usos restantes este ciclo
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <Badge 
                    variant={
                      subscription.cancel_at_period_end ? 'destructive' : 
                      subscription.status === 'cancelled' ? 'destructive' :
                      subscription.status === 'active' ? 'default' : 'secondary'
                    } 
                    className="text-xs mb-1"
                  >
                    {/* Status badge text */}
                    {subscription.cancel_at_period_end 
                      ? 'Se cancelará' 
                      : subscription.status === 'cancelled' 
                        ? 'Cancelada'
                        : subscription.status === 'active' 
                          ? 'Activa' 
                          : subscription.status
                    }
                  </Badge>
                  <p className="text-white/60 text-xs">
                    {subscription.plan.price}€/{subscription.plan.cycle === 'monthly' ? 'mensual' : subscription.plan.cycle}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Auth gate: show login if no session
  if (isAuthChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
        <div className="text-white">Cargando...</div>
      </div>
    );
  }

  if (!authUserId) {
    return (
      <div className="min-h-screen text-foreground max-w-sm mx-auto" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
        <WidgetAuth
          onSuccess={(authId, shadowUser) => {
            setAuthUserId(authId);
            setCurrentUserId(shadowUser.id);
          }}
          organizationId={organization?.id || null}
          slug={slug}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-foreground overflow-hidden max-w-sm mx-auto" style={{ backgroundColor: 'var(--widget-primary, rgba(37, 44, 88, 1))' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button 
          onClick={() => {
      if (currentView === 'services') {
        setSelectedProfessional(null);
        clearServicesState();
        clearClassesState();
        setCurrentView('home');
            } else if (currentView === 'categories') {
              setSelectedCategory(null);
              setClasses([]);
              setClassSessions([]);
              setClassesError(null);
              setCurrentView('home');
            } else if (currentView === 'service-detail') {
              setSelectedService(null);
              setCurrentView('categories');
            } else if (currentView === 'class-detail') {
              setSelectedClass(null);
              setCurrentView('categories');
            } else if (currentView === 'calendar') {
              // Go back to the appropriate detail view
              if (selectedService) {
                setCurrentView('service-detail');
              } else if (selectedClass) {
                setCurrentView('class-detail');
              } else {
                setCurrentView('home');
              }
            } else if (currentView === 'confirmation') {
              setCurrentView('calendar');
            } else if (currentView === 'success') {
              setCurrentView('home');
            } else if (currentView === 'mi-cuenta') {
              setCurrentView('home');
            } else if (currentView === 'subscription-detail') {
              setInitialAccountTab('suscripciones');
              setCurrentView('mi-cuenta');
            } else if (currentView === 'voucher-detail') {
              setInitialAccountTab('bonos');
              setCurrentView('mi-cuenta');
            } else if (currentView === 'voucher-check') {
              setCurrentView('voucher-detail');
            } else if (currentView === 'bonos' || currentView === 'suscripciones' || currentView === 'mis-bonos' || currentView === 'mis-suscripciones') {
              setCurrentView('home');
            } else {
              setCurrentView('home');
            }
          }}
          className="p-1"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-white text-lg font-semibold">
          {currentView === 'services' && selectedProfessional 
            ? selectedProfessional.name 
            : currentView === 'categories' && selectedCategory
            ? selectedCategory.name
            : currentView === 'service-detail' && selectedService
            ? 'Información'
            : currentView === 'class-detail' && selectedClass
            ? 'Información'
            : currentView === 'calendar'
            ? 'Seleccionar fecha'
            : currentView === 'confirmation'
            ? 'Confirmar reserva'
            : currentView === 'success'
            ? '¡Reserva confirmada!'
            : currentView === 'voucher-check'
            ? 'Verificar bono'
            : currentView === 'mi-cuenta'
            ? 'Mi Cuenta'
            : currentView === 'bonos'
            ? 'Bonos disponibles'
            : currentView === 'suscripciones'
            ? 'Suscripciones disponibles'
            : currentView === 'mis-bonos'
            ? 'Mis bonos'
            : currentView === 'mis-suscripciones'
            ? 'Mis suscripciones'
            : currentView === 'subscription-detail'
            ? 'Detalle suscripción'
            : currentView === 'voucher-detail'
            ? 'Detalle bono'
            : 'Reservas Pro'
          }
        </h1>
        
        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center relative transition-all hover:bg-white/30"
          >
            <User className="w-5 h-5 text-white" />
            {/* Upcoming bookings count badge */}
            {upcomingBookingsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-destructive text-destructive-foreground text-[11px] font-bold rounded-full flex items-center justify-center shadow-md animate-in zoom-in-50 duration-200">
                {upcomingBookingsCount}
              </span>
            )}
            {/* Dot indicator for vouchers/subscriptions (only if no bookings badge) */}
            {upcomingBookingsCount === 0 && (userVouchers.length > 0 || userSubscriptions.filter(s => s.status === 'active').length > 0) && (
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-secondary rounded-full ring-2 ring-primary" />
            )}
          </button>

          {/* User Menu Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Mis citas - prominent entry */}
              <button
                onClick={() => {
                  setInitialAccountTab('reservas');
                  setCurrentView('mi-cuenta');
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="font-medium">Mis citas</span>
                </span>
                {upcomingBookingsCount > 0 && (
                  <Badge className="bg-destructive text-destructive-foreground text-[11px] px-1.5 py-0 font-bold">
                    {upcomingBookingsCount}
                  </Badge>
                )}
              </button>
              <hr className="my-1 border-gray-100" />
              <button
                onClick={() => {
                  setInitialAccountTab('bonos');
                  setCurrentView('mi-cuenta');
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                  <span>Mis bonos</span>
                </span>
                {userVouchers.length > 0 && (
                  <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                    {totalVoucherCredits}
                  </Badge>
                )}
              </button>
              <button
                onClick={() => {
                  setInitialAccountTab('suscripciones');
                  setCurrentView('mi-cuenta');
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <span>Mis suscripciones</span>
                </span>
                {userSubscriptions.filter(s => s.status === 'active').length > 0 && (
                  <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                    {userSubscriptions.filter(s => s.status === 'active').length}
                  </Badge>
                )}
              </button>
              <hr className="my-1 border-gray-100" />
              <button
                onClick={() => {
                  setCurrentView('mi-cuenta');
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                <span>Mi cuenta</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {currentView === 'home' && <HomeView />}
        {currentView === 'location' && <LocationView />}
        {currentView === 'services' && <ServicesView />}
        {currentView === 'categories' && <CategoriesView />}
        {currentView === 'service-detail' && <ServiceDetailView />}
        {currentView === 'class-detail' && <ClassDetailView />}
        {currentView === 'calendar' && <CalendarView />}
        {currentView === 'confirmation' && (
          <>
            {console.log('Attempting to render confirmation:', { currentView, bookingParams })}
            {bookingParams ? (
              <>
                {console.log('Rendering BookingConfirmation with params:', bookingParams)}
                <BookingConfirmation
                  serviceId={bookingParams.serviceId}
                  classId={bookingParams.classId}
                  professionalId={bookingParams.professionalId}
                  locationId={bookingParams.locationId || undefined}
                  date={bookingParams.date}
                  time={bookingParams.time}
                  mode={bookingParams.mode}
                  voucherId={bookingParams.voucherId || undefined}
                  voucherTypeId={bookingParams.voucherTypeId}
                  durationMin={bookingParams.durationMin}
                  subscriptionPlanId={bookingParams.subscriptionPlanId}
                  onBack={confirmationOnBack}
                />
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-white">No se encontraron los parámetros de reserva</p>
                <button onClick={() => setCurrentView('home')} className="mt-4 text-white underline">
                  Volver al inicio
                </button>
              </div>
            )}
          </>
        )}
        {currentView === 'success' && (
          <BookingSuccess
            onContinue={() => {
              // Navigate to user account
              setCurrentView('mi-cuenta');
            }}
          />
        )}
        {currentView === 'mi-cuenta' && (
          <>
          <UserAccount
            initialTab={initialAccountTab}
            onBack={() => setCurrentView('home')}
            onReserveVoucher={async (voucherId: string, voucherTypeId: string) => {
              console.log('[MyAccount.Bonos] click Reservar', { voucherId, voucherTypeId });
              
              // Set both IDs
              setSelectedVoucherId(voucherId);
              setSelectedVoucherTypeId(voucherTypeId);
              
              // Save to localStorage for VoucherBookingCalendar
              try {
                localStorage.setItem('reservasPro_verifiedVoucherId', voucherId);
                localStorage.setItem('reservasPro_selectedVoucherTypeId', voucherTypeId);
              } catch (e) {
                console.warn('[MyAccount.Bonos] localStorage error', e);
              }

              // Get allowed services for this voucher type
              const { getVoucherAllowedServices } = await import('@/lib/voucher-flow-utils');
              const allowedServiceIds = await getVoucherAllowedServices(voucherTypeId);
              console.log('[MyAccount.Bonos] Allowed services:', allowedServiceIds);

              // Ensure we have a location
              try {
                let locId = selectedLocationId;
                if (!locId) {
                  const def = await getDefaultLocation();
                  locId = def?.id || null;
                }
                if (locId) setSelectedLocationId(locId);
              } catch (e) {
                console.warn('[Widget] default location resolve failed', e);
              }

              // Find professional - PRIORITY: use professional_id from voucher_type
              let profId: string | null = null;
              
              // Helper function to check if a professional has active services
              const hasActiveServices = async (pid: string): Promise<boolean> => {
                console.log('[hasActiveServices] Checking professional:', pid);
                const { data: spLinks, error: spError } = await supabase
                  .from('service_professionals')
                  .select('service_id')
                  .eq('professional_id', pid);
                
                if (spError) {
                  console.error('[hasActiveServices] Error fetching service_professionals:', spError);
                  return false;
                }
                
                console.log('[hasActiveServices] Service links for professional', pid, ':', spLinks);
                
                if (!spLinks || spLinks.length === 0) {
                  console.log('[hasActiveServices] No services linked to professional:', pid);
                  return false;
                }
                
                const serviceIds = spLinks.map(sp => sp.service_id).filter(Boolean);
                
                // Check if any of these services are active
                const { data: services, error: svcError } = await supabase
                  .from('services')
                  .select('id, name, active')
                  .in('id', serviceIds)
                  .eq('active', true);
                
                if (svcError) {
                  console.error('[hasActiveServices] Error fetching services:', svcError);
                  return false;
                }
                
                console.log('[hasActiveServices] Active services for professional', pid, ':', services);
                
                return (services || []).length > 0;
              };

              try {
                // 1. FIRST: Get professional_id from voucher_type (HIGHEST PRIORITY)
                const { data: voucherType } = await supabase
                  .from('voucher_types')
                  .select('professional_id')
                  .eq('id', voucherTypeId)
                  .single();
                
                if (voucherType?.professional_id) {
                  const voucherProfId = voucherType.professional_id;
                  if (await hasActiveServices(voucherProfId)) {
                    profId = voucherProfId;
                    console.log('[MyAccount.Bonos] Using voucher type professional:', profId);
                  } else {
                    console.warn('[MyAccount.Bonos] Voucher professional has no active services:', voucherProfId);
                  }
                }

                // 2. Try locked professional from voucherFlow (fallback)
                if (!profId) {
                  const saved = localStorage.getItem('reservasPro_voucherFlow');
                  if (saved) {
                    const parsed = JSON.parse(saved);
                    const lockedProfId = parsed.lockedProfessionalId;
                    if (lockedProfId && await hasActiveServices(lockedProfId)) {
                      profId = lockedProfId;
                      console.log('[MyAccount.Bonos] Using locked professional:', profId);
                    }
                  }
                }

                // 3. Try each professional from the loaded list (fallback)
                if (!profId && professionals && professionals.length > 0) {
                  for (const prof of professionals) {
                    if (await hasActiveServices(prof.id)) {
                      profId = prof.id;
                      console.log('[MyAccount.Bonos] Found valid professional from list:', profId);
                      break;
                    }
                  }
                }

                // 4. Last resort: query database for any professional with active services
                if (!profId) {
                  const { data: professionalIds } = await supabase
                    .from('service_professionals')
                    .select('professional_id, services!inner(active)')
                    .eq('services.active', true)
                    .limit(50);
                  
                  const uniqueProfIds = [...new Set((professionalIds || []).map((p: any) => p.professional_id))];
                  if (uniqueProfIds.length > 0) {
                    profId = uniqueProfIds[0];
                    console.log('[MyAccount.Bonos] Last resort professional:', profId);
                  }
                }
              } catch (e) {
                console.error('[MyAccount.Bonos] Error finding professional:', e);
              }

              if (!profId) {
                toast({ 
                  title: 'Sin profesionales disponibles', 
                  description: 'No hay profesionales con servicios activos para reservar', 
                  variant: 'destructive' 
                });
                setCurrentView('bonos');
                return;
              }

              // Get current user
              const savedUser = localStorage.getItem('reservasPro_user');
              const userId = savedUser ? JSON.parse(savedUser)?.userShadowId : null;
              
              if (userId) {
                // Persist voucher flow with all required information
                const { persistVoucherFlow } = await import('@/lib/voucher-flow-utils');
                await persistVoucherFlow(voucherId, userId, allowedServiceIds, voucherTypeId, profId);
                console.log('[MyAccount.Bonos] Persisted voucher flow');
              }

              setSelectedProfessionalId(profId);
              console.info('[Navigate] to voucher-calendar', { voucherId, voucherTypeId, selectedProfessionalId: profId, selectedLocationId });
              setCurrentView('voucher-calendar');
            }}
              onNavigateToSubscriptionCalendar={async (subscriptionId: string, planId: string) => {
                console.log('[MyAccount.Subscriptions] click Nueva Reserva', { subscriptionId, planId });
                setSelectedSubscriptionId(subscriptionId);

                // Ensure we have a location
                try {
                  let locId = selectedLocationId;
                  if (!locId) {
                    const def = await getDefaultLocation();
                    locId = def?.id || null;
                  }
                  if (locId) setSelectedLocationId(locId);
                } catch (e) {
                  console.warn('[Widget] default location resolve failed', e);
                }

                // Set professional if needed
                if (!selectedProfessionalId && professionals?.length) {
                  setSelectedProfessionalId(professionals[0]?.id || null);
                }

                // Use planId directly from parameter
                if (planId) {
                  window.location.hash = `#/calendario?mode=subscription&planId=${planId}`;
                  console.info('[Navigate] to calendar for subscription', { subscriptionId, planId, selectedLocationId });
                  setCurrentView('calendar');
                } else {
                  console.warn('[Navigate] planId not found for subscription', { subscriptionId });
                }
              }}
          />
          <div className="px-4 pb-4">
            <Button
              variant="outline"
              className="w-full text-white/70 border-white/20 hover:bg-white/10"
              onClick={async () => {
                await supabase.auth.signOut();
                setAuthUserId(null);
                setCurrentUserId(null);
                localStorage.removeItem('reservasPro_user');
                setCurrentView('home');
              }}
            >
              Cerrar sesion
            </Button>
          </div>
          </>
        )}

        {/* New Views for Plans */}
        {currentView === 'bonos' && <BonosView />}
        {currentView === 'suscripciones' && <SuscripcionesView />}
        {currentView === 'mis-bonos' && <MisBonosView />}
        {currentView === 'mis-suscripciones' && <MisSuscripcionesView />}
        {currentView === 'subscription-detail' && selectedSubscriptionId && (
          <UserSubscriptions 
            userId={currentUserId || undefined}
            selectedSubscriptionId={selectedSubscriptionId}
            onNavigateToCalendar={(subscriptionId, planId) => {
              setSelectedSubscriptionId(subscriptionId);
              if (planId) {
                window.location.hash = `#/calendario?mode=subscription&planId=${planId}`;
                setCurrentView('calendar');
              } else {
                console.warn('[Navigate] planId not found for subscription', { subscriptionId });
              }
            }}
          />
        )}
        
        {currentView === 'voucher-detail' && selectedVoucherId && (
          // Show UserVoucherDetail only if this voucher ID belongs to user's vouchers
          userVouchers.some(v => v.id === selectedVoucherId) ? (
            <UserVoucherDetail 
              userId={currentUserId || undefined}
              selectedVoucherId={selectedVoucherId}
              onNavigateToCalendar={async (voucherId) => {
                console.log('[UserVoucherDetail] Navigating to calendar for voucher:', voucherId);
                
                // Find the voucher to get its type id
                const voucher = userVouchers.find(v => v.id === voucherId);
                const voucherTypeId = voucher?.voucher_type?.id || voucher?.voucher_type_id;
                
                if (voucherTypeId) {
                  setSelectedVoucherTypeId(voucherTypeId);
                  
                  // Get allowed services for this voucher type
                  const allowedServiceIds = await getVoucherAllowedServices(voucherTypeId);
                  
                  // Get professional from voucher_type if not already selected
                  let professionalId = selectedProfessionalId;
                  if (!professionalId) {
                    try {
                      const { data: vt } = await supabase
                        .from('voucher_types')
                        .select('professional_id')
                        .eq('id', voucherTypeId)
                        .maybeSingle();
                      if (vt?.professional_id) {
                        professionalId = vt.professional_id;
                        setSelectedProfessionalId(professionalId);
                      }
                    } catch (e) {
                      console.warn('[UserVoucherDetail] Failed to resolve voucher_type professional', e);
                    }
                  }
                  
                  // CRITICAL: Persist the correct voucherId to localStorage
                  if (currentUserId) {
                    await persistVoucherFlow(
                      voucherId,           // The CORRECT voucherId of the selected voucher
                      currentUserId,
                      allowedServiceIds,
                      voucherTypeId,
                      professionalId || undefined
                    );
                    console.log('[UserVoucherDetail] Persisted voucherFlow with correct voucherId:', voucherId);
                  }
                  
                  // Set default location if not already selected
                  if (!selectedLocationId) {
                    const defaultLoc = await getDefaultLocation();
                    if (defaultLoc) {
                      setSelectedLocationId(defaultLoc.id);
                    } else {
                      try {
                        const { data: anyLoc } = await supabase
                          .from('locations')
                          .select('id')
                          .eq('active', true)
                          .order('created_at', { ascending: true })
                          .limit(1);
                        if (anyLoc && anyLoc.length > 0) {
                          setSelectedLocationId(anyLoc[0].id);
                        }
                      } catch (error) {
                        console.error('Error getting location:', error);
                      }
                    }
                  }
                  
                  // Navigate to voucher calendar
                  setCurrentView('voucher-calendar');
                } else {
                  toast({
                    title: "Error",
                    description: "No se pudo obtener la información del bono",
                    variant: "destructive",
                  });
                }
              }}
            />
          ) : (
            // Show VoucherDetailView for public vouchers (to purchase)
            <VoucherDetailView
              voucherTypeId={selectedVoucherId}
              onBack={() => setCurrentView('bonos')}
              onReserveClick={(voucherTypeId: string, professionalId: string, locationId: string) => {
                console.log('[Widget] onReserveClick - going to voucher check', { voucherTypeId, professionalId, locationId });
                
                // Set voucher check parameters
                setVoucherCheckParams({
                  voucherTypeId,
                  professionalId,
                  locationId
                });
                
                // Navigate to voucher check (email verification)
                setCurrentView('voucher-check');
              }}
              onPurchaseClick={(voucherTypeId: string) => {
                console.log('[Widget] onPurchaseClick', { voucherTypeId });
                // Navigate directly to purchase
                setSelectedVoucherId(voucherTypeId);
                setCurrentView('voucher-purchase');
              }}
            />
          )
        )}
        
        {/* Voucher Check View */}
        {currentView === 'voucher-check' && voucherCheckParams && (
          <VoucherCheck
            voucherTypeId={voucherCheckParams.voucherTypeId}
            professionalId={voucherCheckParams.professionalId}
            onBack={() => setCurrentView('voucher-detail')}
            onVerified={async (voucherId: string, userId: string) => {
              console.log('[Widget.onVerified] start', { voucherId, userId, voucherCheckParams });

              // Ensure voucher type is set
              const voucherTypeIdToUse = voucherCheckParams?.voucherTypeId || selectedVoucherId;
              if (!selectedVoucherId && voucherTypeIdToUse) {
                setSelectedVoucherId(voucherTypeIdToUse);
              }

              // Get allowedServiceIds for validation - VoucherCheck already persisted them
              let allowedServiceIds: string[] = [];
              try {
                const vfSaved = localStorage.getItem('reservasPro_voucherFlow');
                if (vfSaved) {
                  const parsed = JSON.parse(vfSaved);
                  if (Array.isArray(parsed?.allowedServiceIds)) {
                    allowedServiceIds = parsed.allowedServiceIds;
                  }
                }
              } catch {}

              // If allowedServiceIds not in flow, fetch them now
              if (allowedServiceIds.length === 0 && voucherTypeIdToUse) {
                const { getVoucherAllowedServices } = await import('@/lib/voucher-flow-utils');
                allowedServiceIds = await getVoucherAllowedServices(voucherTypeIdToUse);
                console.log('[Widget.onVerified] Fetched allowedServiceIds:', allowedServiceIds);
              }

              // Determine location to use: from params, default, or first active
              let locationIdToUse = voucherCheckParams?.locationId || null;
              if (!locationIdToUse) {
                const def = await getDefaultLocation();
                locationIdToUse = def?.id || null;
              }
              if (!locationIdToUse) {
                try {
                  const { data: anyLoc } = await supabase
                    .from('locations')
                    .select('id')
                    .eq('active', true)
                    .order('created_at', { ascending: true })
                    .limit(1);
                  if (anyLoc && anyLoc.length > 0) locationIdToUse = anyLoc[0].id;
                } catch {}
              }

              // Determine professional to use: locked from flow, param, first loaded, or first active
              let professionalIdToUse: string | null = null;
              try {
                const saved = localStorage.getItem('reservasPro_voucherFlow');
                if (saved) {
                  const parsed = JSON.parse(saved);
                  professionalIdToUse = parsed.lockedProfessionalId || null;
                }
              } catch {}
              if (!professionalIdToUse) {
                professionalIdToUse = voucherCheckParams?.professionalId || null;
              }
              if (!professionalIdToUse) {
                try {
                  if (voucherTypeIdToUse) {
                    const { data: vt } = await supabase
                      .from('voucher_types')
                      .select('professional_id')
                      .eq('id', voucherTypeIdToUse)
                      .maybeSingle();
                    professionalIdToUse = vt?.professional_id || null;
                  }
                } catch {}
              }

              console.log('[Widget.onVerified]', { professionalIdToUse, locationIdToUse, allowedServiceIds });

              // Re-persist voucher flow with all correct data to ensure consistency
              if (voucherTypeIdToUse && professionalIdToUse) {
                const { persistVoucherFlow } = await import('@/lib/voucher-flow-utils');
                await persistVoucherFlow(voucherId, userId, allowedServiceIds, voucherTypeIdToUse, professionalIdToUse);
                console.log('[Widget.onVerified] Re-persisted voucher flow');
              }

              setCurrentUserId(userId);

              // ServiceGuard BEFORE opening calendar: if a service is preselected, validate it's allowed
              try {
                if (selectedService?.id) {
                  const allowed = allowedServiceIds.length === 0 || allowedServiceIds.includes(selectedService.id);
                  console.info('[ServiceGuard]', { selectedServiceId: selectedService.id, allowed, allowedServiceIds });
                  if (!allowed) {
                    toast({ title: 'Servicio no incluido', description: 'Este servicio no está incluido en tu bono', variant: 'destructive' });
                    setCurrentView('services');
                    return;
                  }
                }
              } catch (e) {
                console.warn('[Widget] ServiceGuard precheck failed', e);
              }

              // Set fallbacks and navigate to calendar
              if (voucherTypeIdToUse && professionalIdToUse && locationIdToUse) {
                setSelectedProfessionalId(professionalIdToUse);
                setSelectedLocationId(locationIdToUse);
                setCurrentView('voucher-calendar');
              } else {
                toast({ title: 'Faltan datos', description: 'No se pudo determinar profesional o centro', variant: 'destructive' });
                setCurrentView('services');
              }
            }}
            onNeedsVoucher={() => {
              console.log('[Widget] User needs voucher, redirecting to purchase');
              if (voucherCheckParams) {
                setSelectedVoucherId(voucherCheckParams.voucherTypeId);
                setCurrentView('voucher-purchase');
              }
            }}
          />
        )}
        
        {/* Voucher Purchase View */}
        {currentView === 'voucher-purchase' && selectedVoucherId && (
          <VoucherPurchase
            voucherTypeId={selectedVoucherId}
            onBack={() => setCurrentView('voucher-detail')}
            onPurchaseSuccess={async (voucherTypeId: string) => {
              console.log('[Widget] Voucher purchased successfully for type:', voucherTypeId);
              
              // CRÍTICO: Refrescar vouchers del usuario inmediatamente después de compra
              await refetchUserVouchers();
              
              // Re-sync currentUserId from localStorage after purchase
              let userId: string | null = null;
              try {
                const saved = localStorage.getItem('reservasPro_user');
                if (saved) {
                  const parsed = JSON.parse(saved);
                  if (parsed?.userShadowId) {
                    console.log('[Widget] Syncing currentUserId after voucher purchase:', parsed.userShadowId);
                    userId = parsed.userShadowId;
                    setCurrentUserId(parsed.userShadowId);
                  }
                }
              } catch (e) {
                console.warn('[Widget] Failed to sync user after voucher purchase');
              }
              
              // CRÍTICO: Buscar el voucher recién creado y guardar su ID en localStorage
              if (userId && voucherTypeId) {
                const { data: newVoucher } = await supabase
                  .from('vouchers')
                  .select('id')
                  .eq('user_id', userId)
                  .eq('voucher_type_id', voucherTypeId)
                  .eq('status', 'active')
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                
                if (newVoucher) {
                  console.log('[Widget] Saving new voucher ID to localStorage:', newVoucher.id);
                  localStorage.setItem('reservasPro_verifiedVoucherId', newVoucher.id);
                  localStorage.setItem('reservasPro_selectedVoucherTypeId', voucherTypeId);
                } else {
                  console.warn('[Widget] Could not find newly created voucher');
                }
              }
              
              // Find the voucher type to get name and sessions_count
              const voucherType = publicVouchers?.find(v => v.id === voucherTypeId);
              if (voucherType) {
                setPurchasedVoucherType({
                  name: voucherType.name,
                  sessions_count: voucherType.sessions_count
                });
              }
              
              // Show success page
              setCurrentView('voucher-success');
            }}
          />
        )}
        
        {/* Voucher Success View */}
        {currentView === 'voucher-success' && purchasedVoucherType && (
          <VoucherSuccessMessage
            voucherType={purchasedVoucherType}
            onReserveNow={async () => {
              try {
                // CRÍTICO: Asegurar que los vouchers están actualizados antes de reservar
                await refetchUserVouchers();
                
                // 0) Ensure we have the voucher type and voucher id from the recent purchase
                let voucherTypeId = localStorage.getItem('reservasPro_selectedVoucherTypeId') || selectedVoucherId;
                let verifiedVoucherId = localStorage.getItem('reservasPro_verifiedVoucherId');

                const savedUser = localStorage.getItem('reservasPro_user');
                const userId = savedUser ? JSON.parse(savedUser)?.userShadowId : null;

                if (!voucherTypeId || !verifiedVoucherId) {
                  // Fallback: fetch the most recent active voucher for the current user
                  if (userId) {
                    const { data: lastVoucher } = await supabase
                      .from('vouchers')
                      .select('id, voucher_type_id, status, sessions_remaining')
                      .eq('user_id', userId)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    if (lastVoucher) {
                      voucherTypeId = lastVoucher.voucher_type_id;
                      verifiedVoucherId = lastVoucher.id;
                      try {
                        localStorage.setItem('reservasPro_selectedVoucherTypeId', voucherTypeId);
                        localStorage.setItem('reservasPro_verifiedVoucherId', verifiedVoucherId);
                      } catch {}
                      setSelectedVoucherId(voucherTypeId);
                    }
                  }
                } else {
                  // Ensure selected state mirrors storage
                  setSelectedVoucherId(voucherTypeId);
                }

                // Get allowedServiceIds for this voucher type
                let allowedServiceIds: string[] = [];
                if (voucherTypeId) {
                  const { getVoucherAllowedServices } = await import('@/lib/voucher-flow-utils');
                  allowedServiceIds = await getVoucherAllowedServices(voucherTypeId);
                  console.log('[VoucherSuccessMessage] Allowed services:', allowedServiceIds);
                }

                // Ensure location
                let locId = selectedLocationId;
                if (!locId) {
                  const def = await getDefaultLocation();
                  locId = def?.id || null;
                  if (!locId) {
                    const { data: anyLoc } = await supabase
                      .from('locations')
                      .select('id')
                      .eq('active', true)
                      .order('created_at', { ascending: true })
                      .limit(1);
                    locId = anyLoc?.[0]?.id || null;
                  }
                }
                if (locId) setSelectedLocationId(locId);

                // Ensure professional - LOCK to voucher_type professional (no fallbacks)
                let profId: string | null = null;
                if (voucherTypeId) {
                  const { data: voucherType } = await supabase
                    .from('voucher_types')
                    .select('professional_id')
                    .eq('id', voucherTypeId)
                    .maybeSingle();
                  profId = voucherType?.professional_id || null;
                  console.log('[VoucherSuccessMessage] Locked professional from voucher_type:', profId);
                }

                if (voucherTypeId && verifiedVoucherId && profId && locId && userId) {
                  // Persist voucher flow with ALL correct data
                  const { persistVoucherFlow } = await import('@/lib/voucher-flow-utils');
                  await persistVoucherFlow(verifiedVoucherId, userId, allowedServiceIds, voucherTypeId, profId);
                  console.log('[VoucherSuccessMessage] Persisted voucher flow with allowedServiceIds');
                  
                  setSelectedProfessionalId(profId);
                  setSelectedVoucherTypeId(voucherTypeId);
                  setCurrentView('voucher-calendar');
                } else {
                  console.warn('[VoucherSuccessMessage] Missing data:', { voucherTypeId, verifiedVoucherId, profId, locId, userId });
                  setCurrentView('services');
                }
              } catch (e) {
                console.warn('[VoucherSuccessMessage ReserveNow] error:', e);
                setCurrentView('services');
              }
            }}
            onGoToAccount={() => {
              setCurrentView('mi-cuenta');
            }}
          />
        )}
        
        {/* Voucher Calendar View */}
        {currentView === 'voucher-calendar' && selectedVoucherTypeId && selectedProfessionalId && selectedLocationId && (
          <VoucherBookingCalendar
            voucherTypeId={selectedVoucherTypeId}
            professionalId={selectedProfessionalId}
            locationId={selectedLocationId}
            onBack={() => setCurrentView('voucher-detail')}
            onTimeSlotSelect={(date: string, time: string, serviceId?: string, durationMin?: number) => {
              console.log('[Widget] Voucher time slot selected:', { date, time, serviceId, durationMin, voucherTypeId: selectedVoucherTypeId });
              // Navigate to confirmation with voucher mode
              const verifiedVoucherId = localStorage.getItem('reservasPro_verifiedVoucherId');
              setBookingParams({
                serviceId: serviceId || null,
                professionalId: selectedProfessionalId,
                locationId: selectedLocationId,
                date,
                time,
                mode: 'voucher',
                voucherId: verifiedVoucherId,
                voucherTypeId: selectedVoucherTypeId || undefined,
                durationMin: durationMin
              });
              console.log('[Widget] Navigating to voucher confirmation');
              setCurrentView('confirmation');
            }}
          />
        )}
        
        {/* Subscription Summary View */}
        {currentView === 'subscription-summary' && (
          <SubscriptionSummary
            planId={selectedPlanId || undefined}
            onBack={() => setCurrentView('suscripciones')}
            onBuySubscription={(planId: string) => {
              console.log('[SubscriptionSummary] Buy subscription for planId=', planId);
              setSelectedPlanId(planId);
              setCurrentView('subscription-purchase');
            }}
            onUseSubscription={(planId: string) => {
              console.log('[SubscriptionSummary] Use subscription for planId=', planId);
              setSelectedPlanId(planId);
              setCurrentView('subscription-check');
            }}
          />
        )}
        
        {/* Subscription Check View */}
        {currentView === 'subscription-check' && (
          <SubscriptionCheck
            planId={selectedPlanId || undefined}
            onBack={() => {
              console.log('[SubscriptionCheck] Back to summary');
              setCurrentView('subscription-summary');
            }}
            onSubscriptionVerified={(subscriptionFlow: SubscriptionFlow) => {
              console.log('[SubscriptionCheck] Subscription verified:', subscriptionFlow);
              saveSubscriptionFlow(subscriptionFlow);
              
              // Navigate to calendar with subscription mode
              const planId = subscriptionFlow.planId;
              if (!planId) {
                console.log('[SubFlow] Missing planId, going to subscriptions');
                toast({
                  title: 'Error',
                  description: 'ID del plan no encontrado',
                  variant: 'destructive',
                });
                window.location.hash = '#/suscripciones';
                return;
              }
              
              console.log('[SubFlow] navigate calendar planId=', planId);
              window.location.hash = `#/calendario?mode=subscription&planId=${planId}`;
              // Force view switch immediately in case hashchange listener doesn't fire fast
              setCurrentView('calendar');
            }}
            onRedirectToPurchase={(planId: string) => {
              console.log('[SubscriptionCheck] Redirect to purchase for planId=', planId);
              setSelectedPlanId(planId);
              setCurrentView('subscription-purchase');
            }}
          />
        )}
        
        {/* Subscription Selector View */}
        {currentView === 'subscription-selector' && subscriptionFlow && (
          <SubscriptionSelector
            subscriptionFlow={subscriptionFlow}
            onBack={() => {
              clearSubscriptionFlow();
              setCurrentView('home');
            }}
            onSelectClass={(classData) => {
              console.log('[SubscriptionSelector] Selected class:', classData);
              // Set selected class and navigate to calendar
              setSelectedClass(classData);
              setCurrentView('calendar');
            }}
            onSelectService={(serviceData) => {
              console.log('[SubscriptionSelector] Selected service:', serviceData);
              // Set selected service and navigate to calendar - add missing category field
              const serviceWithCategory = {
                ...serviceData,
                category: serviceData.description || '',
                professionals: []
              };
              setSelectedService(serviceWithCategory);
              setCurrentView('calendar');
            }}
          />
        )}
        
        {/* Subscription Purchase View */}
        {currentView === 'subscription-purchase' && selectedPlanId && (
          <SubscriptionPurchase
            planId={selectedPlanId}
            onBack={() => setCurrentView('subscription-summary')}
            onPurchaseSuccess={async (subscriptionId) => {
              console.log('[Widget] subscription purchased:', subscriptionId);
              
              // Re-sync currentUserId from localStorage after purchase
              try {
                const saved = localStorage.getItem('reservasPro_user');
                if (saved) {
                  const parsed = JSON.parse(saved);
                  if (parsed?.userShadowId) {
                    console.log('[Widget] Syncing currentUserId after subscription purchase:', parsed.userShadowId);
                    setCurrentUserId(parsed.userShadowId);
                  }
                }
              } catch (e) {
                console.warn('[Widget] Failed to sync user after subscription purchase');
              }
              
              setSelectedSubscriptionId(subscriptionId);
              
              // Obtener datos del plan para preparar subscriptionFlow
              try {
                const { data: subscription } = await supabase
                  .from('subscriptions')
                  .select(`
                    id,
                    plan_id,
                    plan:subscription_plans (
                      id,
                      name,
                      description
                    )
                  `)
                  .eq('id', subscriptionId)
                  .maybeSingle();
                
                if (subscription) {
                  const planData = subscription.plan as any;
                  
                  // Parsear session_config del plan si existe (planes con horarios fijos)
                  let sessionConfig = null;
                  if (planData?.description) {
                    try {
                      const parsed = JSON.parse(planData.description);
                      if (parsed.session_config) {
                        sessionConfig = parsed.session_config;
                      }
                    } catch (e) {
                      // description no es JSON, es texto normal - ignorar
                    }
                  }
                  
                  // Si el plan tiene session_config (horarios fijos), usar directamente
                  if (sessionConfig && sessionConfig.professional_id) {
                    const flow = {
                      origin: 'subscription',
                      subscriptionId: subscriptionId,
                      planId: subscription.plan_id,
                      allowedClassIds: [] as string[],
                      allowedServiceIds: [] as string[],
                      lockedProfessionalId: sessionConfig.professional_id,
                      sessionConfig: sessionConfig,
                    };
                    
                    saveSubscriptionFlow(flow);
                    console.log('[Widget] Saved subscriptionFlow with session_config:', flow);
                  } else {
                    // Plan tradicional: buscar clases y servicios por categoría
                    const { data: planClasses } = await supabase
                      .from('subscription_plan_classes')
                      .select('class_id')
                      .eq('plan_id', subscription.plan_id);
                    
                    const { data: planCategories } = await supabase
                      .from('subscription_plan_categories')
                      .select('category_id')
                      .eq('plan_id', subscription.plan_id);
                    
                    const categoryIds = (planCategories || []).map(c => c.category_id).filter(Boolean);
                    let allowedServiceIds: string[] = [];
                    if (categoryIds.length > 0) {
                      const { data: services } = await supabase
                        .from('services')
                        .select('id')
                        .eq('active', true)
                        .in('category_id', categoryIds);
                      allowedServiceIds = (services || []).map(s => s.id);
                    }
                    
                    const flow = {
                      origin: 'subscription',
                      subscriptionId: subscriptionId,
                      planId: subscription.plan_id,
                      allowedClassIds: (planClasses || []).map(c => c.class_id).filter(Boolean) as string[],
                      allowedServiceIds: allowedServiceIds,
                    };
                    
                    saveSubscriptionFlow(flow);
                    console.log('[Widget] Saved subscriptionFlow for new subscription:', flow);
                  }
                }
              } catch (e) {
                console.warn('[Widget] Failed to prepare subscriptionFlow:', e);
              }
              
              toast({
                title: "¡Suscripción activada!",
                description: "Tu suscripción se ha activado correctamente",
              });
              
              // Refrescar la lista de suscripciones del usuario para que aparezca en "Mis suscripciones"
              refetchUserSubscriptions();
              
              // Navigate to success page
              setCurrentView('subscription-success-message');
            }}
          />
        )}
        
        {/* Subscription Success Message View */}
        {currentView === 'subscription-success-message' && selectedSubscriptionId && (
          <SubscriptionSuccessMessage
            subscriptionId={selectedSubscriptionId}
            onReserveNow={() => {
              // Recargar subscriptionFlow desde localStorage para tener los datos actualizados
              const storedFlow = localStorage.getItem('reservasPro_subscriptionFlow');
              const flow = storedFlow ? JSON.parse(storedFlow) : subscriptionFlow;
              
              if (flow) {
                // Si tiene sessionConfig (horarios fijos), ir directamente al calendario en modo subscription
                if (flow.sessionConfig || (flow.allowedClassIds?.length === 0 && flow.allowedServiceIds?.length === 0 && flow.lockedProfessionalId)) {
                  // Navegar al calendario con el profesional bloqueado y pasar planId en la URL
                  if (flow.lockedProfessionalId) {
                    setSelectedProfessionalId(flow.lockedProfessionalId);
                  }
                  // Establecer hash con modo subscription y planId para que CalendarView lo detecte
                  window.location.hash = `#/calendario?mode=subscription&planId=${flow.planId}`;
                  setCurrentView('calendar');
                } else if ((flow.allowedClassIds?.length || 0) + (flow.allowedServiceIds?.length || 0) === 1) {
                  // Solo 1 item permitido, ir al calendario en modo subscription
                  window.location.hash = `#/calendario?mode=subscription&planId=${flow.planId}`;
                  setCurrentView('calendar');
                } else if ((flow.allowedClassIds?.length || 0) + (flow.allowedServiceIds?.length || 0) > 1) {
                  // Múltiples items, mostrar selector
                  setCurrentView('subscription-selector');
                } else {
                  setCurrentView('home');
                }
              } else {
                setCurrentView('home');
              }
            }}
            onGoToAccount={() => {
              setInitialAccountTab('suscripciones');
              setCurrentView('mi-cuenta');
            }}
          />
        )}
        
        {/* Subscription Success View */}
        {currentView === 'exito-suscripcion' && (
          <SubscriptionSuccess
            sessionId={voucherSuccessSessionId} // Reusing this state for session ID
            onBack={() => setCurrentView('suscripciones')}
            onViewSubscriptions={() => { setInitialAccountTab('suscripciones'); setCurrentView('mi-cuenta'); }}
          />
        )}
        
        {/* Stripe Voucher Success View */}
          {currentView === 'stripe-voucher-success' && (
            <VoucherSuccess
              sessionId={voucherSuccessSessionId}
              onBack={() => setCurrentView('bonos')}
              onReserveNow={async () => {
                try {
                  // 0) Ensure we have the voucher type and voucher id from the recent purchase
                  let voucherTypeId = localStorage.getItem('reservasPro_selectedVoucherTypeId') || selectedVoucherId;
                  let verifiedVoucherId = localStorage.getItem('reservasPro_verifiedVoucherId');

                  if (!voucherTypeId || !verifiedVoucherId) {
                    // Fallback: fetch the most recent active voucher for the current user
                    const savedUser = localStorage.getItem('reservasPro_user');
                    const userId = savedUser ? JSON.parse(savedUser)?.userShadowId : null;
                    if (userId) {
                      const { data: lastVoucher } = await supabase
                        .from('vouchers')
                        .select('id, voucher_type_id, status, sessions_remaining')
                        .eq('user_id', userId)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      if (lastVoucher) {
                        voucherTypeId = lastVoucher.voucher_type_id;
                        verifiedVoucherId = lastVoucher.id;
                        try {
                          // Get allowed services for this voucher type
                          const allowedServiceIds = await getVoucherAllowedServices(voucherTypeId);
                          console.log('[StripeVoucherSuccess] Fetched allowedServiceIds:', allowedServiceIds);
                          
                          localStorage.setItem('reservasPro_selectedVoucherTypeId', voucherTypeId);
                          localStorage.setItem('reservasPro_verifiedVoucherId', verifiedVoucherId);
                          // Persist voucher flow with correct allowedServiceIds
                          localStorage.setItem(
                            'reservasPro_voucherFlow',
                            JSON.stringify({
                              origin: 'voucher',
                              voucherId: verifiedVoucherId,
                              voucherTypeId,
                              allowedServiceIds,
                              lockedProfessionalId: null,
                              timestamp: Date.now(),
                            })
                          );
                        } catch {}
                        setSelectedVoucherId(voucherTypeId);
                      }
                    }
                  } else {
                    // Ensure selected state mirrors storage
                    setSelectedVoucherId(voucherTypeId);
                  }

                  // Ensure location
                  let locId = selectedLocationId;
                  if (!locId) {
                    const def = await getDefaultLocation();
                    locId = def?.id || null;
                    if (!locId) {
                      const { data: anyLoc } = await supabase
                        .from('locations')
                        .select('id')
                        .eq('active', true)
                        .order('created_at', { ascending: true })
                        .limit(1);
                      locId = anyLoc?.[0]?.id || null;
                    }
                  }
                  if (locId) setSelectedLocationId(locId);

                  // Ensure professional - LOCK to voucher_type professional (no fallbacks)
                  let profId: string | null = null;
                  if (voucherTypeId) {
                    const { data: voucherType } = await supabase
                      .from('voucher_types')
                      .select('professional_id')
                      .eq('id', voucherTypeId)
                      .maybeSingle();
                    profId = voucherType?.professional_id || null;
                    console.log('[StripeVoucherSuccess] Locked professional from voucher_type:', profId);
                  }

                  if (voucherTypeId && profId && locId) {
                    try {
                      // Get allowed services for this voucher type
                      const allowedServiceIds = await getVoucherAllowedServices(voucherTypeId);
                      console.log('[StripeVoucherSuccess] Final allowedServiceIds before navigation:', allowedServiceIds);
                      
                      localStorage.setItem(
                        'reservasPro_voucherFlow',
                        JSON.stringify({
                          origin: 'voucher',
                          voucherId: verifiedVoucherId,
                          voucherTypeId,
                          allowedServiceIds,
                          lockedProfessionalId: profId,
                          timestamp: Date.now(),
                        })
                      );
                    } catch {}
                    setSelectedProfessionalId(profId);
                    window.location.hash = `#/calendario?mode=voucher&voucherTypeId=${voucherTypeId}&professionalId=${profId}&locationId=${locId}`;
                    setCurrentView('voucher-calendar');
                  } else {
                    setCurrentView('services');
                  }
                } catch (e) {
                  console.warn('[StripeVoucherSuccess ReserveNow] fallback to services', e);
                  setCurrentView('services');
                }
              }}
            />
          )}
      </div>
    </div>
  );
}