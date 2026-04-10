import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { PermissionsProvider } from "@/hooks/usePermissions";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ProtectedAdminRoute } from "@/components/ProtectedAdminRoute";
import { AuthProvider } from "@/hooks/useAuth";
import { AdminBootstrapProvider } from "@/hooks/useAdminBootstrap";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/admin/Dashboard";
import Bookings from "./pages/admin/Bookings";
import Users from "./pages/admin/Users";
import Locations from "./pages/admin/Locations";
import Categories from "./pages/admin/Categories";
import Services from "./pages/admin/Services";
import Classes from "./pages/admin/Classes";
import Professionals from "./pages/admin/Professionals";
import Widget from "./pages/widget/Widget";
import { Vouchers } from "./pages/admin/Vouchers";
import { Subscriptions } from "./pages/admin/Subscriptions";
import { Reports } from "./pages/admin/Reports";
import { Roles } from "./pages/admin/Roles";
import Calendar from "./pages/admin/Calendar";
import Settings from "./pages/admin/Settings";
import Organizations from "./pages/admin/Organizations";
import { ActiveOrganizationProvider } from "./hooks/useActiveOrganization";

const queryClient = new QueryClient();

const App = () => {
  console.log('App: Initializing, React available?', !!React);
  
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/widget" element={<Widget />} />
              <Route path="/suscripciones/:planId" element={<Widget />} />
              <Route path="/suscripciones/:planId/verificar" element={<Widget />} />
            
              {/* Admin Routes with Authentication and Role Protection */}
              <Route path="/admin/*" element={
                <AdminBootstrapProvider>
                  <PermissionsProvider>
                    <ProtectedAdminRoute>
                      <ActiveOrganizationProvider>
                      <AdminLayout>
                        <Routes>
                      <Route index element={
                        <ProtectedRoute section="dashboard">
                          <Dashboard />
                        </ProtectedRoute>
                      } />
                      <Route path="/calendar" element={
                        <ProtectedRoute section="calendar">
                          <Calendar />
                        </ProtectedRoute>
                      } />
                      <Route path="/bookings" element={
                        <ProtectedRoute section="bookings">
                          <Bookings />
                        </ProtectedRoute>
                      } />
                      <Route path="/users" element={
                        <ProtectedRoute section="users">
                          <Users />
                        </ProtectedRoute>
                      } />
                      <Route path="/locations" element={
                        <ProtectedRoute section="locations">
                          <Locations />
                        </ProtectedRoute>
                      } />
                      <Route path="/categories" element={
                        <ProtectedRoute section="categories">
                          <Categories />
                        </ProtectedRoute>
                      } />
                      <Route path="/services" element={
                        <ProtectedRoute section="services">
                          <Services />
                        </ProtectedRoute>
                      } />
                      <Route path="/classes" element={
                        <ProtectedRoute section="classes">
                          <Classes />
                        </ProtectedRoute>
                      } />
                      <Route path="/professionals" element={
                        <ProtectedRoute section="professionals">
                          <Professionals />
                        </ProtectedRoute>
                      } />
                      <Route path="/vouchers" element={
                        <ProtectedRoute section="vouchers">
                          <Vouchers />
                        </ProtectedRoute>
                      } />
                      <Route path="/subscriptions" element={
                        <ProtectedRoute section="subscriptions">
                          <Subscriptions />
                        </ProtectedRoute>
                      } />
                      <Route path="/payments" element={
                        <ProtectedRoute section="payments">
                          <div>Pagos - Próximamente</div>
                        </ProtectedRoute>
                      } />
                      <Route path="/reports" element={
                        <ProtectedRoute section="reports">
                          <Reports />
                        </ProtectedRoute>
                      } />
                      <Route path="/notifications" element={
                        <ProtectedRoute section="notifications">
                          <div>Notificaciones - Próximamente</div>
                        </ProtectedRoute>
                      } />
                      <Route path="/settings" element={
                        <ProtectedRoute section="settings">
                          <Settings />
                        </ProtectedRoute>
                      } />
                      <Route path="/audit" element={
                        <ProtectedRoute section="audit">
                          <div>Auditoría - Próximamente</div>
                        </ProtectedRoute>
                      } />
                      <Route path="/roles" element={
                        <ProtectedRoute section="roles">
                          <Roles />
                        </ProtectedRoute>
                      } />
                      <Route path="/organizations" element={
                        <ProtectedRoute section="organizations">
                          <Organizations />
                        </ProtectedRoute>
                      } />
                        </Routes>
                      </AdminLayout>
                      </ActiveOrganizationProvider>
                    </ProtectedAdminRoute>
                  </PermissionsProvider>
                </AdminBootstrapProvider>
              } />
            
            {/* Catch-all route */}
            <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
