import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { 
  CalendarIcon, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  CreditCard, 
  Calendar, 
  Euro,
  Target,
  HelpCircle,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

// Types
interface Location {
  id: string;
  name: string;
}

interface KPIData {
  bookings_created: number;
  bookings_confirmed: number;
  revenue_confirmed: number;
  revenue_projected: number;
  vouchers_sold: number;
  vouchers_redeemed: number;
  active_subscriptions: number;
  mrr: number;
}

interface DailyData {
  day_local: string;
  bookings_created: number;
  bookings_confirmed: number;
  bookings_cancelled: number;
  revenue_confirmed: number;
  revenue_projected: number;
  vouchers_sold: number;
  vouchers_redeemed: number;
}

interface MonthlyData {
  month_local: string;
  bookings_created: number;
  bookings_confirmed: number;
}

interface MoMCalculation {
  current: number;
  previous: number;
  change: number;
  percentage: number;
}

export function Reports() {
  // State management with URL persistence
  const [filters, setFilters] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const savedFilters = localStorage.getItem('reports-filters');
    
    const defaultFilters = {
      dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dateTo: new Date().toISOString().split('T')[0],
      locationId: 'all'
    };

    if (urlParams.get('from') && urlParams.get('to')) {
      return {
        dateFrom: urlParams.get('from') || defaultFilters.dateFrom,
        dateTo: urlParams.get('to') || defaultFilters.dateTo,
        locationId: urlParams.get('location') || defaultFilters.locationId
      };
    }

    return savedFilters ? JSON.parse(savedFilters) : defaultFilters;
  });

  // Persist filters to URL and localStorage
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('from', filters.dateFrom);
    params.set('to', filters.dateTo);
    if (filters.locationId !== 'all') {
      params.set('location', filters.locationId);
    }
    
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
    localStorage.setItem('reports-filters', JSON.stringify(filters));
  }, [filters]);

  const updateFilters = (newFilters: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  // Quick range helper: set from/to based on months back from today
  const setQuickRange = (monthsBack: number) => {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - monthsBack);
    updateFilters({
      dateFrom: from.toISOString().split('T')[0],
      dateTo: to.toISOString().split('T')[0],
    });
  };

  // Locations query
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Location[];
    },
  });

  // Set default location if only one exists
  useEffect(() => {
    if (locations.length === 1 && filters.locationId === 'all') {
      updateFilters({ locationId: locations[0].id });
    }
  }, [locations, filters.locationId]);

  // Current period KPIs
  const { data: currentKPIs } = useQuery({
    queryKey: ["current-kpis", filters],
    queryFn: async () => {
      // Simple queries with direct table names
      let bookingsQuery = supabase.from("vw_bookings_daily").select("*").gte("day_local", filters.dateFrom).lte("day_local", filters.dateTo);
      let revenueConfirmedQuery = supabase.from("vw_revenue_confirmed").select("*").gte("day_local", filters.dateFrom).lte("day_local", filters.dateTo);
      let vouchersQuery = supabase.from("vw_vouchers_daily").select("*").gte("day_local", filters.dateFrom).lte("day_local", filters.dateTo);
      let redemptionsQuery = supabase.from("vw_voucher_redemptions_daily").select("*").gte("day_local", filters.dateFrom).lte("day_local", filters.dateTo);
      let mrrQuery = supabase.from("vw_subscriptions_mrr").select("*");
      // Paid subscription invoices within range (no location filter available)
      let subsInvoicesQuery = supabase.from("subscription_invoices").select("amount, paid_at, status").eq("status", "paid").gte("paid_at", filters.dateFrom).lte("paid_at", filters.dateTo);
      
      // Query for voucher payments within range
      let voucherPaymentsQuery = supabase
        .from("payments")
        .select("amount, created_at, status")
        .in("status", ["paid", "succeeded"])
        .is("booking_id", null)
        .gte("created_at", filters.dateFrom)
        .lte("created_at", filters.dateTo);
      
      // Query for active subscriptions
      let subscriptionsQuery = supabase.from("subscriptions").select("id").eq("status", "active");

      // Calculate projected revenue using same logic as Dashboard
      let projectedBookingsQuery = supabase
        .from('bookings')
        .select(`
          id,
          type,
          payment_method,
          service_id,
          class_id,
          services(price),
          classes(price),
          location_id
        `)
        .neq('status', 'cancelled')
        .eq('status', 'pending')
        .gte('start_at', new Date().toISOString());

      if (filters.locationId !== 'all') {
        bookingsQuery = bookingsQuery.eq("location_id", filters.locationId);
        revenueConfirmedQuery = revenueConfirmedQuery.eq("location_id", filters.locationId);
        // Note: vouchers don't have direct location_id, so we don't filter them
        redemptionsQuery = redemptionsQuery.eq("location_id", filters.locationId);
        mrrQuery = mrrQuery.eq("location_id", filters.locationId);
        projectedBookingsQuery = projectedBookingsQuery.eq("location_id", filters.locationId);
        // Note: subscriptions and invoices don't have location_id, so we don't filter them
      }

      // Get booking IDs that have paid/succeeded payments
      const { data: paidBookingIds } = await supabase
        .from('payments')
        .select('booking_id')
        .in('status', ['paid', 'succeeded'])
        .not('booking_id', 'is', null);

      const [bookingsRes, revenueConfirmedRes, vouchersRes, redemptionsRes, mrrRes, subscriptionsRes, subsInvoicesRes, voucherPaymentsRes, projectedBookingsRes] = await Promise.all([
        bookingsQuery, revenueConfirmedQuery, vouchersQuery, redemptionsQuery, mrrQuery, subscriptionsQuery, subsInvoicesQuery, voucherPaymentsQuery, projectedBookingsQuery
      ]);

      const bookingsData = bookingsRes.data || [];
      const revenueConfirmedData = revenueConfirmedRes.data || [];
      const vouchersData = vouchersRes.data || [];
      const redemptionsData = redemptionsRes.data || [];
      const mrrData = mrrRes.data || [];
      const subscriptionsData = subscriptionsRes.data || [];
      const subsInvoicesData = subsInvoicesRes.data || [];
      const voucherPaymentsData = voucherPaymentsRes.data || [];

      // Calculate projected revenue using same logic as Dashboard
      const paidBookingIdsSet = new Set(paidBookingIds?.map(p => p.booking_id) || []);
      const eligiblePendingBookings = projectedBookingsRes.data?.filter(booking => {
        // Include cash bookings (regardless of payment_status since they don't use payments table)
        if (booking.payment_method === 'cash') return true;
        // Include card bookings that don't have successful payments yet
        return !paidBookingIdsSet.has(booking.id);
      }) || [];

      const projectedRevenue = eligiblePendingBookings.reduce((sum, booking) => {
        const price = booking.type === 'service' 
          ? Number(booking.services?.price ?? 0)
          : Number(booking.classes?.price ?? 0);
        return sum + price;
      }, 0);

      // Calculate total voucher payments
      const voucherRevenue = voucherPaymentsData.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);

      return {
        bookings_created: bookingsData.reduce((sum: number, row: any) => sum + (row.bookings_created || 0), 0),
        bookings_confirmed: bookingsData.reduce((sum: number, row: any) => sum + (row.bookings_confirmed || 0), 0),
        revenue_confirmed: revenueConfirmedData.reduce((sum: number, row: any) => sum + (row.revenue_confirmed || 0), 0) + subsInvoicesData.reduce((s: number, inv: any) => s + Number(inv.amount || 0), 0) + voucherRevenue,
        revenue_projected: projectedRevenue,
        vouchers_sold: vouchersData.reduce((sum: number, row: any) => sum + (row.vouchers_sold || 0), 0),
        vouchers_redeemed: redemptionsData.reduce((sum: number, row: any) => sum + (row.vouchers_redeemed || 0), 0),
        active_subscriptions: subscriptionsData.length,
        mrr: mrrData.reduce((sum: number, row: any) => sum + (row.mrr || 0), 0),
      } as KPIData;
    },
  });

  // Previous period for MoM calculations
  const previousPeriodFrom = useMemo(() => {
    const from = new Date(filters.dateFrom);
    const to = new Date(filters.dateTo);
    const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    const previousFrom = new Date(from.getTime() - diffDays * 24 * 60 * 60 * 1000);
    return previousFrom.toISOString().split('T')[0];
  }, [filters.dateFrom, filters.dateTo]);

  const previousPeriodTo = useMemo(() => {
    const from = new Date(filters.dateFrom);
    const previousTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
    return previousTo.toISOString().split('T')[0];
  }, [filters.dateFrom]);

  // Previous period KPIs
  const { data: previousKPIs } = useQuery({
    queryKey: ["previous-kpis", previousPeriodFrom, previousPeriodTo, filters.locationId],
    queryFn: async () => {
      // Similar to current KPIs but for previous period
      let bookingsQuery = supabase.from("vw_bookings_daily").select("*").gte("day_local", previousPeriodFrom).lte("day_local", previousPeriodTo);
      let revenueConfirmedQuery = supabase.from("vw_revenue_confirmed").select("*").gte("day_local", previousPeriodFrom).lte("day_local", previousPeriodTo);
      let vouchersQuery = supabase.from("vw_vouchers_daily").select("*").gte("day_local", previousPeriodFrom).lte("day_local", previousPeriodTo);
      let redemptionsQuery = supabase.from("vw_voucher_redemptions_daily").select("*").gte("day_local", previousPeriodFrom).lte("day_local", previousPeriodTo);

      if (filters.locationId !== 'all') {
        bookingsQuery = bookingsQuery.eq("location_id", filters.locationId);
        revenueConfirmedQuery = revenueConfirmedQuery.eq("location_id", filters.locationId);
        // Note: vouchers don't have direct location_id, so we don't filter them
        redemptionsQuery = redemptionsQuery.eq("location_id", filters.locationId);
      }

      const [bookingsRes, revenueConfirmedRes, vouchersRes, redemptionsRes] = await Promise.all([
        bookingsQuery, revenueConfirmedQuery, vouchersQuery, redemptionsQuery
      ]);

      const bookingsData = bookingsRes.data || [];
      const revenueConfirmedData = revenueConfirmedRes.data || [];
      const vouchersData = vouchersRes.data || [];
      const redemptionsData = redemptionsRes.data || [];

      return {
        bookings_created: bookingsData.reduce((sum: number, row: any) => sum + (row.bookings_created || 0), 0),
        bookings_confirmed: bookingsData.reduce((sum: number, row: any) => sum + (row.bookings_confirmed || 0), 0),
        revenue_confirmed: revenueConfirmedData.reduce((sum: number, row: any) => sum + (row.revenue_confirmed || 0), 0),
        revenue_projected: 0, // Previous periods don't have projected revenue (historical data)
        vouchers_sold: vouchersData.reduce((sum: number, row: any) => sum + (row.vouchers_sold || 0), 0),
        vouchers_redeemed: redemptionsData.reduce((sum: number, row: any) => sum + (row.vouchers_redeemed || 0), 0),
      } as Partial<KPIData>;
    },
  });

  // Monthly trend data for charts (last 6 months)
  const { data: monthlyTrends = [] } = useQuery({
    queryKey: ["monthly-trends", filters.locationId],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const fromMonth = sixMonthsAgo.toISOString().split('T')[0];
      
      // Get bookings data directly from bookings table
      let query = supabase
        .from("bookings")
        .select("id, status, start_at, location_id, created_at")
        .gte("created_at", fromMonth)
        .neq("status", "cancelled");
        
      if (filters.locationId !== 'all') {
        query = query.eq("location_id", filters.locationId);
      }

      const response = await query;
      if (response.error) throw response.error;
      
      // Create complete 6-month range
      const months: MonthlyData[] = [];
      const today = new Date();
      
      for (let i = 5; i >= 0; i--) {
        const month = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthKey = month.toISOString().slice(0, 7) + '-01';
        months.push({
          month_local: monthKey,
          bookings_created: 0,
          bookings_confirmed: 0
        });
      }
      
      // Count bookings by month (using created_at for when they were actually made)
      (response.data || []).forEach(booking => {
        const createdMonth = new Date(booking.created_at).toISOString().slice(0, 7) + '-01';
        const monthData = months.find(m => m.month_local === createdMonth);
        
        if (monthData) {
          monthData.bookings_created++;
          if (booking.status === 'confirmed') {
            monthData.bookings_confirmed++;
          }
        }
      });
      
      return months;
    },
  });

  // Daily data for tables
  const { data: dailyData = [] } = useQuery({
    queryKey: ["daily-data", filters],
    queryFn: async () => {
      // Get bookings data directly from bookings table
      let bookingsQuery = supabase
        .from('bookings')
        .select(`
          id,
          type,
          status,
          payment_method,
          service_id,
          class_id,
          services(price),
          classes(price),
          location_id,
          start_at,
          created_at
        `)
        .gte('start_at', filters.dateFrom)
        .lte('start_at', filters.dateTo + 'T23:59:59')
        .neq('status', 'cancelled');

      // Get payments for confirmed revenue (bookings)
      let paymentsQuery = supabase
        .from('payments')
        .select('booking_id, amount, status')
        .in('status', ['paid', 'succeeded'])
        .not('booking_id', 'is', null);

      // Voucher payments (no booking_id)
      let voucherPaymentsQuery = supabase
        .from('payments')
        .select('amount, created_at, status')
        .in('status', ['paid', 'succeeded'])
        .is('booking_id', null)
        .gte('created_at', filters.dateFrom)
        .lte('created_at', filters.dateTo + 'T23:59:59');

      // Vouchers sold per day (view)
      let vouchersDailyQuery = supabase
        .from('vw_vouchers_daily')
        .select('*')
        .gte('day_local', filters.dateFrom)
        .lte('day_local', filters.dateTo);

      // Vouchers redeemed per day (view)
      let redemptionsDailyQuery = supabase
        .from('vw_voucher_redemptions_daily')
        .select('*')
        .gte('day_local', filters.dateFrom)
        .lte('day_local', filters.dateTo);

      // Subscription invoices paid within range
      let subsInvoicesQuery = supabase
        .from('subscription_invoices')
        .select('amount, paid_at, status')
        .eq('status', 'paid')
        .gte('paid_at', filters.dateFrom)
        .lte('paid_at', filters.dateTo);

      if (filters.locationId !== 'all') {
        bookingsQuery = bookingsQuery.eq("location_id", filters.locationId);
        redemptionsDailyQuery = redemptionsDailyQuery.eq('location_id', filters.locationId);
      }

      const [bookingsRes, paymentsRes, voucherPaymentsRes, vouchersDailyRes, redemptionsDailyRes, subsInvoicesRes] = await Promise.all([
        bookingsQuery, paymentsQuery, voucherPaymentsQuery, vouchersDailyQuery, redemptionsDailyQuery, subsInvoicesQuery
      ]);
      
      if (bookingsRes.error) throw bookingsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (voucherPaymentsRes.error) throw voucherPaymentsRes.error;
      if (vouchersDailyRes.error) throw vouchersDailyRes.error;
      if (redemptionsDailyRes.error) throw redemptionsDailyRes.error;
      if (subsInvoicesRes.error) throw subsInvoicesRes.error;

      const bookings = bookingsRes.data || [];
      const payments = paymentsRes.data || [];
      const voucherPayments = voucherPaymentsRes.data || [];
      const vouchersDaily = vouchersDailyRes.data || [];
      const redemptionsDaily = redemptionsDailyRes.data || [];
      const subsInvoices = subsInvoicesRes.data || [];
      const paidBookingIds = new Set(payments.map((p: any) => p.booking_id));
      const paymentMap = new Map(payments.map((p: any) => [p.booking_id, p.amount]));

      // Create complete date range
      const dateRange: DailyData[] = [];
      const start = new Date(filters.dateFrom);
      const end = new Date(filters.dateTo);
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        dateRange.push({
          day_local: dateStr,
          bookings_created: 0,
          bookings_confirmed: 0,
          bookings_cancelled: 0,
          revenue_confirmed: 0,
          revenue_projected: 0,
          vouchers_sold: 0,
          vouchers_redeemed: 0
        });
      }

      // Process bookings by date
      bookings.forEach(booking => {
        const bookingDate = new Date(booking.start_at).toISOString().split('T')[0];
        const dayData = dateRange.find(d => d.day_local === bookingDate);
        
        if (dayData) {
          // Count bookings by status
          if (booking.status === 'confirmed') {
            dayData.bookings_confirmed++;
          }
          dayData.bookings_created++; // All non-cancelled bookings
          
          // Calculate revenue
          const price = booking.type === 'service' 
            ? Number(booking.services?.price ?? 0)
            : Number(booking.classes?.price ?? 0);

          if (booking.status === 'confirmed') {
            // Confirmed revenue
            if (paidBookingIds.has(booking.id)) {
              // Paid bookings (card/online)
              dayData.revenue_confirmed += Number(paymentMap.get(booking.id) || 0);
            } else if (booking.payment_method === 'cash') {
              // Cash bookings confirmed (may not have payment record)
              dayData.revenue_confirmed += price;
            }
          } else if (booking.status === 'pending') {
            // Projected revenue (pending bookings not yet paid)
            const isEligible = booking.payment_method === 'cash' || !paidBookingIds.has(booking.id);
            if (isEligible) {
              dayData.revenue_projected += price;
            }
          }
         }
       });

      // Merge voucher payments into confirmed revenue per day
      voucherPayments.forEach((p: any) => {
        const dateStr = new Date(p.created_at).toISOString().split('T')[0];
        const day = dateRange.find(d => d.day_local === dateStr);
        if (day) {
          day.revenue_confirmed += Number(p.amount || 0);
        }
      });

      // Merge vouchers sold per day
      vouchersDaily.forEach((row: any) => {
        const day = dateRange.find(d => d.day_local === row.day_local);
        if (day) {
          day.vouchers_sold += Number(row.vouchers_sold || 0);
        }
      });

      // Merge vouchers redeemed per day
      redemptionsDaily.forEach((row: any) => {
        const day = dateRange.find(d => d.day_local === row.day_local);
        if (day) {
          day.vouchers_redeemed += Number(row.vouchers_redeemed || row.credits_used || 0);
        }
      });

      // Merge subscription invoices into confirmed revenue per day
      subsInvoices.forEach((inv: any) => {
        const dateStr = new Date(inv.paid_at).toISOString().split('T')[0];
        const day = dateRange.find(d => d.day_local === dateStr);
        if (day) {
          day.revenue_confirmed += Number(inv.amount || 0);
        }
      });
      
      return dateRange;
    },
  });

  // Derived table view: from today onwards in ascending order
  const todayString = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tableDailyData = useMemo(() => {
    return (dailyData || [])
      .filter((d) => d.day_local >= todayString)
      .sort((a, b) => a.day_local.localeCompare(b.day_local));
  }, [dailyData, todayString]);

  // MoM calculation helper
  const calculateMoM = (current: number, previous: number): MoMCalculation => {
    const change = current - previous;
    const percentage = previous > 0 ? (change / previous) * 100 : 0;
    return { current, previous, change, percentage };
  };

  // Export function
  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(row => Object.values(row).map(val => 
      typeof val === 'string' && val.includes(',') ? `"${val}"` : val
    ).join(",")).join("\n");
    const csv = `${headers}\n${rows}`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${filters.dateFrom}-${filters.dateTo}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // KPI Card Component
  const KPICard = ({ 
    title, 
    value, 
    icon: Icon, 
    format = "number",
    mom,
    tooltip 
  }: {
    title: string;
    value: number;
    icon: React.ElementType;
    format?: "number" | "currency";
    mom?: MoMCalculation;
    tooltip?: string;
  }) => {
    const formatValue = (val: number) => {
      if (format === "currency") {
        return `€${val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return val.toLocaleString('es-ES');
    };

    const isPositive = mom && mom.percentage >= 0;
    const TrendIcon = isPositive ? ArrowUp : ArrowDown;
    const trendColor = isPositive ? "text-green-600" : "text-red-600";

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {tooltip && (
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatValue(value)}</div>
          {mom && (
            <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
              <TrendIcon className="h-3 w-3" />
              <span>{mom.percentage.toFixed(1)}%</span>
              <span className="text-muted-foreground">vs período anterior</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Table columns
  const dailyColumns: ColumnDef<DailyData>[] = [
    {
      accessorKey: "day_local",
      header: "Fecha",
      cell: ({ row }) => new Date(row.getValue("day_local")).toLocaleDateString('es-ES'),
    },
    {
      accessorKey: "bookings_created",
      header: "Reservas Creadas",
    },
    {
      accessorKey: "bookings_confirmed", 
      header: "Confirmadas",
    },
    {
      accessorKey: "bookings_cancelled",
      header: "Canceladas",
    },
    {
      accessorKey: "revenue_confirmed",
      header: "Ingreso Confirmado",
      cell: ({ row }) => `€${Number(row.getValue("revenue_confirmed")).toFixed(2)}`,
    },
    {
      accessorKey: "revenue_projected", 
      header: "Ingreso Proyectado",
      cell: ({ row }) => `€${Number(row.getValue("revenue_projected")).toFixed(2)}`,
    },
    {
      accessorKey: "vouchers_sold",
      header: "Bonos Vendidos",
    },
    {
      accessorKey: "vouchers_redeemed",
      header: "Bonos Consumidos", 
    },
  ];

  // Default values for safer rendering
  const safeCurrentKPIs = currentKPIs || {} as KPIData;
  const safePreviousKPIs = previousKPIs || {} as Partial<KPIData>;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          title="Analytics de Negocio"
          description="Métricas y tendencias claras, rápidas y accionables"
        />

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end flex-wrap">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium">Desde</label>
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => updateFilters({ dateFrom: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Hasta</label>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => updateFilters({ dateTo: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setQuickRange(1)}>Último mes</Button>
                <Button variant="outline" size="sm" onClick={() => setQuickRange(3)}>Últimos 3 meses</Button>
                <Button variant="outline" size="sm" onClick={() => setQuickRange(6)}>Últimos 6 meses</Button>
              </div>
              {locations.length > 1 && (
                <div>
                  <label className="text-sm font-medium">Ubicación</label>
                  <Select 
                    value={filters.locationId} 
                    onValueChange={(value) => updateFilters({ locationId: value })}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las ubicaciones</SelectItem>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Reservas Creadas"
            value={safeCurrentKPIs.bookings_created || 0}
            icon={Calendar}
            mom={calculateMoM(safeCurrentKPIs.bookings_created || 0, safePreviousKPIs.bookings_created || 0)}
            tooltip="Total de reservas creadas en el período seleccionado"
          />
          <KPICard
            title="Reservas Confirmadas"
            value={safeCurrentKPIs.bookings_confirmed || 0}
            icon={Target}
            mom={calculateMoM(safeCurrentKPIs.bookings_confirmed || 0, safePreviousKPIs.bookings_confirmed || 0)}
            tooltip="Reservas con status 'confirmed' en el período"
          />
          <KPICard
            title="Ingresos Confirmados"
            value={safeCurrentKPIs.revenue_confirmed || 0}
            icon={Euro}
            format="currency"
            mom={calculateMoM(safeCurrentKPIs.revenue_confirmed || 0, safePreviousKPIs.revenue_confirmed || 0)}
            tooltip="Ingresos de pagos completados (status 'paid')"
          />
          <KPICard
            title="Ingresos Proyectados"
            value={safeCurrentKPIs.revenue_projected || 0}
            icon={TrendingUp}
            format="currency"
            mom={calculateMoM(safeCurrentKPIs.revenue_projected || 0, safePreviousKPIs.revenue_projected || 0)}
            tooltip="Ingresos de reservas confirmadas pendientes de cobro"
          />
          <KPICard
            title="Bonos Vendidos"
            value={safeCurrentKPIs.vouchers_sold || 0}
            icon={CreditCard}
            mom={calculateMoM(safeCurrentKPIs.vouchers_sold || 0, safePreviousKPIs.vouchers_sold || 0)}
            tooltip="Número de bonos/vouchers vendidos"
          />
          <KPICard
            title="Bonos Consumidos"
            value={safeCurrentKPIs.vouchers_redeemed || 0}
            icon={Users}
            mom={calculateMoM(safeCurrentKPIs.vouchers_redeemed || 0, safePreviousKPIs.vouchers_redeemed || 0)}
            tooltip="Número de bonos utilizados en reservas"
          />
          <KPICard
            title="Suscripciones Activas"
            value={safeCurrentKPIs.active_subscriptions || 0}
            icon={Users}
            tooltip="Suscripciones con status 'active' y billing futuro"
          />
          <KPICard
            title="MRR Estimado"
            value={safeCurrentKPIs.mrr || 0}
            icon={Euro}
            format="currency"
            tooltip="Monthly Recurring Revenue de suscripciones activas"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bookings Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Tendencia de Reservas (últimos 6 meses)</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{
                created: { label: "Creadas", color: "hsl(var(--chart-1))" },
                confirmed: { label: "Confirmadas", color: "hsl(var(--chart-2))" }
              }} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="month_local" 
                      tickFormatter={(value) => new Date(value).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })}
                    />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="bookings_created" 
                      stroke="var(--color-created)" 
                      name="Creadas"
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="bookings_confirmed" 
                      stroke="var(--color-confirmed)" 
                      name="Confirmadas"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Ingresos Diarios</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{
                confirmed: { label: "Confirmados", color: "hsl(var(--chart-3))" },
                projected: { label: "Proyectados", color: "hsl(var(--chart-4))" }
              }} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="day_local"
                      tickFormatter={(value) => new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                    />
                    <YAxis tickFormatter={(value) => `€${value}`} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="revenue_confirmed" fill="var(--color-confirmed)" name="Confirmados" />
                    <Bar dataKey="revenue_projected" fill="var(--color-projected)" name="Proyectados" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Datos Detallados por Día</CardTitle>
              <Button
                variant="outline"
                onClick={() => exportToCSV(tableDailyData, "datos-detallados")}
                disabled={tableDailyData.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={dailyColumns}
              data={tableDailyData}
              searchKey="day_local"
              searchPlaceholder="Buscar por fecha..."
            />
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}