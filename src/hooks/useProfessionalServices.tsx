import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProfessionalService {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_min: number;
  category_id: string | null;
  category?: {
    name: string;
  };
}

interface ProfessionalClass {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_min: number;
  capacity: number;
  category_id: string | null;
  category?: {
    name: string;
  };
}

export function useProfessionalServices(professionalId?: string) {
  const [services, setServices] = useState<ProfessionalService[]>([]);
  const [classes, setClasses] = useState<ProfessionalClass[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!professionalId) {
      setServices([]);
      setClasses([]);
      return;
    }

    const fetchProfessionalData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch services
        const { data: serviceRelations, error: servicesError } = await supabase
          .from('service_professionals')
          .select('service_id')
          .eq('professional_id', professionalId);

        if (servicesError) throw servicesError;

        const serviceIds = serviceRelations?.map(r => r.service_id) || [];
        
        let servicesData: ProfessionalService[] = [];
        if (serviceIds.length > 0) {
          const { data, error } = await supabase
            .from('services')
            .select(`
              id,
              name,
              description,
              price,
              duration_min,
              category_id,
              categories (
                name
              )
            `)
            .in('id', serviceIds)
            .eq('active', true);

          if (error) throw error;
          servicesData = data?.map(service => ({
            ...service,
            category: service.categories
          })) || [];
        }

        // Fetch classes
        const { data: classRelations, error: classesError } = await supabase
          .from('class_professionals')
          .select('class_id')
          .eq('professional_id', professionalId);

        if (classesError) throw classesError;

        const classIds = classRelations?.map(r => r.class_id) || [];
        
        let classesData: ProfessionalClass[] = [];
        if (classIds.length > 0) {
          const { data, error } = await supabase
            .from('classes')
            .select(`
              id,
              name,
              description,
              price,
              duration_min,
              capacity,
              category_id,
              categories (
                name
              )
            `)
            .in('id', classIds)
            .eq('active', true);

          if (error) throw error;
          classesData = data?.map(classItem => ({
            ...classItem,
            category: classItem.categories
          })) || [];
        }

        setServices(servicesData);
        setClasses(classesData);
      } catch (err) {
        console.error('Error fetching professional data:', err);
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchProfessionalData();
  }, [professionalId]);

  return { services, classes, loading, error };
}