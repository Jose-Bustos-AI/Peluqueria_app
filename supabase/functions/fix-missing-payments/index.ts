import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BookingWithService {
  id: string;
  payment_method: string;
  payment_status: string;
  status: string;
  service?: {
    price: number;
    currency: string;
  };
  class?: {
    price: number;
    currency: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get all confirmed bookings with cash payment method that don't have payment records
    const { data: bookingsData, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        payment_method,
        payment_status,
        status,
        service:services(price, currency),
        class:classes(price, currency)
      `)
      .eq('payment_method', 'cash')
      .eq('payment_status', 'paid')
      .in('status', ['confirmed', 'completed']);

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      throw bookingsError;
    }

    if (!bookingsData || bookingsData.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No cash bookings found that need payment records',
          created: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Get existing payment records to avoid duplicates
    const bookingIds = bookingsData.map(b => b.id);
    const { data: existingPayments, error: paymentsError } = await supabase
      .from('payments')
      .select('booking_id')
      .in('booking_id', bookingIds);

    if (paymentsError) {
      console.error('Error fetching existing payments:', paymentsError);
      throw paymentsError;
    }

    const existingPaymentBookingIds = new Set(
      existingPayments?.map(p => p.booking_id) || []
    );

    // Filter bookings that don't have payment records and fix array relationships
    const bookingsNeedingPayments = bookingsData.filter(
      booking => !existingPaymentBookingIds.has(booking.id)
    ).map(booking => ({
      ...booking,
      service: Array.isArray(booking.service) ? booking.service[0] : booking.service,
      class: Array.isArray(booking.class) ? booking.class[0] : booking.class
    })) as BookingWithService[];

    if (bookingsNeedingPayments.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'All cash bookings already have payment records',
          created: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Create payment records
    const paymentRecords = bookingsNeedingPayments.map(booking => {
      const amount = booking.service?.price || booking.class?.price || 0;
      const currency = booking.service?.currency || booking.class?.currency || 'EUR';

      return {
        booking_id: booking.id,
        amount: amount,
        currency: currency.toLowerCase(),
        method: 'cash',
        status: 'succeeded'
      };
    });

    const { data: createdPayments, error: insertError } = await supabase
      .from('payments')
      .insert(paymentRecords)
      .select();

    if (insertError) {
      console.error('Error creating payment records:', insertError);
      throw insertError;
    }

    console.log(`Created ${createdPayments?.length || 0} payment records`);

    return new Response(
      JSON.stringify({ 
        message: 'Payment records created successfully',
        created: createdPayments?.length || 0,
        records: createdPayments
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in fix-missing-payments function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});