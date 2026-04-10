import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar, Clock, User, MapPin, CreditCard, DollarSign, FileText, AlertTriangle, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { calculateVoucherBalance } from "@/lib/voucher-utils";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { SubscriptionSessionInfo } from "@/components/admin/SubscriptionSessionInfo";
interface BookingDetailsData {
  id: string;
  status: string;
  origin: string;
  created_at: string;
  type: string;
  start_at: string;
  end_at: string;
  payment_method: string;
  payment_status: string;
  actual_payment_status: string; // Real payment status from payments table
  notes?: string;
  service_name?: string;
  class_name?: string;
  professional_name?: string;
  professional_id?: string;
  location_name?: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
  price?: number;
  currency?: string;
  subscription_plan_name?: string;
  stripe_payment_intent_id?: string;
  voucher_info?: {
    type_name?: string;
    code?: string;
    total?: number;
    used?: number;
    remaining?: number;
  };
}


interface BookingDetailsModalProps {
  bookingId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onBookingUpdated: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
}

const statusLabels = {
  confirmed: "Confirmada",
  pending: "Pendiente",
  completed: "Completada",
  cancelled: "Cancelada"
};

const statusColors = {
  confirmed: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-primary/10 text-primary",
  cancelled: "bg-destructive/10 text-destructive"
};

const paymentMethodLabels = {
  card: "Tarjeta",
  cash: "Efectivo",
  voucher: "Bono",
  none: "Sin pago"
};

const getPaymentMethodDisplay = (booking: BookingDetailsData) => {
  if (booking.origin === 'subscription') {
    return "Suscripción (pagado)";
  }
  return paymentMethodLabels[booking.payment_method as keyof typeof paymentMethodLabels];
};

const paymentStatusLabels = {
  paid: "Pagado",
  unpaid: "No pagado"
};

