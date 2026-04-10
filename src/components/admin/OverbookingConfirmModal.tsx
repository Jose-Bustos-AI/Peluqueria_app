import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Clock, User } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ConflictingBooking {
  id: string;
  user_name: string;
  service_name?: string;
  class_name?: string;
  start_at: string;
  end_at: string;
}

interface OverbookingConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  conflictingBookings: ConflictingBooking[];
  isLoading: boolean;
}

export function OverbookingConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  conflictingBookings,
  isLoading
}: OverbookingConfirmModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <AlertTriangle className="h-5 w-5" />
            Confirmar Overbooking
          </DialogTitle>
          <DialogDescription>
            Este profesional ya tiene reservas en este horario
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Estás a punto de crear una reserva en un horario ya ocupado. Esto puede causar conflictos de agenda.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <p className="text-sm font-medium">Reservas existentes en este horario:</p>
          {conflictingBookings.map((booking) => (
            <div
              key={booking.id}
              className="rounded-lg border border-border bg-muted/50 p-3 space-y-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{booking.user_name}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  {format(new Date(booking.start_at), "HH:mm", { locale: es })} - {format(new Date(booking.end_at), "HH:mm", { locale: es })}
                </span>
              </div>

              {(booking.service_name || booking.class_name) && (
                <div className="text-sm text-muted-foreground">
                  {booking.service_name || booking.class_name}
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Creando..." : "Confirmar y crear reserva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
