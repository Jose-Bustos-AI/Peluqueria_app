import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CalendarSettings {
  startHour: number;
  endHour: number;
  showProfessionalColors: boolean;
}

export function useCalendarSettings() {
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['calendar-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['calendar.start_hour', 'calendar.end_hour', 'calendar.show_professional_colors']);

      if (error) throw error;

      // Convert to object
      const settingsObj: Record<string, any> = {};
      data?.forEach(setting => {
        settingsObj[setting.key] = setting.value;
      });

      // Parse time strings to hour numbers
      const startTime = settingsObj['calendar.start_hour'] || '08:00';
      const endTime = settingsObj['calendar.end_hour'] || '20:00';
      
      const startHour = parseInt(startTime.split(':')[0], 10);
      const endHour = parseInt(endTime.split(':')[0], 10);

      return {
        startHour,
        endHour,
        showProfessionalColors: settingsObj['calendar.show_professional_colors'] ?? true,
      } as CalendarSettings;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    settings: settings || { startHour: 8, endHour: 20, showProfessionalColors: true },
    isLoading,
    error,
  };
}
