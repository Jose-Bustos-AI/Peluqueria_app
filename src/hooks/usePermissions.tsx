import { createContext, useContext, ReactNode, useMemo } from "react";
import { useAdminContext } from "@/hooks/useAdminBootstrap";

// Section definitions - must match Roles component
export const AVAILABLE_SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "calendar", label: "Calendario" },
  { key: "bookings", label: "Reservas" },
  { key: "users", label: "Usuarios" },
  { key: "locations", label: "Ubicaciones" },
  { key: "categories", label: "Categorías" },
  { key: "services", label: "Servicios" },
  { key: "classes", label: "Clases" },
  { key: "professionals", label: "Profesionales" },
  { key: "vouchers", label: "Bonos" },
  { key: "subscriptions", label: "Suscripciones" },
  { key: "payments", label: "Pagos" },
  { key: "reports", label: "Informes" },
  { key: "notifications", label: "Notificaciones & Webhooks" },
  { key: "settings", label: "Ajustes" },
  { key: "audit", label: "Histórico/Auditoría" },
  { key: "roles", label: "Accesos/Roles" },
  { key: "organizations", label: "Organizaciones" },
] as const;

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean | null;
  professional_id: string | null;
  allowed_sections: string[] | null;
}

interface PermissionsContextType {
  currentUser: AdminUser | null;
  allowedSections: string[];
  hasPermission: (section: string) => boolean;
  isLoading: boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

interface PermissionsProviderProps { children: ReactNode }

// Selector del AdminBootstrapContext: no hace fetch propio
export function PermissionsProvider({ children }: PermissionsProviderProps) {
  const admin = useAdminContext();

  const value: PermissionsContextType = useMemo(() => {
    const currentUser = admin.adminUser as AdminUser | null;
    const allowedSections = currentUser?.allowed_sections || [];

    const hasPermission = (section: string): boolean => {
      if (currentUser?.role === "superadmin") return true;
      return allowedSections.includes(section);
    };

    const isLoading = admin.status !== "ready"; // sólo listo cuando el core está listo

    const refreshPermissions = async () => {
      await admin.retry();
    };

    return {
      currentUser,
      allowedSections,
      hasPermission,
      isLoading,
      refreshPermissions,
    };
  }, [admin.status, admin.adminUser, admin.retry]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
}

// Helper to determine if bookings should be filtered by professional
export function shouldFilterByProfessional(currentUser: AdminUser | null): string | null {
  if (!currentUser) return null;
  if (currentUser.role === 'superadmin') return null;
  return currentUser.professional_id || null;
}
