import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the subscription ID for bustosalmeria@gmail.com
    const { data: subData, error: subError } = await supabase
      .from('subscriptions')
      .select('id, user_id, plan_id')
      .eq('status', 'active')
      .eq('user_id', (await supabase
        .from('users_shadow')
        .select('id')
        .eq('email', 'bustosalmeria@gmail.com')
        .single()
      ).data?.id)
      .maybeSingle();

    if (subError || !subData) {
      throw new Error('Subscription not found');
    }

    console.log('Found subscription:', subData);

    // Get all subscription bookings for this user without subscriptionId
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, notes')
      .eq('user_id', subData.user_id)
      .eq('origin', 'subscription');

    if (bookingsError) {
      throw bookingsError;
    }

    console.log(`Found ${bookings?.length || 0} subscription bookings`);

    // Update each booking with the correct subscriptionId
    const updates = [];
    for (const booking of bookings || []) {
      let notes;
      try {
        notes = JSON.parse(booking.notes);
      } catch {
        notes = { origin: 'subscription' };
      }

      // Update notes with correct subscriptionId
      notes.subscriptionId = subData.id;
      notes.planId = subData.plan_id;

      const { error: updateError } = await supabase
        .from('bookings')
        .update({ notes: JSON.stringify(notes) })
        .eq('id', booking.id);

      if (updateError) {
        console.error(`Error updating booking ${booking.id}:`, updateError);
      } else {
        updates.push(booking.id);
      }
    }

    // Update the subscription plan cap_per_cycle
    const { error: planError } = await supabase
      .from('subscription_plans')
      .update({ cap_per_cycle: 8 })
      .eq('name', 'Intermedio');

    if (planError) {
      console.error('Error updating plan:', planError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscriptionId: subData.id,
        updatedBookings: updates.length,
        planUpdated: !planError
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