export function BookingDetailsModal({ bookingId, isOpen, onClose, onBookingUpdated, onEdit, onCancel }: BookingDetailsModalProps) {
  const [booking, setBooking] = useState<BookingDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isMarkingAsPaid, setIsMarkingAsPaid] = useState(false);
  const [simultaneousBookingsCount, setSimultaneousBookingsCount] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const { toast } = useToast();
  const { currentUser } = usePermissions();

  // Quipu invoice state
  const [quipuEnabled, setQuipuEnabled] = useState(false);
  const [existingInvoice, setExistingInvoice] = useState<{ id: string; quipu_invoice_number: string | null; pdf_url: string | null; status: string; created_at: string } | null>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

  const fetchBookingDetails = async (id: string) => {
    setBooking(null);  // Reset previous booking data
    setIsLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          services (name, price, currency),
          classes (name, price, currency),
          professionals (name),
          locations (name),
          users_shadow (name, email)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      // Handle case where booking was not found (orphaned booking)
      if (!data) {
        setIsLoading(false);
        setLoadError(true);
        toast({
          title: "Reserva no encontrada",
          description: "No se han podido cargar los detalles. Es posible que el cliente asociado ya no exista o que la reserva esté incompleta.",
          variant: "destructive",
        });
        return;
      }

      // Get payment info if exists
      const { data: paymentData } = await supabase
        .from('payments')
        .select('stripe_payment_intent_id, status')
        .eq('booking_id', id)
        .in('status', ['paid', 'succeeded'])
        .maybeSingle();
      
      // Extract phone from notes if available
      const phoneMatch = data.notes?.match(/Teléfono:\s*([+\d\s]+)/);
      const userPhone = phoneMatch ? phoneMatch[1].trim() : undefined;

      // Derive actual payment status
      let actualPaymentStatus = paymentData?.status ? 'paid' : (data.payment_status as string);
      // Rule: Cash payments cannot be considered 'paid' while booking is not confirmed/completed
      if (data.payment_method === 'cash' && !['confirmed', 'completed'].includes(data.status)) {
        actualPaymentStatus = 'unpaid';
      }

      // If voucher booking, compute voucher sessions info
      let voucherInfo: BookingDetailsData["voucher_info"] | undefined;
      if (data.origin === 'voucher' && data.notes) {
        try {
          const parsed = JSON.parse(data.notes);
          const voucherId = parsed?.voucherId as string | undefined;
          if (voucherId) {
            const [{ data: voucherData }, balance] = await Promise.all([
              supabase
                .from('vouchers')
                .select('id, code, voucher_types(name)')
                .eq('id', voucherId)
                .maybeSingle(),
              calculateVoucherBalance(voucherId)
            ]);

            voucherInfo = {
              type_name: voucherData?.voucher_types?.name,
              code: voucherData?.code || undefined,
              total: balance.total,
              used: balance.used,
              remaining: balance.remaining
            };
          }
        } catch (e) {
          console.warn('[BookingDetails] Could not parse voucher info from notes', e);
        }
      }

      // Extract subscription plan name from notes (if subscription booking)
      let subscriptionPlanName: string | undefined;
      if (data.origin === 'subscription' && data.notes) {
        try {
          const notesData = JSON.parse(data.notes);
          subscriptionPlanName = notesData.planName;
        } catch {
          // If notes is not valid JSON, ignore
        }
      }

      const bookingDetails: BookingDetailsData = {
        id: data.id,
        status: data.status,
        origin: data.origin,
        created_at: data.created_at,
        type: data.type,
        start_at: data.start_at,
        end_at: data.end_at,
        payment_method: data.payment_method,
        payment_status: data.payment_status,
        actual_payment_status: actualPaymentStatus,
        notes: data.notes,
        service_name: data.services?.name,
        class_name: data.classes?.name,
        subscription_plan_name: subscriptionPlanName,
        professional_name: data.professionals?.name,
        professional_id: data.professional_id,
        location_name: data.locations?.name,
        user_name: data.users_shadow?.name,
        user_email: data.users_shadow?.email,
        user_phone: userPhone,
        price: data.type === 'service' ? data.services?.price : data.classes?.price,
        currency: data.type === 'service' ? data.services?.currency : data.classes?.currency,
        stripe_payment_intent_id: paymentData?.stripe_payment_intent_id,
        voucher_info: voucherInfo
      };

      setBooking(bookingDetails);

      // Fetch Quipu invoice data
      const [{ data: invoiceData }, { data: quipuSettings }] = await Promise.all([
        supabase
          .from("quipu_invoices")
          .select("id, quipu_invoice_number, pdf_url, status, created_at")
          .eq("booking_id", id)
          .eq("status", "created")
          .maybeSingle(),
        supabase
          .from("settings")
          .select("key, value")
          .in("key", ["quipu.enabled"]),
      ]);
      setExistingInvoice(invoiceData);
      const enabled = quipuSettings?.find(s => s.key === "quipu.enabled")?.value === "true";
      setQuipuEnabled(enabled);
    } catch (error) {
      console.error('Error fetching booking details:', error);
      setLoadError(true);
      toast({
        title: "Error",
        description: "No se pudieron cargar los detalles de la reserva",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmBooking = async () => {
    if (!booking) return;
    
    setIsConfirming(true);
    try {
      // Update booking status
      const { error } = await supabase
        .from('bookings')
        .update({ 
          status: 'confirmed', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', booking.id)
        .eq('status', 'pending');

      if (error) throw error;

      // Si es en efectivo, marcar como pagado y crear registro en payments (evitando duplicados)
      if (booking.payment_method === 'cash') {
        await supabase
          .from('bookings')
          .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', booking.id);

        const { data: existing, error: existErr } = await supabase
          .from('payments')
          .select('id')
          .eq('booking_id', booking.id)
          .limit(1);
        if (existErr) console.error('Error checking existing payment:', existErr);

        if (!existing || existing.length === 0) {
          const amount = booking.price || 0;
          const currency = (booking.currency || 'EUR').toLowerCase();

          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              booking_id: booking.id,
              amount,
              currency,
              method: 'cash',
              status: 'succeeded'
            });
          if (paymentError) console.error('Error creating payment record:', paymentError);
        }
      }

      console.log(`[Admin.Bookings] confirm id=${booking.id} result=ok`);

      // Disparar factura Quipu si auto_invoice está activado
     console.log('[Quipu] Reached auto-invoice block, payment_method:', booking.payment_method);
      try {
        const { data: autoInvoiceSetting } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "quipu.auto_invoice")
          .maybeSingle();

        if (autoInvoiceSetting?.value === "true") {
          await supabase.functions.invoke("quipu-create-invoice", {
            body: {
              booking_id: booking.id,
              triggered_by: "automatic"
            }
          });
          console.log('[Quipu] auto-invoice triggered for booking:', booking.id);
        }
      } catch (quipuError) {
        // Error de Quipu no debe romper la confirmación de reserva
        console.error("Quipu auto-invoice error (cash):", quipuError);
      }

      toast({
        title: "Reserva confirmada",
        description: "La reserva ha sido confirmada exitosamente",
      });

      setBooking({ ...booking, status: 'confirmed' });
      onBookingUpdated();
    } catch (error) {
      console.error('Error confirming booking:', error);
      console.log(`[Admin.Bookings] confirm id=${booking.id} result=fail`);
      
      toast({
        title: "Error",
        description: "No se pudo confirmar la reserva",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const markAsPaidCash = async () => {
    if (!booking) return;
    
    setIsMarkingAsPaid(true);
    let insertedPayment = false;
    let updatedBooking = false;
    
    try {
      // Check if payment already exists
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('booking_id', booking.id)
        .in('status', ['paid', 'succeeded'])
        .single();

      // Insert payment if doesn't exist
      if (!existingPayment) {
        const amountCents = Math.round((booking.price || 0) * 100);
        
        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            booking_id: booking.id,
            amount: booking.price || 0,
            currency: booking.currency || 'EUR',
            method: 'cash',
            status: 'paid',
            created_at: new Date().toISOString()
          });

        if (paymentError) throw paymentError;
        insertedPayment = true;
      }

      // Update booking payment status
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({ 
          payment_status: 'paid', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', booking.id)
        .eq('payment_status', 'unpaid');

      if (bookingError) throw bookingError;
      updatedBooking = true;

      console.log(`[Admin.Bookings] cashPaid id=${booking.id} insertedPayment=${insertedPayment} updatedBooking=${updatedBooking}`);
      
      toast({
        title: "Pago registrado",
        description: "El pago en efectivo ha sido registrado exitosamente",
      });

      setBooking({ ...booking, payment_status: 'paid', actual_payment_status: 'paid' });
      onBookingUpdated();
    } catch (error) {
      console.error('Error marking as paid:', error);
      console.log(`[Admin.Bookings] cashPaid id=${booking.id} insertedPayment=${insertedPayment} updatedBooking=${updatedBooking}`);
      
      toast({
        title: "Error",
        description: "No se pudo registrar el pago",
        variant: "destructive",
      });
    } finally {
      setIsMarkingAsPaid(false);
    }
  };

  const generateQuipuInvoice = async () => {
    if (!booking) return;
    setIsGeneratingInvoice(true);
    try {
      const { data, error } = await supabase.functions.invoke("quipu-create-invoice", {
        body: {
          booking_id: booking.id,
          triggered_by: "manual",
          triggered_by_email: currentUser?.email || "",
        },
      });

      if (error) throw error;

      if (data?.success) {
        setExistingInvoice({
          id: data.invoice?.id || "",
          quipu_invoice_number: data.quipu_invoice_number || data.invoice?.quipu_invoice_number || null,
          pdf_url: data.invoice?.pdf_url || null,
          status: "created",
          created_at: new Date().toISOString(),
        });
        toast({ title: "✅ Factura generada en Quipu", description: `Nº ${data.quipu_invoice_number || ""}` });
      } else {
        throw new Error(data?.error || "Error desconocido");
      }
    } catch (error: any) {
      toast({ title: "Error generando factura", description: error?.message || "No se pudo crear la factura", variant: "destructive" });
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  const handleClose = () => {
    setBooking(null);
    setLoadError(false);
    setIsLoading(false);
    setExistingInvoice(null);
    setQuipuEnabled(false);
    onClose();
  };

  // Fetch booking details when modal opens - use useEffect to prevent infinite loops
  useEffect(() => {
    if (isOpen && bookingId) {
      setBooking(null);     // Defensive reset
      setLoadError(false);  // Defensive reset
      fetchBookingDetails(bookingId);
    }
  }, [isOpen, bookingId]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalles de la Reserva</DialogTitle>
          <DialogDescription>
            Información completa de la reserva
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : loadError ? (
          <div className="py-8 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-muted-foreground">
              No se han podido cargar los detalles de esta reserva.
              <br />
              Es posible que el cliente asociado ya no exista o que la reserva esté incompleta.
            </p>
            <Button variant="outline" onClick={handleClose}>Cerrar</Button>
          </div>
        ) : booking?.origin === 'class_session' ? (
          <div className="py-8 text-center space-y-4">
            <Calendar className="h-12 w-12 text-primary mx-auto" />
            <div>
              <h3 className="font-semibold text-lg mb-2">Sesión de Clase Grupal</h3>
              <p className="text-muted-foreground">
                Vista detallada de sesiones de clase próximamente.
                <br />
                Podrás ver todos los participantes y gestionar la capacidad.
              </p>
            </div>
            <Button onClick={handleClose}>Cerrar</Button>
          </div>
        ) : booking ? (
          <div className="space-y-6">
            {/* Reserva Info */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Información de la Reserva</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">ID:</span>
                  <p className="font-mono">{booking.id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Estado:</span>
                  <div className="mt-1">
                    <Badge className={statusColors[booking.status as keyof typeof statusColors]}>
                      {statusLabels[booking.status as keyof typeof statusLabels]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Origen:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="capitalize">{booking.origin}</p>
                    {booking.origin === 'subscription' && (
                      <Badge className="bg-purple-600 text-white">Suscripción</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Creada:</span>
                  <p>{format(new Date(booking.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Tipo y Recurso */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">
                {booking.origin === 'voucher' ? 'Bono' : 'Servicio/Clase'}
              </h3>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {booking.origin === 'subscription' && !booking.service_name && !booking.class_name
                    ? (booking.subscription_plan_name || 'Sesión de suscripción')
                    : (booking.type === 'service' ? booking.service_name : booking.class_name) || 'Reserva'
                  }
                </span>
                <Badge variant="outline" className="capitalize">
                  {booking.origin === 'subscription' 
                    ? 'Suscripción'
                    : booking.origin === 'voucher' 
                      ? 'Bono' 
                      : booking.type === 'service' ? 'Servicio' : 'Clase'}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Profesional, Ubicación, Fecha/Hora */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Detalles de la Cita</h3>
              <div className="space-y-2">
                {booking.professional_name && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>Profesional: {booking.professional_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>Ubicación: {booking.location_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Fecha: {format(new Date(booking.start_at), 'dd/MM/yyyy', { locale: es })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Hora: {format(new Date(booking.start_at), 'HH:mm')} - {format(new Date(booking.end_at), 'HH:mm')}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Overbooking Alert */}
            {simultaneousBookingsCount > 1 && (
              <>
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    ⚠️ Overbooking: {simultaneousBookingsCount} reservas en este horario
                  </AlertDescription>
                </Alert>
                <Separator />
              </>
            )}

            {/* Cliente */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Cliente</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-muted-foreground">Nombre:</span>
                  <p>{booking.user_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <p>{booking.user_email}</p>
                </div>
                {booking.user_phone && (
                  <div>
                    <span className="text-muted-foreground">Teléfono:</span>
                    <p>{booking.user_phone}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Precio y Pago */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Información de Pago</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Precio:</span>
                  <p className="font-semibold">
                    {booking.origin === 'subscription' ? (
                      <>
                        <span className="text-green-600">€0</span>
                        <span className="ml-2 text-xs text-green-600">Incluido en suscripción</span>
                      </>
                    ) : booking.price ? (
                      `${booking.currency === 'EUR' ? '€' : ''}${booking.price}`
                    ) : (
                      'Bono'
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">IVA incluido</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Estado del pago:</span>
                  <p className={booking.origin === 'subscription' || booking.actual_payment_status === 'paid' ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                    {booking.origin === 'subscription' ? 'Pagado' : paymentStatusLabels[booking.actual_payment_status as keyof typeof paymentStatusLabels]}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Método de pago:</span>
                  <div className="flex items-center gap-2 mt-1">
                    {booking.payment_method === 'card' ? (
                      <CreditCard className="h-4 w-4" />
                    ) : (
                      <DollarSign className="h-4 w-4" />
                    )}
                    <span>{getPaymentMethodDisplay(booking)}</span>
                  </div>
                </div>
                {booking.stripe_payment_intent_id && (
                  <div>
                    <span className="text-muted-foreground">Payment Intent ID:</span>
                    <p className="font-mono text-xs">{booking.stripe_payment_intent_id}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Voucher Info */}
            {booking.origin === 'voucher' && booking.voucher_info && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Bono
                  </h3>
                  <div className="bg-purple-50 p-3 rounded-md space-y-2">
                    <div>
                      <span className="text-sm text-muted-foreground">Tipo:</span>
                      <p className="font-medium">{booking.voucher_info.type_name || 'Bono'}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Sesiones:</span>
                      <p className="font-medium">Usadas {booking.voucher_info.used} / Restantes {booking.voucher_info.remaining} de {booking.voucher_info.total}</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Subscription Info */}
            {booking.origin === 'subscription' && (
              <>
                <Separator />
                <SubscriptionSessionInfo bookingId={booking.id} />
              </>
            )}

            {/* Notas - No mostrar metadata técnica del sistema */}
            {booking.notes && (() => {
              try {
                const notesData = JSON.parse(booking.notes);
                
                // Lista de campos técnicos que no queremos mostrar
                const technicalFields = ['createdBy', 'clientName', 'clientEmail', 'paymentMethod', 'voucherId', 'subscriptionId', 'planId'];
                
                // Buscar campos personalizados (que no sean técnicos)
                const customFields = Object.keys(notesData).filter(key => !technicalFields.includes(key));
                
                // Si solo hay campos técnicos, no mostrar la sección
                if (customFields.length === 0) {
                  return null;
                }
                
                // Si hay campos personalizados, mostrarlos
                return (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Notas Adicionales
                      </h3>
                      <div className="text-sm bg-muted p-3 rounded-md space-y-2">
                        {customFields.map(key => (
                          <div key={key}>
                            <span className="font-medium">{key}: </span>
                            <span>{String(notesData[key])}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              } catch {
                // Si no es JSON válido, no mostrar nada (es metadata corrupta o técnica)
                return null;
              }
            })()}

            {/* Quipu Invoice Section */}
            {quipuEnabled && booking.actual_payment_status === 'paid' && booking.status !== 'cancelled' && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Facturación Quipu
                  </h3>
                  {existingInvoice ? (
                    <div className="bg-muted p-3 rounded-md space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="font-medium">Factura generada</span>
                      </div>
                      {existingInvoice.quipu_invoice_number && (
                        <p className="text-sm text-muted-foreground">Nº {existingInvoice.quipu_invoice_number}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Generada el {format(new Date(existingInvoice.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                      </p>
                      {existingInvoice.pdf_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(existingInvoice.pdf_url!, '_blank')}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Ver PDF
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={generateQuipuInvoice}
                      disabled={isGeneratingInvoice}
                    >
                      {isGeneratingInvoice ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generando...</>
                      ) : (
                        <><FileText className="mr-2 h-4 w-4" />Generar factura en Quipu</>
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}

            {/* Actions */}
            <Separator />
            <div className="flex flex-wrap gap-2 pt-4">
              {booking.status === 'pending' && (
                <Button 
                  onClick={confirmBooking}
                  disabled={isConfirming}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isConfirming ? "Confirmando..." : "Confirmar Reserva"}
                </Button>
              )}
              
              {booking.payment_method === 'cash' && booking.status === 'confirmed' && booking.actual_payment_status === 'unpaid' && (
                <Button 
                  onClick={markAsPaidCash}
                  disabled={isMarkingAsPaid}
                  variant="outline"
                  className="border-green-600 text-green-600 hover:bg-green-50"
                >
                  {isMarkingAsPaid ? "Procesando..." : "Marcar como Pagada (Efectivo)"}
                </Button>
              )}
              
              {onEdit && booking.status !== 'cancelled' && (
                <Button 
                  onClick={() => {
                    onEdit();
                    handleClose();
                  }}
                  variant="default"
                >
                  Reprogramar
                </Button>
              )}
              
              {onCancel && booking.status !== 'cancelled' && (
                <Button 
                  onClick={() => {
                    onCancel();
                    handleClose();
                  }}
                  variant="destructive"
                >
                  Cancelar reserva
                </Button>
              )}
              
              <Button variant="outline" onClick={handleClose}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default BookingDetailsModal;