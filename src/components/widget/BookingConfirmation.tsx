import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowLeft, User, MapPin, Clock, CreditCard, Banknote, Loader2, Ticket, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parse, addMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { fromZonedTime } from 'date-fns-tz';
import { useToast } from "@/hooks/use-toast";
import { useClassAvailability } from '@/hooks/useClassAvailability';
import { getDefaultLocation } from '@/lib/default-location';
import { calculateVoucherBalance, checkExistingRedemption } from '@/lib/voucher-utils';
import VoucherGuard from './VoucherGuard';
import { useSubscriptionsByEmail, checkSubscriptionEligibility, calculateSubscriptionUsage, type SubscriptionUsage } from '@/hooks/useSubscriptionsByEmail';
import { useIsMobile } from '@/hooks/use-mobile';

interface Service {
  id: string;
  name: string;
  description?: string;
  duration_min: number;
  price: number;
  currency?: string;
  category_id?: string;
}

interface Professional {
  id: string;
  name: string;
  photo_url?: string;
  color?: string;
  email?: string;
}

interface Category {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  timezone?: string;
}

interface BookingConfirmationProps {
  serviceId?: string;
  classId?: string;
  professionalId?: string;
  locationId?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  onBack: () => void;
  // Mode props
  mode?: 'service' | 'voucher' | 'class' | 'subscription';
  voucherId?: string; // id de un bono del usuario (si existe)
  voucherTypeId?: string; // id del tipo de bono cuando no hay bono del usuario
  durationMin?: number; // duration from voucher, service, or class
  capacity?: number; // for classes
  price?: number; // for classes
  currency?: string; // for classes
  // Subscription props
  subscriptionPlanId?: string;
}

// Helper function to resolve professional_id for class bookings
const resolveClassProfessional = async ({ 
  classId, 
  locationId, 
  startUTC 
}: { 
  classId: string; 
  locationId: string; 
  startUTC: Date; 
}): Promise<string | null> => {
  try {
    // 1) Match explicit class session (preferred)
    const { data: session, error: sessionError } = await supabase
      .from('class_sessions')
      .select('professional_id')
      .eq('class_id', classId)
      .eq('location_id', locationId)
      .eq('start_at', startUTC.toISOString())
      .maybeSingle();
    if (sessionError) console.warn('[resolveClassProfessional] session lookup error', sessionError);
    if (session?.professional_id) return session.professional_id;

    // 2) Fallback: first linked professional for the class (stable ordering)
    const { data: cpRow, error: cpError } = await supabase
      .from('class_professionals')
      .select('professional_id')
      .eq('class_id', classId)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (cpError) console.warn('[resolveClassProfessional] class_professionals lookup error', cpError);
    if (cpRow?.professional_id) return cpRow.professional_id;

    // 3) Last resort: any active professional (to avoid blocking booking)
    const { data: anyProf, error: anyProfErr } = await supabase
      .from('professionals')
      .select('id')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1);
    if (anyProfErr) console.warn('[resolveClassProfessional] professionals fallback error', anyProfErr);
    if (anyProf && anyProf.length > 0) {
      console.warn('[resolveClassProfessional] using generic active professional as fallback');
      return anyProf[0].id;
    }

    return null;
  } catch (error) {
    console.warn('[resolveClassProfessional] exception', error);
    return null;
  }
};

