import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";

interface RescheduleConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  oldDate: Date;
  newDate: Date;
  newHour: number;
  bookingName: string;
  loading?: boolean;
}

export default function RescheduleConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  oldDate,
  newDate,
  newHour,
  bookingName,
  loading = false
}: RescheduleConfirmModalProps) {
  const newDateTime = new Date(newDate);
  newDateTime.setHours(newHour, 0, 0, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Reprogramar esta cita?</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <p className="text-sm font-medium mb-2">{bookingName}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>De: {format(oldDate, "EEEE d 'de' MMMM", { locale: es })}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{format(oldDate, "HH:mm")}</span>
            </div>
          </div>

          <div className="text-center text-sm font-medium">↓</div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4" />
              <span>A: {format(newDateTime, "EEEE d 'de' MMMM", { locale: es })}</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" />
              <span>{format(newDateTime, "HH:mm")}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? "Reprogramando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
