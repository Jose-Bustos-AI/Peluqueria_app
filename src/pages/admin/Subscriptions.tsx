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
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Info, UserPlus, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ColumnDef } from "@tanstack/react-table";
import { ImageUpload } from "@/components/ui/image-upload";
import { SubscriptionDetailsModal } from "@/components/admin/SubscriptionDetailsModal";
import { CancelSubscriptionModal } from "@/components/admin/CancelSubscriptionModal";

// Types
interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  cycle: string;
  price: number;
  currency: string;
  sessions_count: number | null;
  capacity_per_session: number | null;
  cap_per_cycle: number | null;
  photo_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Campos para sistema de packs
  pack_type?: string | null;
  parent_plan_id?: string | null;
  // Campos para sesiones programadas
  days_of_week?: number[];
  default_start_time?: string;
  default_end_time?: string;
  subscription_plan_categories?: {
    categories: {
      id: string;
      name: string;
    };
  }[];
}

interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  start_date: string;
  next_billing_date: string;
  cap_remaining_in_cycle: number | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
  subscription_plans: {
    name: string;
    cycle: string;
    sessions_count: number | null;
    price: number;
    currency: string;
  };
  users_shadow: {
    name: string;
    email: string;
  };
}

interface Class {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

interface Professional {
  id: string;
  name: string;
  specialty: string | null;
  email: string | null;
  phone: string | null;
}

interface UserShadow {
  id: string;
  name: string;
  email: string;
}

// Schemas
const packSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  price: z.number().min(0, "El precio debe ser mayor o igual a 0"),
  sessions_count: z.number().min(1, "Debe especificar el número de sesiones"),
  pack_type: z.string().min(1, "El tipo de pack es requerido"),
});

const subscriptionPlanSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().min(1, "La descripción es requerida"),
  cycle: z.enum(["weekly", "monthly"], { required_error: "El ciclo es requerido" }),
  price: z.number().min(0, "El precio debe ser mayor o igual a 0"),
  currency: z.string().default("EUR"),
  sessions_count: z.number().nullable().optional(),
  capacity_per_session: z.number().nullable().optional(),
  photo_url: z.string().nullable().optional(),
  active: z.boolean().default(true),
  // Campos para sesiones programadas
  days_of_week: z.array(z.number()).optional(),
  time_slots: z.array(z.object({
    start_time: z.string(),
    end_time: z.string(),
  })).optional(),
  professional_id: z.string().optional(),
  // Campos para sistema de packs
  has_packs: z.boolean().default(false),
  packs: z.array(packSchema).optional(),
}).refine(
  (data) => {
    // Si no tiene packs, el precio debe ser mayor que 0
    if (!data.has_packs && data.price === 0) {
      return false;
    }
    return true;
  },
  {
    message: "El precio debe ser mayor que 0 cuando no hay packs asociados",
    path: ["price"],
  }
);

const subscriptionSchema = z.object({
  user_id: z.string().min(1, "El usuario es requerido"),
  plan_id: z.string().min(1, "El plan es requerido"),
  status: z.enum(["active", "paused", "canceled", "past_due"]).default("active"),
  start_date: z.string().min(1, "La fecha de inicio es requerida"),
  next_billing_date: z.string().min(1, "La próxima facturación es requerida"),
});

export function Subscriptions() {
  const [activeTab, setActiveTab] = useState("plans");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [subscriptionToCancel, setSubscriptionToCancel] = useState<Subscription | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [timeSlots, setTimeSlots] = useState<Array<{ start_time: string; end_time: string }>>([]);
  const [packs, setPacks] = useState<Array<{ name: string; price: number; sessions_count: number; pack_type: string }>>([]);
  const [hasPacks, setHasPacks] = useState(false);
  const [daySlots, setDaySlots] = useState<Record<string, Array<{ start_time: string; end_time: string }>>>({});
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [globalSlotStart, setGlobalSlotStart] = useState("09:00");
  const [globalSlotEnd, setGlobalSlotEnd] = useState("10:00");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch subscription plans
  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select(`*`)
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as SubscriptionPlan[];
    },
  });

  // Fetch subscriptions
  const { data: subscriptions = [], isLoading: loadingSubscriptions } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          *,
          subscription_plans(name, cycle, sessions_count, price, currency),
          users_shadow(name, email)
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Subscription[];
    },
  });

  // Fetch classes for plan assignment
  const { data: classes = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as Class[];
    },
  });


  // Fetch professionals for plan assignment
  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name, specialty, email, phone")
        .eq("active", true)
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as Professional[];
    },
  });

  // Fetch users for subscription assignment
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

  // Plan form
  const planForm = useForm<z.infer<typeof subscriptionPlanSchema>>({
    resolver: zodResolver(subscriptionPlanSchema),
    defaultValues: {
      name: "",
      description: "",
      cycle: "monthly",
      price: 0,
      currency: "EUR",
      active: true,
    },
  });

  // Subscription form
  const subscriptionForm = useForm<z.infer<typeof subscriptionSchema>>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      status: "active",
      start_date: new Date().toISOString().split('T')[0],
      next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  });

  // Plan mutations
  const planMutation = useMutation({
    mutationFn: async (data: z.infer<typeof subscriptionPlanSchema>) => {
      const { days_of_week, time_slots, professional_id, has_packs, packs, ...planData } = data;
      
      // Almacenar configuración de sesiones en la descripción como JSON
      let finalPlanData = { ...planData };
      
      if (days_of_week?.length || professional_id || Object.keys(daySlots).length > 0) {
        // Generate time_slots as fallback from first day with slots
        const firstDayWithSlots = Object.values(daySlots).find(s => s.length > 0) || [];
        
        const sessionConfig: any = {
          days_of_week: days_of_week || [],
          time_slots: firstDayWithSlots,
          professional_id: professional_id || null,
          day_slots: daySlots,
        };
        
        // Combinar descripción existente con configuración de sesión
        const existingDescription = planData.description || "";
        finalPlanData.description = JSON.stringify({
          text: existingDescription,
          session_config: sessionConfig
        });
      }

      // Si es un plan con packs, marcarlo como "main"
      if (has_packs && packs && packs.length > 0) {
        finalPlanData = {
          ...finalPlanData,
          pack_type: 'main',
          // No incluir precio ni sesiones en el plan principal cuando tiene packs
          price: 0,
          sessions_count: null,
        } as any;
      }
      
      if (editingPlan) {
        // Update plan
        const { error: planError } = await supabase
          .from("subscription_plans")
          .update(finalPlanData as any)
          .eq("id", editingPlan.id);
        if (planError) throw planError;


        // Si tiene packs, actualizar los packs existentes
        if (has_packs && packs && packs.length > 0) {
          // Obtener packs existentes
          const { data: existingPacks } = await supabase
            .from("subscription_plans")
            .select("id, pack_type")
            .eq("parent_plan_id", editingPlan.id)
            .order('price', { ascending: true });

          // Actualizar cada pack existente con los nuevos datos
          for (let i = 0; i < packs.length; i++) {
            const pack = packs[i];
            const packData = {
              name: pack.name,
              price: pack.price,
              sessions_count: pack.sessions_count,
              pack_type: pack.pack_type,
              currency: finalPlanData.currency,
              cycle: finalPlanData.cycle,
              active: finalPlanData.active,
              description: finalPlanData.description,
            };

            if (existingPacks && existingPacks[i]) {
              // Actualizar pack existente
              const { error: updatePackError } = await supabase
                .from("subscription_plans")
                .update(packData as any)
                .eq("id", existingPacks[i].id);
              if (updatePackError) throw updatePackError;
            } else {
              // Crear nuevo pack si no existe
              const { data: newPack, error: insertPackError } = await supabase
                .from("subscription_plans")
                .insert({
                  ...packData,
                  parent_plan_id: editingPlan.id,
                } as any)
                .select()
                .single();
              if (insertPackError) throw insertPackError;

            }
          }
        }
      } else {
        // Create new plan
        const { data: planResult, error: planError } = await supabase
          .from("subscription_plans")
          .insert(finalPlanData as any)
          .select()
          .single();
        if (planError) throw planError;


        // Si tiene packs, crearlos
        if (has_packs && packs && packs.length > 0) {
          const packsToInsert = packs.map(pack => ({
            name: pack.name,
            price: pack.price,
            sessions_count: pack.sessions_count,
            pack_type: pack.pack_type,
            parent_plan_id: planResult.id,
            currency: finalPlanData.currency,
            cycle: finalPlanData.cycle,
            active: finalPlanData.active,
            description: finalPlanData.description,
          }));

          const { data: insertedPacks, error: insertPacksError } = await supabase
            .from("subscription_plans")
            .insert(packsToInsert)
            .select();
          if (insertPacksError) throw insertPacksError;

        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      setShowPlanDialog(false);
      setEditingPlan(null);
      planForm.reset();
      setTimeSlots([]);
      toast({
        title: "Éxito",
        description: editingPlan ? "Plan actualizado" : "Plan creado con éxito",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el plan",
      });
      console.error(error);
    },
  });

  // Delete plan mutation
  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subscription_plans")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      toast({
        title: "Éxito",
        description: "Plan eliminado",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el plan",
      });
    },
  });

  // Subscription mutations
  const subscriptionMutation = useMutation({
    mutationFn: async (data: z.infer<typeof subscriptionSchema>) => {
      const { error } = await supabase
        .from("subscriptions")
        .insert(data as any);
      if (error) throw error;
    },
    onSuccess: async (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      setShowSubscriptionDialog(false);
      subscriptionForm.reset();
      toast({
        title: "Éxito",
        description: "Suscripción creada",
      });

      // Send webhook notification for new subscription
      try {
        const user = users.find((u: any) => u.id === variables.user_id);
        const plan = plans.find(p => p.id === variables.plan_id);
        
        // Extract professional_id from plan description (session_config JSON)
        let professionalId: string | null = null;
        if (plan?.description) {
          try {
            const sessionConfig = JSON.parse(plan.description);
            professionalId = sessionConfig?.session_config?.professional_id || null;
          } catch {
            // description is not JSON, ignore
          }
        }
        const professional = professionalId ? professionals.find(p => p.id === professionalId) : null;

        // Fetch default location
        const { data: locationData } = await supabase
          .from("locations")
          .select("id, name, address, timezone")
          .eq("active", true)
          .limit(1)
          .maybeSingle();

        await supabase.functions.invoke("send-generic-webhook", {
          body: {
            event: "subscription.created",
            data: {
              subscription: {
                plan_id: variables.plan_id,
                plan_name: plan?.name || "Unknown",
                plan_price: plan?.price || 0,
                plan_currency: plan?.currency || "EUR",
                plan_cycle: plan?.cycle || "monthly",
                sessions_count: plan?.sessions_count || null,
                cap_per_cycle: plan?.cap_per_cycle || null,
                status: variables.status,
                start_date: variables.start_date,
                next_billing_date: variables.next_billing_date,
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
                id: variables.user_id,
                name: user?.name || "Unknown",
                email: user?.email || "unknown@email.com",
                phone: (user as any)?.phone || null,
                app_user_id: (user as any)?.app_user_id || null,
              },
            },
          },
        });
      } catch (webhookErr) {
        console.error("Error sending subscription webhook:", webhookErr);
      }
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear la suscripción",
      });
      console.error(error);
    },
  });

  // Update subscription status mutation
  const updateSubscriptionStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast({
        title: "Éxito",
        description: "Estado de suscripción actualizado",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar el estado",
      });
    },
  });

  // Filter subscriptions
  const filteredSubscriptions = subscriptions.filter((subscription) => {
    const searchMatch = searchQuery === "" || 
      subscription.users_shadow?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subscription.users_shadow?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subscription.subscription_plans?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const statusMatch = statusFilter === "all" || subscription.status === statusFilter;
    
    return searchMatch && statusMatch;
  });

  // Group plans: separate main plans from packs
  const mainPlans = plans.filter(plan => !plan.parent_plan_id || plan.pack_type === 'main');
  const plansByParent = plans.reduce((acc, plan) => {
    if (plan.parent_plan_id) {
      if (!acc[plan.parent_plan_id]) {
        acc[plan.parent_plan_id] = [];
      }
      acc[plan.parent_plan_id].push(plan);
    }
    return acc;
  }, {} as Record<string, SubscriptionPlan[]>);

  // Plan columns
  const planColumns: ColumnDef<SubscriptionPlan>[] = [
    {
      accessorKey: "name",
      header: "Nombre",
    },
    {
      accessorKey: "description",
      header: "Descripción",
      cell: ({ row }) => {
        const description = row.getValue("description") as string;
        if (!description) return "-";
        
        // Try to parse as JSON to extract text portion
        try {
          const parsed = JSON.parse(description);
          return parsed.text || description;
        } catch {
          return description;
        }
      },
    },
    {
      accessorKey: "cycle",
      header: "Ciclo",
      cell: ({ row }) => {
        const cycle = row.getValue("cycle") as string;
        return cycle === "weekly" ? "Semanal" : "Mensual";
      },
    },
    {
      accessorKey: "price",
      header: "Precio",
      cell: ({ row }) => {
        // Si es un plan principal con packs, no mostrar precio
        if (row.original.pack_type === 'main') {
          return "-";
        }
        return `${row.getValue("price")} ${row.original.currency}`;
      },
    },
    {
      accessorKey: "sessions_count",
      header: "Sesiones",
      cell: ({ row }) => row.getValue("sessions_count") || "-",
    },
    {
      accessorKey: "capacity_per_session",
      header: "Aforo Máx.",
      cell: ({ row }) => row.getValue("capacity_per_session") || "-",
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
             onClick={async () => {
              setEditingPlan(row.original);
              
              
              // Extraer configuración de sesiones del JSON en descripción
              let sessionConfig: any = {
                days_of_week: [],
                time_slots: [],
                professional_id: ""
              };
              let description = row.original.description || "";
              
              try {
                // Intentar parsear la descripción como JSON
                const parsedDescription = JSON.parse(description);
                if (parsedDescription.session_config) {
                  sessionConfig = parsedDescription.session_config;
                  description = parsedDescription.text || "";
                  
                  // Migrar formato antiguo a nuevo si es necesario
                  if (sessionConfig.default_start_time && sessionConfig.default_end_time && !sessionConfig.time_slots) {
                    sessionConfig.time_slots = [{
                      start_time: sessionConfig.default_start_time,
                      end_time: sessionConfig.default_end_time
                    }];
                  }
                }
              } catch (e) {
                // Si no es JSON, usar la descripción tal como está
                console.log("Description is not JSON, using as plain text");
              }
              
              // Establecer time_slots en el estado local
              setTimeSlots(sessionConfig.time_slots || []);
              setExpandedDay(null);
              
              // Load per-day slots: if day_slots exist use them, otherwise populate from global time_slots
              if (sessionConfig.day_slots && Object.keys(sessionConfig.day_slots).length > 0) {
                setDaySlots(sessionConfig.day_slots);
              } else if (sessionConfig.time_slots?.length > 0 && sessionConfig.days_of_week?.length > 0) {
                // Migrate: copy global time_slots to each selected day
                const migrated: Record<string, Array<{ start_time: string; end_time: string }>> = {};
                sessionConfig.days_of_week.forEach((d: number) => {
                  migrated[String(d)] = sessionConfig.time_slots.map((s: any) => ({ ...s }));
                });
                setDaySlots(migrated);
              } else {
                setDaySlots({});
              }

              // Cargar packs si este plan tiene packs hijos
              let loadedPacks: any[] = [];
              const isMainPlan = row.original.pack_type === 'main';
              
              if (isMainPlan) {
                const { data: childPacks } = await supabase
                  .from('subscription_plans')
                  .select('name, price, sessions_count, pack_type')
                  .eq('parent_plan_id', row.original.id)
                  .order('price', { ascending: true });
                
                if (childPacks && childPacks.length > 0) {
                  loadedPacks = childPacks;
                }
              }
              
              setHasPacks(isMainPlan && loadedPacks.length > 0);
              setPacks(loadedPacks);
              
              planForm.reset({
                name: row.original.name,
                description: description,
                cycle: row.original.cycle as "weekly" | "monthly",
                price: row.original.price,
                currency: row.original.currency,
                sessions_count: row.original.sessions_count || undefined,
                capacity_per_session: row.original.capacity_per_session || undefined,
                photo_url: row.original.photo_url || undefined,
                active: row.original.active,
                
                days_of_week: sessionConfig.days_of_week || [],
                time_slots: sessionConfig.time_slots || [],
                professional_id: sessionConfig.professional_id || "",
                has_packs: isMainPlan && loadedPacks.length > 0,
                packs: loadedPacks
              });
              setShowPlanDialog(true);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => deletePlanMutation.mutate(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // Subscription columns
  const subscriptionColumns: ColumnDef<Subscription>[] = [
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
      accessorKey: "subscription_plans.name",
      header: "Plan",
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        const cancelAtPeriodEnd = row.original.cancel_at_period_end;
        
        // Determine real status considering cancel_at_period_end
        let displayStatus: string;
        let variant: "default" | "secondary" | "destructive" | "outline";
        
        if (status === 'cancelled') {
          displayStatus = "Cancelada";
          variant = "destructive";
        } else if (cancelAtPeriodEnd) {
          displayStatus = "Se cancelará";
          variant = "destructive";
        } else if (status === 'active') {
          displayStatus = "Activa";
          variant = "default";
        } else if (status === 'paused') {
          displayStatus = "Pausada";
          variant = "secondary";
        } else if (status === 'past_due') {
          displayStatus = "Vencida";
          variant = "outline";
        } else {
          displayStatus = status;
          variant = "secondary";
        }
        
        return (
          <Badge variant={variant}>
            {displayStatus}
          </Badge>
        );
      },
    },
    {
      accessorKey: "start_date",
      header: "Fecha Inicio",
      cell: ({ row }) => new Date(row.getValue("start_date") as string).toLocaleDateString(),
    },
    {
      accessorKey: "next_billing_date",
      header: "Próxima Facturación",
      cell: ({ row }) => new Date(row.getValue("next_billing_date") as string).toLocaleDateString(),
    },
    {
      accessorKey: "cap_remaining_in_cycle",
      header: "Consumo Ciclo",
      cell: ({ row }) => {
        const plan = row.original.subscription_plans;
        if (!plan?.sessions_count) return "Ilimitado";
        
        // Por ahora mostramos formato básico, el cálculo real se hará en el modal de detalles
        return "Ver detalles";
      },
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        const canCancel = row.original.status === 'active' && !row.original.cancel_at_period_end;
        
        return (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedSubscription(row.original);
                setShowDetailsModal(true);
              }}
            >
              <Info className="h-4 w-4" />
              Detalles
            </Button>
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setSubscriptionToCancel(row.original);
                  setShowCancelModal(true);
                }}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const handleCreatePlan = () => {
    setEditingPlan(null);
    setTimeSlots([]);
    setPacks([]);
    setHasPacks(false);
    setDaySlots({});
    setExpandedDay(null);
    planForm.reset({
      name: "",
      description: "",
      cycle: "monthly",
      price: 0,
      currency: "EUR",
      active: true,
      
      sessions_count: undefined,
      capacity_per_session: undefined,
      has_packs: false,
      packs: [],
    });
    setShowPlanDialog(true);
  };

  const handleCreateSubscription = () => {
    setEditingSubscription(null);
    subscriptionForm.reset();
    setShowSubscriptionDialog(true);
  };

  const onSubmitPlan = (data: z.infer<typeof subscriptionPlanSchema>) => {
    planMutation.mutate(data);
  };

  const onSubmitSubscription = (data: z.infer<typeof subscriptionSchema>) => {
    subscriptionMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suscripciones"
        description="Gestión de planes de suscripción y suscriptores"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="plans">Planes</TabsTrigger>
          <TabsTrigger value="subscribers">Suscriptores</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Planes de Suscripción</CardTitle>
                <Button onClick={handleCreatePlan}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {mainPlans.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay planes de suscripción</p>
              ) : (
                mainPlans.map((mainPlan) => {
                  const childPacks = plansByParent[mainPlan.id] || [];
                  const hasPackSystem = childPacks.length > 0;

                  return (
                    <Card key={mainPlan.id} className="border-2">
                      <CardHeader className="bg-muted/30 pb-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-3">
                              <CardTitle className="text-xl">{mainPlan.name}</CardTitle>
                              <Badge variant={mainPlan.active ? "default" : "secondary"}>
                                {mainPlan.active ? "Activo" : "Inactivo"}
                              </Badge>
                              {hasPackSystem && (
                                <Badge variant="outline" className="bg-background">
                                  {childPacks.length} {childPacks.length === 1 ? 'Pack' : 'Packs'}
                                </Badge>
                              )}
                            </div>
                            {mainPlan.description && (
                              <p className="text-sm text-muted-foreground">
                                {(() => {
                                  try {
                                    const parsed = JSON.parse(mainPlan.description);
                                    return parsed.text || mainPlan.description;
                                  } catch {
                                    return mainPlan.description;
                                  }
                                })()}
                              </p>
                            )}
                            <div className="flex items-center gap-4 text-sm pt-2">
                              <span className="text-muted-foreground">
                                Ciclo: <span className="font-medium text-foreground">
                                  {mainPlan.cycle === 'weekly' ? 'Semanal' : 'Mensual'}
                                </span>
                              </span>
                              {!hasPackSystem && (
                                <>
                                  <span className="text-muted-foreground">•</span>
                                  <span className="text-muted-foreground">
                                    Precio: <span className="font-semibold text-foreground">
                                      {mainPlan.price} {mainPlan.currency}
                                    </span>
                                  </span>
                                  {mainPlan.sessions_count && (
                                    <>
                                      <span className="text-muted-foreground">•</span>
                                      <span className="text-muted-foreground">
                                        Sesiones: <span className="font-medium text-foreground">
                                          {mainPlan.sessions_count}
                                        </span>
                                      </span>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                setEditingPlan(mainPlan);
                                
                                let sessionConfig: any = {
                                  days_of_week: [],
                                  time_slots: [],
                                  professional_id: ""
                                };
                                let description = mainPlan.description || "";
                                
                                try {
                                  const parsedDescription = JSON.parse(description);
                                  if (parsedDescription.session_config) {
                                    sessionConfig = parsedDescription.session_config;
                                    description = parsedDescription.text || "";
                                    
                                    if (sessionConfig.default_start_time && sessionConfig.default_end_time && !sessionConfig.time_slots) {
                                      sessionConfig.time_slots = [{
                                        start_time: sessionConfig.default_start_time,
                                        end_time: sessionConfig.default_end_time
                                      }];
                                    }
                                  }
                                } catch (e) {
                                  console.log("Description is not JSON, using as plain text");
                                }
                                
                                setTimeSlots(sessionConfig.time_slots || []);
                                setExpandedDay(null);
                                
                                // Load per-day slots: migrate from global if needed
                                if (sessionConfig.day_slots && Object.keys(sessionConfig.day_slots).length > 0) {
                                  setDaySlots(sessionConfig.day_slots);
                                } else if (sessionConfig.time_slots?.length > 0 && sessionConfig.days_of_week?.length > 0) {
                                  const migrated: Record<string, Array<{ start_time: string; end_time: string }>> = {};
                                  sessionConfig.days_of_week.forEach((d: number) => {
                                    migrated[String(d)] = sessionConfig.time_slots.map((s: any) => ({ ...s }));
                                  });
                                  setDaySlots(migrated);
                                } else {
                                  setDaySlots({});
                                }

                                let loadedPacks: any[] = [];
                                const isMainPlan = mainPlan.pack_type === 'main' || childPacks.length > 0;
                                
                                if (isMainPlan && childPacks.length > 0) {
                                  loadedPacks = childPacks.map(pack => ({
                                    name: pack.name,
                                    price: pack.price,
                                    sessions_count: pack.sessions_count,
                                    pack_type: pack.pack_type || 'basic'
                                  }));
                                }
                                
                                setHasPacks(loadedPacks.length > 0);
                                setPacks(loadedPacks);
                                
                                planForm.reset({
                                  name: mainPlan.name,
                                  description: description,
                                  cycle: mainPlan.cycle as "weekly" | "monthly",
                                  price: mainPlan.price,
                                  currency: mainPlan.currency,
                                  sessions_count: mainPlan.sessions_count || undefined,
                                  capacity_per_session: mainPlan.capacity_per_session || undefined,
                                  photo_url: mainPlan.photo_url || undefined,
                                  active: mainPlan.active,
                                  days_of_week: sessionConfig.days_of_week || [],
                                  time_slots: sessionConfig.time_slots || [],
                                  professional_id: sessionConfig.professional_id || "",
                                  has_packs: loadedPacks.length > 0,
                                  packs: loadedPacks
                                });
                                setShowPlanDialog(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deletePlanMutation.mutate(mainPlan.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      {hasPackSystem && (
                        <CardContent className="pt-4">
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Packs Disponibles</h4>
                            <div className="grid gap-3">
                              {childPacks.map((pack) => (
                                <div
                                  key={pack.id}
                                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h5 className="font-medium">{pack.name}</h5>
                                      <Badge variant="outline" className="text-xs">
                                        {pack.pack_type || 'Pack'}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                      <span>{pack.sessions_count} sesiones</span>
                                      <span>•</span>
                                      <span className="font-semibold text-foreground">
                                        {pack.price} {pack.currency}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscribers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Suscriptores</CardTitle>
                <Button onClick={handleCreateSubscription}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Nueva Suscripción
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
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="paused">Pausada</SelectItem>
                    <SelectItem value="canceled">Cancelada</SelectItem>
                    <SelectItem value="past_due">Vencida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DataTable
                columns={subscriptionColumns}
                data={filteredSubscriptions}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Plan Dialog */}
      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingPlan ? "Editar Plan" : "Crear Plan"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2">
            <Form {...planForm}>
              <form onSubmit={planForm.handleSubmit(onSubmitPlan)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={planForm.control}
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
                  control={planForm.control}
                  name="cycle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ciclo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensual</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={planForm.control}
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
                  control={planForm.control}
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
                  control={planForm.control}
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

                <FormField
                 control={planForm.control}
                 name="sessions_count"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel className="flex items-center gap-2">
                       Sesiones Incluidas
                       <span className="text-xs text-muted-foreground font-normal">
                         (Total de sesiones que puede usar el cliente)
                       </span>
                     </FormLabel>
                     <FormControl>
                        <Input
                          type="number"
                          placeholder="Ej: 10 sesiones"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                     </FormControl>
                     <FormMessage />
                   </FormItem>
                 )}
               />

                <FormField
                 control={planForm.control}
                 name="capacity_per_session"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel className="flex items-center gap-2">
                       Aforo Máximo por Franja Horaria
                       <span className="text-xs text-muted-foreground font-normal">
                         (Cuántas personas pueden reservar la misma hora)
                       </span>
                     </FormLabel>
                     <FormControl>
                        <Input
                          type="number"
                          placeholder="Ej: 15 personas"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                     </FormControl>
                     <FormMessage />
                   </FormItem>
                 )}
               />

                {/* Configuración de Sesiones Programadas */}
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium text-sm">Configuración de Sesiones (Opcional)</h4>
                  
                  <FormField
                    control={planForm.control}
                    name="days_of_week"
                    render={({ field }) => {
                      const selectedDays = field.value || [];
                      const dayLabels: Record<number, string> = {
                        0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié',
                        4: 'Jue', 5: 'Vie', 6: 'Sáb'
                      };
                      const dayFullLabels: Record<number, string> = {
                        0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
                        4: 'Jueves', 5: 'Viernes', 6: 'Sábado'
                      };
                      
                      return (
                        <FormItem>
                          <FormLabel>Días de la Semana Disponibles</FormLabel>
                          <FormControl>
                            <div className="space-y-3">
                              {/* Global slot creator */}
                              {selectedDays.length > 0 && (
                                <div className="border border-dashed border-primary/30 rounded-lg p-3 bg-primary/5">
                                  <p className="text-xs font-medium text-muted-foreground mb-2">Añadir franja a todos los días seleccionados</p>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="time"
                                      className="h-8 text-xs w-28"
                                      value={globalSlotStart}
                                      onChange={(e) => setGlobalSlotStart(e.target.value)}
                                    />
                                    <span className="text-xs text-muted-foreground">—</span>
                                    <Input
                                      type="time"
                                      className="h-8 text-xs w-28"
                                      value={globalSlotEnd}
                                      onChange={(e) => setGlobalSlotEnd(e.target.value)}
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs"
                                      onClick={() => {
                                        if (!globalSlotStart || !globalSlotEnd || globalSlotStart >= globalSlotEnd) {
                                          toast({ title: "Hora inválida", description: "La hora de inicio debe ser anterior a la de fin", variant: "destructive" });
                                          return;
                                        }
                                        setDaySlots(prev => {
                                          const next = { ...prev };
                                          selectedDays.forEach((day: number) => {
                                            const key = String(day);
                                            const existing = next[key] || [];
                                            const isDuplicate = existing.some((s: any) => s.start_time === globalSlotStart && s.end_time === globalSlotEnd);
                                            if (!isDuplicate) {
                                              next[key] = [...existing, { start_time: globalSlotStart, end_time: globalSlotEnd }]
                                                .sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
                                            }
                                          });
                                          return next;
                                        });
                                        toast({ title: "Franja añadida", description: `${globalSlotStart} - ${globalSlotEnd} aplicada a ${selectedDays.length} día(s)` });
                                      }}
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Aplicar a todos
                                    </Button>
                                  </div>
                                </div>
                              )}
                              {/* Day buttons row */}
                              <div className="grid grid-cols-7 gap-1.5">
                                {[0, 1, 2, 3, 4, 5, 6].map((dayValue) => {
                                  const isSelected = selectedDays.includes(dayValue);
                                  const isExpanded = expandedDay === dayValue;
                                  const slotsCount = (daySlots[String(dayValue)] || []).length;
                                  
                                  return (
                                    <div key={dayValue} className="flex flex-col items-center gap-1">
                                      <button
                                        type="button"
                                        className={`w-full rounded-md border px-1 py-2 text-xs font-medium transition-colors ${
                                          isSelected
                                            ? isExpanded
                                              ? 'bg-primary text-primary-foreground border-primary'
                                              : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                                            : 'bg-background text-muted-foreground border-input hover:bg-accent'
                                        }`}
                                        onClick={() => {
                                          if (!isSelected) {
                                            const newDays = [...selectedDays, dayValue];
                                            field.onChange(newDays);
                                            const existingSlots = Object.values(daySlots).find(s => s.length > 0);
                                            setDaySlots(prev => ({
                                              ...prev,
                                              [String(dayValue)]: existingSlots ? existingSlots.map(s => ({ ...s })) : []
                                            }));
                                            setExpandedDay(dayValue);
                                          } else {
                                            setExpandedDay(isExpanded ? null : dayValue);
                                          }
                                        }}
                                      >
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span>{dayLabels[dayValue]}</span>
                                          {isSelected && slotsCount > 0 && (
                                            <span className="text-[10px] opacity-70">{slotsCount} franja{slotsCount !== 1 ? 's' : ''}</span>
                                          )}
                                        </div>
                                        {isSelected && (
                                          isExpanded ? <ChevronUp className="h-3 w-3 mx-auto mt-0.5" /> : <ChevronDown className="h-3 w-3 mx-auto mt-0.5" />
                                        )}
                                      </button>
                                      {isSelected && (
                                        <button
                                          type="button"
                                          className="text-[10px] text-destructive hover:underline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            field.onChange(selectedDays.filter((d: number) => d !== dayValue));
                                            if (expandedDay === dayValue) setExpandedDay(null);
                                            setDaySlots(prev => {
                                              const next = { ...prev };
                                              delete next[String(dayValue)];
                                              return next;
                                            });
                                          }}
                                        >
                                          Quitar
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              
                              {/* Expanded day slots editor */}
                              {expandedDay !== null && selectedDays.includes(expandedDay) && (
                                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                                  <div className="flex items-center justify-between">
                                    <h5 className="font-semibold text-sm">{dayFullLabels[expandedDay]} — Franjas Horarias</h5>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const dayKey = String(expandedDay);
                                        setDaySlots(prev => ({
                                          ...prev,
                                          [dayKey]: [...(prev[dayKey] || []), { start_time: "", end_time: "" }]
                                        }));
                                      }}
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Añadir Franja
                                    </Button>
                                  </div>
                                  
                                  {(() => {
                                    const dayKey = String(expandedDay);
                                    const slotsForDay = daySlots[dayKey] || [];
                                    
                                    if (slotsForDay.length === 0) {
                                      return (
                                        <p className="text-sm text-muted-foreground py-2">
                                          Sin franjas horarias. Añade una para definir cuándo se puede reservar este día.
                                        </p>
                                      );
                                    }
                                    
                                    return slotsForDay.map((slot, slotIdx) => (
                                      <div key={slotIdx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                                        <div>
                                          <FormLabel className="text-xs">Inicio</FormLabel>
                                          <Input
                                            type="time"
                                            value={slot.start_time}
                                            onChange={(e) => {
                                              setDaySlots(prev => {
                                                const newSlots = [...(prev[dayKey] || [])];
                                                newSlots[slotIdx] = { ...newSlots[slotIdx], start_time: e.target.value };
                                                return { ...prev, [dayKey]: newSlots };
                                              });
                                            }}
                                          />
                                        </div>
                                        <div>
                                          <FormLabel className="text-xs">Fin</FormLabel>
                                          <Input
                                            type="time"
                                            value={slot.end_time}
                                            onChange={(e) => {
                                              setDaySlots(prev => {
                                                const newSlots = [...(prev[dayKey] || [])];
                                                newSlots[slotIdx] = { ...newSlots[slotIdx], end_time: e.target.value };
                                                return { ...prev, [dayKey]: newSlots };
                                              });
                                            }}
                                          />
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setDaySlots(prev => {
                                              const newSlots = (prev[dayKey] || []).filter((_, i) => i !== slotIdx);
                                              return { ...prev, [dayKey]: newSlots };
                                            });
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ));
                                  })()}
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>



                {/* Professional Assignment */}
                <FormField
                  control={planForm.control}
                  name="professional_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profesional Asignado</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || "unassigned"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar profesional" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="unassigned">Sin profesional específico</SelectItem>
                          {professionals.map((professional) => (
                            <SelectItem key={professional.id} value={professional.id}>
                              {professional.name}
                              {professional.specialty && ` - ${professional.specialty}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                control={planForm.control}
                name="photo_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Foto del Plan</FormLabel>
                    <FormControl>
                      <ImageUpload
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

               {/* Sistema de Packs */}
               <div className="space-y-4 border rounded-lg p-4">
                 <div className="flex items-center justify-between">
                   <div className="space-y-0.5">
                     <FormLabel className="text-base">Sistema de Packs</FormLabel>
                     <p className="text-sm text-muted-foreground">
                       Crear diferentes niveles (Básico, Intermedio, Premium) con distintos límites de sesiones
                     </p>
                   </div>
                   <Switch
                     checked={hasPacks}
                     onCheckedChange={(checked) => {
                       setHasPacks(checked);
                       planForm.setValue("has_packs", checked);
                       if (!checked) {
                         setPacks([]);
                         planForm.setValue("packs", []);
                       }
                     }}
                   />
                 </div>

                 {hasPacks && (
                   <div className="space-y-3 mt-4">
                     <div className="flex items-center justify-between">
                       <FormLabel>Packs Disponibles</FormLabel>
                       <Button
                         type="button"
                         variant="outline"
                         size="sm"
                         onClick={() => {
                           const newPacks = [...packs, { name: "", price: 0, sessions_count: 1, pack_type: "" }];
                           setPacks(newPacks);
                           planForm.setValue("packs", newPacks);
                         }}
                       >
                         <Plus className="h-4 w-4 mr-1" />
                         Añadir Pack
                       </Button>
                     </div>

                     {packs.length === 0 && (
                       <p className="text-sm text-muted-foreground">
                         No hay packs. Haz clic en "Añadir Pack" para crear uno.
                       </p>
                     )}

                     {packs.map((pack, index) => (
                       <Card key={index} className="p-4">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                           <div>
                             <FormLabel>Nombre del Pack</FormLabel>
                             <Input
                               value={pack.name}
                               onChange={(e) => {
                                 const newPacks = [...packs];
                                 newPacks[index].name = e.target.value;
                                 setPacks(newPacks);
                                 planForm.setValue("packs", newPacks);
                               }}
                               placeholder="Ej: Básico, Intermedio, Premium"
                             />
                           </div>
                           <div>
                             <FormLabel>Tipo</FormLabel>
                             <Select
                               value={pack.pack_type}
                               onValueChange={(value) => {
                                 const newPacks = [...packs];
                                 newPacks[index].pack_type = value;
                                 setPacks(newPacks);
                                 planForm.setValue("packs", newPacks);
                               }}
                             >
                               <SelectTrigger>
                                 <SelectValue placeholder="Seleccionar tipo" />
                               </SelectTrigger>
                               <SelectContent>
                                 <SelectItem value="basic">Básico</SelectItem>
                                 <SelectItem value="intermediate">Intermedio</SelectItem>
                                 <SelectItem value="premium">Premium</SelectItem>
                               </SelectContent>
                             </Select>
                           </div>
                           <div>
                             <FormLabel>Precio (€)</FormLabel>
                             <Input
                               type="number"
                               min="0"
                               step="0.01"
                               value={pack.price}
                               onChange={(e) => {
                                 const newPacks = [...packs];
                                 newPacks[index].price = parseFloat(e.target.value) || 0;
                                 setPacks(newPacks);
                                 planForm.setValue("packs", newPacks);
                               }}
                             />
                           </div>
                            <div>
                              <FormLabel>Sesiones Incluidas</FormLabel>
                              <div className="flex gap-2">
                                <Input
                                  type="number"
                                  min="1"
                                  value={pack.sessions_count}
                                  onChange={(e) => {
                                    const newPacks = [...packs];
                                    newPacks[index].sessions_count = parseInt(e.target.value) || 1;
                                    setPacks(newPacks);
                                    planForm.setValue("packs", newPacks);
                                  }}
                                />
                               <Button
                                 type="button"
                                 variant="ghost"
                                 size="sm"
                                 onClick={() => {
                                   const newPacks = packs.filter((_, i) => i !== index);
                                   setPacks(newPacks);
                                   planForm.setValue("packs", newPacks);
                                 }}
                               >
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                             </div>
                           </div>
                         </div>
                       </Card>
                     ))}

                      <p className="text-xs text-muted-foreground">
                        Nota: Los packs heredan las franjas horarias, días de la semana y profesionales del plan principal.
                      </p>
                   </div>
                 )}
               </div>

               <FormField
                control={planForm.control}
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
                  onClick={() => setShowPlanDialog(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={planMutation.isPending}>
                  {planMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          </Form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscription Dialog */}
      <Dialog open={showSubscriptionDialog} onOpenChange={setShowSubscriptionDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Suscripción</DialogTitle>
          </DialogHeader>
          <Form {...subscriptionForm}>
            <form onSubmit={subscriptionForm.handleSubmit(onSubmitSubscription)} className="space-y-4">
              <FormField
                control={subscriptionForm.control}
                name="user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuario</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar usuario" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name} ({user.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={subscriptionForm.control}
                name="plan_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar plan" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {plans.filter(p => p.active).map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name} - {plan.price} {plan.currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={subscriptionForm.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Inicio</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={subscriptionForm.control}
                  name="next_billing_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Próxima Facturación</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSubscriptionDialog(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={subscriptionMutation.isPending}>
                  {subscriptionMutation.isPending ? "Creando..." : "Crear"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Subscription Details Modal */}
      <SubscriptionDetailsModal
        subscription={selectedSubscription}
        open={showDetailsModal}
        onOpenChange={setShowDetailsModal}
        onCancelSubscription={() => {
          setShowDetailsModal(false);
          if (selectedSubscription) {
            setSubscriptionToCancel(selectedSubscription);
            setShowCancelModal(true);
          }
        }}
      />

      {/* Cancel Subscription Modal */}
      <CancelSubscriptionModal
        subscription={subscriptionToCancel}
        open={showCancelModal}
        onOpenChange={setShowCancelModal}
      />
    </div>
  );
}

export default Subscriptions;