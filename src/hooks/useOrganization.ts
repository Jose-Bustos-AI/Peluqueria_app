import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Organization {
  id: string;
  slug: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  active: boolean;
}

export function useOrganization(slug: string | null) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setOrganization(null);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchOrganization = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('organizations_public')
          .select('id, slug, name, primary_color, secondary_color, logo_url, active')
          .eq('slug', slug)
          .single();

        if (fetchError) throw fetchError;

        if (!data) {
          throw new Error(`Organizacion no encontrada: ${slug}`);
        }

        setOrganization(data);
      } catch (err) {
        console.error('[useOrganization] Error:', err);
        setError(err instanceof Error ? err.message : 'Error loading organization');
        setOrganization(null);
      } finally {
        setLoading(false);
      }
    };

    fetchOrganization();
  }, [slug]);

  return { organization, loading, error };
}
