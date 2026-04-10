import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAdminContext } from '@/hooks/useAdminBootstrap';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'reservasPro_activeOrgId';

interface ActiveOrganization {
  id: string;
  name: string;
  slug: string;
}

interface ActiveOrganizationContextType {
  activeOrg: ActiveOrganization | null;
  effectiveOrgId: string | null;
  isSuperadmin: boolean;
  isManagingOrg: boolean;
  setActiveOrgId: (id: string) => Promise<void>;
  clearActiveOrgId: () => void;
}

const ActiveOrganizationContext = createContext<ActiveOrganizationContextType | undefined>(undefined);

export function ActiveOrganizationProvider({ children }: { children: ReactNode }) {
  const admin = useAdminContext();
  const adminUser = admin.adminUser as any;

  const [activeOrg, setActiveOrg] = useState<ActiveOrganization | null>(null);

  const isSuperadmin = adminUser?.role === 'superadmin' && !adminUser?.organization_id;
  const adminOrgId = adminUser?.organization_id || null;

  // On mount: restore from localStorage (only for superadmins)
  useEffect(() => {
    if (!isSuperadmin) {
      setActiveOrg(null);
      return;
    }

    const savedId = localStorage.getItem(STORAGE_KEY);
    if (savedId) {
      loadOrg(savedId);
    }
  }, [isSuperadmin]);

  const loadOrg = async (orgId: string) => {
    const { data } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('id', orgId)
      .eq('active', true)
      .single();

    if (data) {
      setActiveOrg(data);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setActiveOrg(null);
    }
  };

  const setActiveOrgId = useCallback(async (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    await loadOrg(id);
  }, []);

  const clearActiveOrgId = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setActiveOrg(null);
  }, []);

  const effectiveOrgId = isSuperadmin ? (activeOrg?.id || null) : adminOrgId;
  const isManagingOrg = isSuperadmin && !!activeOrg;

  return (
    <ActiveOrganizationContext.Provider value={{
      activeOrg,
      effectiveOrgId,
      isSuperadmin,
      isManagingOrg,
      setActiveOrgId,
      clearActiveOrgId,
    }}>
      {children}
    </ActiveOrganizationContext.Provider>
  );
}

export function useActiveOrganization() {
  const ctx = useContext(ActiveOrganizationContext);
  if (!ctx) {
    throw new Error('useActiveOrganization must be used within ActiveOrganizationProvider');
  }
  return ctx;
}
