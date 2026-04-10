import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BootstrapStatus = "loading" | "ready" | "no-session" | "no-access" | "error";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean | null;
  professional_id: string | null;
  allowed_sections: string[] | null;
  organization_id: string | null;
}

interface SettingsKV {
  disable_location_hours: boolean;
}

interface LocationHoursLite {
  timezone: string;
  business_hours: any[]; // lite, solo para defaults
}

interface AdminBootstrapState {
  status: BootstrapStatus;
  session: any | null;
  adminUser: AdminUser | null;
  settings: SettingsKV;
  locationHours: LocationHoursLite;
  errorMessage: string | null;
  errors: string[];
  retry: () => Promise<void>;
}

const DEFAULT_SETTINGS: SettingsKV = { disable_location_hours: true };
const DEFAULT_LOCATION_HOURS: LocationHoursLite = { timezone: "Europe/Madrid", business_hours: [] };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  return new Promise<T>((resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      const err = new Error(`${label}: timeout after ${ms}ms`);
      (err as any).code = "TIMEOUT";
      reject(err);
    }, ms);
    promise
      .then((v) => resolve(v))
      .catch((e) => reject(e))
      .finally(() => clearTimeout(timeoutId));
  });
}

export function useAdminBootstrap(): AdminBootstrapState {
  const [status, setStatus] = useState<BootstrapStatus>("loading");
  const [session, setSession] = useState<any | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [settings, setSettings] = useState<SettingsKV>(DEFAULT_SETTINGS);
  const [locationHours, setLocationHours] = useState<LocationHoursLite>(DEFAULT_LOCATION_HOURS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const errorsRef = useRef<string[]>([]);

  const log = (msg: string, data?: any) => {
    if (import.meta.env.DEV) console.debug(`[Bootstrap] ${msg}`, data ?? "");
  };

  const fetchAdminUser = useCallback(async (email: string): Promise<AdminUser | null> => {
    // Query por email (la tabla no tiene auth_user_id en el schema actual)
    const { data, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("email", email)
      .eq("active", true)
      .maybeSingle();

    if (error) throw error;
    return data as unknown as AdminUser | null;
  }, []);

  const loadCore = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);
    errorsRef.current = [];
    log("start: loading core (session + admin)");

    try {
      const { data: sessionRes, error: sessionError } = await withTimeout(
        supabase.auth.getSession(),
        3000,
        "getSession"
      );

      if (sessionError) {
        errorsRef.current.push(`Session: ${sessionError.message}`);
        setStatus("error");
        setErrorMessage(sessionError.message);
        log("session error", sessionError);
        return;
      }

      const currentSession = sessionRes.session;
      const hasSession = !!currentSession?.user;
      log("session ok?", { hasSession });
      setSession(currentSession);

      if (!hasSession) {
        setStatus("no-session");
        log("no-session");
        return;
      }

      try {
        const admin = await withTimeout(
          fetchAdminUser(currentSession.user.email as string),
          3000,
          "fetchAdminUser"
        );
        const hasAdmin = !!admin;
        log("admin ok?", { hasAdmin, adminRole: admin?.role });

        if (!hasAdmin) {
          setStatus("no-access");
          return;
        }

        setAdminUser(admin);
        setStatus("ready");
        log("ready (core)");
      } catch (e: any) {
        const msg = e?.message || "No se pudieron cargar permisos";
        errorsRef.current.push(`AdminUser: ${msg}`);
        // Si es fallo de permisos o timeout, consideramos no-access
        if (e?.code === "TIMEOUT") {
          log("admin timeout, marcando no-access", e);
        } else {
          log("admin error", e);
        }
        setStatus("no-access");
        setErrorMessage(msg);
      }
    } catch (e: any) {
      const msg = e?.message || "Error inesperado";
      errorsRef.current.push(`Bootstrap: ${msg}`);
      setStatus("error");
      setErrorMessage(msg);
      log("fatal error", e);
    }
  }, [fetchAdminUser]);

  // Carga diferida de settings y horarios cuando el core está listo
  useEffect(() => {
    if (status !== "ready") return;

    const loadDeferred = async () => {
      log("deferred: loading settings + locationHours");

      let localSettings: SettingsKV = DEFAULT_SETTINGS;

      // Settings KV
      try {
        const res = await withTimeout(
          (supabase
            .from("settings")
            .select("value")
            .eq("key", "disable_location_hours")
            .maybeSingle() as unknown as Promise<any>),
          3000,
          "settingsKV"
        );
        const { data, error } = res as { data: any; error: any };
        if (error) throw error;
        const disabled = (data?.value as any)?.enabled ?? true;
        localSettings = { disable_location_hours: !!disabled };
        setSettings(localSettings);
        if (import.meta.env.DEV) console.debug("[Settings] ok", localSettings);
      } catch (e: any) {
        localSettings = DEFAULT_SETTINGS;
        setSettings(DEFAULT_SETTINGS);
        if (import.meta.env.DEV) console.debug("[Settings] defaults", e?.message || e);
      }

      // LocationHours (lite) -> defaults siempre si desactivado o fallo
      try {
        if (localSettings.disable_location_hours) {
          setLocationHours(DEFAULT_LOCATION_HOURS);
          if (import.meta.env.DEV) console.debug("[LocationHours] defaults (feature disabled)");
          return;
        }
        // Si en algún momento la feature se activa, aquí podríamos consultar;
        // ahora devolvemos defaults seguros para no bloquear
        setLocationHours(DEFAULT_LOCATION_HOURS);
        if (import.meta.env.DEV) console.debug("[LocationHours] defaults (no query)");
      } catch (e: any) {
        setLocationHours(DEFAULT_LOCATION_HOURS);
        if (import.meta.env.DEV) console.debug("[LocationHours] defaults (error)", e?.message || e);
      }
    };

    // Fire and forget
    loadDeferred();
  }, [status]);

  // Bootstrap inicial + suscripción a cambios de auth para mantener coherencia
  useEffect(() => {
    let mounted = true;
    loadCore();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (import.meta.env.DEV) console.debug("[Bootstrap] auth event:", event);
      setSession(newSession);
      // Sólo re-ejecutamos core en eventos relevantes
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        loadCore();
      }
      if (event === "SIGNED_OUT") {
        setStatus("no-session");
        setAdminUser(null);
        setSettings(DEFAULT_SETTINGS);
        setLocationHours(DEFAULT_LOCATION_HOURS);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadCore]);

  const retry = useCallback(async () => {
    try {
      await supabase.auth.refreshSession();
    } catch {
      // ignore
    }
    // Aquí podríamos limpiar caches (react-query) si existieran
    await loadCore();
  }, [loadCore]);

  return useMemo(() => ({
    status,
    session,
    adminUser,
    settings,
    locationHours,
    errorMessage,
    errors: errorsRef.current,
    retry,
  }), [status, session, adminUser, settings, locationHours, errorMessage, retry]);
}

// Contexto para compartir un único bootstrap en la zona admin
export const AdminBootstrapContext = createContext<AdminBootstrapState | null>(null);

export function AdminBootstrapProvider({ children }: { children: ReactNode }) {
  const value = useAdminBootstrap();
  return (
    <AdminBootstrapContext.Provider value={value}>
      {children}
    </AdminBootstrapContext.Provider>
  );
}

export function useAdminContext(): AdminBootstrapState {
  const ctx = useContext(AdminBootstrapContext);
  if (!ctx) {
    throw new Error("useAdminContext must be used within AdminBootstrapProvider");
  }
  return ctx;
}

