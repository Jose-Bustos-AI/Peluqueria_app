import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAdminContext } from "@/hooks/useAdminBootstrap";

interface ProtectedAdminRouteProps {
  children: ReactNode;
}

export function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { status, session, adminUser, errorMessage, retry, errors } = useAdminContext();

  // Redirección si no hay sesión
  useEffect(() => {
    if (status === "no-session") {
      toast({
        title: "Sesión expirada",
        description: "Vuelve a iniciar sesión",
        variant: "destructive",
      });
      navigate("/login");
    }
  }, [status, navigate, toast]);

  const handleRetry = async () => {
    await retry();
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando panel...</p>
        </div>
      </div>
    );
  }

  if (status === "no-access") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <h2 className="text-2xl font-bold">Sin Acceso</h2>
        <p className="text-muted-foreground">No tienes permisos para acceder al panel de administración</p>
        <Button onClick={() => { supabase.auth.signOut(); navigate("/login"); }}>
          Cerrar Sesión
        </Button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <AlertTriangle className="h-12 w-12 text-yellow-500" />
        <h2 className="text-2xl font-bold">Error de Conexión</h2>
        <p className="text-muted-foreground">No se pudo cargar la información del panel</p>

        <Button onClick={handleRetry} className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>

        {errorMessage && (
          <div className="mt-2 text-xs text-muted-foreground max-w-md text-center">
            {navigator.onLine ? errorMessage : "Parece que no hay conexión. Inténtalo de nuevo."}
          </div>
        )}

        {errors && errors.length > 0 && (
          <div className="mt-4 p-3 bg-muted rounded-md text-sm text-muted-foreground max-w-md">
            <p className="font-medium mb-1">Detalles del error:</p>
            {errors.map((err, i) => (
              <p key={i} className="text-xs">• {err}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (status === "ready" && session && adminUser) {
    return <>{children}</>;
  }

  return null;
}
