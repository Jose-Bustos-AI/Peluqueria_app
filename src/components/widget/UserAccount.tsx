import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Calendar, Clock, MapPin, User, Ticket, CreditCard, AlertCircle, Phone, Mail, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from "@/hooks/use-toast";
import { calculateVoucherBalance } from '@/lib/voucher-utils';
import UserSubscriptions from './UserSubscriptions';
import CancelBookingModal from './CancelBookingModal';

interface UserData {
  userShadowId: string;
  email: string;
  name: string;
  savedAt: string;
}

interface Booking {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  payment_method: string;
  payment_status: string;
  origin: string;
  notes?: string;
  professional?: { name: string; color?: string };
  location?: { name: string };
  service?: { name: string; duration_min: number };
  professional_id: string;
  location_id: string;
  service_id?: string;
}

interface UserVoucher {
  id: string;
  sessions_remaining: number;
  expiry_date?: string;
  status: string;
  calculated_remaining?: number; // Add calculated remaining for accurate display
  calculated_total?: number; // Add calculated total
  voucher_type: {
    id: string;
    name: string;
    sessions_count: number;
    session_duration_min?: number;
    description?: string;
    currency: string;
    price: number;
  };
}

interface UserSubscription {
  id: string;
  status: string;
  next_billing_date?: string;
  cancel_at_period_end?: boolean;
  subscription_plan: {
    id: string;
    name: string;
    price: number;
    currency: string;
    cycle: string;
    description?: string;
  };
}

interface UserAccountProps {
  onBack: () => void;
  onReserveVoucher?: (voucherId: string, voucherTypeId: string) => void;
  onNavigateToSubscriptionCalendar?: (subscriptionId: string, planId: string) => void;
  initialTab?: string;
}

