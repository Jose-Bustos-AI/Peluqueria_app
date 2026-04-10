import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, Copy, RotateCcw, Clock, CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ProfessionalHour {
  id?: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed?: boolean;
}

interface ProfessionalException {
  id?: string;
  date: string;
  open_time?: string;
  close_time?: string;
  is_closed: boolean;
  note?: string;
}

interface ProfessionalHoursManagerProps {
  professionalId: string;
  professionalName: string;
}

const DAYS_OF_WEEK = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
];

export default function ProfessionalHoursManager({ 
  professionalId, 
  professionalName 
}: ProfessionalHoursManagerProps) {
  const [hours, setHours] = useState<ProfessionalHour[]>([]);
  const [exceptions, setExceptions] = useState<ProfessionalException[]>([]);
  const [loading, setLoading] = useState(false);
  const [professionalTimezone, setProfessionalTimezone] = useState<string>('Europe/Madrid');
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [newException, setNewException] = useState<Omit<ProfessionalException, 'id' | 'date'>>({
    is_closed: false,
    open_time: '09:00',
    close_time: '17:00',
    note: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    if (professionalId) {
      loadProfessionalHours();
      loadProfessionalExceptions();
    }
  }, [professionalId]);

  const loadProfessionalHours = async () => {
    try {
      // 1. Load professional data (business_hours and timezone)
      const { data: professionalData, error: professionalError } = await supabase
        .from('professionals')
        .select('business_hours, timezone')
        .eq('id', professionalId)
        .single();

      if (professionalError) throw professionalError;
      
      const businessHours = professionalData?.business_hours;
      const timezone = professionalData?.timezone || 'Europe/Madrid';
      setProfessionalTimezone(timezone);

      // 2. If has business_hours, load from there
      if (businessHours && Object.keys(businessHours).length > 0) {
        const hoursFromJson: ProfessionalHour[] = [];
        for (let day = 1; day <= 7; day++) {
          const dayData = businessHours[day.toString()];
          if (dayData?.open && dayData?.intervals?.length > 0) {
            dayData.intervals.forEach((interval: any) => {
              hoursFromJson.push({
                day_of_week: day,
                open_time: interval.start,
                close_time: interval.end,
                is_closed: false
              });
            });
          } else if (dayData && !dayData.open) {
            // Explicitly closed day
            hoursFromJson.push({
              day_of_week: day,
              open_time: '09:00',
              close_time: '17:00',
              is_closed: true
            });
          }
        }
        setHours(hoursFromJson);
      } else {
        // 3. Fallback: load from professional_hours for pre-loading
        const { data, error } = await supabase
          .from('professional_hours')
          .select('*')
          .eq('professional_id', professionalId)
          .order('day_of_week');

        if (error) throw error;
        setHours(data || []);
      }
    } catch (error) {
      console.error('Error loading professional hours:', error);
    }
  };

  const loadProfessionalExceptions = async () => {
    try {
      const { data, error } = await supabase
        .from('professional_hours_exceptions')
        .select('*')
        .eq('professional_id', professionalId)
        .order('date');

      if (error) throw error;
      setExceptions(data || []);
    } catch (error) {
      console.error('Error loading professional exceptions:', error);
    }
  };

  const getHoursForDay = (dayOfWeek: number) => {
    return hours.filter(h => h.day_of_week === dayOfWeek);
  };

  const isDayClosed = (dayOfWeek: number) => {
    const dayHours = getHoursForDay(dayOfWeek);
    return dayHours.length === 0 || dayHours.some(h => h.is_closed);
  };

  const addTimeSlot = (dayOfWeek: number) => {
    const newHour: ProfessionalHour = {
      day_of_week: dayOfWeek,
      open_time: '09:00',
      close_time: '17:00',
      is_closed: false
    };
    setHours([...hours, newHour]);
  };

  const updateTimeSlot = (index: number, field: keyof ProfessionalHour, value: any) => {
    const updatedHours = [...hours];
    updatedHours[index] = { ...updatedHours[index], [field]: value };
    setHours(updatedHours);
  };

  const removeTimeSlot = (index: number) => {
    setHours(hours.filter((_, i) => i !== index));
  };

  const toggleDayClosed = (dayOfWeek: number) => {
    const dayHours = getHoursForDay(dayOfWeek);
    if (isDayClosed(dayOfWeek)) {
      // Open the day - add default hours if none exist
      if (dayHours.length === 0) {
        addTimeSlot(dayOfWeek);
      } else {
        // Remove is_closed flag from existing hours
        const updatedHours = hours.map(h => 
          h.day_of_week === dayOfWeek ? { ...h, is_closed: false } : h
        );
        setHours(updatedHours);
      }
    } else {
      // Close the day - mark all hours as closed
      const updatedHours = hours.map(h => 
        h.day_of_week === dayOfWeek ? { ...h, is_closed: true } : h
      );
      setHours(updatedHours);
    }
  };

  const copyToAllDays = (dayOfWeek: number) => {
    const sourceHours = getHoursForDay(dayOfWeek);
    const newHours: ProfessionalHour[] = [];
    
    DAYS_OF_WEEK.forEach(day => {
      if (day.value !== dayOfWeek) {
        sourceHours.forEach(sourceHour => {
          newHours.push({
            day_of_week: day.value,
            open_time: sourceHour.open_time,
            close_time: sourceHour.close_time,
            is_closed: sourceHour.is_closed
          });
        });
      }
    });

    // Remove existing hours for other days and add new ones
    const filteredHours = hours.filter(h => h.day_of_week === dayOfWeek);
    setHours([...filteredHours, ...newHours]);
  };

  const resetHours = () => {
    setHours([]);
  };

  const saveHours = async () => {
    setLoading(true);
    try {
      // 1. Build business_hours JSON with ISO 1-7 index (Mon=1, Sun=7)
      const businessHours: Record<string, any> = {};
      
      for (let day = 1; day <= 7; day++) {
        const dayHours = getHoursForDay(day).filter(h => !h.is_closed);
        
        if (dayHours.length > 0) {
          businessHours[day.toString()] = {
            open: true,
            intervals: dayHours.map(h => ({
              start: h.open_time,
              end: h.close_time
            }))
          };
        } else {
          businessHours[day.toString()] = {
            open: false,
            intervals: []
          };
        }
      }

      // 2. Update professionals.business_hours and timezone
      const { error: professionalError } = await supabase
        .from('professionals')
        .update({ 
          business_hours: businessHours,
          timezone: professionalTimezone 
        })
        .eq('id', professionalId);

      if (professionalError) throw professionalError;

      // 3. (Temporal) Keep professional_hours in sync for legacy
      await supabase
        .from('professional_hours')
        .delete()
        .eq('professional_id', professionalId);

      if (hours.length > 0) {
        const hoursToInsert = hours.map(h => ({
          professional_id: professionalId,
          day_of_week: h.day_of_week,
          open_time: h.open_time,
          close_time: h.close_time,
          is_closed: h.is_closed || false
        }));

        const { error: legacyError } = await supabase
          .from('professional_hours')
          .insert(hoursToInsert);

        if (legacyError) console.warn('Warning: Could not sync legacy professional_hours:', legacyError);
      }

      toast({
        title: "Horarios guardados",
        description: "Los horarios del profesional se han actualizado correctamente."
      });
    } catch (error) {
      console.error('Error saving hours:', error);
      toast({
        title: "Error",
        description: "No se pudieron guardar los horarios.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addException = async () => {
    if (!selectedDate) return;

    try {
      const exceptionData = {
        professional_id: professionalId,
        date: format(selectedDate, 'yyyy-MM-dd'),
        ...newException
      };

      const { error } = await supabase
        .from('professional_hours_exceptions')
        .insert([exceptionData]);

      if (error) throw error;

      await loadProfessionalExceptions();
      setExceptionDialogOpen(false);
      setSelectedDate(undefined);
      setNewException({
        is_closed: false,
        open_time: '09:00',
        close_time: '17:00',
        note: ''
      });

      toast({
        title: "Excepción añadida",
        description: "La excepción de horario se ha guardado correctamente."
      });
    } catch (error) {
      console.error('Error adding exception:', error);
      toast({
        title: "Error",
        description: "No se pudo añadir la excepción.",
        variant: "destructive"
      });
    }
  };

  const removeException = async (exceptionId: string) => {
    try {
      const { error } = await supabase
        .from('professional_hours_exceptions')
        .delete()
        .eq('id', exceptionId);

      if (error) throw error;

      await loadProfessionalExceptions();
      toast({
        title: "Excepción eliminada",
        description: "La excepción de horario se ha eliminado correctamente."
      });
    } catch (error) {
      console.error('Error removing exception:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la excepción.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Weekly Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Horario Semanal - {professionalName}
          </CardTitle>
          <div className="flex items-center gap-4 pt-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Zona horaria:</Label>
              <Select value={professionalTimezone} onValueChange={setProfessionalTimezone}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Europe/Madrid">Europe/Madrid (Madrid)</SelectItem>
                  <SelectItem value="Europe/Barcelona">Europe/Barcelona (Barcelona)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (Londres)</SelectItem>
                  <SelectItem value="America/New_York">America/New_York (Nueva York)</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los_Angeles (Los Ángeles)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {DAYS_OF_WEEK.map((day) => {
            const dayHours = getHoursForDay(day.value);
            const isClosed = isDayClosed(day.value);

            return (
              <div key={day.value} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium w-20">{day.label}</span>
                    <Switch
                      checked={!isClosed}
                      onCheckedChange={() => toggleDayClosed(day.value)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {isClosed ? 'No disponible' : 'Disponible'}
                    </span>
                  </div>
                  {!isClosed && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addTimeSlot(day.value)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToAllDays(day.value)}
                        title="Copiar al resto de días"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {!isClosed && (
                  <div className="ml-24 space-y-2">
                    {dayHours.map((hour, index) => {
                      const globalIndex = hours.findIndex(h => h === hour);
                      return (
                        <div key={globalIndex} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={hour.open_time}
                            onChange={(e) => updateTimeSlot(globalIndex, 'open_time', e.target.value)}
                            className="w-32"
                          />
                          <span>-</span>
                          <Input
                            type="time"
                            value={hour.close_time}
                            onChange={(e) => updateTimeSlot(globalIndex, 'close_time', e.target.value)}
                            className="w-32"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeTimeSlot(globalIndex)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <Separator />

          <div className="flex justify-between">
            <Button variant="outline" onClick={resetHours}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Restablecer
            </Button>
            <Button onClick={saveHours} disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar Horarios'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Exceptions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Excepciones de Horario</CardTitle>
            <Dialog open={exceptionDialogOpen} onOpenChange={setExceptionDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Añadir Excepción
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva Excepción de Horario</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Fecha</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !selectedDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, "PPP", { locale: es }) : "Seleccionar fecha"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          locale={es}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newException.is_closed}
                      onCheckedChange={(checked) => 
                        setNewException({ ...newException, is_closed: checked })
                      }
                    />
                    <Label>Día no disponible</Label>
                  </div>

                  {!newException.is_closed && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Hora inicio</Label>
                        <Input
                          type="time"
                          value={newException.open_time}
                          onChange={(e) => 
                            setNewException({ ...newException, open_time: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>Hora fin</Label>
                        <Input
                          type="time"
                          value={newException.close_time}
                          onChange={(e) => 
                            setNewException({ ...newException, close_time: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>Nota (opcional)</Label>
                    <Textarea
                      value={newException.note}
                      onChange={(e) => 
                        setNewException({ ...newException, note: e.target.value })
                      }
                      placeholder="Motivo de la excepción..."
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setExceptionDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={addException}>
                      Añadir Excepción
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {exceptions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay excepciones configuradas</p>
            ) : (
              exceptions.map((exception) => (
                <div
                  key={exception.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium">
                      {format(new Date(exception.date), "PPP", { locale: es })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {exception.is_closed ? (
                        <Badge variant="secondary">No disponible</Badge>
                      ) : (
                        <span>{exception.open_time} - {exception.close_time}</span>
                      )}
                      {exception.note && <span className="ml-2">({exception.note})</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeException(exception.id!)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
