import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Calendar, Clock, User, MapPin, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBookings, getBookingDisplayData } from "@/hooks/useBookings";
import { useToast } from "@/hooks/use-toast";
import BookingDetailsModal from "@/components/admin/BookingDetailsModal";
import AdminCancelBookingModal from "@/components/admin/AdminCancelBookingModal";
import CreateBookingModal from "@/components/admin/CreateBookingModal";
import { supabase } from "@/integrations/supabase/client";
import { useState as useStateLocal, useEffect } from "react";
import { SubscriptionSessionInfo } from "@/components/admin/SubscriptionSessionInfo";
import { usePermissions, shouldFilterByProfessional } from "@/hooks/usePermissions";


const statusColors = {
  confirmed: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  pending_cash: "bg-orange-100 text-orange-800",
  pending_card: "bg-blue-100 text-blue-800",
  completed: "bg-primary/10 text-primary",
  cancelled: "bg-destructive/10 text-destructive"
};

const statusLabels = {
  confirmed: "Confirmada",
  pending: "Pendiente",
  pending_cash: "Pendiente (Efectivo)",
  pending_card: "Pendiente (Tarjeta)",
  completed: "Completada",
  cancelled: "Cancelada"
};

const paymentMethodLabels = {
  card: "Tarjeta",
  cash: "Efectivo",
  voucher: "Bono",
  none: "Sin pago"
};

