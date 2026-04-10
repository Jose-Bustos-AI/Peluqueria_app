import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface AccessDeniedProps {
  section?: string;
}

export function AccessDenied({ section }: AccessDeniedProps) {
  const navigate = useNavigate();
  const { currentUser } = usePermissions();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Acceso Denegado</h1>
          <p className="text-lg text-gray-600">
            No tienes permisos para acceder a {section ? `la sección "${section}"` : "esta página"}.
          </p>
          {currentUser && (
            <p className="text-sm text-gray-500">
              Usuario: {currentUser.name} ({currentUser.role})
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <Button
          onClick={() => navigate("/admin")}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al Dashboard
        </Button>
        
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
        >
          Página Anterior
        </Button>

        <Button
          variant="destructive"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate('/login');
          }}
        >
          Salir
        </Button>
      </div>
    </div>
  );
}