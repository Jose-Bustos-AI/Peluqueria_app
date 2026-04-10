import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfessionalAvailability } from './useProfessionalAvailability';

interface ProfessionalSlot {
  time: string;
  professionalId: string;
  professionalName: string;
  professionalColor?: string;
  startAt: Date;
  endAt: Date;
}

interface Professional {
  id: string;
  name: string;
  color?: string;
}

export function useMultiProfessionalAvailability(
  serviceId: string | null,
  locationId: string | null,
  selectedDate: Date | undefined
) {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(false);
  const [combinedSlots, setCombinedSlots] = useState<ProfessionalSlot[]>([]);

  // Load professionals for this service and location
  useEffect(() => {
    if (!serviceId || !locationId) {
      setProfessionals([]);
      return;
    }

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
          const profs = data
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
        setProfessionals([]);
      } finally {
        setLoading(false);
      }
    };

    loadProfessionals();
  }, [serviceId, locationId]);

  return {
    professionals,
    loading,
    combinedSlots,
  };
}

// Component to fetch individual professional availability
export function ProfessionalAvailabilityFetcher({
  professionalId,
  serviceId,
  locationId,
  selectedDate,
  professionalName,
  professionalColor,
  onSlotsLoaded,
}: {
  professionalId: string;
  serviceId: string;
  locationId: string;
  selectedDate: Date;
  professionalName: string;
  professionalColor?: string;
  onSlotsLoaded: (slots: ProfessionalSlot[]) => void;
}) {
  const { getAvailableSlots } = useProfessionalAvailability(
    professionalId,
    serviceId,
    locationId
  );

  useEffect(() => {
    const slots = getAvailableSlots(selectedDate);
    const professionalSlots: ProfessionalSlot[] = slots
      .filter(slot => slot.available)
      .map(slot => {
        // Parse time format "HH:mm" and create Date objects
        const [hours, minutes] = slot.time.split(':').map(Number);
        const startAt = new Date(selectedDate);
        startAt.setHours(hours, minutes, 0, 0);
        
        // endAt will be calculated based on service duration (handled by the hook)
        // For now we just add 1 hour as placeholder
        const endAt = new Date(startAt);
        endAt.setHours(hours + 1, minutes, 0, 0);
        
        return {
          time: slot.time,
          professionalId,
          professionalName,
          professionalColor,
          startAt,
          endAt,
        };
      });

    onSlotsLoaded(professionalSlots);
  }, [professionalId, selectedDate, getAvailableSlots, professionalName, professionalColor, onSlotsLoaded]);

  return null;
}
