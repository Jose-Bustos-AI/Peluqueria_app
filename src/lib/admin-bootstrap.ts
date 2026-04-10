import { supabase } from "@/integrations/supabase/client";

export interface AdminContext {
  session: any;
  adminUser: any;
  settings: Record<string, any>;
  locationHours: {
    timezone: string;
    disabled: boolean;
  };
  isReady: boolean;
  errors: string[];
}

// Helper para JSON seguro
function safeJson<T>(str: string | null): T | null {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Fetch session con manejo de errores
async function fetchSession() {
  if (import.meta.env.DEV) console.log('[Bootstrap] Fetching session...');
  const { data, error } = await supabase.auth.getSession();
  if (import.meta.env.DEV) console.log('[Bootstrap] Session result:', { hasSession: !!data.session, error });
  return { data: data.session, error };
}

// Fetch admin user por session
async function fetchAdminUser(session: any) {
  if (!session?.user) {
    throw new Error('No session user');
  }

  if (import.meta.env.DEV) console.log('[Bootstrap] Fetching admin user for:', session.user.email);
  
  // Primero intentar por auth_user_id si existe
  let result = await (supabase as any)
    .from('admin_users')
    .select('*')
    .eq('auth_user_id', session.user.id)
    .eq('active', true)
    .maybeSingle();

  // Fallback por email
  if (!result.data && !result.error) {
    result = await (supabase as any)
      .from('admin_users')
      .select('*')
      .eq('email', session.user.email)
      .eq('active', true)
      .maybeSingle();
  }

  if (import.meta.env.DEV) console.log('[Bootstrap] Admin user result:', { hasUser: !!result.data, error: result.error });

  // Auto-provision superadmin si no existe
  if (!result.data && session.user.email === 'plenosaludyrendimiento@gmail.com') {
    if (import.meta.env.DEV) console.log('[Bootstrap] Auto-provisioning superadmin...');
    await supabase.functions.invoke('seed-superadmin');
    
    result = await (supabase as any)
      .from('admin_users')
      .select('*')
      .eq('email', session.user.email)
      .eq('active', true)
      .maybeSingle();
  }

  if (result.error) throw result.error;
  if (!result.data) throw new Error('Admin user not found or inactive');
  
  return result.data;
}

// Fetch settings con defaults
async function fetchSettings() {
  if (import.meta.env.DEV) console.log('[Bootstrap] Fetching settings...');
  
  const { data, error } = await supabase
    .from('settings')
    .select('key, value');

  if (import.meta.env.DEV) console.log('[Bootstrap] Settings result:', { count: data?.length, error });

  if (error) {
    console.error('[Bootstrap] Settings error:', error);
    return { disable_location_hours: true }; // Default seguro
  }

  // Convertir a objeto key-value
  const settings: Record<string, any> = {};
  data?.forEach(row => {
    settings[row.key] = row.value;
  });

  // Asegurar defaults
  if (!settings.disable_location_hours) {
    settings.disable_location_hours = true;
  }

  return settings;
}

// Fetch location hours con defaults seguros
async function fetchLocationHoursSafe() {
  if (import.meta.env.DEV) console.log('[Bootstrap] Fetching location hours (safe)...');
  
  try {
    // Leer flag
    const { data: flagData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'disable_location_hours')
      .maybeSingle();

    const disabled = (flagData?.value as any)?.enabled ?? true;
    if (import.meta.env.DEV) console.log('[Bootstrap] LocationHours disabled:', disabled);

    return {
      timezone: 'Europe/Madrid',
      disabled: !!disabled
    };
  } catch (error) {
    console.error('[Bootstrap] LocationHours error:', error);
    return {
      timezone: 'Europe/Madrid', 
      disabled: true // Default seguro
    };
  }
}

// Bootstrap principal con Promise.allSettled
export async function loadAdminContext(): Promise<AdminContext> {
  if (import.meta.env.DEV) console.log('[Bootstrap] Starting admin context load...');

  const [sessionRes, settingsRes, locationHoursRes] = await Promise.allSettled([
    fetchSession(),
    fetchSettings(),
    fetchLocationHoursSafe()
  ]);

  const errors: string[] = [];
  let session = null;
  let adminUser = null;
  let settings: Record<string, any> = { disable_location_hours: true };
  let locationHours = { timezone: 'Europe/Madrid', disabled: true };

  // Procesar session
  if (sessionRes.status === 'fulfilled' && !sessionRes.value.error) {
    session = sessionRes.value.data;
  } else {
    const error = sessionRes.status === 'rejected' ? sessionRes.reason : sessionRes.value.error;
    errors.push(`Session: ${error?.message || 'Unknown error'}`);
    if (import.meta.env.DEV) console.error('[Bootstrap] Session failed:', error);
  }

  // Procesar settings
  if (settingsRes.status === 'fulfilled') {
    settings = { disable_location_hours: true, ...(settingsRes.value || {}) };
  } else {
    errors.push(`Settings: ${settingsRes.reason?.message || 'Failed to load'}`);
    if (import.meta.env.DEV) console.error('[Bootstrap] Settings failed:', settingsRes.reason);
  }

  // Procesar location hours
  if (locationHoursRes.status === 'fulfilled') {
    locationHours = locationHoursRes.value;
  } else {
    errors.push(`LocationHours: ${locationHoursRes.reason?.message || 'Failed to load'}`);
    if (import.meta.env.DEV) console.error('[Bootstrap] LocationHours failed:', locationHoursRes.reason);
  }

  // Procesar admin user solo si hay session
  if (session) {
    try {
      adminUser = await fetchAdminUser(session);
    } catch (error: any) {
      errors.push(`AdminUser: ${error.message || 'Failed to load'}`);
      if (import.meta.env.DEV) console.error('[Bootstrap] AdminUser failed:', error);
    }
  }

  const context: AdminContext = {
    session,
    adminUser,
    settings,
    locationHours,
    isReady: true,
    errors
  };

  if (import.meta.env.DEV) {
    console.log('[Bootstrap] Context loaded:', {
      hasSession: !!session,
      hasAdminUser: !!adminUser,
      settingsCount: Object.keys(settings).length,
      locationHoursDisabled: locationHours.disabled,
      errorsCount: errors.length,
      errors
    });
  }

  return context;
}