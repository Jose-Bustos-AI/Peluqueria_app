import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Shield, Users, AlertTriangle, Eye, EyeOff, Key, UserX, Copy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { ColumnDef } from "@tanstack/react-table";

// Section definitions - source of truth for permissions
const AVAILABLE_SECTIONS = [
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
] as const;

// Types
interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  professional_id: string | null;
  allowed_sections: string[] | null;
  created_at: string;
  updated_at: string;
  professionals?: {
    name: string;
  } | null;
}

interface Professional {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  type: 'admin' | 'professional';
  role?: string;
  active: boolean;
  professional_id?: string | null;
  allowed_sections?: string[] | null;
  created_at?: string;
  updated_at?: string;
  phone?: string | null;
  hasAdminAccess: boolean;
}

interface RoleTemplate {
  id: string;
  name: string;
  description: string | null;
  allowed_sections: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Schemas
const roleTemplateSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().nullable().optional(),
  allowed_sections: z.array(z.string()).min(1, "Debe seleccionar al menos una sección"),
  active: z.boolean().default(true),
});

const userPermissionsSchema = z.object({
  allowed_sections: z.array(z.string()).min(1, "Debe seleccionar al menos una sección"),
});

const createAdminUserSchema = z.object({
  professional_id: z.string().min(1, "El profesional es requerido"),
  email: z.string().email("Email válido requerido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  role: z.enum(["manager", "employee"]).default("employee"),
  allowed_sections: z.array(z.string()).min(1, "Debe seleccionar al menos una sección"),
  active: z.boolean().default(true),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

export function Roles() {
  const [activeTab, setActiveTab] = useState("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [showCreateAdminDialog, setShowCreateAdminDialog] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<RoleTemplate | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch admin users
  const { data: adminUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_users")
        .select(`
          *,
          professionals(name)
        `)
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as AdminUser[];
    },
  });

  // Fetch all professionals
  const { data: professionals = [], isLoading: loadingProfessionals } = useQuery({
    queryKey: ["professionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as Professional[];
    },
  });

  // Combine admin users and professionals into a unified list
  const allUsers: UserRow[] = [
    // Existing admin users
    ...adminUsers.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      type: 'admin' as const,
      role: user.role,
      active: user.active,
      professional_id: user.professional_id,
      allowed_sections: user.allowed_sections,
      created_at: user.created_at,
      updated_at: user.updated_at,
      hasAdminAccess: true,
    })),
    // Professionals without admin access
    ...professionals
      .filter(prof => !adminUsers.find(admin => admin.professional_id === prof.id))
      .map(prof => ({
        id: prof.id,
        name: prof.name,
        email: prof.email || 'Sin email',
        type: 'professional' as const,
        active: prof.active,
        phone: prof.phone,
        hasAdminAccess: false,
      }))
  ];

  // Fetch role templates
  const { data: roleTemplates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["role-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_templates")
        .select("*")
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as RoleTemplate[];
    },
  });

  // Template form
  const templateForm = useForm<z.infer<typeof roleTemplateSchema>>({
    resolver: zodResolver(roleTemplateSchema),
    defaultValues: {
      name: "",
      description: "",
      allowed_sections: [],
      active: true,
    },
  });

  // User permissions form
  const permissionsForm = useForm<z.infer<typeof userPermissionsSchema>>({
    resolver: zodResolver(userPermissionsSchema),
    defaultValues: {
      allowed_sections: [],
    },
  });

  // Create admin user form
  const createAdminForm = useForm<z.infer<typeof createAdminUserSchema>>({
    resolver: zodResolver(createAdminUserSchema),
    defaultValues: {
      email: "",
      password: "",
      role: "employee",
      allowed_sections: [],
      active: true,
    },
  });

  // Change password form
  const changePasswordForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Generate secure password
  const generateSecurePassword = () => {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    changePasswordForm.setValue("newPassword", password);
    changePasswordForm.setValue("confirmPassword", password);
    setShowNewPassword(true);
    setShowConfirmPassword(true);
    toast({
      title: "Contraseña generada",
      description: "Contraseña segura creada automáticamente",
    });
  };

  // Template mutations
  const templateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof roleTemplateSchema>) => {
      if (editingTemplate) {
        const { error } = await supabase
          .from("role_templates")
          .update(data)
          .eq("id", editingTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("role_templates")
          .insert(data as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-templates"] });
      setShowTemplateDialog(false);
      setEditingTemplate(null);
      templateForm.reset();
      toast({
        title: "Éxito",
        description: editingTemplate ? "Plantilla actualizada" : "Plantilla creada",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar la plantilla",
      });
      console.error(error);
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("role_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-templates"] });
      toast({
        title: "Éxito",
        description: "Plantilla eliminada",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la plantilla",
      });
    },
  });

  // Create admin user mutation
  const createAdminUserMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createAdminUserSchema>) => {
      const professional = professionals.find(p => p.id === data.professional_id);
      if (!professional) throw new Error("Profesional no encontrado");

      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("No hay sesión activa");

      const response = await supabase.functions.invoke('create-admin-user', {
        body: {
          email: data.email,
          password: data.password,
          professional_id: data.professional_id,
          role: data.role,
          allowed_sections: data.allowed_sections,
          active: data.active,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Error al crear el usuario');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setShowCreateAdminDialog(false);
      createAdminForm.reset();
      toast({
        title: "Éxito",
        description: "Acceso creado correctamente",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo crear el acceso",
      });
      console.error(error);
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async ({ userEmail, newPassword }: { userEmail: string; newPassword: string }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("No hay sesión activa");

      const response = await supabase.functions.invoke('change-user-password', {
        body: {
          target_email: userEmail,
          new_password: newPassword,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Error al cambiar la contraseña');
      }
      
      return { password: newPassword };
    },
    onSuccess: ({ password }) => {
      setSavedPassword(password);
      changePasswordForm.reset();
      toast({
        title: "Éxito",
        description: "Contraseña actualizada. Copia la contraseña ahora.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo cambiar la contraseña",
      });
    },
  });

  // Deactivate user mutation
  const deactivateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("admin_users")
        .update({ active: false })
        .eq("id", userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Éxito",
        description: "Usuario desactivado",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo desactivar el usuario",
      });
    },
  });

  // Update user permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ userId, sections }: { userId: string; sections: string[] }) => {
      // Check for self-protection
      const user = adminUsers.find(u => u.id === userId);
      if (user?.role === "superadmin" && (!sections.includes("roles") || !sections.includes("settings"))) {
        throw new Error("No se puede quitar acceso a Roles o Ajustes del Superadmin");
      }

      const { error } = await supabase
        .from("admin_users")
        .update({ allowed_sections: sections })
        .eq("id", userId);
      
      if (error) throw error;

      // Log the change
      await supabase
        .from("audit_logs")
        .insert({
          entity_type: "admin_user",
          entity_id: userId,
          action: "role.update",
          actor: "current_user", // This would be the logged in user
          data: { 
            old_sections: user?.allowed_sections || [],
            new_sections: sections 
          }
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setShowPermissionsDialog(false);
      setEditingUser(null);
      toast({
        title: "Éxito",
        description: "Permisos actualizados",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudieron actualizar los permisos",
      });
    },
  });

  // Filter users
  const filteredUsers = allUsers.filter((user) => {
    const searchMatch = searchQuery === "" || 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    return searchMatch;
  });

  // Apply template to user permissions
  const applyTemplate = (templateId: string) => {
    const template = roleTemplates.find(t => t.id === templateId);
    if (template) {
      permissionsForm.setValue("allowed_sections", template.allowed_sections);
      setSelectedTemplate(templateId);
    }
  };

  // User columns
  const userColumns: ColumnDef<UserRow>[] = [
    {
      accessorKey: "name",
      header: "Usuario",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.getValue("name")}</div>
          <div className="text-sm text-muted-foreground">{row.original.email}</div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={row.original.type === 'admin' ? "default" : "outline"} className="text-xs">
              {row.original.type === 'admin' ? 'Admin' : 'Profesional'}
            </Badge>
            {row.original.hasAdminAccess && (
              <Badge variant="secondary" className="text-xs">
                Acceso Panel
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Rol",
      cell: ({ row }) => {
        if (!row.original.hasAdminAccess) {
          return <span className="text-muted-foreground text-sm">Sin acceso</span>;
        }
        return (
          <Badge variant={row.original.role === "superadmin" ? "default" : "secondary"}>
            {row.original.role === "superadmin" ? "Superadmin" : 
             row.original.role === "manager" ? "Gerente" : 
             row.original.role === "employee" ? "Empleado" : 
             row.original.role}
          </Badge>
        );
      },
    },
    {
      accessorKey: "allowed_sections",
      header: "Secciones Permitidas",
      cell: ({ row }) => {
        if (!row.original.hasAdminAccess) {
          return <span className="text-muted-foreground text-sm">Sin permisos</span>;
        }
        const sections = row.original.allowed_sections;
        return (
          <div className="text-sm">
            {sections ? `${sections.length} de ${AVAILABLE_SECTIONS.length} secciones` : "Sin configurar"}
          </div>
        );
      },
    },
    {
      accessorKey: "active",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={row.getValue("active") ? "default" : "secondary"}>
          {row.getValue("active") ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        if (!row.original.hasAdminAccess) {
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                createAdminForm.setValue("professional_id", row.original.id);
                setShowCreateAdminDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Dar Acceso
            </Button>
          );
        }
        
        return (
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingUser(row.original);
                permissionsForm.setValue("allowed_sections", row.original.allowed_sections || []);
                setSelectedTemplate("");
                setShowPermissionsDialog(true);
              }}
            >
              <Shield className="h-4 w-4 mr-1" />
              Permisos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingUser(row.original);
                setShowChangePasswordDialog(true);
              }}
            >
              <Key className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("¿Desactivar este usuario?")) {
                  deactivateUserMutation.mutate(row.original.id);
                }
              }}
            >
              <UserX className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  // Template columns
  const templateColumns: ColumnDef<RoleTemplate>[] = [
    {
      accessorKey: "name",
      header: "Nombre",
    },
    {
      accessorKey: "description",
      header: "Descripción",
      cell: ({ row }) => row.getValue("description") || "-",
    },
    {
      accessorKey: "allowed_sections",
      header: "Secciones",
      cell: ({ row }) => {
        const sections = row.getValue("allowed_sections") as string[];
        return `${sections.length} de ${AVAILABLE_SECTIONS.length}`;
      },
    },
    {
      accessorKey: "active",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={row.getValue("active") ? "default" : "secondary"}>
          {row.getValue("active") ? "Activa" : "Inactiva"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingTemplate(row.original);
              templateForm.reset({
                name: row.original.name,
                description: row.original.description || "",
                allowed_sections: row.original.allowed_sections,
                active: row.original.active,
              });
              setShowTemplateDialog(true);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => deleteTemplateMutation.mutate(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    templateForm.reset();
    setShowTemplateDialog(true);
  };

  const onSubmitTemplate = (data: z.infer<typeof roleTemplateSchema>) => {
    templateMutation.mutate(data);
  };

  const onSubmitPermissions = (data: z.infer<typeof userPermissionsSchema>) => {
    if (editingUser && editingUser.hasAdminAccess) {
      updatePermissionsMutation.mutate({
        userId: editingUser.id,
        sections: data.allowed_sections,
      });
    }
  };

  const onSubmitCreateAdmin = (data: z.infer<typeof createAdminUserSchema>) => {
    createAdminUserMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accesos / Roles"
        description="Gestión de permisos y plantillas de rol"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="users">Usuarios de Panel</TabsTrigger>
          <TabsTrigger value="templates">Plantillas de Rol</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Usuarios de Panel
                </CardTitle>
                <Button onClick={() => setShowCreateAdminDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Dar Acceso (rápido)
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Buscar usuarios..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <DataTable
                columns={userColumns}
                data={filteredUsers}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Plantillas de Rol</CardTitle>
                <Button onClick={handleCreateTemplate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Plantilla
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={templateColumns}
                data={roleTemplates}
                searchKey="name"
                searchPlaceholder="Buscar plantillas..."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Editar Plantilla" : "Crear Plantilla"}
            </DialogTitle>
          </DialogHeader>
          <Form {...templateForm}>
            <form onSubmit={templateForm.handleSubmit(onSubmitTemplate)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={templateForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={templateForm.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Activa</FormLabel>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={templateForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={templateForm.control}
                name="allowed_sections"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secciones Permitidas</FormLabel>
                    <div className="grid grid-cols-2 gap-2 border rounded-md p-4">
                      {AVAILABLE_SECTIONS.map((section) => (
                        <div key={section.key} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`template-${section.key}`}
                            checked={field.value.includes(section.key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...field.value, section.key]);
                              } else {
                                field.onChange(field.value.filter(s => s !== section.key));
                              }
                            }}
                            className="rounded"
                          />
                          <label htmlFor={`template-${section.key}`} className="text-sm">
                            {section.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowTemplateDialog(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={templateMutation.isPending}>
                  {templateMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Admin User Dialog */}
      <Dialog open={showCreateAdminDialog} onOpenChange={setShowCreateAdminDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Dar Acceso (rápido)
            </DialogTitle>
          </DialogHeader>
          <Form {...createAdminForm}>
            <form onSubmit={createAdminForm.handleSubmit(onSubmitCreateAdmin)} className="space-y-4">
              <FormField
                control={createAdminForm.control}
                name="professional_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profesional</FormLabel>
                    <Select 
                      onValueChange={(value) => {
                        field.onChange(value);
                        const professional = professionals.find(p => p.id === value);
                        if (professional?.email) {
                          createAdminForm.setValue("email", professional.email);
                        }
                      }} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar profesional..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {professionals.map((prof) => (
                          <SelectItem key={prof.id} value={prof.id}>
                            {prof.name} ({prof.email || 'Sin email'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createAdminForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="email@ejemplo.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createAdminForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          {...field} 
                          type={showPasswordField ? "text" : "password"} 
                          placeholder="••••••••" 
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPasswordField(!showPasswordField)}
                        >
                          {showPasswordField ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createAdminForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="employee">Empleado</SelectItem>
                        <SelectItem value="manager">Gerente</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createAdminForm.control}
                name="allowed_sections"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secciones Permitidas</FormLabel>
                    <div className="grid grid-cols-2 gap-2 border rounded-md p-4 max-h-60 overflow-y-auto">
                      {AVAILABLE_SECTIONS.map((section) => (
                        <div key={section.key} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`create-${section.key}`}
                            checked={field.value.includes(section.key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...field.value, section.key]);
                              } else {
                                field.onChange(field.value.filter(s => s !== section.key));
                              }
                            }}
                            className="rounded"
                          />
                          <label htmlFor={`create-${section.key}`} className="text-sm">
                            {section.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createAdminForm.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Activo</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateAdminDialog(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createAdminUserMutation.isPending}>
                  {createAdminUserMutation.isPending ? "Creando..." : "Crear Acceso"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Gestionar Permisos - {editingUser?.name}
            </DialogTitle>
          </DialogHeader>
          <Form {...permissionsForm}>
            <form onSubmit={permissionsForm.handleSubmit(onSubmitPermissions)} className="space-y-4">
              {/* User Info */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Usuario:</strong> {editingUser?.name}
                  </div>
                  <div>
                    <strong>Email:</strong> {editingUser?.email}
                  </div>
                  <div>
                    <strong>Rol:</strong> {editingUser?.role || 'Sin acceso'}
                  </div>
                  {editingUser?.type === 'admin' && editingUser.professional_id && (
                    <div>
                      <strong>Tipo:</strong> Usuario Profesional
                    </div>
                  )}
                  {editingUser?.type === 'professional' && (
                    <div>
                      <strong>Tipo:</strong> Profesional sin acceso
                    </div>
                  )}
                </div>
              </div>

              {/* Template Selector */}
              <div>
                <FormLabel>Aplicar Plantilla (Opcional)</FormLabel>
                <Select value={selectedTemplate} onValueChange={applyTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar plantilla..." />
                  </SelectTrigger>
                  <SelectContent>
                    {roleTemplates.filter(t => t.active).map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} ({template.allowed_sections.length} secciones)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Self-protection warning */}
              {editingUser?.role === "superadmin" && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-amber-800">
                    Los Superadmin no pueden quitarse el acceso a Roles o Ajustes
                  </span>
                </div>
              )}

              {/* Permissions Matrix */}
              <FormField
                control={permissionsForm.control}
                name="allowed_sections"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matriz de Permisos</FormLabel>
                    <div className="grid grid-cols-2 gap-2 border rounded-md p-4 max-h-60 overflow-y-auto">
                      {AVAILABLE_SECTIONS.map((section) => (
                        <div key={section.key} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`perm-${section.key}`}
                            checked={field.value.includes(section.key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...field.value, section.key]);
                              } else {
                                field.onChange(field.value.filter(s => s !== section.key));
                              }
                            }}
                            className="rounded"
                          />
                          <label htmlFor={`perm-${section.key}`} className="text-sm">
                            {section.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPermissionsDialog(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updatePermissionsMutation.isPending}>
                  {updatePermissionsMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showChangePasswordDialog} onOpenChange={(open) => {
        setShowChangePasswordDialog(open);
        if (!open) {
          setSavedPassword(null);
          changePasswordForm.reset();
          setShowNewPassword(false);
          setShowConfirmPassword(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña - {editingUser?.name}</DialogTitle>
          </DialogHeader>
          
          {savedPassword ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  <p className="font-semibold mb-2">✅ Contraseña cambiada exitosamente</p>
                  <p className="text-sm mb-3 text-muted-foreground">
                    <strong>IMPORTANTE:</strong> Guarda esta contraseña ahora. No podrás verla de nuevo.
                  </p>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <code className="flex-1 text-sm font-mono">{savedPassword}</code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(savedPassword);
                        toast({
                          title: "Copiado",
                          description: "Contraseña copiada al portapapeles",
                        });
                      }}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copiar
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setShowChangePasswordDialog(false);
                    setSavedPassword(null);
                  }}
                >
                  Cerrar
                </Button>
              </div>
            </div>
          ) : (
            <Form {...changePasswordForm}>
              <form onSubmit={changePasswordForm.handleSubmit((data) => {
                if (editingUser) {
                  changePasswordMutation.mutate({
                    userEmail: editingUser.email,
                    newPassword: data.newPassword,
                  });
                }
              })} className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generateSecurePassword}
                  >
                    🔐 Generar Contraseña Segura
                  </Button>
                </div>
                
                <FormField
                  control={changePasswordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nueva Contraseña (mínimo 8 caracteres)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            {...field} 
                            type={showNewPassword ? "text" : "password"} 
                            placeholder="••••••••" 
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                          >
                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={changePasswordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar Contraseña</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            {...field} 
                            type={showConfirmPassword ? "text" : "password"} 
                            placeholder="••••••••" 
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowChangePasswordDialog(false);
                      changePasswordForm.reset();
                      setShowNewPassword(false);
                      setShowConfirmPassword(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={changePasswordMutation.isPending}>
                    {changePasswordMutation.isPending ? "Cambiando..." : "Cambiar Contraseña"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}