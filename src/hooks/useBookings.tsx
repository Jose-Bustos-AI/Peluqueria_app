import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface BookingData {
  id: string;
  type: string;
  status: string;
  payment_method: string;
  payment_status: string;
  origin: string;
  start_at: string;
  end_at: string;
  notes?: string;
  user_id: string;
  created_at: string;
  service?: {
    id: string;
    name: string;
    price: number;
    duration_min: number;
    currency: string;
  };
  class?: {
    id: string;
    name: string;
    price: number;
    duration_min: number;
    currency: string;
  };
  professional: {
    id: string;
    name: string;
    email?: string;
    color?: string;
  };
  location: {
    id: string;
    name: string;
    address?: string;
  };
  customer: {
    id: string;
    name: string;
    email: string;
  };
}

export const useBookings = (professionalIdFilter?: string | null) => {
  return useQuery({
    queryKey: ['bookings', professionalIdFilter],
    queryFn: async (): Promise<BookingData[]> => {
      let query = supabase
        .from('bookings')
        .select(`
          id,
          type,
          status,
          payment_method,
          payment_status,
          origin,
          start_at,
          end_at,
          notes,
          user_id,
          created_at,
          service:services(
            id,
            name,
            price,
            duration_min,
            currency
          ),
          class:classes(
            id,
            name,
            price,
            duration_min,
            currency
          ),
          professional:professionals(
            id,
            name,
            email,
            color
          ),
          location:locations(
            id,
            name,
            address
          ),
          customer:users_shadow(
            id,
            name,
            email
          )
        `)
        .order('start_at', { ascending: false });

      // Apply professional filter if provided
      if (professionalIdFilter) {
        query = query.eq('professional_id', professionalIdFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching bookings:', error);
        throw error;
      }

      return data as BookingData[];
    },
    refetchOnWindowFocus: false,
  });
};

export const getBookingDisplayData = (booking: BookingData) => {
  const serviceName = booking.service?.name || booking.class?.name || 'Reserva';
  const price = booking.service?.price || booking.class?.price || 0;
  const duration = booking.service?.duration_min || booking.class?.duration_min || 0;
  const currency = booking.service?.currency || booking.class?.currency || 'EUR';

  const startDate = new Date(booking.start_at);
  const endDate = new Date(booking.end_at);

  return {
    id: booking.id,
    service: serviceName,
    customer: booking.customer?.name || 'Cliente',
    customerEmail: booking.customer?.email || '',
    professional: booking.professional?.name || 'Profesional',
    professionalId: booking.professional?.id || null,
    date: format(startDate, 'yyyy-MM-dd'),
    time: format(startDate, 'HH:mm'),
    duration: `${duration} min`,
    location: booking.location?.name || 'Ubicación',
    status: booking.status || 'pending',
    paymentMethod: booking.payment_method || 'none',
    paymentStatus: booking.payment_status || 'unpaid',
    amount: price,
    currency,
    type: booking.type,
    origin: booking.origin,
    notes: booking.notes,
    startAt: booking.start_at,
    endAt: booking.end_at,
    createdAt: booking.created_at,
    isSubscription: booking.origin === 'subscription'
  };
};