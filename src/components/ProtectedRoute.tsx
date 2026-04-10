import { ReactNode, useEffect } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
  section: string;
  children: ReactNode;
  fallback?: ReactNode;
}

// Mapping between sections and their routes
const SECTION_ROUTES: Record<string, string> = {
  dashboard: "/admin",
  calendar: "/admin/calendar",
  bookings: "/admin/bookings",
  users: "/admin/users",
  locations: "/admin/locations",
  categories: "/admin/categories",
  services: "/admin/services",
  classes: "/admin/classes",
  professionals: "/admin/professionals",
  vouchers: "/admin/vouchers",
  subscriptions: "/admin/subscriptions",
  payments: "/admin/payments",
  reports: "/admin/reports",
  notifications: "/admin/notifications",
  settings: "/admin/settings",
  audit: "/admin/audit",
  roles: "/admin/roles",
};

export function ProtectedRoute({ section, children, fallback }: ProtectedRouteProps) {
  const { hasPermission, isLoading, allowedSections } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !hasPermission(section)) {
      // Find the first allowed section and redirect there
      if (allowedSections.length > 0) {
        const firstAllowedSection = allowedSections[0];
        const targetRoute = SECTION_ROUTES[firstAllowedSection];
        
        if (targetRoute && location.pathname !== targetRoute) {
          console.log(`Redirecting to first allowed section: ${firstAllowedSection} -> ${targetRoute}`);
          navigate(targetRoute, { replace: true });
        }
      } else {
        // No permissions at all, logout
        console.log('No permissions found, logging out');
        navigate('/login', { replace: true });
      }
    }
  }, [isLoading, hasPermission, section, allowedSections, navigate, location.pathname]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasPermission(section)) {
    // Show loading while redirecting
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
}