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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[CleanTestData] Starting cleanup...');

    // 1. Delete voucher redemptions (depends on vouchers and bookings)
    const { error: redemptionsError } = await supabase
      .from('voucher_redemptions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (redemptionsError) {
      console.error('[CleanTestData] Error deleting redemptions:', redemptionsError);
      throw redemptionsError;
    }
    console.log('[CleanTestData] Deleted voucher_redemptions');

    // 2. Delete payments (depends on bookings)
    const { error: paymentsError } = await supabase
      .from('payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (paymentsError) {
      console.error('[CleanTestData] Error deleting payments:', paymentsError);
      throw paymentsError;
    }
    console.log('[CleanTestData] Deleted payments');

    // 3. Delete refunds
    const { error: refundsError } = await supabase
      .from('refunds')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (refundsError) {
      console.error('[CleanTestData] Error deleting refunds:', refundsError);
      throw refundsError;
    }
    console.log('[CleanTestData] Deleted refunds');

    // 4. Delete bookings
    const { error: bookingsError } = await supabase
      .from('bookings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (bookingsError) {
      console.error('[CleanTestData] Error deleting bookings:', bookingsError);
      throw bookingsError;
    }
    console.log('[CleanTestData] Deleted bookings');

    // 5. Delete subscription invoices (depends on subscriptions)
    const { error: invoicesError } = await supabase
      .from('subscription_invoices')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (invoicesError) {
      console.error('[CleanTestData] Error deleting invoices:', invoicesError);
      throw invoicesError;
    }
    console.log('[CleanTestData] Deleted subscription_invoices');

    // 6. Delete subscriptions
    const { error: subscriptionsError } = await supabase
      .from('subscriptions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (subscriptionsError) {
      console.error('[CleanTestData] Error deleting subscriptions:', subscriptionsError);
      throw subscriptionsError;
    }
    console.log('[CleanTestData] Deleted subscriptions');

    // 7. Delete vouchers
    const { error: vouchersError } = await supabase
      .from('vouchers')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (vouchersError) {
      console.error('[CleanTestData] Error deleting vouchers:', vouchersError);
      throw vouchersError;
    }
    console.log('[CleanTestData] Deleted vouchers');

    // 8. Delete class_sessions
    const { error: classSessionsError } = await supabase
      .from('class_sessions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (classSessionsError) {
      console.error('[CleanTestData] Error deleting class_sessions:', classSessionsError);
      throw classSessionsError;
    }
    console.log('[CleanTestData] Deleted class_sessions');

    // Get final counts
    const { count: bookingsCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true });

    const { count: vouchersCount } = await supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true });

    const { count: subscriptionsCount } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true });

    const { count: redemptionsCount } = await supabase
      .from('voucher_redemptions')
      .select('*', { count: 'exact', head: true });

    const { count: paymentsCount } = await supabase
      .from('payments')
      .select('*', { count: 'exact', head: true });

    const { count: classSessionsCount } = await supabase
      .from('class_sessions')
      .select('*', { count: 'exact', head: true });

    console.log('[CleanTestData] Cleanup completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test data cleaned successfully',
        finalCounts: {
          bookings: bookingsCount || 0,
          vouchers: vouchersCount || 0,
          subscriptions: subscriptionsCount || 0,
          redemptions: redemptionsCount || 0,
          payments: paymentsCount || 0,
          class_sessions: classSessionsCount || 0,
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[CleanTestData] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