export default function BookingConfirmation({
  serviceId, 
  classId, 
  professionalId, 
  locationId, 
  date, 
  time, 
  onBack, 
  mode = 'service',
  voucherId,
  voucherTypeId,
  durationMin,
  capacity,
  price,
  currency,
  subscriptionPlanId
}: BookingConfirmationProps) {
  console.log('[BookingConfirm.params]', { mode, serviceId, classId, professionalId, locationId, date, time, subscriptionPlanId });
  console.log('BookingConfirmation rendered with:', { 
    serviceId, classId, professionalId, locationId, date, time, mode, 
    voucherId, voucherTypeId, durationMin, capacity, price, currency,
    subscriptionPlanId
  });
  
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  
  // Data states
  const [service, setService] = useState<Service | null>(null);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [voucher, setVoucher] = useState<any>(null);
  
  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'voucher' | 'subscription' | null>(
    mode === 'voucher' ? 'voucher' : 
    mode === 'subscription' ? 'subscription' :
    subscriptionPlanId ? 'subscription' : null
  );
  const [isRecognizedUser, setIsRecognizedUser] = useState(false);
  
  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Subscription states
  const [availableSubscriptions, setAvailableSubscriptions] = useState<SubscriptionUsage[]>([]);
  const [selectedSubscription, setSelectedSubscription] = useState<SubscriptionUsage | null>(null);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);

  // Load saved user data from localStorage - immediate load with fallback from database
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const saved = localStorage.getItem('reservasPro_user');
        console.log('[BookingConfirmation] Reading localStorage:', saved);
        
        if (saved) {
          const userData = JSON.parse(saved);
          console.log('[BookingConfirmation] Parsed user data:', userData);
          
          // Always set data from localStorage first for immediate display
          if (userData.email) {
            setEmail(userData.email);
          }
          
          if (userData.firstName) {
            setFirstName(userData.firstName);
          }
          
          if (userData.lastName) {
            setLastName(userData.lastName);
          }
          
          if (userData.phone) {
            setPhone(userData.phone);
          }
          
          // If we only have a name field but not firstName/lastName, parse it
          if (!userData.firstName && !userData.lastName && userData.name) {
            const nameParts = userData.name.trim().split(' ');
            const firstNameFromName = nameParts[0] || '';
            const lastNameFromName = nameParts.slice(1).join(' ') || '';
            
            setFirstName(firstNameFromName);
            setLastName(lastNameFromName);
            
            // Update localStorage with parsed names
            const updatedData = {
              ...userData,
              firstName: firstNameFromName,
              lastName: lastNameFromName
            };
            localStorage.setItem('reservasPro_user', JSON.stringify(updatedData));
          }
          
          console.log('[BookingConfirmation] Set user data from localStorage');
          
          // === AUTO-RECONOCIMIENTO: Verificar si el usuario tiene datos completos en BD ===
          if (userData.email) {
            try {
              const { data: dbUser } = await supabase
                .from('users_shadow')
                .select('id, name, phone, email')
                .eq('email', userData.email.toLowerCase())
                .maybeSingle();
              
              console.log('[BookingConfirmation] DB user lookup:', dbUser);
              
              // Si tiene nombre Y teléfono en BD, activar reconocimiento
              if (dbUser && dbUser.name && dbUser.phone) {
                const nameParts = dbUser.name.trim().split(' ');
                const dbFirstName = nameParts[0] || '';
                const dbLastName = nameParts.slice(1).join(' ') || '';
                // Quitar prefijo +34 para mostrar solo el número
                const displayPhone = dbUser.phone.replace(/^\+34/, '');
                
                setFirstName(dbFirstName);
                setLastName(dbLastName);
                setPhone(displayPhone);
                setEmail(dbUser.email);
                setIsRecognizedUser(true);
                
                console.log('[BookingConfirmation] Usuario reconocido con datos completos');
                
                // Actualizar localStorage con datos de BD
                const enhancedData = {
                  ...userData,
                  userShadowId: dbUser.id,
                  name: dbUser.name,
                  firstName: dbFirstName,
                  lastName: dbLastName,
                  phone: displayPhone,
                  email: dbUser.email
                };
                localStorage.setItem('reservasPro_user', JSON.stringify(enhancedData));
                return; // Salir temprano, no necesitamos más procesamiento
              }
            } catch (dbError) {
              console.warn('[BookingConfirmation] Error verificando usuario en BD:', dbError);
              // Si falla la consulta, continuar con el flujo normal (formulario visible)
            }
          }
          
          // Si no se reconoció en BD, continuar con fallbacks de localStorage
          // If we have userShadowId but missing some data, try to fetch from database
          if (userData.userShadowId && (!userData.firstName || !userData.lastName || !userData.phone)) {
            console.log('[BookingConfirmation] Fetching additional data from database');
            
            // Get user data from database
            const { data: userShadow } = await supabase
              .from('users_shadow')
              .select('name, email')
              .eq('id', userData.userShadowId)
              .maybeSingle();
            
            // Get phone from most recent booking
            const { data: recentBooking } = await supabase
              .from('bookings')
              .select('notes')
              .eq('user_id', userData.userShadowId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            let dbFirstName = userData.firstName || '';
            let dbLastName = userData.lastName || '';
            let dbPhone = userData.phone || '';
            
            // Parse from booking notes if available
            if (recentBooking?.notes) {
              try {
                // Try to parse JSON format first
                const bookingData = JSON.parse(recentBooking.notes);
                if (bookingData.clientName && (!dbFirstName || !dbLastName)) {
                  const nameParts = bookingData.clientName.split(' ');
                  dbFirstName = nameParts[0] || dbFirstName;
                  dbLastName = nameParts.slice(1).join(' ') || dbLastName;
                }
                if (bookingData.clientPhone && !dbPhone) {
                  dbPhone = bookingData.clientPhone;
                }
              } catch {
                // Try to parse text format
                const lines = recentBooking.notes.split('\n');
                for (const line of lines) {
                  if (line.includes('Cliente:') && (!dbFirstName || !dbLastName)) {
                    const name = line.replace('Cliente:', '').trim();
                    const nameParts = name.split(' ');
                    dbFirstName = nameParts[0] || dbFirstName;
                    dbLastName = nameParts.slice(1).join(' ') || dbLastName;
                  }
                  if (line.includes('Teléfono:') && !dbPhone) {
                    dbPhone = line.replace('Teléfono:', '').trim();
                  }
                }
              }
            }
            
            // Fallback to user shadow name if still missing names
            if ((!dbFirstName || !dbLastName) && userShadow?.name) {
              const nameParts = userShadow.name.split(' ');
              dbFirstName = dbFirstName || nameParts[0] || '';
              dbLastName = dbLastName || nameParts.slice(1).join(' ') || '';
            }
            
            // Update state with database data if it's more complete
            if (dbFirstName && !firstName) {
              setFirstName(dbFirstName);
            }
            if (dbLastName && !lastName) {
              setLastName(dbLastName);
            }
            if (dbPhone && !phone) {
              setPhone(dbPhone);
            }
            
            // Update localStorage with the enhanced data
            if (dbFirstName || dbLastName || dbPhone) {
              const fullName = dbFirstName && dbLastName ? `${dbFirstName} ${dbLastName}`.trim() : dbFirstName || userData.email?.split('@')[0] || '';
              const enhancedData = {
                ...userData,
                name: fullName,
                firstName: dbFirstName || userData.firstName || '',
                lastName: dbLastName || userData.lastName || '',
                phone: dbPhone || userData.phone || ''
              };
              localStorage.setItem('reservasPro_user', JSON.stringify(enhancedData));
              console.log('[BookingConfirmation] Enhanced user data saved:', enhancedData);
            }
          }
        }
      } catch (e) {
        console.error('[BookingConfirmation] Failed to load user data:', e);
      }
    };

    loadUserData();
  }, []);
  
  // Auto-save user data whenever it changes
  useEffect(() => {
    if (email && (firstName || lastName || phone)) {
      const saved = localStorage.getItem('reservasPro_user');
      let userData = saved ? JSON.parse(saved) : {};
      
      const fullName = firstName && lastName ? `${firstName} ${lastName}`.trim() : firstName || email.split('@')[0];
      
      userData = {
        ...userData,
        email,
        name: fullName,
        firstName: firstName || '',
        lastName: lastName || '',
        phone: phone || ''
      };
      
      localStorage.setItem('reservasPro_user', JSON.stringify(userData));
      console.log('[BookingConfirmation] Auto-saved user data:', userData);
    }
  }, [email, firstName, lastName, phone]);

  // Class availability hook for refreshing data after successful booking
  const classAvailability = mode === 'class' ? useClassAvailability(classId, locationId) : null;
  
  // Subscriptions hook - load when email changes
  const { subscriptions, loading: subscriptionsBaseLoading } = useSubscriptionsByEmail(email);

  useEffect(() => {
    // Validate required parameters at component initialization
    const params = { serviceId, classId, professionalId, locationId, date, time, mode, voucherId, voucherTypeId };
    console.log('[Confirm] params OK origin=', mode, 'voucherId=', voucherId, 'classId=', classId);
    
    if (!date || !time) {
      console.error('[Confirm] missing required params', params);
      toast({
        title: "Error",
        description: "Vuelve a elegir la hora",
        variant: "destructive"
      });
      onBack();
      return;
    }

    // For service and voucher modes, professional is required
    if ((mode === 'service' || mode === 'voucher') && !professionalId) {
      console.error('[Confirm] missing professionalId for service/voucher mode', params);
      toast({
        title: "Error",
        description: "Vuelve a elegir la hora",
        variant: "destructive"
      });
      onBack();
      return;
    }

    // For class mode, classId is required
    if (mode === 'class' && !classId) {
      console.error('[Confirm] missing classId for class mode', params);
      toast({
        title: "Error",
        description: "Vuelve a elegir la clase",
        variant: "destructive"
      });
      onBack();
      return;
    }

    // For subscription mode, subscriptionPlanId is required but NOT classId
    if (mode === 'subscription' && !subscriptionPlanId) {
      console.error('[Confirm] missing subscriptionPlanId for subscription mode', params);
      toast({
        title: "Error",
        description: "Vuelve a elegir la suscripción",
        variant: "destructive"
      });
      onBack();
      return;
    }

    if (mode === 'voucher' && !voucherId) {
      // Try to recover voucherId from voucher flow state
      let voucherFlow: any = null;
      try {
        const saved = localStorage.getItem('reservasPro_voucherFlow');
        if (saved) {
          voucherFlow = JSON.parse(saved);
          console.log('[Confirm] recovered voucherFlow:', voucherFlow);
        }
      } catch (e) {
        console.warn('Failed to parse voucher flow');
      }

      if (!voucherFlow?.voucherId && !voucherTypeId) {
        console.error('[Confirm] voucher mode missing voucherId', params);
        toast({
          title: "Error de verificación", 
          description: "Vuelve a verificar tu bono",
          variant: "destructive"
        });
        window.location.hash = `#/bonos/${voucherTypeId}/verificar`;
        return;
      }

      // Update voucherId from recovered flow
      if (voucherFlow?.voucherId && !voucherId) {
        console.log('[Confirm] using recovered voucherId:', voucherFlow.voucherId);
        // We can't change props, but we'll use it in the load function
      }
    }

    const initializeAndLoad = async () => {
      // Initialize location from default if not provided
      if (!locationId) {
        const defaultLocation = await getDefaultLocation();
        if (defaultLocation) {
          setLocation(defaultLocation);
          if (import.meta.env.DEV) {
            console.log('[BookingConfirmation] using default location_id=', defaultLocation.id);
          }
        }
      }
      
      await loadBookingData();
    };
    
    initializeAndLoad();
  }, [serviceId, professionalId, locationId, date, time, mode, voucherId, voucherTypeId]);

  // Process subscriptions when they change - only for services, never for classes
  useEffect(() => {
    const processSubscriptions = async () => {
      // Only process subscriptions for services, never for classes
      if (mode !== 'service' || !email || !service?.category_id || subscriptionsBaseLoading) {
        setAvailableSubscriptions([]);
        setSelectedSubscription(null);
        setSubscriptionsLoading(false);
        return;
      }

      if (!subscriptions?.length) {
        setAvailableSubscriptions([]);
        setSelectedSubscription(null);
        setSubscriptionsLoading(false);
        return;
      }

      try {
        setSubscriptionsLoading(true);
        
        // Check which subscriptions are eligible for this service category
        const eligibleSubscriptions = await checkSubscriptionEligibility(
          undefined, // serviceId - not needed for category check
          service.category_id,
          subscriptions
        );

        // Calculate usage for each eligible subscription
        const subscriptionsWithUsage: SubscriptionUsage[] = [];
        for (const subscription of eligibleSubscriptions) {
          const usage = await calculateSubscriptionUsage(subscription);
          
          // Only include if there's remaining usage (or unlimited)
          if (usage.isUnlimited || usage.remaining > 0) {
            subscriptionsWithUsage.push(usage);
          }
        }

        setAvailableSubscriptions(subscriptionsWithUsage);
        
        // Auto-select first available subscription if user hasn't chosen payment method
        if (subscriptionsWithUsage.length > 0 && !paymentMethod) {
          setSelectedSubscription(subscriptionsWithUsage[0]);
          setPaymentMethod('subscription');
        }

      } catch (error) {
        console.error('[BookingConfirmation] Error processing subscriptions:', error);
        setAvailableSubscriptions([]);
        setSelectedSubscription(null);
      } finally {
        setSubscriptionsLoading(false);
      }
    };

    processSubscriptions();
  }, [subscriptions, subscriptionsBaseLoading, email, service?.category_id, mode, paymentMethod]);

  const loadBookingData = async () => {
    try {
      setLoading(true);
      console.log('[BookingConfirmation] Loading data with params:', {
        serviceId, classId, professionalId, locationId, date, time, mode, 
        voucherId, voucherTypeId, durationMin, capacity, price, currency
      });
      
      if (mode === 'voucher') {
        // ... keep existing voucher logic
        let effectiveVoucherId = voucherId;
        if (!effectiveVoucherId) {
          try {
            const saved = localStorage.getItem('reservasPro_voucherFlow');
            if (saved) {
              const voucherFlow = JSON.parse(saved);
              effectiveVoucherId = voucherFlow?.voucherId;
              console.log('[BookingConfirmation] using voucherId from localStorage:', effectiveVoucherId);
            }
          } catch (e) {
            console.warn('Failed to parse voucherFlow from localStorage');
          }
        }

        console.log('[DB] voucher query with voucherId:', effectiveVoucherId);

        // Load voucher first if we have voucherId
        let voucherData = null;
        if (effectiveVoucherId) {
          const { data, error: voucherError } = await supabase
            .from('vouchers')
            .select('*')
            .eq('id', effectiveVoucherId)
            .maybeSingle();

          if (voucherError) {
            console.warn('[BookingConfirmation] voucher fetch error:', voucherError);
          } else {
            voucherData = data;
            console.log('[DB] voucher loaded:', voucherData ? 'success' : 'not found');
          }
        }

        // Load voucher type data
        let voucherTypeData: any = null;
        const effectiveVoucherTypeId = voucherData?.voucher_type_id || voucherTypeId;
        if (effectiveVoucherTypeId) {
          const { data: vt, error: vtError } = await supabase
            .from('voucher_types')
            .select('*')
            .eq('id', effectiveVoucherTypeId)
            .maybeSingle();
          if (vtError) {
            console.warn('[BookingConfirmation] voucher_type fetch error:', vtError);
          } else {
            voucherTypeData = vt;
            console.log('[DB] voucher_type loaded:', voucherTypeData ? voucherTypeData.name : 'not found');
          }
        }

        // Always create pseudo service for voucher mode - even if voucher not found
        if (voucherTypeData) {
          const voucherCombined = voucherData 
            ? { ...voucherData, voucher_type: voucherTypeData } 
            : { voucher_type: voucherTypeData };
          setVoucher(voucherCombined);

          setService({
            id: 'voucher-service',
            name: voucherTypeData.name,
            description: voucherTypeData.description,
            duration_min: durationMin || voucherTypeData.session_duration_min || 60,
            price: 0,
            currency: voucherTypeData.currency || 'EUR'
          });
          console.log('[BookingConfirmation] created pseudo-service for voucher:', voucherTypeData.name);
        } else {
          // Fallback: create minimal pseudo service
          console.warn('[BookingConfirmation] no voucher_type found, creating minimal pseudo-service');
          setService({
            id: 'voucher-service',
            name: 'Sesión con Bono',
            description: 'Reserva realizada con bono',
            duration_min: durationMin || 60,
            price: 0,
            currency: 'EUR'
          });
        }
      } else if (mode === 'class') {
        // Load class data
        console.log('[ClassConfirm] Loading class data for id:', classId);
        
        if (classId) {
          const { data: classData, error: classError } = await supabase
            .from('classes')
            .select(`
              *,
              categories (id, name)
            `)
            .eq('id', classId)
            .maybeSingle();

          if (classError) {
            console.error('[ClassConfirm] class fetch error:', classError);
          } else if (classData) {
            // Create pseudo service for class
            setService({
              id: classData.id,
              name: classData.name,
              description: classData.description,
              duration_min: durationMin || classData.duration_min || 60,
              price: price !== undefined ? price : classData.price || 0,
              currency: currency || classData.currency || 'EUR'
            });
            setCategory(classData.categories);
            console.log('[DB] class loaded:', classData.name);
          } else {
            console.warn('[ClassConfirm] class not found for id', classId);
            // Create fallback service
            setService({
              id: 'class-service',
              name: 'Clase',
              description: 'Reserva de clase',
              duration_min: durationMin || 60,
              price: price || 0,
              currency: currency || 'EUR'
            });
          }
        } else {
          // Create fallback service from props
          setService({
            id: 'class-service',
            name: 'Clase',
            description: 'Reserva de clase',
            duration_min: durationMin || 60,
            price: price || 0,
            currency: currency || 'EUR'
          });
        }
      } else if (mode === 'subscription') {
        // Subscription mode logic
        console.log('[BookingConfirmation] Loading subscription data for planId:', subscriptionPlanId);
        
        // Load subscription plan to get name and details
        if (subscriptionPlanId) {
          const { data: planData, error: planError } = await supabase
            .from('subscription_plans')
            .select('name, description, sessions_count')
            .eq('id', subscriptionPlanId)
            .maybeSingle();
            
          if (planError) {
            console.warn('[BookingConfirmation] plan fetch error:', planError);
          }
          
          // Create pseudo service for subscription
          setService({
            id: 'subscription-service',
            name: planData?.name || 'Sesión de Suscripción',
            description: 'Reserva con suscripción activa',
            duration_min: durationMin || 60,
            price: 0, // Subscription bookings are already paid
            currency: 'EUR'
          });
        } else {
          // Fallback pseudo service
          setService({
            id: 'subscription-service',
            name: 'Sesión de Suscripción',
            description: 'Reserva con suscripción activa',
            duration_min: durationMin || 60,
            price: 0,
            currency: 'EUR'
          });
        }
      } else if (mode === 'service' && serviceId) {
        // Load service with category - only for service mode
        const { data: serviceData, error: serviceError } = await supabase
          .from('services')
          .select(`
            *,
            categories (id, name)
          `)
          .eq('id', serviceId)
          .maybeSingle();

        if (serviceError?.code === 'PGRST116') {
          console.warn('[BookingConfirmation] No service found for id', serviceId);
        } else if (!serviceData) {
          console.warn('[BookingConfirmation] service not found for id', serviceId);
        } else {
          setService(serviceData);
          setCategory(serviceData.categories);
        }
      }
      
      // Load professional (tolerant: fallback to first active if not found) - only for service/voucher modes
      if (mode !== 'class' && professionalId) {
        const { data: professionalData, error: professionalError } = await supabase
          .from('professionals')
          .select('id, name, photo_url, color, email')
          .eq('id', professionalId)
          .maybeSingle();

        let resolvedProfessional = professionalData;
        if (!resolvedProfessional) {
          console.warn('[BookingConfirmation] professional not found, using first active');
          const { data: anyProf } = await supabase
            .from('professionals')
            .select('id, name, photo_url, color, email')
            .eq('active', true)
            .order('created_at', { ascending: true })
            .limit(1);
          if (anyProf && anyProf.length > 0) resolvedProfessional = anyProf[0];
        }

        if (!resolvedProfessional) {
          throw professionalError || new Error('Profesional no encontrado');
        }

        setProfessional(resolvedProfessional);
      }

      // Load location if provided
      let locationData = null;
      if (locationId) {
        const { data, error } = await supabase
          .from('locations')
          .select('id, name, timezone')
          .eq('id', locationId)
          .maybeSingle();
        
        if (error?.code === 'PGRST116') {
          console.warn('[BookingConfirmation] No location found for id', locationId);
        } else if (!error) {
          locationData = data;
        }
      }

      setLocation(locationData);
      
    } catch (error) {
      console.error('Error loading booking data:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos de la reserva",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) newErrors.firstName = 'El nombre es obligatorio';
    if (!isRecognizedUser && !lastName.trim()) newErrors.lastName = 'Los apellidos son obligatorios';
    if (!phone.trim()) newErrors.phone = 'El teléfono es obligatorio';
    if (!email.trim()) newErrors.email = 'El email es obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'El email no es válido';
    }
    
    // Form validation
    if (!paymentMethod && mode !== 'voucher' && mode !== 'subscription') newErrors.paymentMethod = 'Selecciona un método de pago';
    
    // Subscription validation - only required for service mode with subscription payment
    if (paymentMethod === 'subscription' && mode !== 'subscription' && !selectedSubscription) {
      newErrors.paymentMethod = 'Selecciona una suscripción';
    }
    
    // Phone validation (soft)
    if (phone && !/^[\d\s\+\-\(\)]+$/.test(phone)) {
      newErrors.phone = 'El teléfono contiene caracteres no válidos';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStripePayment = async (bookingId: string) => {
    try {
      setProcessingPayment(true);
      const widgetBase = window.location.origin + window.location.pathname;
      const successUrl = `${widgetBase}#/exito?booking_id=${bookingId}`;
      const cancelUrl = `${widgetBase}#/confirmacion?booking_id=${bookingId}`;
      
      // Use appropriate endpoint based on mode
      const endpoint = mode === 'class' ? 'create-class-checkout' : 'create-service-checkout';
      console.log(`[${mode === 'class' ? 'ClassPay' : 'CardPay'}] request ${endpoint}`, { booking_id: bookingId, success_url: successUrl, cancel_url: cancelUrl });
      
      const { data, error } = await supabase.functions.invoke(endpoint, {
        body: { booking_id: bookingId, success_url: successUrl, cancel_url: cancelUrl }
      });

      const redirectUrl = data?.checkout_url || data?.url;

      if (error || !redirectUrl) {
        console.error(`[${mode === 'class' ? 'ClassPay' : 'CardPay'}].error`, { error, data });
        toast({
          title: "Error de pago",
          description: "No se pudo iniciar el pago con tarjeta",
          variant: "destructive"
        });
        setProcessingPayment(false);
        return;
      }

      console.log(`[${mode === 'class' ? 'ClassPay' : 'CardPay'}] redirecting to Stripe`, redirectUrl);
      
      // Ensure top-level navigation (Stripe blocks iframes)
      try {
        const inIframe = window.top && window.top !== window.self;
        if (isMobile || inIframe) {
          (inIframe ? window.top! : window).location.href = redirectUrl as string;
        } else {
          window.location.assign(redirectUrl as string);
        }
      } catch {
        window.location.href = redirectUrl as string;
      }
    } catch (error) {
      console.error(`[${mode === 'class' ? 'ClassPay' : 'CardPay'}].error`, error);
      toast({
        title: "Error de pago",
        description: "No se pudo procesar el pago. Inténtalo de nuevo.",
        variant: "destructive"
      });
      setProcessingPayment(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Anti-double-click protection
    if (hasSubmitted || submitting || processingPayment) {
      console.log('[Confirm] Preventing double submission', { hasSubmitted, submitting, processingPayment });
      return;
    }
    
    if (!validateForm()) return;
    
    if (mode === 'service' && !service) return;
    if ((mode === 'class' || mode === 'subscription') && !service) {
      console.error('[Confirm] service is null for mode', mode, '- cannot submit');
      toast({ title: 'Cargando datos...', description: 'Espera un momento e intenta de nuevo.', variant: 'destructive' });
      return;
    }
    if ((mode === 'service' || mode === 'voucher') && !professional) {
      console.error('[Confirm] professional is null for mode', mode, '- cannot submit');
      toast({ title: 'Cargando datos...', description: 'Espera un momento e intenta de nuevo.', variant: 'destructive' });
      return;
    }
    
    try {
      setSubmitting(true);
      setHasSubmitted(true);
      
      // Ensure we have a valid location (use default if needed)
      let effectiveLocation = location;
      if (!effectiveLocation) {
        const defaultLocation = await getDefaultLocation();
        if (defaultLocation) {
          effectiveLocation = defaultLocation;
          setLocation(defaultLocation);
          if (import.meta.env.DEV) {
            console.log('[BookingConfirmation] using fallback default location_id=', defaultLocation.id);
          }
        }
      }

      if (!effectiveLocation?.id) {
        const debugInfo = {
          userId: null,
          voucherId: voucherId || 'undefined',
          origin: mode,
          serviceId: serviceId || 'null',
          classId: classId || 'null',
          professionalId: professionalId || 'null',
          locationId: effectiveLocation?.id || 'null',
          date,
          time,
          durationMin: durationMin || 'undefined',
          startUTC: 'invalid - no location',
          endUTC: 'invalid - no location'
        };
        console.error('[Confirm.debug]', debugInfo);
        throw new Error('No se pudo determinar la ubicación (location_id)');
      }

      // Parse date and time using location timezone and convert to UTC
      const timezone = effectiveLocation.timezone || 'Europe/Madrid';
      const localDateTimeStr = `${date}T${time}:00`;
      
      let startDateUtc, endDateUtc;
      try {
        startDateUtc = fromZonedTime(localDateTimeStr, timezone);
        const effectiveDurationMin = mode === 'voucher' && voucher?.voucher_type?.session_duration_min 
          ? voucher.voucher_type.session_duration_min 
          : service?.duration_min || durationMin || 60;
        endDateUtc = addMinutes(startDateUtc, effectiveDurationMin);
        
        // Validate date conversion
        if (isNaN(startDateUtc.getTime()) || isNaN(endDateUtc.getTime())) {
          throw new Error('Invalid date conversion');
        }
      } catch (dateError) {
        const debugInfo = {
          userId: null,
          voucherId: voucherId || 'undefined',
          origin: mode,
          serviceId: serviceId || 'null',
          professionalId: professionalId,
          locationId: effectiveLocation?.id || 'null',
          date,
          time,
          durationMin: durationMin || 'undefined',
          startUTC: 'invalid - date conversion failed',
          endUTC: 'invalid - date conversion failed',
          timezone,
          localDateTimeStr,
          dateError: dateError
        };
        console.error('[Confirm.debug]', debugInfo);
        throw new Error('Error al convertir fecha/hora a UTC');
      }

      // 1. Resolve usuario por email (o crearlo si no existe)
      const emailNormalized = email.trim().toLowerCase();
      const name = `${firstName} ${lastName}`.trim();
      const formattedPhone = phone.trim() ? '+34' + phone.trim().replace(/\D/g, '').slice(0, 9) : null;
      
      const { data: userFound } = await supabase
        .from('users_shadow')
        .select('id')
        .eq('email', emailNormalized)
        .maybeSingle();

      let userId = userFound?.id;
      if (userId) {
        // Update existing user with latest data
        await supabase
          .from('users_shadow')
          .update({ name, phone: formattedPhone, updated_at: new Date().toISOString() })
          .eq('id', userId);
      } else {
        try {
          const { data: inserted, error: insertError } = await supabase
            .from('users_shadow')
            .insert({ email: emailNormalized, name, app_user_id: `widget:${emailNormalized}`, phone: formattedPhone })
            .select('id')
            .single();
          if (insertError) throw insertError;
          userId = inserted.id;
        } catch (userError) {
          const debugInfo = {
            userId: 'failed to resolve',
            voucherId: voucherId || 'undefined',
            origin: mode,
            serviceId: serviceId || 'null',
            classId: classId || 'null',
            professionalId: professionalId || 'null',
            locationId: effectiveLocation?.id || 'null',
            date,
            time,
            durationMin: durationMin || 'undefined',
            startUTC: startDateUtc.toISOString(),
            endUTC: endDateUtc.toISOString(),
            userError: userError
          };
          console.error('[Confirm.debug]', debugInfo);
          throw userError;
        }
      }

      // Verify userId is resolved
      if (!userId) {
        const debugInfo = {
          userId: 'null after resolution attempt',
          voucherId: voucherId || 'undefined',
          origin: mode,
          serviceId: serviceId || 'null',
          professionalId: professionalId,
          locationId: effectiveLocation?.id || 'null',
          date,
          time,
          durationMin: durationMin || 'undefined',
          startUTC: startDateUtc.toISOString(),
          endUTC: endDateUtc.toISOString()
        };
        console.error('[Confirm.debug]', debugInfo);
        throw new Error('No se pudo resolver el ID del usuario');
      }
      // If voucher mode, get effective voucherId and revalidate
      let chosenVoucherId = null;
      let eligibleVouchers: any[] = [];
      
      if (mode === 'voucher') {
        // Get effective voucherId - from props or localStorage
        let effectiveVoucherId = voucherId;
        if (!effectiveVoucherId) {
          try {
            const saved = localStorage.getItem('reservasPro_voucherFlow');
            if (saved) {
              const voucherFlow = JSON.parse(saved);
              effectiveVoucherId = voucherFlow?.voucherId;
              console.log('[Confirm] using voucherId from localStorage:', effectiveVoucherId);
            }
          } catch (e) {
            console.warn('Failed to parse voucherFlow from localStorage');
          }
        }

        if (!effectiveVoucherId) {
          const debugInfo = {
            userId: userId,
            voucherId: 'undefined - missing',
            origin: mode,
            serviceId: serviceId || 'null',
            professionalId: professionalId,
            locationId: effectiveLocation?.id || 'null',
            date,
            time,
            durationMin: durationMin || 'undefined',
            startUTC: startDateUtc.toISOString(),
            endUTC: endDateUtc.toISOString()
          };
          console.error('[Confirm.debug]', debugInfo);
          throw new Error('No se encontró el identificador del bono. Vuelve a verificar tu bono.');
        }

        // Check userId match in voucherFlow
        try {
          const saved = localStorage.getItem('reservasPro_voucherFlow');
          if (saved) {
            const voucherFlow = JSON.parse(saved);
            if (voucherFlow.userId && voucherFlow.userId !== userId) {
              console.error('[Confirm] userId mismatch:', {
                voucherFlowUserId: voucherFlow.userId,
                currentUserId: userId
              });
              localStorage.removeItem('reservasPro_voucherFlow');
              localStorage.removeItem('reservasPro_verifiedVoucherId');
              throw new Error('Este bono no pertenece al usuario actual. Por favor, vuelve a verificar tu bono.');
            }
          }
        } catch (e: any) {
          if (e.message?.includes('no pertenece')) {
            throw e;
          }
          console.warn('Failed to validate voucherFlow userId');
        }

        // Revalidate the specific voucher
        try {
          const { data: voucherData, error: voucherError } = await supabase
            .from('vouchers')
            .select(`
              *,
              voucher_types (
                id, name, sessions_count, session_duration_min, validity_days, validity_end_date
              )
            `)
            .eq('id', effectiveVoucherId)
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle();

          if (voucherError) {
            const debugInfo = {
              userId: userId,
              voucherId: effectiveVoucherId,
              origin: mode,
              serviceId: serviceId || 'null',
              professionalId: professionalId,
              locationId: effectiveLocation?.id || 'null',
              date,
              time,
              durationMin: durationMin || 'undefined',
              startUTC: startDateUtc.toISOString(),
              endUTC: endDateUtc.toISOString(),
              voucherError: voucherError
            };
            console.error('[Confirm.debug]', debugInfo);
            throw voucherError;
          }

          if (!voucherData) {
            const debugInfo = {
              userId: userId,
              voucherId: effectiveVoucherId,
              origin: mode,
              serviceId: serviceId || 'null',
              professionalId: professionalId,
              locationId: effectiveLocation?.id || 'null',
              date,
              time,
              durationMin: durationMin || 'undefined',
              startUTC: startDateUtc.toISOString(),
              endUTC: endDateUtc.toISOString(),
              error: 'voucher not found or not valid'
            };
            console.error('[Confirm.debug]', debugInfo);
            throw new Error('Bono no encontrado o no válido');
          }

          // Check credits using calculateVoucherBalance for accurate count
          const voucherBalance = await calculateVoucherBalance(effectiveVoucherId);
          console.log(`[Confirm] voucherBalance check: remaining=${voucherBalance.remaining}, total=${voucherBalance.total}, used=${voucherBalance.used}`);
          
          if (voucherBalance.remaining <= 0) {
            const debugInfo = {
              userId: userId,
              voucherId: effectiveVoucherId,
              origin: mode,
              serviceId: serviceId || 'null',
              professionalId: professionalId,
              locationId: effectiveLocation?.id || 'null',
              date,
              time,
              durationMin: durationMin || 'undefined',
              startUTC: startDateUtc.toISOString(),
              endUTC: endDateUtc.toISOString(),
              error: `no credits remaining: ${voucherBalance.remaining}/${voucherBalance.total} (used=${voucherBalance.used})`
            };
            console.error('[Confirm.debug]', debugInfo);
            toast({
              title: "Bono agotado",
              description: "Este bono no tiene sesiones disponibles. Por favor selecciona otro bono.",
              variant: "destructive"
            });
            setSubmitting(false);
            setProcessingPayment(false);
            setHasSubmitted(false);
            return;
          }

          if (voucherData.expiry_date && voucherData.expiry_date < new Date().toISOString()) {
            const debugInfo = {
              userId: userId,
              voucherId: effectiveVoucherId,
              origin: mode,
              serviceId: serviceId || 'null',
              professionalId: professionalId,
              locationId: effectiveLocation?.id || 'null',
              date,
              time,
              durationMin: durationMin || 'undefined',
              startUTC: startDateUtc.toISOString(),
              endUTC: endDateUtc.toISOString(),
              error: `voucher expired: ${voucherData.expiry_date}`
            };
            console.error('[Confirm.debug]', debugInfo);
            throw new Error('Este bono ha caducado');
          }

          chosenVoucherId = effectiveVoucherId;
          eligibleVouchers = [voucherData];
          console.log(`[Confirm] revalidate OK`);
          
        } catch (revalidateError) {
          const debugInfo = {
            userId: userId,
            voucherId: effectiveVoucherId,
            origin: mode,
            serviceId: serviceId || 'null',
            professionalId: professionalId,
            locationId: effectiveLocation?.id || 'null',
            date,
            time,
            durationMin: durationMin || 'undefined',
            startUTC: startDateUtc.toISOString(),
            endUTC: endDateUtc.toISOString(),
            revalidateError: revalidateError
          };
          console.error('[Confirm.debug]', debugInfo);
          throw revalidateError;
        }
      }

      // Build payload with try/catch for debugging
      // Guard: serviceId must exist for card payments
      if (mode === 'service' && paymentMethod === 'card') {
        if (!serviceId) {
          console.error('[CardPay] missing service_id for card payment', serviceId);
          toast({
            title: 'Servicio inválido',
            description: 'Falta el identificador del servicio. Vuelve a seleccionar el servicio.',
            variant: 'destructive'
          });
          setSubmitting(false);
          setProcessingPayment(false);
          return;
        }
      }

      let bookingData;
      let effectiveServiceId = null;
      let effectiveOrigin = 'normal'; // For card/service flow - use 'normal' for DB constraint
      
      if (mode === 'voucher') {
        effectiveServiceId = serviceId || null; // Use service_id from calendar for vouchers
        effectiveOrigin = 'voucher';
      } else if (mode === 'service') {
        // For service mode, always use the real serviceId prop (not the service object which could be pseudo)
        effectiveServiceId = serviceId; // Use the original prop, not service?.id
        effectiveOrigin = 'normal';
      } else if (mode === 'class') {
        // For class mode, check if using subscription
        effectiveServiceId = null; 
        effectiveOrigin = paymentMethod === 'subscription' ? 'subscription' : 'normal';
      } else if (mode === 'subscription') {
        // For subscription mode: it's a service booking with subscription origin
        effectiveServiceId = null; // Subscriptions don't have service_id
        effectiveOrigin = 'subscription';
      } else {
        // Fallback: force normal origin and log correction
        console.log('[CardPay] origin corrected -> normal');
        effectiveOrigin = 'normal';
      }
      
      try {
        // For card payments, use the real serviceId (not pseudo-service)

        if (mode === 'class') {
          // Only for real class bookings (not subscription mode)
          // Resolve professional_id using resolveClassProfessional
          const resolvedProfessionalId = await resolveClassProfessional({
            classId: classId!,
            locationId: effectiveLocation.id,
            startUTC: startDateUtc
          });

          if (!resolvedProfessionalId) {
            console.error('[ClassConfirm.error] professional not found', {
              classId, locationId: effectiveLocation.id, startUTC: startDateUtc.toISOString()
            });
            toast({
              title: 'No se puede crear la reserva',
              description: 'No hay profesional asignado a esta clase en esa hora.',
              variant: 'destructive'
            });
            setSubmitting(false);
            setProcessingPayment(false);
            setHasSubmitted(false);
            return;
          }

          // Add subscription ID to notes if using subscription
          const subscriptionNotes = paymentMethod === 'subscription' && subscriptionPlanId
            ? `\nsubscriptionId:${subscriptionPlanId}` 
            : '';

          bookingData = {
            type: 'class',
            class_id: classId,
            professional_id: resolvedProfessionalId,
            location_id: effectiveLocation.id,
            user_id: userId,
            start_at: startDateUtc.toISOString(),
            end_at: endDateUtc.toISOString(),
            origin: effectiveOrigin,
            status: 'pending',
            payment_method: paymentMethod === 'subscription' ? 'cash' : paymentMethod,
            payment_status: paymentMethod === 'subscription' ? 'paid' : (paymentMethod === 'cash' ? 'paid' : 'unpaid'),
            service_id: null,
            notes: `Cliente: ${firstName} ${lastName}\nTeléfono: ${phone}\nEmail: ${email}${subscriptionNotes}`
          } as const;
          
          console.log('[DB] class booking.insert payload=', bookingData);
        } else if (mode === 'subscription') {
          // Subscription bookings are service-type bookings with subscription origin
          // They don't have class_id - they're for category-based sessions
          
          // Get professional from subscription plan
          let subscriptionProfessionalId = professionalId;
          if (!subscriptionProfessionalId) {
            // Try to get from subscription plan configuration
            try {
              const { data: plan } = await supabase
                .from('subscription_plans')
                .select('description')
                .eq('id', subscriptionPlanId!)
                .maybeSingle();
                
              if (plan?.description) {
                let profId = null;
                if (typeof plan.description === 'object') {
                  profId = (plan.description as any).session_config?.professional_id;
                } else if (typeof plan.description === 'string') {
                  const parsed = JSON.parse(plan.description);
                  profId = parsed.session_config?.professional_id;
                }
                if (profId && profId !== 'unassigned') {
                  subscriptionProfessionalId = profId;
                }
              }
            } catch (e) {
              console.warn('[SubConfirm] Could not resolve professional from plan:', e);
            }
          }

          if (!subscriptionProfessionalId) {
            console.error('[SubConfirm.error] professional not found for subscription');
            toast({
              title: 'No se puede crear la reserva',
              description: 'No hay profesional asignado a esta suscripción.',
              variant: 'destructive'
            });
            setSubmitting(false);
            setProcessingPayment(false);
            setHasSubmitted(false);
            return;
          }

          // Get the active subscription for this user and plan
          const { data: activeSubscription } = await supabase
            .from('subscriptions')
            .select(`
              id,
              start_date,
              next_billing_date,
              plan:subscription_plans(cycle, cap_per_cycle, sessions_count)
            `)
            .eq('user_id', userId)
            .eq('plan_id', subscriptionPlanId)
            .eq('status', 'active')
            .maybeSingle();

          if (!activeSubscription) {
            toast({
              title: 'Suscripción no encontrada',
              description: 'No tienes una suscripción activa para este plan.',
              variant: 'destructive'
            });
            setSubmitting(false);
            setProcessingPayment(false);
            setHasSubmitted(false);
            return;
          }

          // Determine which cycle the booking falls into using EXACT timestamps
          const bookingDate = new Date(startDateUtc);
          let bookingCycleStart = new Date(activeSubscription.start_date);
          let bookingCycleEnd = new Date(bookingCycleStart);
          
          // Set initial cycle end based on cycle type
          if (activeSubscription.plan.cycle === 'weekly') {
            bookingCycleEnd.setDate(bookingCycleEnd.getDate() + 7);
          } else {
            bookingCycleEnd.setMonth(bookingCycleEnd.getMonth() + 1);
          }

          // Advance cycle by cycle until we find the one containing the booking date
          while (bookingDate >= bookingCycleEnd) {
            bookingCycleStart = new Date(bookingCycleEnd);
            if (activeSubscription.plan.cycle === 'weekly') {
              bookingCycleEnd.setDate(bookingCycleEnd.getDate() + 7);
            } else {
              bookingCycleEnd.setMonth(bookingCycleEnd.getMonth() + 1);
            }
          }

          // Count bookings in THAT specific cycle using EXACT timestamps
          const { data: existingBookings } = await supabase
            .from('bookings')
            .select('id, start_at')
            .eq('origin', 'subscription')
            .neq('status', 'cancelled')
            .or(`notes.like.%"subscriptionId":"${activeSubscription.id}"%,notes.like.%"subscriptionId": "${activeSubscription.id}"%`)
            .gte('start_at', bookingCycleStart.toISOString())
            .lt('start_at', bookingCycleEnd.toISOString());

          const used = existingBookings?.length || 0;
          // Prioritize cap_per_cycle over sessions_count
          const cap = activeSubscription.plan.cap_per_cycle ?? activeSubscription.plan.sessions_count ?? 0;
          const remaining = Math.max(0, cap - used);

          console.log(`[SubValidation] Reserva para: ${bookingDate.toISOString()}`);
          console.log(`[SubValidation] Ciclo: ${bookingCycleStart.toISOString()} - ${bookingCycleEnd.toISOString()}`);
          console.log(`[SubValidation] Usadas: ${used} / Cap: ${cap} / Restantes: ${remaining}`);

          if (remaining <= 0) {
            const cycleStartFormatted = bookingCycleStart.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
            const cycleEndFormatted = bookingCycleEnd.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
            
            toast({
              title: 'Ciclo agotado',
              description: `Este ciclo (${cycleStartFormatted} - ${cycleEndFormatted}) ya tiene ${used} de ${cap} sesiones reservadas. Selecciona una fecha en otro ciclo o espera a la próxima renovación el ${new Date(activeSubscription.next_billing_date).toLocaleDateString('es-ES')}.`,
              variant: 'destructive'
            });
            setSubmitting(false);
            setProcessingPayment(false);
            setHasSubmitted(false);
            return;
          }

          bookingData = {
            type: 'service',  // Subscription bookings are service-type
            class_id: null,   // NO class_id for subscriptions
            service_id: null, // NO service_id for subscriptions
            professional_id: subscriptionProfessionalId,
            location_id: effectiveLocation.id,
            user_id: userId,
            start_at: startDateUtc.toISOString(),
            end_at: endDateUtc.toISOString(),
            origin: 'subscription',
            status: 'pending',
            payment_method: 'cash',  // Subscription bookings are pre-paid
            payment_status: 'paid',  // Already paid through subscription
            notes: JSON.stringify({ 
              subscriptionId: activeSubscription?.id ?? null, 
              planId: subscriptionPlanId ?? null, 
              origin: 'subscription',
              clientName: `${firstName} ${lastName}`,
              clientPhone: phone,
              clientEmail: email
            })
          } as const;
          
          console.log('[SubConfirm] payload', bookingData);
        } else {
          // Build notes as JSON for consistent webhook parsing
          const notesData: Record<string, string | null> = {
            clientName: `${firstName} ${lastName}`,
            clientPhone: phone,
            clientEmail: email,
            origin: effectiveOrigin
          };
          
          // Add voucherId if voucher mode
          if (mode === 'voucher' && chosenVoucherId) {
            notesData.voucherId = chosenVoucherId;
          }
          
          // Add serviceId if available
          if (effectiveServiceId) {
            notesData.serviceId = effectiveServiceId;
          }
          
          bookingData = {
            service_id: effectiveServiceId,
            class_id: null, // Services don't have class_id
            professional_id: professional?.id || null,
            location_id: effectiveLocation.id,
            start_at: startDateUtc.toISOString(),
            end_at: endDateUtc.toISOString(),
            type: 'service', // Both voucher and service use type 'service'
            status: 'pending',
            payment_method: mode === 'voucher' ? 'none' : paymentMethod,
            payment_status: (mode === 'voucher' || paymentMethod === 'cash') ? 'paid' : 'unpaid',
            origin: effectiveOrigin,
            user_id: userId,
            notes: JSON.stringify(notesData)
          } as const;
          
          console.log('[Confirm] booking payload', {
            service_id: bookingData.service_id,
            professional_id: bookingData.professional_id,
            location_id: bookingData.location_id,
            start_at: bookingData.start_at,
            end_at: bookingData.end_at,
            origin: bookingData.origin,
            payment_method: bookingData.payment_method,
            payment_status: bookingData.payment_status
          });
        }
      } catch (error) {
        const debugInfo = {
          userId: userId,
          voucherId: chosenVoucherId || 'undefined',
          origin: mode,
          serviceId: serviceId || 'null',
          professionalId: professionalId,
          locationId: effectiveLocation?.id || 'null',
          date,
          time,
          durationMin: durationMin || 'undefined',
          startUTC: startDateUtc.toISOString(),
          endUTC: endDateUtc.toISOString(),
          buildPayloadError: error
        };
        console.error('[Confirm.debug]', debugInfo);
        throw new Error('Error al preparar los datos de la reserva');
      }

      let booking;
      try {
        // For class bookings
        if (mode === 'class') {
          // Additional validation for subscription usage - only for service mode with subscription payment
          if (paymentMethod === 'subscription' && selectedSubscription) {
            // Re-check subscription usage at the moment of booking to prevent race conditions
            const currentUsage = await calculateSubscriptionUsage(selectedSubscription.subscription);
            if (!currentUsage.isUnlimited && currentUsage.remaining <= 0) {
              toast({
                title: 'Límite alcanzado',
                description: `Has alcanzado el límite de tu plan en este ciclo (${currentUsage.used}/${selectedSubscription.subscription.plan.cap_per_cycle}).`,
                variant: 'destructive'
              });
              setSubmitting(false);
              setProcessingPayment(false);
              setHasSubmitted(false);
              return;
            }
          }
          
          // Validate capacity before inserting
          const { data: sessionData } = await supabase
            .from('class_sessions')
            .select('capacity')
            .eq('class_id', classId)
            .eq('location_id', effectiveLocation.id)
            .eq('start_at', startDateUtc.toISOString())
            .maybeSingle();

          // Get class data for capacity
          const { data: classData } = await supabase
            .from('classes')
            .select('capacity')
            .eq('id', classId)
            .single();

          const classCapacity = classData?.capacity || 10; // fallback
          const capacity = sessionData?.capacity || classCapacity;

          // Count existing bookings for this exact slot
          const { data: existingBookings, error: capacityError } = await supabase
            .from('bookings')
            .select('id')
            .eq('type', 'class')
            .eq('class_id', classId)
            .eq('location_id', effectiveLocation.id)
            .eq('start_at', startDateUtc.toISOString())
            .neq('status', 'cancelled');

          if (capacityError) {
            console.error('[ClassConfirm] Error checking capacity:', capacityError);
            throw new Error('Error verificando disponibilidad de la clase');
          }

          const usedSlots = existingBookings?.length || 0;
          const remaining = capacity - usedSlots;

          console.log('[ClassConfirm] pre-insert cap=', capacity, 'used=', usedSlots, 'remaining=', remaining, 'slot=', startDateUtc.toISOString());

          if (remaining <= 0) {
            toast({
              title: 'Clase completa',
              description: 'Esta clase ya no tiene plazas disponibles. Por favor elige otro horario.',
              variant: 'destructive'
            });
            setSubmitting(false);
            setProcessingPayment(false);
            setHasSubmitted(false);
            return;
          }

          // Always create new booking for class
          const result = await supabase
            .from('bookings')
            .insert([bookingData])
            .select()
            .single();

          if (result.error) {
            console.error(`[DB] class booking.insert error`, result.error);
            const debugInfo = {
              userId: userId,
              origin: mode,
              classId: classId || 'null',
              professionalId: professionalId,
              locationId: effectiveLocation?.id || 'null',
              date,
              time,
              durationMin: durationMin || 'undefined',
              startUTC: startDateUtc.toISOString(),
              endUTC: endDateUtc.toISOString(),
              bookingInsertError: result.error
            };
            console.error('[Confirm.debug]', debugInfo);
            console.error('Complete booking insert error:', result.error);
            toast({
              title: 'Error al crear la reserva',
              description: (result.error as any)?.message || 'No se pudo crear la reserva. Inténtalo de nuevo.',
              variant: 'destructive'
            });
            setSubmitting(false);
            setProcessingPayment(false);
            setHasSubmitted(false);
            return;
          }
          booking = result.data;
          console.log('[DB] class booking.insert ok booking_id=', booking.id);
        } else if (mode === 'subscription') {
          // For subscription bookings - no capacity check needed (already done in calendar)
          // Idempotency for subscription bookings
          let existingQuery = supabase
            .from('bookings')
            .select('id, status, payment_status')
            .eq('user_id', userId)
            .eq('location_id', effectiveLocation.id)
            .eq('start_at', startDateUtc.toISOString())
            .eq('end_at', endDateUtc.toISOString())
            .eq('status', 'pending')
            .eq('type', 'service')  // Subscriptions are service-type
            .eq('origin', 'subscription')
            .eq('payment_method', 'cash')
            .eq('payment_status', 'paid');

          const { data: existing } = await existingQuery.maybeSingle();

          if (existing) {
            booking = existing as any;
            console.log('[SubConfirm] booking reuse id=', booking.id);
          } else {
            const result = await supabase
              .from('bookings')
              .insert([bookingData])
              .select()
              .single();

            if (result.error) {
              console.error('[SubConfirm] error', result.error);
              const debugInfo = {
                userId: userId,
                origin: mode,
                subscriptionPlanId: subscriptionPlanId || 'null',
                professionalId: professionalId,
                locationId: effectiveLocation?.id || 'null',
                date,
                time,
                startUTC: startDateUtc.toISOString(),
                endUTC: endDateUtc.toISOString(),
                bookingInsertError: result.error
              };
              console.error('[Confirm.debug]', debugInfo);
              toast({
                title: 'Error al crear la reserva',
                description: (result.error as any)?.message || 'No se pudo crear la reserva. Inténtalo de nuevo.',
                variant: 'destructive'
              });
              setSubmitting(false);
              setProcessingPayment(false);
              setHasSubmitted(false);
              return;
            }
            booking = result.data as any;
            console.log('[SubConfirm] insert ok id=', booking.id);
          }
        } else {
          // For services/vouchers, keep idempotency check
          let existingQuery = supabase
            .from('bookings')
            .select('id, status, payment_status')
            .eq('user_id', userId)
            .eq('location_id', effectiveLocation.id)
            .eq('start_at', startDateUtc.toISOString())
            .eq('end_at', endDateUtc.toISOString())
            .eq('status', 'pending');

          existingQuery = existingQuery
            .eq('service_id', bookingData.service_id)
            .eq('professional_id', professional?.id || null)
            .eq('payment_method', paymentMethod)
            .eq('payment_status', 'unpaid')
            .eq('origin', effectiveOrigin);

          const { data: existing } = await existingQuery.maybeSingle();

          if (existing) {
            booking = existing;
            console.log(`[${mode === 'service' ? 'ServicePay' : 'CardPay'}] booking reuse id=`, booking.id);
          } else {
            const result = await supabase
              .from('bookings')
              .insert([bookingData])
              .select()
              .single();

            if (result.error) {
              console.error(`[DB] ${mode} booking.insert error`, result.error);
              const debugInfo = {
                userId: userId,
                voucherId: chosenVoucherId || 'undefined',
                origin: mode,
                serviceId: serviceId || 'null',
                classId: classId || 'null',
                professionalId: professionalId,
                locationId: effectiveLocation?.id || 'null',
                date,
                time,
                durationMin: durationMin || 'undefined',
                startUTC: startDateUtc.toISOString(),
                endUTC: endDateUtc.toISOString(),
                bookingInsertError: result.error
              };
              console.error('[Confirm.debug]', debugInfo);
              console.error('Complete booking insert error:', result.error);
              throw result.error;
            }
            booking = result.data;
            console.log('[DB] service booking.insert ok booking_id=', booking.id);
          }
        }
      } catch (error) {
        const debugInfo = {
          userId: userId,
          voucherId: chosenVoucherId || 'undefined',
          origin: mode,
          serviceId: serviceId || 'null',
          professionalId: professionalId,
          locationId: effectiveLocation?.id || 'null',
          date,
          time,
          durationMin: durationMin || 'undefined',
          startUTC: startDateUtc.toISOString(),
          endUTC: endDateUtc.toISOString(),
          bookingCatchError: error,
          bookingData: bookingData,
          effectiveLocationId: effectiveLocation.id
        };
        console.error('[Confirm.debug]', debugInfo);
        throw error;
      }

      // Handle payment method
      if (mode === 'service' && paymentMethod === 'card') {
        // Persist last booking state for cancel redirect
        try {
          localStorage.setItem('reservasPro_lastBooking', JSON.stringify({
            bookingId: booking.id,
            serviceId: service?.id || null,
            professionalId: professional.id,
            locationId: effectiveLocation.id,
            date,
            time,
            mode: 'service'
          }));
        } catch {}

        // Redirect to Stripe checkout
        await handleStripePayment(booking.id);
        return; // Exit here - success will be handled on return from Stripe
      } else if (mode === 'class' && paymentMethod === 'card') {
        // Persist last booking state for cancel redirect
        try {
          localStorage.setItem('reservasPro_lastBooking', JSON.stringify({
            bookingId: booking.id,
            classId: classId || null,
            locationId: effectiveLocation.id,
            date,
            time,
            mode: 'class'
          }));
        } catch {}

        console.log('[ClassPay] booking ready id=' + booking.id);
        // Redirect to Stripe checkout for classes
        await handleStripePayment(booking.id);
        return; // Exit here - success will be handled on return from Stripe
      }

      // If voucher mode, consumir crédito automáticamente
      let voucherBalance: any = null;
      if (mode === 'voucher' && chosenVoucherId) {
        try {
          // Check if redemption already exists to prevent double consumption (idempotency)
          const existsAlready = await checkExistingRedemption(booking.id);

          if (existsAlready) {
            console.log('[Voucher] Redemption already exists for booking', booking.id);
          } else {
            const { error: redemptionError } = await supabase
              .from('voucher_redemptions')
              .insert([{
                voucher_id: chosenVoucherId,
                booking_id: booking.id,
                credits_used: 1,
                status: 'captured'
              }]);

            if (redemptionError) {
              const debugInfo = {
                userId: userId,
                voucherId: chosenVoucherId,
                origin: mode,
                serviceId: serviceId || 'null',
                professionalId: professionalId,
                locationId: effectiveLocation?.id || 'null',
                date,
                time,
                durationMin: durationMin || 'undefined',
                startUTC: startDateUtc.toISOString(),
                endUTC: endDateUtc.toISOString(),
                bookingId: booking.id,
                voucherRedemptionError: redemptionError
              };
              console.error('[Confirm.debug]', debugInfo);
              console.error('Complete voucher redemption error:', redemptionError);
              
              // Rollback lógico
              await supabase.from('bookings').delete().eq('id', booking.id);
              throw redemptionError;
            }

            console.log(`[DB] voucher_redemptions.insert ok voucher_id=${chosenVoucherId} booking_id=${booking.id}`);
          }

          // Calculate post-booking balance using consistent formula
          voucherBalance = await calculateVoucherBalance(chosenVoucherId);
      console.log(`[Voucher] post-booking balance`, voucherBalance);
      
      // Webhook is now sent automatically via database trigger (on_booking_created)
      // No need to call sendBookingWebhook here - it would cause duplicates

      // REDIRECT IMMEDIATELY for voucher mode
      if (mode === 'voucher') {
        const widgetBase = window.location.origin + window.location.pathname;
        const successUrl = `${widgetBase}#/exito?booking_id=${booking.id}`;
        console.log(`[VoucherPay] IMMEDIATE redirection to: ${successUrl}`);
        
        // Immediate redirect for voucher bookings
        setTimeout(() => {
          window.location.href = successUrl;
        }, 500); // Shorter delay
        return; // Exit immediately
      }

        } catch (error) {
          const debugInfo = {
            userId: userId,
            voucherId: chosenVoucherId,
            origin: mode,
            serviceId: serviceId || 'null',
            professionalId: professionalId,
            locationId: effectiveLocation?.id || 'null',
            date,
            time,
            durationMin: durationMin || 'undefined',
            startUTC: startDateUtc.toISOString(),
            endUTC: endDateUtc.toISOString(),
            bookingId: booking.id,
            voucherRedemptionCatchError: error
          };
          console.error('[Confirm.debug]', debugInfo);
          throw new Error('No se pudo aplicar el bono, inténtalo de nuevo');
        }
      }
      
      // Save user data to localStorage for future use
      if (userId) {
        const userData = {
          userShadowId: userId,
          email: emailNormalized,
          name: name,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem('reservasPro_user', JSON.stringify(userData));
        console.log('User data saved to localStorage:', userData);
      }
      
      // Build success message with accurate remaining credits
      let successDescription = '';
      if (mode === 'voucher' && voucherBalance) {
        successDescription = `Tu reserva ha sido confirmada con el bono - Te quedan ${voucherBalance.remaining}/${voucherBalance.total} créditos`;
        console.log(`[UI] updated MyVouchers remaining=${voucherBalance.remaining}`);
      } else if (mode === 'voucher') {
        successDescription = 'Tu reserva ha sido confirmada con el bono';
      } else if (paymentMethod === 'cash') {
        successDescription = 'Tu reserva ha sido confirmada';
      } else {
        successDescription = 'Recibirás el enlace de pago pronto';
      }
      
      // Show success message
      toast({
        title: "¡Reserva creada!",
        description: successDescription,
        variant: "default"
      });

      console.log(`[UI] success booking_id=${booking.id}`);

      // Refresh class availability data if this is a class booking (including subscription)
      if ((mode === 'class' || mode === 'subscription') && classAvailability?.refreshAvailability) {
        console.log('[ClassBooking] refreshing availability after successful booking (mode: class/subscription)');
        classAvailability.refreshAvailability();
      }

      // Redirect to success page for cash payments, voucher bookings, and subscription bookings
      if (paymentMethod === 'cash' || paymentMethod === 'subscription' || mode === 'voucher' || mode === 'subscription') {
        const widgetBase = window.location.origin + window.location.pathname;
        const successUrl = `${widgetBase}#/exito?booking_id=${booking.id}`;
        console.log(`[${mode === 'voucher' ? 'VoucherPay' : (paymentMethod === 'subscription' || mode === 'subscription') ? 'SubscriptionPay' : 'CashPay'}] redirecting to success page: ${successUrl}`);
        
        // Small delay to ensure toast is visible
        setTimeout(() => {
          window.location.href = successUrl;
        }, 1000);
      }
      
    } catch (error) {
      console.error('Error creating booking:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo crear la reserva. Inténtalo de nuevo.",
        variant: "destructive"
      });
      setHasSubmitted(false);
    } finally {
      setSubmitting(false);
      // Don't reset hasSubmitted here - let it remain true to prevent retries
    }
  };
  const sendBookingWebhook = async (booking: any, effectiveLocationOverride?: Location | null) => {
    try {
      // Check if webhooks are enabled
      const { data: enabledSettings } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'webhooks.enabled')
        .single();

      if (!enabledSettings?.value) {
        console.log('[Webhook] Webhooks disabled, skipping');
        return;
      }

      // Get webhook URL from settings
      const { data: urlSettings } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'webhooks.booking_created_url')
        .single();

      let webhookUrl = urlSettings?.value as string;
      
      // Fallback to test URL if not configured
      if (!webhookUrl) {
        webhookUrl = 'https://n8n-n8ninnovagastro.zk6hny.easypanel.host/webhook-test/5d254150-f0e9-4f79-a89c-34d8b33bd559';
        console.log('[Webhook] No URL configured, using test endpoint');
      }

      // Normalize URL (trim and remove wrapping quotes)
      webhookUrl = webhookUrl.trim().replace(/^["']|["']$/g, '');

      if (!webhookUrl || (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://'))) {
        console.error('[Webhook] Invalid URL:', webhookUrl);
        toast({
          title: "Webhook desactivado",
          description: "URL inválida o no configurada",
          variant: "default"
        });
        return;
      }

      console.log('[Webhook] Sending to URL:', webhookUrl);

      const webhookPayload = {
        event: 'booking.created',
        environment: 'production',
        source: 'widget',
        timestamp: new Date().toISOString(),
        booking: {
          id: booking.id,
          start_at: booking.start_at,
          end_at: booking.end_at,
          duration_min: service?.duration_min,
          status: booking.status,
          payment_method: booking.payment_method,
          payment_status: booking.payment_status,
          price: mode === 'voucher' ? 0 : service?.price,
          currency: service?.currency || 'EUR',
          notes: booking.notes
        },
        service: {
          id: service?.id,
          name: service?.name,
          category_id: category?.id,
          category_name: category?.name
        },
        professional: {
          id: professional?.id,
          name: professional?.name,
          email: professional?.email
        },
        location: (effectiveLocationOverride ?? location) ? {
          id: (effectiveLocationOverride ?? location)!.id,
          name: (effectiveLocationOverride ?? location)!.name,
          timezone: (effectiveLocationOverride ?? location)!.timezone || 'Europe/Madrid'
        } : null,
        customer: {
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          email: email
        },
        ...(mode === 'voucher' && voucher ? {
          voucher: {
            id: voucherId,
            type_id: voucher.voucher_type_id,
            name: voucher.voucher_type.name
          }
        } : {}),
        meta: {
          external_ref: `bk_${booking.id}`,
          widget_version: '1.0.0',
          ua: navigator.userAgent
        }
      };

      const requestHeaders = {
        'Content-Type': 'application/json',
        'X-ReservasPro-Event': 'booking.created'
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(webhookPayload)
      });

      let responseBody = '';
      try {
        responseBody = await response.text();
      } catch (e) {
        responseBody = 'Could not read response body';
      }

      console.log('[Webhook] Response:', {
        status: response.status,
        statusText: response.statusText,
        url: webhookUrl,
        body: responseBody
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }

      // Log successful webhook
      await supabase
        .from('outbound_webhooks')
        .insert([{
          event: 'booking.created',
          payload: webhookPayload,
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null,
          retries: 0
        }]);

      console.log('[Webhook] Sent successfully:', response.status);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Webhook] Error:', errorMessage);
      
      // Log failed webhook for retry
      try {
        await supabase
          .from('outbound_webhooks')
          .insert([{
            event: 'booking.created',
            payload: {
              ...booking,
              service_name: service?.name,
              professional_name: professional?.name,
              location_name: (effectiveLocationOverride ?? location)?.name
            },
            status: 'failed',
            last_error: errorMessage,
            retries: 0
          }]);
      } catch (dbError) {
        console.error('[Webhook] Could not log to outbound_webhooks:', dbError);
      }
      
      // Don't fail the booking, just show a warning
      toast({
        title: "Reserva creada",
        description: `Reserva creada pero no se pudo notificar (status: ${error instanceof Error && error.message.includes('404') ? '404' : 'error'}). Reintentaremos.`,
        variant: "default"
      });
    }
  };

  const showSuccessScreen = () => {
    console.log('[UI] success');
    // Navigate to success screen
    window.location.hash = '#/exito';
  };

  // Final guard to avoid rendering with undefined params - handled in useEffect now
  if (!date || !time) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // For service and voucher modes, professional is required
  if ((mode === 'service' || mode === 'voucher') && !professionalId) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const isVoucherMode = mode === 'voucher';
  const effectiveService = service;
  const effectiveCategoryId = effectiveService?.category_id;

  // In voucher mode, do NOT gate with VoucherGuard even if service is null.
  // We create a pseudo-service earlier for UI and proceed to confirmation.
  // Voucher revalidation and redemption remain unchanged.
  // (This prevents accidental redirects to purchase in voucher flows.)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  // For classes and subscriptions, professional is not required; for services/vouchers it is
  if (!service || ((mode !== 'class' && mode !== 'subscription') && !professional)) {
    console.log('[ClassConfirm.error] missing data', { service: !!service, professional: !!professional, mode });
    return (
      <div className="text-center py-8">
        <p className="text-white">Error: No se pudieron cargar los datos de la reserva</p>
        <Button onClick={onBack} variant="outline" className="mt-4">
          Volver
        </Button>
      </div>
    );
  }

  const bookingDate = parse(date, 'yyyy-MM-dd', new Date());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          onClick={onBack}
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-white text-lg font-semibold">Confirmar reserva</h1>
      </div>

      {/* Booking Summary */}
      <Card className="bg-white/10 border-white/20 p-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="text-white">
              <p className="font-medium">{service.name}</p>
              {category && <p className="text-sm text-white/70">{category.name}</p>}
            </div>
          </div>
          
          {/* Only show professional for service/voucher modes */}
          {mode !== 'class' && professional && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
              <p className="text-white">{professional.name}</p>
            </div>
          )}

          {location && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <MapPin className="h-4 w-4 text-white" />
              </div>
              <p className="text-white">{location.name}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Clock className="h-4 w-4 text-white" />
            </div>
            <div className="text-white">
              <p>{format(bookingDate, 'EEEE, d MMMM yyyy', { locale: es })}</p>
              <p className="text-sm text-white/70">{time} ({service.duration_min} min)</p>
            </div>
          </div>

            <div className="pt-2 border-t border-white/20">
            <div className="flex justify-between items-center">
              <span className="text-white">Precio:</span>
              <Badge variant="secondary" className="bg-primary text-white">
                {mode === 'voucher' ? 'Bono (1 crédito)' : 
                 paymentMethod === 'subscription' && selectedSubscription ? 'Suscripción (1 sesión)' :
                 `${service.price}€`}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Customer Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Customer Form - Solo visible si NO está reconocido */}
        {!isRecognizedUser && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName" className="text-white">Nombre *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  placeholder="Tu nombre"
                />
                {errors.firstName && <p className="text-red-400 text-sm mt-1">{errors.firstName}</p>}
              </div>
              
              <div>
                <Label htmlFor="lastName" className="text-white">Apellidos *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  placeholder="Tus apellidos"
                />
                {errors.lastName && <p className="text-red-400 text-sm mt-1">{errors.lastName}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="phone" className="text-white">Teléfono *</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                placeholder="+34 600 000 000"
              />
              {errors.phone && <p className="text-red-400 text-sm mt-1">{errors.phone}</p>}
            </div>

            <div>
              <Label htmlFor="email" className="text-white">Email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                placeholder="tu@email.com"
              />
              {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email}</p>}
            </div>
          </>
        )}

        {/* Payment Method */}
        <div className="space-y-3">
          <Label className="text-white">Método de pago *</Label>
          
          {/* Subscription mode - show subscription info instead of payment options */}
          {mode === 'subscription' && subscriptionPlanId && (
            <div className="bg-primary/20 border border-primary/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-4 w-4 text-primary" />
                <span className="text-white font-medium">Reserva con suscripción</span>
              </div>
              <div className="text-white">
                <p className="text-sm">Esta reserva se realizará usando tu suscripción activa.</p>
                <p className="text-xs text-white/60 mt-1">
                  Consulta tus sesiones restantes en tu perfil después de confirmar la reserva.
                </p>
              </div>
            </div>
          )}
          
          {/* Show subscription option for services only (never for classes) */}
          {mode === 'service' && availableSubscriptions.length > 0 && (
            <div className="mb-4">
              <div className="bg-primary/20 border border-primary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-4 w-4 text-primary" />
                  <span className="text-white font-medium">Usar mi suscripción</span>
                </div>
                
                {availableSubscriptions.map((usage) => (
                  <Button
                    key={usage.subscription.id}
                    type="button"
                    variant={paymentMethod === 'subscription' && selectedSubscription?.subscription.id === usage.subscription.id ? 'default' : 'outline'}
                    className={`w-full mb-2 h-auto p-3 ${
                      paymentMethod === 'subscription' && selectedSubscription?.subscription.id === usage.subscription.id
                        ? 'bg-white text-gray-900'
                        : 'border-white/20 text-white hover:bg-white/10 bg-transparent'
                    }`}
                    onClick={() => {
                      setSelectedSubscription(usage);
                      setPaymentMethod('subscription');
                    }}
                  >
                    <div className="text-left w-full">
                      <div className="font-medium">{usage.subscription.plan.name}</div>
                      <div className="text-sm opacity-75">
                        {usage.isUnlimited 
                          ? 'Sesiones ilimitadas' 
                          : `${usage.remaining}/${usage.subscription.plan.cap_per_cycle} sesiones restantes`
                        }
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          {/* Regular payment options - hide for subscription mode */}
          {mode !== 'subscription' && (
            <div className={`grid gap-3 ${mode === 'voucher' ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {mode === 'voucher' ? (
                <Button
                  type="button"
                  variant="default"
                  className="h-12 bg-white text-gray-900 cursor-default"
                  disabled
                >
                  <Ticket className="h-4 w-4 mr-2" />
                  Bono (1 crédito)
                </Button>
              ) : (
                <>
                  <Button
                    type="button" 
                    variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                    className={`h-12 ${
                      paymentMethod === 'cash'
                        ? 'bg-white text-gray-900'
                        : 'border-white/20 text-white hover:bg-white/10 bg-transparent'
                    }`}
                    onClick={() => setPaymentMethod('cash')}
                  >
                    <Banknote className="h-4 w-4 mr-2" />
                    Pago en la clínica
                  </Button>
                  
                  <Button
                    type="button"
                    variant={paymentMethod === 'card' ? 'default' : 'outline'}
                    className={`h-12 ${
                      paymentMethod === 'card'
                        ? 'bg-white text-gray-900'
                        : 'border-white/20 text-white hover:bg-white/10 bg-transparent'
                    }`}
                    onClick={() => setPaymentMethod('card')}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pago en la app
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          size="lg"
          className="w-full bg-white text-gray-900 hover:bg-white/90"
          disabled={submitting || processingPayment}
        >
          {submitting || processingPayment ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {processingPayment ? 'Redirigiendo a pago...' : 
               mode === 'voucher' ? 'Confirmando reserva...' : 
               paymentMethod === 'subscription' ? 'Confirmando con suscripción...' :
               paymentMethod === 'card' ? 'Preparando pago...' : 'Creando reserva...'}
            </>
          ) : (
            <>
              {paymentMethod === 'card' && mode !== 'voucher' ? (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Confirmar reserva
                </>
              ) : paymentMethod === 'subscription' ? (
                <>
                  <Star className="h-4 w-4 mr-2" />
                  Confirmar reserva con suscripción
                </>
              ) : (
                mode === 'voucher' ? 'Confirmar reserva con bono' : 'Confirmar reserva'
              )}
            </>
          )}
        </Button>
      </form>
    </div>
  );
}