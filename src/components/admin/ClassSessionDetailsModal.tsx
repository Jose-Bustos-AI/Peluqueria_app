import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar, Clock, User, MapPin, Users, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Participant {
  id: string;
  user_name: string;
  user_email: string;
  status: string;
  payment_status: string;
  payment_method: string;
}

interface ClassSessionDetails {
  class_id: string;
  class_name: string;
  start_at: string;
  end_at: string;
  professional_name: string;
  location_name: string;
  capacity: number;
}

interface ClassSessionDetailsModalProps {
  sessionData: {
    class_id: string;
    start_at: string;
    end_at: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onParticipantClick?: (bookingId: string) => void;
  onAddParticipant?: (classId: string, startAt: string, endAt: string) => void;
  onSessionUpdated?: () => void;
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

const paymentStatusLabels = {
  paid: "Pagado",
  unpaid: "No pagado"
};

export function ClassSessionDetailsModal({ 
  sessionData, 
  isOpen, 
  onClose, 
  onParticipantClick,
  onAddParticipant,
  onSessionUpdated 
}: ClassSessionDetailsModalProps) {
  const [sessionDetails, setSessionDetails] = useState<ClassSessionDetails | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const { toast } = useToast();

  const fetchSessionDetails = async () => {
    if (!sessionData) return;

    setIsLoading(true);
    setLoadError(false);

    try {
      // Get all bookings for this class at this time
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          payment_method,
          payment_status,
          class_id,
          start_at,
          end_at,
          classes (name, capacity),
          professionals (name),
          locations (name),
          users_shadow (name, email)
        `)
        .eq('class_id', sessionData.class_id)
        .eq('start_at', sessionData.start_at)
        .eq('type', 'class')
        .neq('status', 'cancelled');

      if (bookingsError) throw bookingsError;

      if (!bookings || bookings.length === 0) {
        // No bookings found, try to get class info
        const { data: classData, error: classError } = await supabase
          .from('classes')
          .select('name, capacity')
          .eq('id', sessionData.class_id)
          .single();

        if (classError) throw classError;

        setSessionDetails({
          class_id: sessionData.class_id,
          class_name: classData.name,
          start_at: sessionData.start_at,
          end_at: sessionData.end_at,
          professional_name: 'No asignado',
          location_name: 'No asignada',
          capacity: classData.capacity
        });
        setParticipants([]);
        setIsLoading(false);
        return;
      }

      // Use first booking to get session details
      const firstBooking = bookings[0];
      
      setSessionDetails({
        class_id: sessionData.class_id,
        class_name: firstBooking.classes?.name || 'Clase',
        start_at: sessionData.start_at,
        end_at: sessionData.end_at,
        professional_name: firstBooking.professionals?.name || 'No asignado',
        location_name: firstBooking.locations?.name || 'No asignada',
        capacity: firstBooking.classes?.capacity || 0
      });

      // Map participants
      const participantList: Participant[] = bookings.map(booking => ({
        id: booking.id,
        user_name: booking.users_shadow?.name || 'Sin nombre',
        user_email: booking.users_shadow?.email || 'Sin email',
        status: booking.status,
        payment_status: booking.payment_status || 'unpaid',
        payment_method: booking.payment_method || 'none'
      }));

      setParticipants(participantList);
    } catch (error) {
      console.error('Error fetching session details:', error);
      setLoadError(true);
      toast({
        title: "Error",
        description: "No se pudieron cargar los detalles de la sesión",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSessionDetails(null);
    setParticipants([]);
    setLoadError(false);
    onClose();
  };

  const handleAddParticipant = () => {
    if (sessionDetails && onAddParticipant) {
      onAddParticipant(
        sessionDetails.class_id,
        sessionDetails.start_at,
        sessionDetails.end_at
      );
    }
  };

  useEffect(() => {
    if (isOpen && sessionData) {
      fetchSessionDetails();
    }
  }, [isOpen, sessionData]);

  const occupancyPercentage = sessionDetails 
    ? (participants.length / sessionDetails.capacity) * 100 
    : 0;

  const isFull = sessionDetails && participants.length >= sessionDetails.capacity;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Detalles de Sesión de Clase
          </DialogTitle>
          <DialogDescription>
            Gestión de participantes y capacidad de la sesión
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
              No se han podido cargar los detalles de esta sesión.
            </p>
            <Button variant="outline" onClick={handleClose}>Cerrar</Button>
          </div>
        ) : sessionDetails ? (
          <div className="space-y-6">
            {/* Clase Info */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">{sessionDetails.class_name}</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(new Date(sessionDetails.start_at), 'dd/MM/yyyy', { locale: es })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(new Date(sessionDetails.start_at), 'HH:mm', { locale: es })} - {format(new Date(sessionDetails.end_at), 'HH:mm', { locale: es })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{sessionDetails.professional_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{sessionDetails.location_name}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Capacidad */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Capacidad</h3>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="text-lg font-semibold">
                    {participants.length}/{sessionDetails.capacity}
                  </span>
                  {isFull && (
                    <Badge variant="destructive">Completo</Badge>
                  )}
                </div>
              </div>
              <Progress value={occupancyPercentage} className="h-3" />
              <p className="text-sm text-muted-foreground">
                {sessionDetails.capacity - participants.length} plaza{sessionDetails.capacity - participants.length !== 1 ? 's' : ''} disponible{sessionDetails.capacity - participants.length !== 1 ? 's' : ''}
              </p>
            </div>

            <Separator />

            {/* Lista de participantes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Participantes ({participants.length})</h3>
                <Button 
                  onClick={handleAddParticipant}
                  size="sm"
                  disabled={isFull}
                >
                  Añadir participante
                </Button>
              </div>

              {participants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No hay participantes registrados en esta sesión</p>
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Participante</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Pago</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {participants.map((participant) => (
                        <TableRow key={participant.id}>
                          <TableCell className="font-medium">{participant.user_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {participant.user_email}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[participant.status as keyof typeof statusColors]}>
                              {statusLabels[participant.status as keyof typeof statusLabels]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">
                                {paymentMethodLabels[participant.payment_method as keyof typeof paymentMethodLabels]}
                              </span>
                              <Badge 
                                variant={participant.payment_status === 'paid' ? 'default' : 'outline'}
                                className="w-fit"
                              >
                                {paymentStatusLabels[participant.payment_status as keyof typeof paymentStatusLabels]}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onParticipantClick?.(participant.id)}
                            >
                              Ver detalles
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
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

export default ClassSessionDetailsModal;
