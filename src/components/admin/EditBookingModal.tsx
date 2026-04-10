import React, { useState, useEffect } from 'react';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useProfessionalAvailability } from "@/hooks/useProfessionalAvailability";

interface Booking {
  id: string;
  start_at: string;
  end_at: string;
  professional: {
    id: string;
    name: string;
  };
  location: {
    id: string;
    name: string;
  };
  service?: {
    name: string;
    duration_min: number;
  };
  class?: {
    name: string;
    duration_min: number;
  };
}

interface EditBookingModalProps {
  booking: Booking | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newDate: Date, newStartTime: string) => Promise<void>;
}

export default function EditBookingModal({
  booking,
  isOpen,
  onClose,
  onSave
}: EditBookingModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const duration = booking?.service?.duration_min || booking?.class?.duration_min || 60;
  
  const { getAvailableSlots, loading: loadingSlots } = useProfessionalAvailability(
    booking?.professional.id || "",
    null, // serviceId not needed
    booking?.location.id || "",
    duration,
    booking?.id, // Exclude this booking from conflict checks
    30 // Admin: show 30-min granularity slots
  );

  const currentTime = booking ? format(new Date(booking.start_at), 'HH:mm') : "";
  const originalBookingDate = booking ? new Date(booking.start_at) : null;
  const isOriginalBookingDay = Boolean(
    selectedDate && originalBookingDate && isSameDay(selectedDate, originalBookingDate)
  );
  const baseSlots = selectedDate 
    ? getAvailableSlots(selectedDate).filter(slot => slot.available).map(slot => slot.time) 
    : [];
  const availableSlots = currentTime && isOriginalBookingDay && !baseSlots.includes(currentTime)
    ? [currentTime, ...baseSlots].sort()
    : baseSlots;

  useEffect(() => {
    if (booking && isOpen) {
      const startDate = new Date(booking.start_at);
      setSelectedDate(startDate);
      setSelectedTime(format(startDate, 'HH:mm'));
    }
  }, [booking, isOpen]);

  const handleSave = async () => {
    if (!selectedDate || !selectedTime) return;

    try {
      setLoading(true);
      await onSave(selectedDate, selectedTime);
      onClose();
    } catch (error) {
      console.error('[EditBookingModal] Error saving:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!booking) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modificar cita</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <p className="text-sm font-medium">
              {booking.service?.name || booking.class?.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {booking.professional.name} - {booking.location.name}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Seleccionar fecha</Label>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={es}
                className="rounded-md border"
                disabled={(date) => date < new Date()}
              />
            </div>

            {selectedDate && (
              <div>
                <Label>Seleccionar hora</Label>
                {loadingSlots ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Cargando horarios...</span>
                  </div>
                ) : availableSlots.length > 0 ? (
                  <Select value={selectedTime} onValueChange={setSelectedTime}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un horario" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSlots.map((slot) => (
                        <SelectItem key={slot} value={slot}>
                          {slot}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    No hay horarios disponibles para esta fecha
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || !selectedDate || !selectedTime || loadingSlots}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar cambios"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
