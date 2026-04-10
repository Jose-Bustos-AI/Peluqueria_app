import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const email = "plenosaludyrendimiento@gmail.com";
    const defaultPassword = "@Plenosalud1"; // not logged, only used server-side
    const password = Deno.env.get("SUPERADMIN_PASSWORD") || defaultPassword;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find user by email
    let targetUser: any = null;
    let page = 1;
    const perPage = 200;

    while (!targetUser) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      targetUser = data.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase()) || null;
      if (data.users.length < perPage) break; // no more pages
      page++;
    }

    if (!targetUser) {
      // Create confirmed user
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: 'superadmin' },
        user_metadata: { name: 'Super Administrador' },
      });
      if (error) throw error;
      targetUser = data.user;
    } else {
      // Ensure password and confirmation
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
        password,
        email_confirm: true,
        app_metadata: { role: 'superadmin' },
      });
      if (updErr) throw updErr;
    }

    // Ensure admin_users row exists with full permissions
    const allowed_sections = [
      'dashboard','calendar','bookings','users','locations','categories','services','classes','professionals','vouchers','subscriptions','payments','reports','notifications','settings','audit','roles'
    ];

    const { error: upsertErr } = await supabaseAdmin.from('admin_users').upsert({
      email,
      name: 'Super Administrador',
      role: 'superadmin',
      active: true,
      allowed_sections,
    }, { onConflict: 'email' });
    if (upsertErr) throw upsertErr;

    // Audit
    await supabaseAdmin.from('audit_logs').insert({
      action: 'admin.superadmin.provisioned',
      entity_type: 'admin_user',
      entity_id: email,
      actor: 'system',
      data: { method: 'edge_function' }
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('seed-superadmin error', error);
    const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error')
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
