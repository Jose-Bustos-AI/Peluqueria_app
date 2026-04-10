import { 
  Calendar,
  Users,
  MapPin,
  Building2,
  Tag, 
  Activity, 
  Dumbbell, 
  UserCheck, 
  Ticket, 
  CreditCard, 
  BarChart3, 
  Bell, 
  Settings, 
  History,
  Shield,
  LayoutDashboard
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePermissions } from "@/hooks/usePermissions";
import { useActiveOrganization } from "@/hooks/useActiveOrganization";

const menuItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, section: "dashboard" },
  { title: "Calendario", url: "/admin/calendar", icon: Calendar, section: "calendar" },
  { title: "Reservas", url: "/admin/bookings", icon: Calendar, section: "bookings" },
  { title: "Usuarios", url: "/admin/users", icon: Users, section: "users" },
  { title: "Informes", url: "/admin/reports", icon: BarChart3, section: "reports" },
];

const catalogItems = [
  { title: "Categorías", url: "/admin/categories", icon: Tag, section: "categories" },
  { title: "Servicios", url: "/admin/services", icon: Activity, section: "services" },
  { title: "Clases", url: "/admin/classes", icon: Dumbbell, section: "classes" },
  { title: "Bonos", url: "/admin/vouchers", icon: Ticket, section: "vouchers" },
  { title: "Suscripciones", url: "/admin/subscriptions", icon: CreditCard, section: "subscriptions" },
];

const systemItems = [
  { title: "Ubicaciones", url: "/admin/locations", icon: MapPin, section: "locations" },
  { title: "Profesionales", url: "/admin/professionals", icon: UserCheck, section: "professionals" },
  { title: "Organizaciones", url: "/admin/organizations", icon: Building2, section: "organizations" },
  { title: "Roles", url: "/admin/roles", icon: Shield, section: "roles" },
  { title: "Ajustes", url: "/admin/settings", icon: Settings, section: "settings" },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { hasPermission } = usePermissions();
  const { isSuperadmin, isManagingOrg, activeOrg } = useActiveOrganization();
  const collapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(path);
  };

  const getNavCls = (path: string) =>
    isActive(path) 
      ? "bg-primary/10 text-primary font-medium border-r-2 border-primary" 
      : "hover:bg-muted/50 text-muted-foreground hover:text-foreground";

  // Filter menu items based on permissions
  // Superadmin sin org activa: solo mostrar Organizaciones
  const superadminNoOrg = isSuperadmin && !isManagingOrg;
  const filteredMenuItems = superadminNoOrg ? [] : menuItems.filter(item => hasPermission(item.section));
  const filteredCatalogItems = superadminNoOrg ? [] : catalogItems.filter(item => hasPermission(item.section));
  const filteredSystemItems = systemItems.filter(item => {
    if (item.section === 'organizations') return isSuperadmin && !isManagingOrg;
    if (superadminNoOrg) return false;
    return hasPermission(item.section);
  });

  return (
    <Sidebar className={collapsed ? "w-14" : "w-64"} collapsible="icon">
      <SidebarContent className="bg-card border-r">
        {!collapsed && (
          <div className="border-b p-1" style={{ backgroundColor: '#232b56' }}>
            <img src="/pleno-logo-new.png" alt="Reservas Pro" className="w-full h-28 object-contain" />
          </div>
        )}
        
        <SidebarTrigger className="absolute -right-3 top-6 z-10 h-6 w-6 bg-primary text-primary-foreground hover:bg-primary-hover" />

        {!collapsed && isManagingOrg && activeOrg && (
          <div className="mx-2 mt-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20">
            <div className="text-xs text-muted-foreground">Gestionando</div>
            <div className="text-sm font-medium text-primary truncate">{activeOrg.name}</div>
          </div>
        )}

        {filteredMenuItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Principal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className={getNavCls(item.url)}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredCatalogItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Catálogo</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredCatalogItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className={getNavCls(item.url)}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredSystemItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Sistema</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredSystemItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className={getNavCls(item.url)}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}