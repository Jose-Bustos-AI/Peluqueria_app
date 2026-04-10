import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WidgetSettings {
  show_plans: boolean;
}

export function useWidgetSettings() {
  const [settings, setSettings] = useState<WidgetSettings>({
    show_plans: true
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('settings')
        .select('key, value')
        .eq('key', 'web.show_plans')
        .maybeSingle();

      if (fetchError) throw fetchError;

      let showPlans = true; // default value
      if (data && data.value) {
        try {
          showPlans = JSON.parse(data.value as string);
        } catch (e) {
          console.warn('[useWidgetSettings] Invalid JSON for show_plans setting:', data.value);
        }
      }

      setSettings({
        show_plans: showPlans
      });
    } catch (err) {
      console.error('[useWidgetSettings] Error:', err);
      setError(err instanceof Error ? err.message : 'Error loading widget settings');
      // Use defaults on error
      setSettings({ show_plans: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return { settings, loading, error, refetch: fetchSettings };
}