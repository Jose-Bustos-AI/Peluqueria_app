import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Calendar, DollarSign, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const [stats, setStats] = useState([
    { title: "Reservas Confirmadas", value: "0", description: "Últimos 30 días", icon: Calendar, trend: "" },
    { title: "Ingresos Confirmados", value: "€0", description: "Pagos exitosos", icon: DollarSign, trend: "" },
    { title: "Ingresos Proyectados", value: "€0", description: "Reservas efectivo", icon: TrendingUp, trend: "" },
    { title: "Total Estimado", value: "€0", description: "Confirmados + Proyectados", icon: Users, trend: "" }
  ]);
  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const { toast } = useToast();

  const fetchUpcomingBookings = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          *,
          services(name, price),
          classes(name, price),
          users_shadow(name),
          professionals(name)
        `)
        .gte('start_at', startOfDay.toISOString())
        .lte('start_at', endOfDay.toISOString())
        .in('status', ['pending', 'confirmed', 'completed'])
        .order('start_at', { ascending: true })

      setUpcomingBookings(bookings || [])
    } catch (error) {
      console.error('Error fetching upcoming bookings:', error)
    }
  }

  const fetchRecentActivity = async () => {
    try {
      const activities = []

      // Recent bookings
      const { data: recentBookings } = await supabase
        .from('bookings')
        .select(`
          *,
          services(name),
          classes(name),
          users_shadow(name)
        `)
        .order('created_at', { ascending: false })
        .limit(2)

      recentBookings?.forEach(booking => {
        const serviceName = booking.services?.name || booking.classes?.name || 'Servicio'
        const status =
          booking.status === 'confirmed' ? 'Confirmada' :
          booking.status === 'completed' ? 'Completada' :
          booking.status === 'cancelled' ? 'Cancelada' : 'Pendiente'
        activities.push({
          action: `Reserva ${status.toLowerCase()}`,
          user: booking.users_shadow?.name || 'Cliente',
          time: getTimeAgo(booking.created_at),
          type: 'booking',
          created_at: booking.created_at
        })
      })

      // Recent payments
      const { data: recentPayments } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(2)

      recentPayments?.forEach(payment => {
        activities.push({
          action: 'Pago confirmado',
          user: 'Sistema',
          time: getTimeAgo(payment.created_at),
          type: 'payment',
          created_at: payment.created_at
        })
      })

      // Recent voucher purchases
      const { data: recentVouchers } = await supabase
        .from('vouchers')
        .select(`
          *,
          voucher_type:voucher_types(name),
          user:users_shadow(name)
        `)
        .order('purchase_date', { ascending: false })
        .limit(2)

      recentVouchers?.forEach(voucher => {
        activities.push({
          action: 'Bono comprado',
          user: voucher.user?.name || 'Cliente',
          time: getTimeAgo(voucher.purchase_date),
          type: 'voucher',
          created_at: voucher.purchase_date
        })
      })

      // Sort activities by most recent
      activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setRecentActivity(activities.slice(0, 4))
    } catch (error) {
      console.error('Error fetching recent activity:', error)
    }
  }

  const getTimeAgo = (dateString) => {
    const now = new Date()
    const date = new Date(dateString)
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Ahora mismo'
    if (diffInMinutes < 60) return `Hace ${diffInMinutes} min`
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `Hace ${diffInHours} hora${diffInHours > 1 ? 's' : ''}`
    
    const diffInDays = Math.floor(diffInHours / 24)
    return `Hace ${diffInDays} día${diffInDays > 1 ? 's' : ''}`
  }

  const fetchKPIs = async () => {
    try {
      // Confirmed + completed bookings count (últimos 30 días)
      const { count: confirmedBookings } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .in('status', ['confirmed', 'completed'])
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      // Confirmed revenue: payments.amount where status IN ('paid', 'succeeded') (últimos 30 días)
      const { data: confirmedPayments } = await supabase
        .from('payments')
        .select('amount')
        .in('status', ['paid', 'succeeded'])
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      const confirmedRevenue = confirmedPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

      // Get future pending bookings for projected revenue (unpaid + cash pending)
      const { data: pendingFutureBookings } = await supabase
        .from('bookings')
        .select(`
          id,
          type,
          payment_method,
          service_id,
          class_id,
          services(price),
          classes(price)
        `)
        .neq('status', 'cancelled')
        .eq('status', 'pending')
        .gte('start_at', new Date().toISOString())

      // Get booking IDs that have paid/succeeded payments in payments table (to exclude card bookings that are actually paid)
      const { data: paidBookingIds } = await supabase
        .from('payments')
        .select('booking_id')
        .in('status', ['paid', 'succeeded'])
        .not('booking_id', 'is', null)

      const paidBookingIdsSet = new Set(paidBookingIds?.map(p => p.booking_id) || [])
      
      // Filter eligible bookings: include cash pending + unpaid card bookings that don't have payments
      const eligiblePendingBookings = pendingFutureBookings?.filter(booking => {
        // Include cash bookings (regardless of payment_status since they don't use payments table)
        if (booking.payment_method === 'cash') return true
        // Include card bookings that don't have successful payments yet
        return !paidBookingIdsSet.has(booking.id)
      }) || []

      // Calculate projected revenue
      const projectedRevenue = eligiblePendingBookings.reduce((sum, booking) => {
        const price = booking.type === 'service' 
          ? Number(booking.services?.price ?? 0)
          : Number(booking.classes?.price ?? 0)
        return sum + price
      }, 0)

      const paidPaymentsCount = confirmedPayments?.length || 0
      const pendingBookingsCount = eligiblePendingBookings.length

      // Console logs as requested
      console.log(`[Dashboard] confirmed=€${confirmedRevenue} projected=€${projectedRevenue} paidPayments=${paidPaymentsCount} pendingBookings=${pendingBookingsCount}`)

      setStats([
        { 
          title: "Reservas Confirmadas", 
          value: confirmedBookings?.toString() || "0", 
          description: "Últimos 30 días", 
          icon: Calendar, 
          trend: "" 
        },
        { 
          title: "Ingresos Confirmados", 
          value: `€${confirmedRevenue.toFixed(2)}`, 
          description: "Pagos exitosos", 
          icon: DollarSign, 
          trend: "" 
        },
        { 
          title: "Ingresos Proyectados", 
          value: `€${projectedRevenue.toFixed(2)}`, 
          description: "Reservas pendientes futuras", 
          icon: TrendingUp, 
          trend: "" 
        },
        { 
          title: "Total Estimado", 
          value: `€${(confirmedRevenue + projectedRevenue).toFixed(2)}`, 
          description: "Confirmados + Proyectados", 
          icon: Users, 
          trend: "" 
        }
      ])
    } catch (error) {
      console.error('Error fetching KPIs:', error)
      toast({
        title: "Error",
        description: "No se pudieron cargar las métricas del dashboard",
        variant: "destructive"
      })
    }
  }

  const fixMissingPayments = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fix-missing-payments');
      
      if (error) {
        console.error('Error fixing payments:', error);
        return;
      }
      
      console.log('Payment fix result:', data);
      
      // Refresh the dashboard data after fixing
      fetchKPIs();
      
      alert(`✅ Se crearon ${data.created} registros de pago para reservas en efectivo`);
    } catch (error) {
      console.error('Error calling fix-missing-payments:', error);
      alert('❌ Error al arreglar los pagos');
    }
  };

  useEffect(() => {
    fetchKPIs()
    fetchUpcomingBookings()
    fetchRecentActivity()
  }, [])
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Resumen de actividad y métricas principales</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="bg-gradient-to-br from-card to-card/50 border border-border/50 hover:shadow-lg transition-all duration-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted-foreground">{stat.description}</p>
                  <p className="text-xs text-accent font-medium">{stat.trend}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-card to-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Próximas Reservas</CardTitle>
            <CardDescription>Reservas programadas para hoy</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {upcomingBookings.length > 0 ? (
                upcomingBookings.map((booking) => {
                  const serviceName = booking.services?.name || booking.classes?.name || 'Servicio'
                  const customerName = booking.users_shadow?.name || 'Cliente'
                  const professionalName = booking.professionals?.name || ''
                  const price = booking.services?.price || booking.classes?.price || 0
                  const startTime = new Date(booking.start_at).toLocaleTimeString('es-ES', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })
                  const statusLabel = booking.status === 'completed' ? 'Completada' : booking.status === 'confirmed' ? 'Confirmada' : 'Pendiente'
                  
                  return (
                    <div key={booking.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{serviceName}</p>
                        <p className="text-xs text-muted-foreground">{customerName} • {startTime}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-accent">€{price}</p>
                        <p className="text-xs text-muted-foreground">{statusLabel}</p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">No hay reservas programadas para hoy</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Actividad Reciente</CardTitle>
            <CardDescription>Últimas acciones en el sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{activity.action}</p>
                      <p className="text-xs text-muted-foreground">{activity.user}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">No hay actividad reciente</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}