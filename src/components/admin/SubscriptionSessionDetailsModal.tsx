import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar, Clock, User, MapPin, Users, AlertTriangle, CreditCard } from "lucide-react";

interface Participant {
  id: string;
  user_name: string;
  user_email: string;
  status: string;
}

interface SubscriptionSessionDetailsModalProps {
  sessionData: {
    planName: string;
    planId: string;
    start_at: string;
    end_at: string;
    capacity: number;
    professionalName: string;
    professionalColor: string;
    locationName: string;
    bookings: Array<{
      id: string;
      user: { name: string; email: string };
      status: string;
    }>;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onParticipantClick?: (bookingId: string) => void;
}

const statusLabels: Record<string, string> = {
  confirmed: "Confirmada",
  pending: "Pendiente",
  completed: "Completada",
  cancelled: "Cancelada"
};

const statusColors: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-primary/10 text-primary",
  cancelled: "bg-destructive/10 text-destructive"
};

export function SubscriptionSessionDetailsModal({
  sessionData,
  isOpen,
  onClose,
  onParticipantClick
}: SubscriptionSessionDetailsModalProps) {
  if (!sessionData) return null;

  const participants = sessionData.bookings.filter(b => b.status !== 'cancelled');
  const occupancyPercentage = (participants.length / sessionData.capacity) * 100;
  const isFull = participants.length >= sessionData.capacity;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Detalles de Sesión de Suscripción
          </DialogTitle>
          <DialogDescription>
            Participantes y capacidad de la sesión del plan
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Plan Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-8 rounded-full"
                style={{ backgroundColor: sessionData.professionalColor }}
              />
              <h3 className="font-semibold text-lg">{sessionData.planName}</h3>
              <Badge variant="secondary">Suscripción</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{format(new Date(sessionData.start_at), 'dd/MM/yyyy', { locale: es })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {format(new Date(sessionData.start_at), 'HH:mm', { locale: es })} - {format(new Date(sessionData.end_at), 'HH:mm', { locale: es })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{sessionData.professionalName}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{sessionData.locationName}</span>
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
                  {participants.length}/{sessionData.capacity}
                </span>
                {isFull && (
                  <Badge variant="destructive">Completo</Badge>
                )}
              </div>
            </div>
            <Progress value={occupancyPercentage} className="h-3" />
            <p className="text-sm text-muted-foreground">
              {sessionData.capacity - participants.length} plaza{sessionData.capacity - participants.length !== 1 ? 's' : ''} disponible{sessionData.capacity - participants.length !== 1 ? 's' : ''}
            </p>
          </div>

          <Separator />

          {/* Lista de participantes */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Participantes ({participants.length})</h3>

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
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.map((participant) => (
                      <TableRow key={participant.id}>
                        <TableCell className="font-medium">{participant.user.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {participant.user.email}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[participant.status] || ''}>
                            {statusLabels[participant.status] || participant.status}
                          </Badge>
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
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SubscriptionSessionDetailsModal;
