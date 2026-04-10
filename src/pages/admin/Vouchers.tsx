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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Eye, UserPlus, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ColumnDef } from "@tanstack/react-table";
import { ImageUpload } from "@/components/ui/image-upload";

// Types
interface VoucherType {
  id: string;
  name: string;
  description: string | null;
  sessions_count: number;
  price: number;
  currency: string;
  validity_days: number | null;
  validity_end_date: string | null;
  active: boolean;
  professional_id: string | null;
  photo_url: string | null;
  session_duration_min: number | null;
  created_at: string;
  updated_at: string;
}

interface Professional {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  active: boolean;
}

interface Voucher {
  id: string;
  user_id: string;
  voucher_type_id: string;
  code: string | null;
  sessions_remaining: number;
  status: string;
  purchase_date: string;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
  voucher_types: {
    name: string;
    sessions_count: number;
    currency: string;
    price: number;
  };
  users_shadow: {
    name: string;
    email: string;
  };
}

interface Service {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface UserShadow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  app_user_id?: string;
}

// Schemas
const voucherTypeSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().nullable().optional(),
  sessions_count: z.number().min(1, "Debe tener al menos 1 sesión"),
  price: z.number().min(0, "El precio debe ser mayor o igual a 0"),
  currency: z.string().default("EUR"),
  validity_days: z.number().nullable().optional(),
  validity_end_date: z.string().nullable().optional(),
  active: z.boolean().default(true),
  professional_id: z.string().min(1, "El profesional es requerido"),
  photo_url: z.string().nullable().optional(),
  session_duration_min: z.number().min(1, "Debe ser mayor a 0 minutos").nullable().optional(),
});

export function Vouchers() {
  const [activeTab, setActiveTab] = useState("types");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showVoucherTypeDialog, setShowVoucherTypeDialog] = useState(false);
  const [showAssignVoucherDialog, setShowAssignVoucherDialog] = useState(false);
  const [editingVoucherType, setEditingVoucherType] = useState<VoucherType | null>(null);
  const [showVoucherDetailDialog, setShowVoucherDetailDialog] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch voucher types with professional info and categories
  const { data: voucherTypes = [], isLoading: loadingVoucherTypes } = useQuery({
    queryKey: ["voucher-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_types")
        .select(`
          *,
          professionals(name),
          voucher_type_categories(
            categories(id, name)
          )
        `)
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as (VoucherType & { 
        professionals?: { name: string };
        voucher_type_categories?: { categories: { id: string; name: string } }[];
      })[];
    },
  });

  // Fetch vouchers
  const { data: vouchers = [], isLoading: loadingVouchers } = useQuery({
    queryKey: ["vouchers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select(`
          *,
          voucher_types(name, sessions_count, currency, price),
          users_shadow(name, email)
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Voucher[];
    },
  });

  // Fetch services for voucher type assignment
  const { data: services = [] } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as Service[];
    },
  });

  // Fetch categories for voucher type assignment
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as Category[];
    },
  });

  // Fetch users for voucher assignment
  const { data: users = [] } = useQuery({
    queryKey: ["users-shadow"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_shadow")
        .select("*")
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as UserShadow[];
    },
  });

  // Fetch professionals for voucher type assignment
  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name, email, phone, active")
        .eq("active", true)
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as Professional[];
    },
  });

  // Voucher type form
  const voucherTypeForm = useForm<z.infer<typeof voucherTypeSchema>>({
    resolver: zodResolver(voucherTypeSchema),
    defaultValues: {
      name: "",
      description: "",
      sessions_count: 1,
      price: 0,
      currency: "EUR",
      active: true,
      professional_id: "",
      photo_url: null,
      session_duration_min: null,
    },
  });

  // Create/Update voucher type mutation
  const voucherTypeMutation = useMutation({
    mutationFn: async (data: z.infer<typeof voucherTypeSchema> & { categories?: string[] }) => {
      const { categories: selectedCategories, ...voucherTypeData } = data;
      
      if (editingVoucherType) {
        // Update voucher type
        const { error } = await supabase
          .from("voucher_types")
          .update(voucherTypeData)
          .eq("id", editingVoucherType.id);
        if (error) throw error;

        // Update categories
        if (selectedCategories) {
          // Delete existing categories
          await supabase
            .from("voucher_type_categories")
            .delete()
            .eq("voucher_type_id", editingVoucherType.id);

          // Insert new categories
          if (selectedCategories.length > 0) {
            const categoryRelations = selectedCategories.map(categoryId => ({
              voucher_type_id: editingVoucherType.id,
              category_id: categoryId
            }));
            
            const { error: categoryError } = await supabase
              .from("voucher_type_categories")
              .insert(categoryRelations);
            if (categoryError) throw categoryError;
          }
        }
      } else {
        // Create voucher type
        const { data: newVoucherType, error } = await supabase
          .from("voucher_types")
          .insert(voucherTypeData as any)
          .select()
          .single();
        if (error) throw error;

        // Insert categories
        if (selectedCategories && selectedCategories.length > 0) {
          const categoryRelations = selectedCategories.map(categoryId => ({
            voucher_type_id: newVoucherType.id,
            category_id: categoryId
          }));
          
          const { error: categoryError } = await supabase
            .from("voucher_type_categories")
            .insert(categoryRelations);
          if (categoryError) throw categoryError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voucher-types"] });
      setShowVoucherTypeDialog(false);
      setEditingVoucherType(null);
      voucherTypeForm.reset();
      toast({
        title: "Éxito",
        description: editingVoucherType ? "Tipo de bono actualizado" : "Tipo de bono creado",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el tipo de bono",
      });
      console.error(error);
    },
  });

  // Delete voucher type mutation
  const deleteVoucherTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("voucher_types")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voucher-types"] });
      toast({
        title: "Éxito",
        description: "Tipo de bono eliminado",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el tipo de bono",
      });
    },
  });

  // Assign voucher state
  const [assignVoucherUserId, setAssignVoucherUserId] = useState("");
  const [assignVoucherTypeId, setAssignVoucherTypeId] = useState("");

  // Assign voucher mutation
  const assignVoucherMutation = useMutation({
    mutationFn: async () => {
      const voucherType = voucherTypes.find(vt => vt.id === assignVoucherTypeId);
      if (!voucherType) throw new Error("Tipo de bono no encontrado");
      
      const expiryDate = voucherType.validity_days 
        ? new Date(Date.now() + voucherType.validity_days * 24 * 60 * 60 * 1000).toISOString()
        : null;
      
      const { error } = await supabase.from("vouchers").insert({
        user_id: assignVoucherUserId,
        voucher_type_id: assignVoucherTypeId,
        sessions_remaining: voucherType.sessions_count,
        status: "active",
        expiry_date: expiryDate,
        purchase_date: new Date().toISOString()
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      setShowAssignVoucherDialog(false);

      // Send webhook notification for assigned voucher
      try {
        const user = users.find(u => u.id === assignVoucherUserId);
        const voucherType = voucherTypes.find(vt => vt.id === assignVoucherTypeId);
        const professional = voucherType?.professional_id 
          ? professionals.find(p => p.id === voucherType.professional_id) 
          : null;
        
        // Fetch default location
        const { data: locationData } = await supabase
          .from("locations")
          .select("id, name, address, timezone")
          .eq("active", true)
          .limit(1)
          .maybeSingle();

        await supabase.functions.invoke("send-generic-webhook", {
          body: {
            event: "voucher.assigned",
            data: {
              voucher: {
                voucher_type_id: assignVoucherTypeId,
                type_name: voucherType?.name || "Unknown",
                sessions_count: voucherType?.sessions_count || 0,
                price: voucherType?.price || 0,
                currency: voucherType?.currency || "EUR",
                validity_days: voucherType?.validity_days,
              },
              professional: professional ? {
                id: professional.id,
                name: professional.name,
                email: professional.email || null,
                phone: professional.phone || null,
              } : null,
              location: locationData ? {
                id: locationData.id,
                name: locationData.name,
                address: locationData.address || null,
                timezone: locationData.timezone || "Europe/Madrid",
              } : null,
              customer: {
                id: assignVoucherUserId,
                name: user?.name || "Unknown",
                email: user?.email || "unknown@email.com",
                phone: user?.phone || null,
                app_user_id: user?.app_user_id || null,
              },
            },
          },
        });
      } catch (webhookErr) {
        console.error("Error sending voucher webhook:", webhookErr);
      }

      setAssignVoucherUserId("");
      setAssignVoucherTypeId("");
      toast({ title: "Bono asignado correctamente" });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo asignar el bono",
      });
      console.error(error);
    }
  });

  // Filter vouchers
  const filteredVouchers = vouchers.filter((voucher) => {
    const searchMatch = searchQuery === "" || 
      voucher.users_shadow?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voucher.users_shadow?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voucher.voucher_types?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const statusMatch = statusFilter === "all" || voucher.status === statusFilter;
    
    return searchMatch && statusMatch;
  });

  // Voucher type columns
  const voucherTypeColumns: ColumnDef<VoucherType & { 
    professionals?: { name: string };
    voucher_type_categories?: { categories: { id: string; name: string } }[];
  }>[] = [
    {
      accessorKey: "photo_url",
      header: "Foto",
      cell: ({ row }) => (
        <div className="w-8 h-8">
          {row.getValue("photo_url") ? (
            <img 
              src={row.getValue("photo_url") as string} 
              alt="Foto del bono"
              className="w-full h-full object-cover rounded"
            />
          ) : (
            <div className="w-full h-full bg-muted rounded"></div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: "Nombre",
    },
    {
      accessorKey: "professionals.name",
      header: "Profesional",
      cell: ({ row }) => row.original.professionals?.name || "-",
    },
    {
      accessorKey: "categories",
      header: "Categorías",
      cell: ({ row }) => {
        const categories = row.original.voucher_type_categories?.map(vtc => vtc.categories.name) || [];
        return categories.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {categories.map((category, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {category}
              </Badge>
            ))}
          </div>
        ) : "-";
      },
    },
    {
      accessorKey: "sessions_count",
      header: "Sesiones",
    },
    {
      accessorKey: "session_duration_min",
      header: "Duración (min)",
      cell: ({ row }) => row.getValue("session_duration_min") || "Por defecto",
    },
    {
      accessorKey: "price",
      header: "Precio",
      cell: ({ row }) => `${row.getValue("price")} ${row.original.currency}`,
    },
    {
      accessorKey: "validity_days",
      header: "Validez (días)",
      cell: ({ row }) => row.getValue("validity_days") || "Sin límite",
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
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingVoucherType(row.original);
              const existingCategories = row.original.voucher_type_categories?.map(vtc => vtc.categories.id) || [];
              setSelectedCategories(existingCategories);
              voucherTypeForm.reset({
                name: row.original.name,
                description: row.original.description || "",
                sessions_count: row.original.sessions_count,
                price: row.original.price,
                currency: row.original.currency,
                validity_days: row.original.validity_days || undefined,
                validity_end_date: row.original.validity_end_date || undefined,
                active: row.original.active,
                professional_id: row.original.professional_id || "",
                photo_url: row.original.photo_url || null,
                session_duration_min: row.original.session_duration_min || null,
              });
              setShowVoucherTypeDialog(true);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => deleteVoucherTypeMutation.mutate(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // Voucher columns
  const voucherColumns: ColumnDef<Voucher>[] = [
    {
      accessorKey: "users_shadow.name",
      header: "Usuario",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.users_shadow?.name}</div>
          <div className="text-sm text-muted-foreground">{row.original.users_shadow?.email}</div>
        </div>
      ),
    },
    {
      accessorKey: "voucher_types.name",
      header: "Tipo de Bono",
    },
    {
      accessorKey: "sessions_remaining",
      header: "Restantes/Total",
      cell: ({ row }) => `${row.getValue("sessions_remaining")}/${row.original.voucher_types?.sessions_count}`,
    },
    {
      accessorKey: "expiry_date",
      header: "Caducidad",
      cell: ({ row }) => {
        const date = row.getValue("expiry_date") as string;
        return date ? new Date(date).toLocaleDateString() : "Sin límite";
      },
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={row.getValue("status") === "active" ? "default" : "secondary"}>
          {row.getValue("status") === "active" ? "Activo" : "Inactivo"}
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
              setSelectedVoucher(row.original);
              setShowVoucherDetailDialog(true);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const handleCreateVoucherType = () => {
    setEditingVoucherType(null);
    setSelectedCategories([]);
    voucherTypeForm.reset({
      name: "",
      description: "",
      sessions_count: 1,
      price: 0,
      currency: "EUR",
      active: true,
      professional_id: "",
      photo_url: null,
      session_duration_min: null,
    });
    setShowVoucherTypeDialog(true);
  };

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const onSubmitVoucherType = (data: z.infer<typeof voucherTypeSchema>) => {
    voucherTypeMutation.mutate({ ...data, categories: selectedCategories });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bonos"
        description="Gestión de tipos de bono y bonos asignados"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="types">Tipos de Bono</TabsTrigger>
          <TabsTrigger value="vouchers">Bonos</TabsTrigger>
        </TabsList>

        <TabsContent value="types" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Tipos de Bono</CardTitle>
                <Button onClick={handleCreateVoucherType}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Tipo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={voucherTypeColumns}
                data={voucherTypes}
                searchKey="name"
                searchPlaceholder="Buscar tipos de bono..."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vouchers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Bonos</CardTitle>
                <Button onClick={() => setShowAssignVoucherDialog(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Asignar Bono
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-4">
                <Input
                  placeholder="Buscar por usuario..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="expired">Caducado</SelectItem>
                    <SelectItem value="refunded">Reembolsado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DataTable
                columns={voucherColumns}
                data={filteredVouchers}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Voucher Type Dialog */}
      <Dialog open={showVoucherTypeDialog} onOpenChange={setShowVoucherTypeDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editingVoucherType ? "Editar Tipo de Bono" : "Crear Tipo de Bono"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-8rem)] pr-4">
            <Form {...voucherTypeForm}>
              <form onSubmit={voucherTypeForm.handleSubmit(onSubmitVoucherType)} className="space-y-4 pb-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={voucherTypeForm.control}
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
                  control={voucherTypeForm.control}
                  name="sessions_count"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Sesiones</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={voucherTypeForm.control}
                  name="professional_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profesional</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar profesional" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {professionals.map((professional) => (
                            <SelectItem key={professional.id} value={professional.id}>
                              {professional.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel>Categorías</FormLabel>
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value && !selectedCategories.includes(value)) {
                        setSelectedCategories([...selectedCategories, value]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Añadir categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories
                        .filter(category => !selectedCategories.includes(category.id))
                        .map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedCategories.map((categoryId) => {
                      const category = categories.find(c => c.id === categoryId);
                      return category ? (
                        <Badge 
                          key={categoryId} 
                          variant="secondary" 
                          className="cursor-pointer"
                          onClick={() => setSelectedCategories(selectedCategories.filter(id => id !== categoryId))}
                        >
                          {category.name} ×
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>

              <FormField
                control={voucherTypeForm.control}
                name="photo_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Foto del Bono</FormLabel>
                    <FormControl>
        <ImageUpload
          value={field.value || ""}
          onChange={field.onChange}
          voucherTypeId={editingVoucherType?.id || "temp"}
          disabled={voucherTypeMutation.isPending}
        />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={voucherTypeForm.control}
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={voucherTypeForm.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={voucherTypeForm.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moneda</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={voucherTypeForm.control}
                  name="validity_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Validez (días)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={voucherTypeForm.control}
                  name="session_duration_min"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tiempo por sesión (min)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Deja vacío para usar duración del servicio"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={voucherTypeForm.control}
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
                  onClick={() => setShowVoucherTypeDialog(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={voucherTypeMutation.isPending}>
                  {voucherTypeMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
              </form>
            </Form>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Voucher Detail Dialog */}
      <Dialog open={showVoucherDetailDialog} onOpenChange={setShowVoucherDetailDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalles del Bono</DialogTitle>
          </DialogHeader>
          {selectedVoucher && (
            <div className="space-y-4">
              {/* Usuario */}
              <div className="space-y-1">
                <h4 className="font-medium text-sm text-muted-foreground">Usuario</h4>
                <p className="font-medium">{selectedVoucher.users_shadow?.name || "Sin nombre"}</p>
                <p className="text-sm text-muted-foreground">{selectedVoucher.users_shadow?.email || "Sin email"}</p>
              </div>
              
              {/* Tipo de Bono */}
              <div className="space-y-1">
                <h4 className="font-medium text-sm text-muted-foreground">Tipo de Bono</h4>
                <p className="font-medium">{selectedVoucher.voucher_types?.name}</p>
                <p className="text-sm">
                  {selectedVoucher.voucher_types?.price} {selectedVoucher.voucher_types?.currency}
                </p>
              </div>
              
              {/* Sesiones */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">Sesiones</h4>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Restantes</span>
                    <span className="font-medium">
                      {selectedVoucher.sessions_remaining} de {selectedVoucher.voucher_types?.sessions_count}
                    </span>
                  </div>
                  <Progress 
                    value={selectedVoucher.voucher_types?.sessions_count 
                      ? (selectedVoucher.sessions_remaining / selectedVoucher.voucher_types.sessions_count) * 100 
                      : 0
                    } 
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    {(selectedVoucher.voucher_types?.sessions_count || 0) - selectedVoucher.sessions_remaining} sesiones utilizadas
                  </p>
                </div>
              </div>
              
              {/* Estado y Fechas */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <h4 className="font-medium text-sm text-muted-foreground">Estado</h4>
                  <Badge variant={selectedVoucher.status === "active" ? "default" : "secondary"}>
                    {selectedVoucher.status === "active" ? "Activo" : 
                     selectedVoucher.status === "expired" ? "Caducado" : 
                     selectedVoucher.status === "exhausted" ? "Agotado" : selectedVoucher.status}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <h4 className="font-medium text-sm text-muted-foreground">Caducidad</h4>
                  <p className="text-sm">
                    {selectedVoucher.expiry_date 
                      ? new Date(selectedVoucher.expiry_date).toLocaleDateString() 
                      : "Sin límite"}
                  </p>
                </div>
              </div>

              {/* Fecha de compra */}
              <div className="space-y-1">
                <h4 className="font-medium text-sm text-muted-foreground">Fecha de compra</h4>
                <p className="text-sm">
                  {selectedVoucher.purchase_date 
                    ? new Date(selectedVoucher.purchase_date).toLocaleDateString() 
                    : "No disponible"}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Voucher Dialog */}
      <Dialog open={showAssignVoucherDialog} onOpenChange={(open) => {
        setShowAssignVoucherDialog(open);
        if (!open) {
          setAssignVoucherUserId("");
          setAssignVoucherTypeId("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar Bono</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Usuario</label>
              <Select value={assignVoucherUserId} onValueChange={setAssignVoucherUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar usuario" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Bono</label>
              {voucherTypes.filter(vt => vt.active).length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-md">
                  No hay tipos de bono activos. Crea o activa uno desde la pestaña "Tipos de Bono".
                </p>
              ) : (
                <Select value={assignVoucherTypeId} onValueChange={setAssignVoucherTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo de bono" />
                  </SelectTrigger>
                  <SelectContent>
                    {voucherTypes.filter(vt => vt.active).map((vt) => (
                      <SelectItem key={vt.id} value={vt.id}>
                        {vt.name} - {vt.sessions_count} sesiones ({vt.price} {vt.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowAssignVoucherDialog(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => assignVoucherMutation.mutate()}
                disabled={!assignVoucherUserId || !assignVoucherTypeId || assignVoucherMutation.isPending || voucherTypes.filter(vt => vt.active).length === 0}
              >
                {assignVoucherMutation.isPending ? "Asignando..." : "Asignar Bono"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}