export default function UserAccount({ onBack, onReserveVoucher, onNavigateToSubscriptionCalendar, initialTab }: UserAccountProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab || 'reservas');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  
  // Data states
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vouchers, setVouchers] = useState<UserVoucher[]>([]);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  
  // Filters
  const [bookingFilter, setBookingFilter] = useState<'upcoming' | 'past'>('upcoming');
  
  // Modal states
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    checkUserAuth();
  }, []);
  
  // Force reload vouchers when tab changes to "bonos"
  useEffect(() => {
    if (activeTab === 'bonos' && userData?.userShadowId) {
      console.log('[UserAccount] Tab changed to bonos, reloading vouchers...');
      loadVouchers(userData.userShadowId);
    }
  }, [activeTab, userData?.userShadowId]);

  // Detectar si se acaba de comprar un bono y recargar automáticamente
  useEffect(() => {
    const voucherPurchased = localStorage.getItem('reservasPro_voucherPurchased');
    if (voucherPurchased === 'true' && userData?.userShadowId) {
      console.log('[UserAccount] Detectada compra reciente de bono, recargando...');
      localStorage.removeItem('reservasPro_voucherPurchased');
      loadVouchers(userData.userShadowId);
      toast({
        title: "Bonos actualizados",
        description: "Tu nuevo bono ya está disponible",
        variant: "default"
      });
    }
  }, [userData?.userShadowId]);

  const checkUserAuth = () => {
    const savedUser = localStorage.getItem('reservasPro_user');
    console.log('[UserAccount] localStorage raw value:', savedUser);
    
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        console.log('[UserAccount] Parsed user data:', parsed);
        console.log('[UserAccount] userShadowId:', parsed.userShadowId);
        
        if (!parsed.userShadowId) {
          console.error('[UserAccount] NO userShadowId found in localStorage!');
          setNeedsAuth(true);
          setLoading(false);
          return;
        }
        
        setUserData(parsed);
        loadUserData(parsed.userShadowId);
      } catch (error) {
        console.error('Error parsing saved user data:', error);
        setNeedsAuth(true);
        setLoading(false);
      }
    } else {
      setNeedsAuth(true);
      setLoading(false);
    }
  };

  const authenticateUser = async () => {
    if (!emailInput.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa tu email",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users_shadow')
        .select('*')
        .eq('email', emailInput.trim())
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast({
          title: "Usuario no encontrado",
          description: "No encontramos reservas asociadas a este email",
          variant: "destructive"
        });
        return;
      }

      const userData = {
        userShadowId: data.id,
        email: data.email,
        name: data.name,
        savedAt: new Date().toISOString()
      };

      setUserData(userData);
      localStorage.setItem('reservasPro_user', JSON.stringify(userData));
      setNeedsAuth(false);
      
      await loadUserData(data.id);
    } catch (error) {
      console.error('Error authenticating user:', error);
      toast({
        title: "Error",
        description: "Error al acceder a tu cuenta. Inténtalo de nuevo.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUserData = async (userShadowId: string) => {
    try {
      setLoading(true);
      await Promise.all([
        loadBookings(userShadowId),
        loadVouchers(userShadowId),
        loadSubscriptions(userShadowId)
      ]);
    } catch (error) {
      console.error('Error loading user data:', error);
      toast({
        title: "Error",
        description: "Error al cargar tus datos",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadBookings = async (userShadowId: string) => {
    if (!userShadowId) {
      console.error('[UserAccount.loadBookings] userShadowId is undefined');
      return;
    }
    
    setBookingsLoading(true);
    try {
      console.log('[UserAccount.loadBookings] Fetching bookings for userShadowId:', userShadowId);
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          professionals (id, name, color),
          locations (id, name),
          services (id, name, duration_min)
        `)
        .eq('user_id', userShadowId)
        .order('start_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to include IDs needed for modals
      const transformedBookings = (data || []).map(booking => ({
        ...booking,
        professional_id: booking.professionals?.id || booking.professional_id || '',
        location_id: booking.locations?.id || booking.location_id || '',
        service_id: booking.services?.id || booking.service_id || null,
        professional: booking.professionals ? { name: booking.professionals.name, color: booking.professionals.color } : undefined,
        location: booking.locations ? { name: booking.locations.name } : undefined,
        service: booking.services ? { name: booking.services.name, duration_min: booking.services.duration_min } : undefined
      }));
      
      setBookings(transformedBookings);
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      setBookingsLoading(false);
    }
  };

  const loadVouchers = async (userShadowId: string, showToast = false) => {
    if (!userShadowId) {
      console.error('[UserAccount.loadVouchers] userShadowId is undefined');
      return;
    }
    
    try {
      if (showToast) {
        toast({
          title: "Actualizando bonos...",
          description: "Cargando tus bonos más recientes",
          variant: "default"
        });
      }
      
      console.log('[UserAccount.loadVouchers] Fetching vouchers for userShadowId:', userShadowId);
      
      const { data, error } = await supabase
        .from('vouchers')
        .select(`
          *,
          voucher_types (*)
        `)
        .eq('user_id', userShadowId)
        .in('status', ['active', 'partially_used'])
        .order('expiry_date', { ascending: true });

      if (error) {
        console.error('[UserAccount.loadVouchers] Query error:', error);
        throw error;
      }
      
      console.log('[UserAccount.loadVouchers] Raw vouchers from DB:', data);
      
      // Transform the data and calculate accurate balances
      console.log(`[UserAccount] Loading balances for ${(data || []).length} vouchers`);
      const transformedVouchers = await Promise.all((data || []).map(async (v) => {
        console.log(`[UserAccount] Processing voucher ${v.id} (${v.voucher_types?.name})`);
        try {
          const balance = await calculateVoucherBalance(v.id);
          console.log(`[UserAccount] Calculated balance for ${v.id}:`, balance);
          
          // Filter out vouchers with 0 remaining sessions
          if (balance.remaining <= 0) {
            console.log(`[UserAccount] Filtering out voucher ${v.id} with 0 remaining sessions`);
            return null;
          }
          
          return {
            ...v,
            voucher_type: v.voucher_types,
            calculated_remaining: balance.remaining,
            calculated_total: balance.total
          };
        } catch (error) {
          console.error(`[UserAccount] Error calculating balance for voucher ${v.id}:`, error);
          console.log(`[UserAccount] Using fallback data for ${v.id}: remaining=${v.sessions_remaining}, total=${v.voucher_types.sessions_count}`);
          
          // Filter out if sessions_remaining is 0
          if (v.sessions_remaining <= 0) {
            console.log(`[UserAccount] Filtering out voucher ${v.id} with 0 sessions_remaining`);
            return null;
          }
          
          return {
            ...v,
            voucher_type: v.voucher_types,
            calculated_remaining: v.sessions_remaining,
            calculated_total: v.voucher_types.sessions_count
          };
        }
      }));
      
      // Filter out null entries (vouchers with 0 remaining)
      const filteredVouchers = transformedVouchers.filter(v => v !== null);
      
      setVouchers(filteredVouchers);
      console.log(`[UserAccount.loadVouchers] Final vouchers loaded: ${filteredVouchers.length}`);
    } catch (error) {
      console.error('[UserAccount.loadVouchers] Error:', error);
    }
  };

  const loadSubscriptions = async (userShadowId: string) => {
    if (!userShadowId) {
      console.error('[UserAccount.loadSubscriptions] userShadowId is undefined');
      return;
    }
    
    try {
      console.log('[UserAccount.loadSubscriptions] Fetching subscriptions for userShadowId:', userShadowId);
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_plans (*)
        `)
        .eq('user_id', userShadowId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to match our interface
      const transformedSubscriptions = (data || []).map(s => ({
        ...s,
        subscription_plan: s.subscription_plans
      }));
      
      setSubscriptions(transformedSubscriptions);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    }
  };

  const logout = () => {
    localStorage.removeItem('reservasPro_user');
    localStorage.removeItem('reservasPro_voucherFlow');
    localStorage.removeItem('reservasPro_verifiedVoucherId');
    localStorage.removeItem('voucherId');
    setUserData(null);
    setNeedsAuth(true);
    setBookings([]);
    setVouchers([]);
    setSubscriptions([]);
  };

  const handleCancelClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setCancelModalOpen(true);
  };

  const handleBookingSuccess = () => {
    // Reload bookings after successful cancel/reschedule
    if (userData?.userShadowId) {
      loadBookings(userData.userShadowId);
      // No hacemos reload() - loadBookings ya actualiza el estado
      // El CancelBookingModal llama a onClose() automáticamente
    }
  };

  if (needsAuth) {
    return (
      <div className="min-h-screen bg-brand-bg text-brand-text p-4 max-w-md mx-auto space-y-6">
        <Button onClick={onBack} variant="ghost" className="mb-4 text-white hover:bg-white/10">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>

        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto">
            <User className="h-8 w-8 text-white" />
          </div>
          
          <div className="space-y-2">
          <div className="flex items-center justify-between w-full">
            <h1 className="text-brand-text text-2xl font-bold">Mi Cuenta</h1>
            <Button 
              variant="ghost"
              size="sm" 
              onClick={() => userData?.userShadowId && loadUserData(userData.userShadowId)}
              className="text-white hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4 transform rotate-90" />
            </Button>
          </div>
            <p className="text-white/90 text-sm">
              Ingresa tu email para ver tus reservas, bonos y suscripciones
            </p>
          </div>
        </div>

        <Card className="bg-white/95 backdrop-blur-sm">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="tu@email.com"
                onKeyDown={(e) => e.key === 'Enter' && authenticateUser()}
              />
            </div>
            
            <Button 
              onClick={authenticateUser} 
              variant="brand"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accediendo...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Acceder a mi cuenta
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredBookings = bookings.filter(booking => {
    const bookingDate = parseISO(booking.start_at);
    const now = new Date();
    
    if (bookingFilter === 'upcoming') {
      return !isBefore(bookingDate, now) && booking.status !== 'cancelled';
    } else {
      return isBefore(bookingDate, now) || booking.status === 'cancelled';
    }
  });

  const getBookingStatusBadge = (booking: Booking) => {
    switch (booking.status) {
      case 'confirmed':
        return <Badge className="bg-green-600 text-white text-xs px-1.5 py-0.5">Confirmada</Badge>;
      case 'pending':
        return <Badge className="bg-brand-red text-brand-text text-xs px-1.5 py-0.5">Pendiente</Badge>;
      case 'cancelled':
        return <Badge variant="destructive" className="text-xs px-1.5 py-0.5">Cancelada</Badge>;
      default:
        return <Badge variant="outline" className="text-xs px-1.5 py-0.5">{booking.status}</Badge>;
    }
  };

  const getPaymentMethodBadge = (booking: Booking) => {
    if (booking.origin === 'subscription') {
      return <Badge className="bg-purple-600 text-white text-xs px-1.5 py-0.5">Suscripción</Badge>;
    }
    
    switch (booking.payment_method) {
      case 'cash':
        return <Badge variant="outline" className="border-white/30 text-gray-700 bg-white/10 text-xs px-1.5 py-0.5">Pago en la clínica</Badge>;
      case 'card':
        return <Badge className="bg-brand-blue text-brand-text border border-white/30 text-xs px-1.5 py-0.5">Pago en la app</Badge>;
      case 'voucher':
        return <Badge className="bg-amber-600 text-white text-xs px-1.5 py-0.5">Bono</Badge>;
      default:
        return <Badge variant="outline" className="border-white/30 text-gray-700 text-xs px-1.5 py-0.5">{booking.payment_method}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text p-4 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button onClick={onBack} variant="ghost" className="text-white hover:bg-white/10">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        
        <Button onClick={logout} variant="outline" className="border-white/20 text-white hover:bg-white/10 bg-transparent">
          Cambiar cuenta
        </Button>
      </div>

      {/* User Info */}
      <Card className="bg-white/95 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{userData?.name}</h2>
              <p className="text-sm text-gray-700">{userData?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 bg-transparent p-1">
            <TabsTrigger 
              value="reservas" 
              className="data-[state=active]:bg-transparent data-[state=active]:text-red-600 data-[state=active]:border-b-2 data-[state=active]:border-red-600 data-[state=active]:font-semibold data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:text-gray-900 data-[state=inactive]:border-b-2 data-[state=inactive]:border-transparent rounded-none"
            >
              Reservas
            </TabsTrigger>
            <TabsTrigger 
              value="bonos"
              className="data-[state=active]:bg-transparent data-[state=active]:text-red-600 data-[state=active]:border-b-2 data-[state=active]:border-red-600 data-[state=active]:font-semibold data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:text-gray-900 data-[state=inactive]:border-b-2 data-[state=inactive]:border-transparent rounded-none"
            >
              Bonos
            </TabsTrigger>
            <TabsTrigger 
              value="suscripciones"
              className="data-[state=active]:bg-transparent data-[state=active]:text-red-600 data-[state=active]:border-b-2 data-[state=active]:border-red-600 data-[state=active]:font-semibold data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:text-gray-900 data-[state=inactive]:border-b-2 data-[state=inactive]:border-transparent rounded-none"
            >
              Suscripciones
            </TabsTrigger>
          </TabsList>

          {/* Reservas Tab */}
          <TabsContent value="reservas" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Mis Reservas</h3>
              <div className="flex gap-2">
                <Button
                  variant={bookingFilter === 'upcoming' ? 'brand' : 'outline'}
                  size="sm"
                  onClick={() => setBookingFilter('upcoming')}
                >
                  Próximas
                </Button>
                <Button
                  variant={bookingFilter === 'past' ? 'brand' : 'outline'}
                  size="sm"
                  onClick={() => setBookingFilter('past')}
                >
                  Pasadas
                </Button>
              </div>
            </div>

            {bookingsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="text-center py-8 text-gray-800">
                <Calendar className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No tienes {bookingFilter === 'upcoming' ? 'próximas' : 'pasadas'} reservas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBookings.map((booking) => (
                  <Card key={booking.id} className="border-gray-200 rounded-2xl shadow-lg">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-900 min-w-0 flex-1">
                              <Calendar className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              <span className="truncate">{format(parseISO(booking.start_at), "dd 'de' MMMM, yyyy", { locale: es })}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {getBookingStatusBadge(booking)}
                              {booking.origin === 'subscription' && (
                                <Badge className="bg-purple-600 text-white text-xs px-1.5 py-0.5 whitespace-nowrap">€0</Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-gray-400" />
                              {format(parseISO(booking.start_at), 'HH:mm')} - {format(parseISO(booking.end_at), 'HH:mm')}
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-400" />
                              {booking.professional?.name}
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-gray-400" />
                              {booking.location?.name}
                            </div>
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4 text-gray-400" />
                              {getPaymentMethodBadge(booking)}
                            </div>
                          </div>

                          {booking.service && (
                            <div className="text-sm">
                              <span className="font-medium text-gray-900">{booking.service.name}</span>
                              <span className="text-gray-700 ml-2">({booking.service.duration_min} min)</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {bookingFilter === 'upcoming' && booking.status !== 'cancelled' && (
                        <div className="flex justify-center mt-4 pt-4 border-t border-gray-100">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="w-full max-w-xs text-xs font-medium border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 px-2 py-2"
                            onClick={() => handleCancelClick(booking)}
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Bonos Tab */}
          <TabsContent value="bonos" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Mis Bonos</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => userData?.userShadowId && loadVouchers(userData.userShadowId, true)}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
            </div>
            
            {vouchers.length === 0 ? (
              <div className="text-center py-8 text-gray-800">
                <Ticket className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No tienes bonos activos</p>
              </div>
            ) : (
                <div className="space-y-3">
                  {vouchers.map((voucher) => (
                    <Card key={voucher.id} className="border-gray-200">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <h4 className="font-semibold text-gray-900">{voucher.voucher_type.name}</h4>
                            {voucher.expiry_date && (
                              <Badge variant={isBefore(parseISO(voucher.expiry_date), new Date()) ? 'destructive' : 'secondary'}>
                                {isBefore(parseISO(voucher.expiry_date), new Date()) ? 'Expirado' : 
                                 `Expira ${format(parseISO(voucher.expiry_date), 'dd/MM/yyyy')}`}
                              </Badge>
                            )}
                          </div>
                          
                            <div className="grid grid-cols-2 gap-4 text-sm text-gray-900">
                            <div className="flex items-center gap-2">
                              <Ticket className="h-4 w-4 text-amber-500" />
                              {voucher.calculated_remaining ?? voucher.sessions_remaining} de {voucher.calculated_total ?? voucher.voucher_type.sessions_count} sesiones
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-gray-400" />
                              {voucher.voucher_type.session_duration_min || 60} min por sesión
                            </div>
                          </div>

                          {voucher.voucher_type.description && (
                            <p className="text-sm text-gray-900">{voucher.voucher_type.description}</p>
                          )}

                          {/* Centered Reserve Button */}
                          {((voucher.calculated_remaining ?? voucher.sessions_remaining) > 0 && (!voucher.expiry_date || 
                           !isBefore(parseISO(voucher.expiry_date), new Date()))) && (
                            <div className="flex justify-center pt-2">
                              <Button 
                                size="sm" 
                                onClick={() => onReserveVoucher && onReserveVoucher(voucher.id, voucher.voucher_type.id)}
                                className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md hover:shadow-lg transition-all"
                              >
                                <Ticket className="h-4 w-4 mr-2" />
                                Reservar
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
            )}
          </TabsContent>

          {/* Suscripciones Tab */}
          <TabsContent value="suscripciones" className="p-6 space-y-4">
            <UserSubscriptions 
              userId={userData?.userShadowId} 
              onNavigateToCalendar={(subscriptionId, planId) => onNavigateToSubscriptionCalendar?.(subscriptionId, planId)}
            />
          </TabsContent>
        </Tabs>
      </Card>

      {/* Modals */}
      {selectedBooking && (
        <CancelBookingModal
          booking={selectedBooking}
          isOpen={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
}