import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ImageUpload } from "@/components/ui/image-upload";
import { 
  Loader2, 
  Plus, 
  Edit, 
  Trash2, 
  Calendar, 
  Clock, 
  Users, 
  MapPin, 
  ArrowLeft,
  CalendarIcon,
  Euro,
  Repeat,
  AlertTriangle,
  Search
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { format, parse, addWeeks, startOfWeek, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

const classSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  category_id: z.string().optional(),
  duration_min: z.number().min(1, "La duración debe ser mayor a 0"),
  capacity: z.number().min(1, "La capacidad debe ser mayor a 0"),
  price: z.number().min(0, "El precio no puede ser negativo"),
  currency: z.string().default("EUR"),
  default_start_time: z.string().optional(),
  default_end_time: z.string().optional(),
  days_of_week: z.array(z.number()).optional(),
  photo_url: z.string().optional(),
  active: z.boolean(),
  professional_ids: z.array(z.string()).optional(),
  location_ids: z.array(z.string()).optional(),
});

const sessionSchema = z.object({
  location_id: z.string().min(1, "La ubicación es requerida"),
  professional_id: z.string().min(1, "El profesional es requerido"),
  start_at: z.string().min(1, "La fecha/hora de inicio es requerida"),
  end_at: z.string().min(1, "La fecha/hora de fin es requerida"),
  capacity: z.number().min(1, "La capacidad debe ser mayor a 0"),
});

const generateSessionsSchema = z.object({
  start_date: z.date({ required_error: "La fecha de inicio es requerida" }),
  end_date: z.date({ required_error: "La fecha de fin es requerida" }),
  days_of_week: z.array(z.number()).min(1, "Selecciona al menos un día"),
  start_time: z.string().min(1, "La hora de inicio es requerida"),
  end_time: z.string().min(1, "La hora de fin es requerida"),
  location_id: z.string().min(1, "La ubicación es requerida"),
  professional_id: z.string().min(1, "El profesional es requerido"),
  capacity: z.number().min(1, "La capacidad debe ser mayor a 0"),
});

interface Class {
  id: string;
  name: string;
  description?: string;
  category_id?: string;
  duration_min: number;
  capacity: number;
  price: number;
  currency: string;
  default_start_time?: string;
  default_end_time?: string;
  days_of_week?: number[];
  photo_url?: string;
  active: boolean;
  created_at: string;
  categories?: { name: string };
}

interface Session {
  id: string;
  class_id: string;
  location_id: string;
  professional_id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  locations?: { name: string };
  professionals?: { name: string };
}

