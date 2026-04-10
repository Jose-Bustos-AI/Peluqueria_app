import { useState, useEffect } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Edit, Trash2, Activity, Clock, Euro } from "lucide-react"
import { DataTable } from "@/components/ui/data-table"
import { PageHeader } from "@/components/ui/page-header"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { ImageUpload } from "@/components/ui/image-upload"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Service = {
  id: string
  name: string
  description: string | null
  price: number
  currency: string
  duration_min: number
  buffer_min: number
  credit_cost: number
  active: boolean
  category_id: string | null
  photo_url: string | null
  categories?: { name: string }
}

type ServiceFormData = {
  name: string
  description: string
  price: number
  currency: string
  duration_min: number
  buffer_min: number
  credit_cost: number
  active: boolean
  category_id: string
  photo_url: string
  professional_ids: string[]
}

type Professional = {
  id: string
  name: string
  active: boolean
}

export default function Services() {
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<{id: string, name: string}[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { toast } = useToast()

  const form = useForm<ServiceFormData>({
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      currency: "EUR",
      duration_min: 60,
      buffer_min: 0,
      credit_cost: 1,
      active: true,
      category_id: "",
      photo_url: "",
      professional_ids: [],
    },
  })

  const columns: ColumnDef<Service>[] = [
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{row.getValue("name")}</span>
        </div>
      ),
    },
    {
      accessorKey: "categories.name",
      header: "Categoría",
      cell: ({ row }) => row.original.categories?.name || "—",
    },
    {
      accessorKey: "price",
      header: "Precio",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Euro className="h-3 w-3 text-muted-foreground" />
          <span>{row.getValue("price")}</span>
        </div>
      ),
    },
    {
      accessorKey: "duration_min",
      header: "Duración",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span>{row.getValue("duration_min")}min</span>
        </div>
      ),
    },
    {
      accessorKey: "credit_cost",
      header: "Coste Créditos",
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
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              openEditDialog(row.original)
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              deleteService(row.original.id)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select(`
          *,
          categories (
            name
          )
        `)
        .order('name')

      if (error) throw error
      setServices(data || [])
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los servicios",
        variant: "destructive",
      })
    }
  }

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('active', true)
        .in('type', ['service', 'both'])
        .order('name')

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const fetchProfessionals = async () => {
    try {
      const { data, error } = await supabase
        .from('professionals')
        .select('id, name, active')
        .eq('active', true)
        .order('name')

      if (error) throw error
      setProfessionals(data || [])
    } catch (error) {
      console.error('Error fetching professionals:', error)
    }
  }

  const getServiceRelations = async (serviceId: string) => {
    try {
      const [profRes] = await Promise.all([
        supabase.from("service_professionals").select("professional_id").eq("service_id", serviceId)
      ]);

      return {
        professional_ids: profRes.data?.map(p => p.professional_id) || []
      };
    } catch (error) {
      console.error('Error fetching service relations:', error);
      return { professional_ids: [] };
    }
  };

  const openEditDialog = async (service: Service) => {
    setSelectedService(service)
    
    // Fetch professional relationships
    const relations = await getServiceRelations(service.id);
    
    form.reset({
      name: service.name,
      description: service.description || "",
      price: service.price,
      currency: service.currency,
      duration_min: service.duration_min,
      buffer_min: service.buffer_min,
      credit_cost: service.credit_cost,
      active: service.active,
      category_id: service.category_id || "",
      photo_url: service.photo_url || "",
      professional_ids: relations.professional_ids,
    })
    setDialogOpen(true)
  }

  const openCreateDialog = () => {
    setSelectedService(null)
    form.reset({
      name: "",
      description: "",
      price: 0,
      currency: "EUR",
      duration_min: 60,
      buffer_min: 0,
      credit_cost: 1,
      active: true,
      category_id: "",
      photo_url: "",
      professional_ids: [],
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: ServiceFormData) => {
    try {
      const { professional_ids, ...serviceData } = data;
      const finalServiceData = {
        ...serviceData,
        category_id: serviceData.category_id || null
      };

      let serviceId: string;

      if (selectedService) {
        // Update service
        const { error } = await supabase
          .from('services')
          .update(finalServiceData)
          .eq('id', selectedService.id)

        if (error) throw error
        serviceId = selectedService.id;

        // Update professional relationships
        if (professional_ids) {
          // Delete existing relationships
          await supabase.from("service_professionals").delete().eq("service_id", serviceId);
          
          // Insert new relationships
          if (professional_ids.length > 0) {
            await supabase.from("service_professionals").insert(
              professional_ids.map(id => ({ service_id: serviceId, professional_id: id }))
            );
          }
        }

        toast({ title: "Éxito", description: "Servicio actualizado" })
      } else {
        // Create service
        const { data: newService, error } = await supabase
          .from('services')
          .insert([finalServiceData])
          .select()
          .single()

        if (error) throw error
        serviceId = newService.id;

        // Insert professional relationships
        if (professional_ids && professional_ids.length > 0) {
          await supabase.from("service_professionals").insert(
            professional_ids.map(id => ({ service_id: serviceId, professional_id: id }))
          );
        }

        toast({ title: "Éxito", description: "Servicio creado" })
      }

      fetchServices()
      setDialogOpen(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo guardar el servicio",
        variant: "destructive",
      })
    }
  }

  const deleteService = async (id: string) => {
    try {
      // Check for active (non-cancelled) bookings
      const { count, error: checkError } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('service_id', id)
        .neq('status', 'cancelled')

      if (checkError) throw checkError

      if (count && count > 0) {
        toast({
          title: "No se puede eliminar",
          description: `Este servicio tiene ${count} reserva(s) activa(s). Cancélalas primero antes de eliminar el servicio.`,
          variant: "destructive",
        })
        return
      }

      if (!confirm("¿Estás seguro de que quieres eliminar este servicio? Las reservas canceladas asociadas perderán la referencia al servicio pero no se borrarán.")) return

      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      toast({ title: "Éxito", description: "Servicio eliminado" })
      fetchServices()
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar el servicio",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    Promise.all([fetchServices(), fetchCategories(), fetchProfessionals()]).finally(() => {
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servicios"
        description="Gestión de servicios individuales"
        action={{
          label: "Nuevo Servicio",
          onClick: openCreateDialog,
        }}
      />

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={services}
            searchKey="name"
            searchPlaceholder="Buscar servicios..."
          />
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedService ? "Editar Servicio" : "Nuevo Servicio"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-8rem)] pr-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Photo Upload Section */}
              <FormField
                control={form.control}
                name="photo_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Foto del servicio</FormLabel>
                    <FormControl>
                      <ImageUpload
                        value={field.value}
                        onChange={field.onChange}
                        professionalId={selectedService?.id}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Professional Selection */}
              <FormField
                control={form.control}
                name="professional_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Especialistas</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-2 gap-4 max-h-40 overflow-y-auto border rounded-md p-4">
                        {professionals.map((professional) => (
                          <div key={professional.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`prof-service-${professional.id}`}
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
                            <Label htmlFor={`prof-service-${professional.id}`} className="text-sm">
                              {professional.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio *</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="duration_min"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duración (min) *</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="buffer_min"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buffer (min)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="credit_cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Coste en Créditos</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 pt-6">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>Activo</FormLabel>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {selectedService ? "Actualizar" : "Crear"}
                </Button>
              </div>
              </form>
            </Form>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}