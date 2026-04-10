import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useProfessionalAvailability } from '@/hooks/useProfessionalAvailability';

interface Professional {
  id: string;
  name: string;
  color?: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
  period: 'morning' | 'afternoon' | 'night';
}

interface CombinedSlot {
  time: string;
  professionalId: string;
  professionalName: string;
  professionalColor: string;
  period: 'morning' | 'afternoon' | 'night';
  available: boolean;
}

interface ServiceMultiProfessionalSlotsProps {
  serviceId: string;
  locationId: string;
  onSlotSelected: (slot: CombinedSlot, date: Date) => void;
  onBack: () => void;
}

function ProfessionalSlotsFetcher({
  professional,
  serviceId,
  locationId,
  selectedDate,
  onSlotsReady,
}: {
  professional: Professional;
  serviceId: string;
  locationId: string;
  selectedDate: Date | undefined;
  onSlotsReady: (professionalId: string, slots: TimeSlot[]) => void;
}) {
  const { getAvailableSlots, loading } = useProfessionalAvailability(
    professional.id,
    serviceId,
    locationId,
    undefined, // overrideDuration
    undefined, // excludeBookingId
    30 // Admin: show 30-min granularity slots
  );

  useEffect(() => {
    if (selectedDate && !loading) {
      const slots = getAvailableSlots(selectedDate);
      onSlotsReady(professional.id, slots); // Show all slots for admin (including occupied)
    }
  }, [professional.id, selectedDate, loading, getAvailableSlots, onSlotsReady]);

  return null;
}

export default function ServiceMultiProfessionalSlots({
  serviceId,
  locationId,
  onSlotSelected,
  onBack,
}: ServiceMultiProfessionalSlotsProps) {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [professionalSlots, setProfessionalSlots] = useState<Record<string, TimeSlot[]>>({});
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);

  // Helper: check if a slot time is in the past (only for today)
  const isSlotInPast = (slotTime: string, selectedDate: Date | undefined) => {
    if (!selectedDate) return false;
    
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(selectedDate);
    checkDate.setHours(0, 0, 0, 0);
    
    // Only filter if selected date is today
    if (checkDate.getTime() !== today.getTime()) return false;
    
    // Parse slot time (format "HH:MM")
    const [hours, minutes] = slotTime.split(':').map(Number);
    const slotDateTime = new Date(selectedDate);
    slotDateTime.setHours(hours, minutes, 0, 0);
    
    return slotDateTime < now;
  };

  // Load professionals for this service
  useEffect(() => {
    const loadProfessionals = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('service_professionals')
          .select(`
            professional_id,
            professionals!fk_service_professionals_professional_id (
              id,
              name,
              color,
              active
            )
          `)
          .eq('service_id', serviceId);

        if (error) throw error;

        if (data) {
          const profs: Professional[] = data
            .filter(sp => sp.professionals && sp.professionals.active !== false)
            .map(sp => ({
              id: sp.professionals!.id,
              name: sp.professionals!.name,
              color: sp.professionals!.color || '#3B82F6',
            }));

          setProfessionals(profs);
        }
      } catch (error) {
        console.error('Error loading professionals:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfessionals();
  }, [serviceId]);

  const handleSlotsReady = useCallback((professionalId: string, slots: TimeSlot[]) => {
    setProfessionalSlots(prev => ({
      ...prev,
      [professionalId]: slots,
    }));
  }, []);

  // Combine all slots from all professionals
  const combinedSlots = useMemo(() => {
    const allSlots: CombinedSlot[] = [];
    
    professionals.forEach(prof => {
      const slots = professionalSlots[prof.id] || [];
      slots.forEach(slot => {
        if (showOnlyAvailable && !slot.available) return;
        allSlots.push({
          time: slot.time,
          professionalId: prof.id,
          professionalName: prof.name,
          professionalColor: prof.color || '#3B82F6',
          period: slot.period,
          available: slot.available,
        });
      });
    });

    // Sort by time
    allSlots.sort((a, b) => {
      const [aHour, aMin] = a.time.split(':').map(Number);
      const [bHour, bMin] = b.time.split(':').map(Number);
      return aHour * 60 + aMin - (bHour * 60 + bMin);
    });

    return allSlots;
  }, [professionals, professionalSlots, showOnlyAvailable]);

  // Group slots by time period
  const groupedSlots = useMemo(() => {
    const groups = {
      morning: combinedSlots.filter(s => s.period === 'morning'),
      afternoon: combinedSlots.filter(s => s.period === 'afternoon'),
      night: combinedSlots.filter(s => s.period === 'night'),
    };
    return groups;
  }, [combinedSlots]);

  const periodLabels = {
    morning: 'Mañana',
    afternoon: 'Tarde',
    night: 'Noche',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (professionals.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-center text-muted-foreground">
          No hay profesionales disponibles para este servicio
        </p>
        <Button variant="outline" onClick={onBack} className="w-full">
          Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Render hidden slot fetchers for each professional */}
      {professionals.map(prof => (
        <ProfessionalSlotsFetcher
          key={prof.id}
          professional={prof}
          serviceId={serviceId}
          locationId={locationId}
          selectedDate={selectedDate}
          onSlotsReady={handleSlotsReady}
        />
      ))}

      {/* Date selector */}
      <div>
        <Label>Seleccionar fecha</Label>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          locale={es}
          className="rounded-md border pointer-events-auto"
        />
      </div>

      {/* Available slots */}
      {selectedDate && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>
              Horas disponibles para {format(selectedDate, "d 'de' MMMM", { locale: es })}
            </Label>
            <div className="flex items-center gap-2">
              <Label htmlFor="toggle-available-multi" className="text-xs text-muted-foreground cursor-pointer">Solo libres</Label>
              <Switch id="toggle-available-multi" checked={showOnlyAvailable} onCheckedChange={setShowOnlyAvailable} />
            </div>
          </div>
          
          {combinedSlots.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay horas disponibles para esta fecha.
                <br />
                Selecciona otra fecha.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {(['morning', 'afternoon', 'night'] as const).map(period => {
                const slots = groupedSlots[period];
                if (slots.length === 0) return null;

                return (
                  <div key={period}>
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                      {periodLabels[period]}
                    </h3>
                    <div className="grid grid-cols-1 gap-2">
                      {slots.filter(slot => !isSlotInPast(slot.time, selectedDate)).map((slot, idx) => {
                        const isOccupied = !slot.available;
                        return (
                          <Button
                            key={`${slot.professionalId}-${slot.time}-${idx}`}
                            variant="outline"
                            className={`h-auto justify-start p-3 hover:bg-accent pointer-events-auto ${
                              isOccupied ? 'border-orange-500 bg-orange-50 hover:bg-orange-100' : ''
                            }`}
                            onClick={() => onSlotSelected(slot, selectedDate)}
                            title={isOccupied ? "Slot ocupado - Se pedirá confirmación" : undefined}
                          >
                            <div className="flex items-center gap-3 w-full">
                              {isOccupied && <span className="text-xs">⚠️</span>}
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className={`font-medium ${isOccupied ? 'text-orange-700' : ''}`}>
                                {slot.time}
                                {isOccupied && <span className="text-xs ml-2">(Ocupado)</span>}
                              </span>
                              <div className="flex items-center gap-2 ml-auto">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: slot.professionalColor }}
                                />
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{slot.professionalName}</span>
                              </div>
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="w-full">
          Atrás
        </Button>
      </div>
    </div>
  );
}