interface Category {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface Professional {
  id: string;
  name: string;
}

interface DeleteInfo {
  canHardDelete: boolean;
  counts: {
    services: number;
    classes: number;
    futureBookings: number;
    futureSessions: number;
    adminUsers: number;
  };
}

export default function Classes() {
  const { toast } = useToast();
  const [classes, setClasses] = useState<Class[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [deletingClass, setDeletingClass] = useState<Class | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<DeleteInfo | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [sessionSearch, setSessionSearch] = useState<string>("");

  const classForm = useForm<z.infer<typeof classSchema>>({
    resolver: zodResolver(classSchema),
    defaultValues: {
      name: "",
      description: "",
      category_id: "",
      duration_min: 60,
      capacity: 10,
      price: 0,
      currency: "EUR",
      default_start_time: "",
      default_end_time: "",
      days_of_week: [],
      photo_url: "",
      active: true,
      professional_ids: [],
      location_ids: [],
    },
  });

  const sessionForm = useForm<z.infer<typeof sessionSchema>>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      location_id: "",
      professional_id: "",
      start_at: "",
      end_at: "",
      capacity: 10,
    },
  });

  const generateForm = useForm<z.infer<typeof generateSessionsSchema>>({
    resolver: zodResolver(generateSessionsSchema),
    defaultValues: {
      days_of_week: [],
      start_time: "",
      end_time: "",
      location_id: "",
      professional_id: "",
      capacity: 10,
    },
  });

  const dayNames = ["L", "M", "X", "J", "V", "S", "D"];
  
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [classesRes, categoriesRes, locationsRes, professionalsRes] = await Promise.all([
        supabase
          .from("classes")
          .select(`
            *,
            categories (name)
          `)
          .order("name"),
        supabase.from("categories").select("*").eq("active", true).order("name"),
        supabase.from("locations").select("*").eq("active", true).order("name"),
        supabase.from("professionals").select("*").eq("active", true).order("name")
      ]);

      if (classesRes.error) throw classesRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (locationsRes.error) throw locationsRes.error;
      if (professionalsRes.error) throw professionalsRes.error;

      setClasses(classesRes.data || []);
      setCategories(categoriesRes.data || []);
      setLocations(locationsRes.data || []);
      setProfessionals(professionalsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Error al cargar los datos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async (classId: string) => {
    try {
      const { data, error } = await supabase
        .from("class_sessions")
        .select(`
          *,
          locations (name),
          professionals (name)
        `)
        .eq("class_id", classId)
        .order("start_at");

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      toast({
        title: "Error",
        description: "Error al cargar las sesiones",
        variant: "destructive",
      });
    }
  };

  const fetchClassRelations = async (classId: string) => {
    try {
      const [profRes, locRes] = await Promise.all([
        supabase.from("class_professionals").select("professional_id").eq("class_id", classId),
        supabase.from("class_locations").select("location_id").eq("class_id", classId)
      ]);

      return {
        professional_ids: profRes.data?.map(p => p.professional_id) || [],
        location_ids: locRes.data?.map(l => l.location_id) || []
      };
    } catch (error) {
      console.error("Error fetching relations:", error);
      return { professional_ids: [], location_ids: [] };
    }
  };

  const onSubmitClass = async (values: z.infer<typeof classSchema>) => {
    setSubmitting(true);
    try {
      const classData = {
        name: values.name,
        description: values.description || null,
        category_id: values.category_id || null,
        duration_min: values.duration_min,
        capacity: values.capacity,
        price: values.price,
        currency: values.currency,
        default_start_time: values.default_start_time || null,
        default_end_time: values.default_end_time || null,
        days_of_week: values.days_of_week || null,
        photo_url: values.photo_url || null,
        active: values.active,
      };

      let classId: string;

      if (editingClass) {
        const { error } = await supabase
          .from("classes")
          .update(classData)
          .eq("id", editingClass.id);

        if (error) throw error;
        classId = editingClass.id;
        toast({ title: "Éxito", description: "Clase actualizada correctamente" });
      } else {
        const { data, error } = await supabase
          .from("classes")
          .insert([classData])
          .select()
          .single();
        
        if (error) throw error;
        classId = data.id;
        toast({ title: "Éxito", description: "Clase creada correctamente" });
      }

      // Update relations
      if (values.professional_ids || values.location_ids) {
        // Delete existing relations
        await Promise.all([
          supabase.from("class_professionals").delete().eq("class_id", classId),
          supabase.from("class_locations").delete().eq("class_id", classId)
        ]);

        // Insert new relations
        if (values.professional_ids?.length) {
          await supabase.from("class_professionals").insert(
            values.professional_ids.map(id => ({ class_id: classId, professional_id: id }))
          );
        }

        if (values.location_ids?.length) {
          await supabase.from("class_locations").insert(
            values.location_ids.map(id => ({ class_id: classId, location_id: id }))
          );
        }
      }

      setIsClassDialogOpen(false);
      setEditingClass(null);
      classForm.reset();
      fetchData();
    } catch (error: any) {
      console.error("Error saving class:", error);
      toast({
        title: "Error",
        description: error.message || "Error al guardar la clase",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitSession = async (values: z.infer<typeof sessionSchema>) => {
    try {
      const sessionData = {
        class_id: selectedClass?.id!,
        location_id: values.location_id,
        professional_id: values.professional_id,
        start_at: new Date(values.start_at).toISOString(),
        end_at: new Date(values.end_at).toISOString(),
        capacity: values.capacity,
      };

      if (editingSession) {
        const { error } = await supabase
          .from("class_sessions")
          .update(sessionData)
          .eq("id", editingSession.id);

        if (error) throw error;
        toast({ title: "Éxito", description: "Sesión actualizada correctamente" });
      } else {
        const { error } = await supabase.from("class_sessions").insert([sessionData]);
        if (error) throw error;
        toast({ title: "Éxito", description: "Sesión creada correctamente" });
      }

      setIsSessionDialogOpen(false);
      setEditingSession(null);
      sessionForm.reset();
      if (selectedClass) {
        fetchSessions(selectedClass.id);
      }
    } catch (error) {
      console.error("Error saving session:", error);
      toast({
        title: "Error",
        description: "Error al guardar la sesión",
        variant: "destructive",
      });
    }
  };

  const onGenerateSessions = async (values: z.infer<typeof generateSessionsSchema>) => {
    try {
      const sessions = [];
      let currentDate = startOfWeek(values.start_date, { weekStartsOn: 1 }); // Monday = 1

      while (currentDate <= values.end_date) {
        values.days_of_week.forEach(dayOfWeek => {
          const sessionDate = addDays(currentDate, dayOfWeek - 1);
          
          if (sessionDate >= values.start_date && sessionDate <= values.end_date) {
            const startDateTime = new Date(sessionDate);
            const [startHour, startMin] = values.start_time.split(':');
            startDateTime.setHours(parseInt(startHour), parseInt(startMin));

            const endDateTime = new Date(sessionDate);
            const [endHour, endMin] = values.end_time.split(':');
            endDateTime.setHours(parseInt(endHour), parseInt(endMin));

            sessions.push({
              class_id: selectedClass?.id!,
              location_id: values.location_id,
              professional_id: values.professional_id,
              start_at: startDateTime.toISOString(),
              end_at: endDateTime.toISOString(),
              capacity: values.capacity,
            });
          }
        });
        currentDate = addWeeks(currentDate, 1);
      }

      // Check for duplicates
      const { data: existing } = await supabase
        .from("class_sessions")
        .select("start_at")
        .eq("class_id", selectedClass?.id!);

      const existingTimes = new Set(existing?.map(s => s.start_at) || []);
      const newSessions = sessions.filter(s => !existingTimes.has(s.start_at));

      if (newSessions.length === 0) {
        toast({
          title: "Información",
          description: "No se crearon nuevas sesiones (ya existen para esas fechas)",
        });
        return;
      }

      const { error } = await supabase.from("class_sessions").insert(newSessions);
      if (error) throw error;

      toast({
        title: "Éxito",
        description: `Se crearon ${newSessions.length} sesiones`,
      });

      setIsGenerateDialogOpen(false);
      generateForm.reset();
      if (selectedClass) {
        fetchSessions(selectedClass.id);
      }
    } catch (error) {
      console.error("Error generating sessions:", error);
      toast({
        title: "Error",
        description: "Error al generar sesiones",
        variant: "destructive",
      });
    }
  };

  const checkDeleteDependencies = async (classItem: Class) => {
    try {
      // Check for future sessions and bookings
      const { data: futureSessions } = await supabase
        .from("class_sessions")
        .select("id")
        .eq("class_id", classItem.id)
        .gte("start_at", new Date().toISOString());

      const { data: futureBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("class_id", classItem.id)
        .gte("start_at", new Date().toISOString());

      const canHardDelete = (futureSessions?.length || 0) === 0 && (futureBookings?.length || 0) === 0;

      const deleteInfo: DeleteInfo = {
        canHardDelete,
        counts: {
          services: 0,
          classes: 0,
          futureBookings: futureBookings?.length || 0,
          futureSessions: futureSessions?.length || 0,
          adminUsers: 0,
        }
      };

      setDeleteInfo(deleteInfo);
      setDeletingClass(classItem);
      setIsDeleteDialogOpen(true);
    } catch (error) {
      console.error("Error checking dependencies:", error);
      toast({
        title: "Error",
        description: "Error al verificar dependencias",
        variant: "destructive",
      });
    }
  };

  const executeDelete = async (force: boolean = false) => {
    if (!deletingClass) return;

    try {
      if (force && deleteInfo?.canHardDelete) {
        // Hard delete: remove sessions, relations and class
        await Promise.all([
          supabase.from("class_sessions").delete().eq("class_id", deletingClass.id),
          supabase.from("class_professionals").delete().eq("class_id", deletingClass.id),
          supabase.from("class_locations").delete().eq("class_id", deletingClass.id)
        ]);
        
        // Delete photo if exists
        if (deletingClass.photo_url && deletingClass.photo_url.includes('public-media')) {
          const fileName = deletingClass.photo_url.split('/').pop();
          if (fileName) {
            await supabase.storage
              .from('public-media')
              .remove([`classes/${deletingClass.id}/${fileName}`]);
          }
        }

        const { error } = await supabase.from("classes").delete().eq("id", deletingClass.id);
        if (error) throw error;
        
        toast({ title: "Éxito", description: "Clase eliminada completamente" });
      } else {
        // Soft delete: deactivate
        const { error } = await supabase
          .from("classes")
          .update({ active: false })
          .eq("id", deletingClass.id);
        
        if (error) throw error;
        toast({ title: "Éxito", description: "Clase desactivada correctamente" });
      }

      setIsDeleteDialogOpen(false);
      setDeletingClass(null);
      setDeleteInfo(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting class:", error);
      toast({
        title: "Error",
        description: "Error al eliminar la clase",
        variant: "destructive",
      });
    }
  };

  const deleteSession = async (id: string) => {
    try {
      // Check if session has bookings
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("session_id", id)
        .gte("start_at", new Date().toISOString());

      if (bookings && bookings.length > 0) {
        toast({
          title: "No se puede eliminar",
          description: "Esta sesión tiene reservas futuras asociadas",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("class_sessions").delete().eq("id", id);
      if (error) throw error;
      
      toast({ title: "Éxito", description: "Sesión eliminada correctamente" });
      if (selectedClass) {
        fetchSessions(selectedClass.id);
      }
    } catch (error) {
      console.error("Error deleting session:", error);
      toast({
        title: "Error",
        description: "Error al eliminar la sesión",
        variant: "destructive",
      });
    }
  };

  const openEditClass = async (classItem: Class) => {
    setEditingClass(classItem);
    
    // Fetch relations
    const relations = await fetchClassRelations(classItem.id);
    
    classForm.reset({
      name: classItem.name,
      description: classItem.description || "",
      category_id: classItem.category_id || "",
      duration_min: classItem.duration_min,
      capacity: classItem.capacity,
      price: classItem.price || 0,
      currency: classItem.currency || "EUR",
      default_start_time: classItem.default_start_time || "",
      default_end_time: classItem.default_end_time || "",
      days_of_week: classItem.days_of_week || [],
      photo_url: classItem.photo_url || "",
      active: classItem.active,
      professional_ids: relations.professional_ids,
      location_ids: relations.location_ids,
    });
    setIsClassDialogOpen(true);
  };

  const openEditSession = (session: Session) => {
    setEditingSession(session);
    sessionForm.reset({
      location_id: session.location_id,
      professional_id: session.professional_id,
      start_at: session.start_at.slice(0, 16),
      end_at: session.end_at.slice(0, 16),
      capacity: session.capacity,
    });
    setIsSessionDialogOpen(true);
  };

  const openClassSessions = (classItem: Class) => {
    setSelectedClass(classItem);
    fetchSessions(classItem.id);
  };

  const openGenerateSessions = (classItem: Class) => {
    setSelectedClass(classItem);
    
    // Pre-fill form with class defaults
    generateForm.reset({
      days_of_week: classItem.days_of_week || [],
      start_time: classItem.default_start_time || "",
      end_time: classItem.default_end_time || "",
      capacity: classItem.capacity,
      location_id: "",
      professional_id: "",
    });
    
    setIsGenerateDialogOpen(true);
  };

  const filteredClasses = classes.filter((classItem) => {
    const categoryMatch = categoryFilter === "all" || !categoryFilter || classItem.category_id === categoryFilter;
    const activeMatch = activeFilter === "all" || !activeFilter || classItem.active.toString() === activeFilter;
    return categoryMatch && activeMatch;
  });

  const classColumns: ColumnDef<Class>[] = [
    {
      accessorKey: "name",
      header: "Nombre",
    },
    {
      accessorKey: "categories.name",
      header: "Categoría",
      cell: ({ row }) => row.original.categories?.name || "Sin categoría",
    },
    {
      accessorKey: "duration_min",
      header: "Duración",
      cell: ({ row }) => `${row.original.duration_min} min`,
    },
    {
      accessorKey: "capacity",
      header: "Capacidad",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4 text-muted-foreground" />
          {row.original.capacity}
        </div>
      ),
    },
    {
      accessorKey: "price",
      header: "Precio",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Euro className="h-4 w-4 text-muted-foreground" />
          {row.original.price} {row.original.currency}
        </div>
      ),
    },
    {
      accessorKey: "active",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={row.original.active ? "default" : "secondary"}>
          {row.original.active ? "Activo" : "Inactivo"}
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
            onClick={() => openClassSessions(row.original)}
          >
            <Calendar className="h-4 w-4" />
            Sesiones
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openEditClass(row.original)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkDeleteDependencies(row.original)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const sessionColumns: ColumnDef<Session>[] = [
    {
      accessorKey: "locations.name",
      header: "Ubicación",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          {row.original.locations?.name}
        </div>
      ),
    },
    {
      accessorKey: "professionals.name",
      header: "Profesional",
    },
    {
      accessorKey: "start_at",
      header: "Inicio",
      cell: ({ row }) => new Date(row.original.start_at).toLocaleString("es-ES"),
    },
    {
      accessorKey: "end_at",
      header: "Fin",
      cell: ({ row }) => new Date(row.original.end_at).toLocaleString("es-ES"),
    },
    {
      accessorKey: "capacity",
      header: "Capacidad",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4 text-muted-foreground" />
          {row.original.capacity}
        </div>
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
            onClick={() => openEditSession(row.original)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => deleteSession(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (selectedClass && !isGenerateDialogOpen) {
    const filteredSessions = sessions.filter(session => {
      const searchLower = sessionSearch.toLowerCase();
      const startDate = new Date(session.start_at).toLocaleString("es-ES");
      const endDate = new Date(session.end_at).toLocaleString("es-ES");
      
      return (
        session.locations?.name.toLowerCase().includes(searchLower) ||
        session.professionals?.name.toLowerCase().includes(searchLower) ||
        startDate.toLowerCase().includes(searchLower) ||
        endDate.toLowerCase().includes(searchLower) ||
        session.capacity.toString().includes(sessionSearch)
      );
    });

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="outline" onClick={() => {
              setSelectedClass(null);
              setSessionSearch("");
            }}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Clases
            </Button>
            <h1 className="text-2xl font-bold mt-2">Sesiones - {selectedClass.name}</h1>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => openGenerateSessions(selectedClass)}>
              <Repeat className="h-4 w-4 mr-2" />
              Generar Sesiones
            </Button>
            <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Sesión
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingSession ? "Editar Sesión" : "Nueva Sesión"}
                  </DialogTitle>
                </DialogHeader>
                <Form {...sessionForm}>
                  <form onSubmit={sessionForm.handleSubmit(onSubmitSession)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={sessionForm.control}
                        name="location_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ubicación</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar ubicación" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {locations.map((location) => (
                                  <SelectItem key={location.id} value={location.id}>
                                    {location.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={sessionForm.control}
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
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={sessionForm.control}
                        name="start_at"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha y Hora de Inicio</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={sessionForm.control}
                        name="end_at"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha y Hora de Fin</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={sessionForm.control}
                      name="capacity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Capacidad</FormLabel>
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
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsSessionDialogOpen(false);
                          setEditingSession(null);
                          sessionForm.reset();
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit">
                        {editingSession ? "Actualizar" : "Crear"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sesiones Programadas</CardTitle>
            <CardDescription>
              Gestiona las sesiones de la clase {selectedClass.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ubicación, profesional, fecha o capacidad..."
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                className="pl-8 max-w-sm"
              />
            </div>
            <DataTable 
              columns={sessionColumns} 
              data={filteredSessions}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clases"
        description="Gestiona las clases y sus sesiones programadas"
      />

      <div className="flex gap-4 items-end">
        <div>
          <Label htmlFor="category-filter">Filtrar por categoría</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="active-filter">Filtrar por estado</Label>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="true">Activo</SelectItem>
              <SelectItem value="false">Inactivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Dialog open={isClassDialogOpen} onOpenChange={setIsClassDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Clase
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingClass ? "Editar Clase" : "Nueva Clase"}
              </DialogTitle>
            </DialogHeader>
            <Form {...classForm}>
              <form onSubmit={classForm.handleSubmit(onSubmitClass)} className="space-y-4">
                <FormField
                  control={classForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre de la clase" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={classForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Descripción de la clase" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={classForm.control}
                  name="photo_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Foto de la clase</FormLabel>
                      <FormControl>
                        <ImageUpload
                          value={field.value}
                          onChange={field.onChange}
                          professionalId={editingClass?.id}
                          disabled={submitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={classForm.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={classForm.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Moneda</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar moneda" />
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
                  control={classForm.control}
                  name="category_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar categoría" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
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
                    control={classForm.control}
                    name="duration_min"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duración (minutos) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={classForm.control}
                    name="capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capacidad por defecto *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={classForm.control}
                  name="days_of_week"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Días de la semana (recurrencia)</FormLabel>
                      <div className="flex gap-2">
                        {dayNames.map((day, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <Checkbox
                              id={`day-${index}`}
                              checked={field.value?.includes(index + 1)}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked) {
                                  field.onChange([...current, index + 1]);
                                } else {
                                  field.onChange(current.filter(d => d !== index + 1));
                                }
                              }}
                            />
                            <Label htmlFor={`day-${index}`} className="text-sm">
                              {day}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={classForm.control}
                    name="default_start_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hora de inicio por defecto</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={classForm.control}
                    name="default_end_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hora de fin por defecto</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={classForm.control}
                  name="professional_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profesional(es)</FormLabel>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded p-2">
                        {professionals.map((professional) => (
                          <div key={professional.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`prof-${professional.id}`}
                              checked={field.value?.includes(professional.id)}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked) {
                                  field.onChange([...current, professional.id]);
                                } else {
                                  field.onChange(current.filter(id => id !== professional.id));
                                }
                              }}
                            />
                            <Label htmlFor={`prof-${professional.id}`} className="text-sm">
                              {professional.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={classForm.control}
                  name="location_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ubicación(es)</FormLabel>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded p-2">
                        {locations.map((location) => (
                          <div key={location.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`loc-${location.id}`}
                              checked={field.value?.includes(location.id)}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked) {
                                  field.onChange([...current, location.id]);
                                } else {
                                  field.onChange(current.filter(id => id !== location.id));
                                }
                              }}
                            />
                            <Label htmlFor={`loc-${location.id}`} className="text-sm">
                              {location.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={classForm.control}
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
                    onClick={() => {
                      setIsClassDialogOpen(false);
                      setEditingClass(null);
                      classForm.reset();
                    }}
                    disabled={submitting}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingClass ? "Actualizar" : "Crear"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Generate Sessions Dialog */}
      <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generar Sesiones - {selectedClass?.name}</DialogTitle>
          </DialogHeader>
          <Form {...generateForm}>
            <form onSubmit={generateForm.handleSubmit(onGenerateSessions)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={generateForm.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Fecha de inicio</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP", { locale: es })
                              ) : (
                                <span>Seleccionar fecha</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date()}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={generateForm.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Fecha de fin</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP", { locale: es })
                              ) : (
                                <span>Seleccionar fecha</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date()}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={generateForm.control}
                name="days_of_week"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Días de la semana</FormLabel>
                    <div className="flex gap-2">
                      {dayNames.map((day, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <Checkbox
                            id={`gen-day-${index}`}
                            checked={field.value?.includes(index + 1)}
                            onCheckedChange={(checked) => {
                              const current = field.value || [];
                              if (checked) {
                                field.onChange([...current, index + 1]);
                              } else {
                                field.onChange(current.filter(d => d !== index + 1));
                              }
                            }}
                          />
                          <Label htmlFor={`gen-day-${index}`} className="text-sm">
                            {day}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={generateForm.control}
                  name="start_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora de inicio</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={generateForm.control}
                  name="end_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora de fin</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={generateForm.control}
                  name="location_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ubicación</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar ubicación" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {locations.map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={generateForm.control}
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
              </div>

              <FormField
                control={generateForm.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacidad por sesión</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsGenerateDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  Generar Sesiones
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <p>¿Estás seguro de que quieres eliminar la clase "{deletingClass?.name}"?</p>
                {deleteInfo && (
                  <div className="bg-muted p-3 rounded-md">
                    <p className="font-semibold">Dependencias encontradas:</p>
                    <ul className="text-sm space-y-1">
                      <li>Sesiones futuras: {deleteInfo.counts.futureSessions}</li>
                      <li>Reservas futuras: {deleteInfo.counts.futureBookings}</li>
                    </ul>
                  </div>
                )}
                {deleteInfo && !deleteInfo.canHardDelete && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    <p className="text-sm">
                      No puedes eliminar mientras existan sesiones o reservas futuras.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => executeDelete(false)}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Desactivar
            </AlertDialogAction>
            {deleteInfo?.canHardDelete && (
              <AlertDialogAction
                onClick={() => executeDelete(true)}
                className="bg-red-600 hover:bg-red-700"
              >
                Eliminar definitivamente
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Clases</CardTitle>
          <CardDescription>
            Gestiona las clases disponibles en tu centro
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={classColumns}
            data={filteredClasses}
            searchKey="name"
            searchPlaceholder="Buscar clases..."
          />
        </CardContent>
      </Card>
    </div>
  );
}