export default function Bookings() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedBookingForCancel, setSelectedBookingForCancel] = useState<any>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { toast } = useToast();
  
  // Get current user permissions
  const { currentUser } = usePermissions();
  
  // Determine professional ID for gating actions (not for filtering view)
  const userProfessionalId = shouldFilterByProfessional(currentUser);
  
  // All employees now see ALL bookings (no professional filter)
  const { data: bookingsData, isLoading, error, refetch } = useBookings(null);

  const filteredBookings = useMemo(() => {
    if (!bookingsData) return [];
    
    const displayBookings = bookingsData.map(booking => {
      const displayData = getBookingDisplayData(booking);
      return {
        ...displayData,
        _isSubscriptionBooking: booking.origin === 'subscription'
      };
    });
    
    return displayBookings.filter(booking => {
      const matchesSearch = searchTerm === "" || 
        booking.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.professional.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "active" && booking.status !== "cancelled") ||
        booking.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [bookingsData, searchTerm, statusFilter]);

  const handleViewDetails = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setIsDetailsModalOpen(true);
  };

  const handleConfirmBooking = async (bookingId: string) => {
    try {
      // Get booking details to check payment method and amount
      const { data: bookingData, error: fetchError } = await supabase
        .from('bookings')
        .select(`
          *,
          service:services(price, currency),
          class:classes(price, currency)
        `)
        .eq('id', bookingId)
        .single();

      if (fetchError) throw fetchError;

      // Update booking status
      const { error } = await supabase
        .from('bookings')
        .update({ 
          status: 'confirmed', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', bookingId)
        .eq('status', 'pending');

      if (error) throw error;

      // Si es en efectivo, marcar como pagado y crear registro en payments (evitando duplicados)
      if (bookingData.payment_method === 'cash') {
        // Asegurar payment_status = 'paid'
        await supabase
          .from('bookings')
          .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', bookingId);

        // Comprobar si ya existe un pago para esta reserva
        const { data: existing, error: existErr } = await supabase
          .from('payments')
          .select('id')
          .eq('booking_id', bookingId)
          .limit(1);
        if (existErr) console.error('Error checking existing payment:', existErr);

        if (!existing || existing.length === 0) {
          const amount = bookingData.service?.price || bookingData.class?.price || 0;
          const currency = (bookingData.service?.currency || bookingData.class?.currency || 'EUR').toLowerCase();

          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              booking_id: bookingId,
              amount,
              currency,
              method: 'cash',
              status: 'succeeded'
            });
          if (paymentError) console.error('Error creating payment record:', paymentError);
        }
      }

      console.log(`[Admin.Bookings] confirm id=${bookingId} result=ok`);

      // Disparar factura Quipu si auto_invoice está activado
      try {
        const { data: autoInvoiceSetting } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "quipu.auto_invoice")
          .maybeSingle();

        if (autoInvoiceSetting?.value === "true") {
          await supabase.functions.invoke("quipu-create-invoice", {
            body: {
              booking_id: bookingId,
              triggered_by: "automatic"
            }
          });
          console.log('[Quipu] auto-invoice triggered for booking:', bookingId);
        }
      } catch (quipuError) {
        console.error("Quipu auto-invoice error (cash list):", quipuError);
      }


      toast({
        title: "Reserva confirmada",
        description: "La reserva ha sido confirmada exitosamente",
      });

      refetch();
    } catch (error) {
      console.error('Error confirming booking:', error);
      console.log(`[Admin.Bookings] confirm id=${bookingId} result=fail`);
      
      toast({
        title: "Error",
        description: "No se pudo confirmar la reserva",
        variant: "destructive",
      });
    }
  };

  const handleCancelBooking = (bookingData: any) => {
    const booking = bookingsData?.find(b => b.id === bookingData.id);
    if (!booking) return;
    
    const formattedBooking = {
      id: booking.id,
      start_at: booking.start_at,
      end_at: booking.end_at,
      status: booking.status,
      payment_method: booking.payment_method,
      payment_status: booking.payment_status,
      notes: booking.notes,
      type: booking.type,
      service_name: booking.service?.name,
      class_name: booking.class?.name,
      professional_name: booking.professional?.name,
      location_name: booking.location?.name,
      user_name: booking.customer?.name,
      price: booking.type === 'service' ? booking.service?.price : booking.class?.price,
      currency: booking.type === 'service' ? booking.service?.currency : booking.class?.currency,
    };
    
    setSelectedBookingForCancel(formattedBooking);
    setIsCancelModalOpen(true);
  };

  const handleCancelSuccess = () => {
    refetch();
    setSelectedBookingForCancel(null);
    setIsCancelModalOpen(false);
  };

  const handleBookingUpdated = () => {
    refetch();
  };

  if (error) {
    toast({
      title: "Error",
      description: "No se pudieron cargar las reservas",
      variant: "destructive",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reservas</h1>
          <p className="text-muted-foreground">Gestión completa de reservas del sistema</p>
        </div>
        <Button 
          className="bg-primary hover:bg-primary-hover"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <Calendar className="mr-2 h-4 w-4" />
          Nueva Reserva
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros y Búsqueda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por cliente, servicio o profesional..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="confirmed">Confirmada</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="pending_cash">Pendiente (Efectivo)</SelectItem>
                <SelectItem value="pending_card">Pendiente (Tarjeta)</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Cargando reservas...</span>
          </div>
        ) : filteredBookings.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No hay reservas</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "active" 
                  ? "No se encontraron reservas con los filtros aplicados" 
                  : "Aún no hay reservas en el sistema"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredBookings.map((booking) => (
            <Card key={booking.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-lg text-foreground">{booking.service}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        <span>{booking.customer}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{booking.date}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{booking.time} • {booking.duration}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{booking.location}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className={statusColors[booking.status as keyof typeof statusColors]}>
                      {statusLabels[booking.status as keyof typeof statusLabels]}
                    </Badge>
                    <p className="text-lg font-semibold mt-2 text-foreground">
                      {booking._isSubscriptionBooking ? 'Suscripción' : 
                       booking.amount > 0 ? `${booking.currency === 'EUR' ? '€' : ''}${booking.amount}` : 'Bono'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {booking._isSubscriptionBooking ? 'Incluido en plan' :
                       paymentMethodLabels[booking.paymentMethod as keyof typeof paymentMethodLabels] || 'Sin definir'}
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-between items-center pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    <div>Profesional: <span className="text-foreground font-medium">{booking.professional}</span></div>
                    {booking._isSubscriptionBooking && (
                      <div className="mt-1">
                        <SubscriptionSessionInfo bookingId={booking.id} />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleViewDetails(booking.id)}
                    >
                      Ver Detalles
                    </Button>
                    {(!userProfessionalId || booking.professionalId === userProfessionalId) && (
                      <>
                        {booking.status === 'pending' && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleConfirmBooking(booking.id)}
                            className="text-green-600 hover:text-green-700 border-green-600 hover:border-green-700"
                          >
                            Confirmar
                          </Button>
                        )}
                        {(booking.status === 'confirmed' || booking.status === 'pending') && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleCancelBooking(booking)}
                          >
                            Cancelar
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <BookingDetailsModal
        bookingId={selectedBookingId}
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        onBookingUpdated={handleBookingUpdated}
      />

      {selectedBookingForCancel && (
        <AdminCancelBookingModal
          booking={selectedBookingForCancel}
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          onSuccess={handleCancelSuccess}
        />
      )}

      <CreateBookingModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          refetch();
          setIsCreateModalOpen(false);
        }}
      />
    </div>
  );
}