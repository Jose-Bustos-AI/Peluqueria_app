import { useState, useEffect } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Edit, Trash2, UserCheck, Phone, Mail, Loader2, AlertTriangle, Clock, Eye } from "lucide-react"
import { DataTable } from "@/components/ui/data-table"
import { PageHeader } from "@/components/ui/page-header"
import { ImageUpload } from "@/components/ui/image-upload"
import ProfessionalHoursManager from "@/components/professional-hours/ProfessionalHoursManager"
import { ProfessionalServicesModal } from "@/components/admin/ProfessionalServicesModal"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
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

type Professional = {
  id: string
  name: string
  email: string | null
  phone: string | null
  specialty: string | null
  color: string
  photo_url: string | null
  bio: string | null
  active: boolean
  created_at: string
}

type ProfessionalFormData = {
  name: string
  email: string
  phone: string
  specialty: string
  color: string
  photo_url: string
  bio: string
  active: boolean
}

export default function Professionals() {
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [professionalForSchedule, setProfessionalForSchedule] = useState<Professional | null>(null)
  const [servicesModalOpen, setServicesModalOpen] = useState(false)
  const [professionalForServices, setProfessionalForServices] = useState<Professional | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [professionalToDelete, setProfessionalToDelete] = useState<Professional | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [dependencyCounts, setDependencyCounts] = useState<{
    services: number
    classes: number
    futureBookings: number
    futureSessions: number
    adminUsers: number
  } | null>(null)
  const [canHardDelete, setCanHardDelete] = useState(false)
  const { toast } = useToast()

  const form = useForm<ProfessionalFormData>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      specialty: "",
      color: "#3B82F6",
      photo_url: "",
      bio: "",
      active: true,
    },
  })

  const columns: ColumnDef<Professional>[] = [
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.photo_url ? (
            <img 
              src={row.original.photo_url} 
              alt={row.getValue("name") as string}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div 
              className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: row.original.color }}
            >
              {(row.getValue("name") as string).charAt(0)}
            </div>
          )}
          <div>
            <div className="font-medium">{row.getValue("name")}</div>
            {row.original.specialty && (
              <div className="text-sm text-muted-foreground">{row.original.specialty}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => {
        const email = row.getValue("email") as string
        return email ? (
          <div className="flex items-center gap-2">
            <Mail className="h-3 w-3 text-muted-foreground" />
            <span>{email}</span>
          </div>
        ) : "—"
      },
    },
    {
      accessorKey: "phone",
      header: "Teléfono",
      cell: ({ row }) => {
        const phone = row.getValue("phone") as string
        return phone ? (
          <div className="flex items-center gap-2">
            <Phone className="h-3 w-3 text-muted-foreground" />
            <span>{phone}</span>
          </div>
        ) : "—"
      },
    },
    {
      accessorKey: "color",
      header: "Color",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div 
            className="h-4 w-4 rounded-full border"
            style={{ backgroundColor: row.getValue("color") as string }}
          />
          <span className="text-sm">{row.getValue("color")}</span>
        </div>
      ),
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
              openServicesModal(row.original)
            }}
            title="Ver servicios y clases"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              openEditDialog(row.original)
            }}
            title="Editar profesional"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              openScheduleDialog(row.original)
            }}
            title="Gestionar horarios"
          >
            <Clock className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              openDeleteDialog(row.original)
            }}
            title="Eliminar profesional"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  const fetchProfessionals = async () => {
    try {
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .order('name')

      if (error) throw error
      setProfessionals(data || [])
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los profesionales",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const openEditDialog = (professional: Professional) => {
    setSelectedProfessional(professional)
    form.reset({
      name: professional.name,
      email: professional.email || "",
      phone: professional.phone || "",
      specialty: professional.specialty || "",
      color: professional.color,
      photo_url: professional.photo_url || "",
      bio: professional.bio || "",
      active: professional.active,
    })
    setDialogOpen(true)
  }

  const openCreateDialog = () => {
    setSelectedProfessional(null)
    form.reset({
      name: "",
      email: "",
      phone: "",
      specialty: "",
      color: "#3B82F6",
      photo_url: "",
      bio: "",
      active: true,
    })
    setDialogOpen(true)
  }

  const openScheduleDialog = (professional: Professional) => {
    setProfessionalForSchedule(professional)
    setScheduleDialogOpen(true)
  }

  const openServicesModal = (professional: Professional) => {
    setProfessionalForServices(professional)
    setServicesModalOpen(true)
  }

  const onSubmit = async (data: ProfessionalFormData) => {
    setSubmitting(true)
    
    try {
      // Validación básica
      if (!data.name.trim()) {
        toast({
          title: "Error de validación",
          description: "El nombre es requerido",
          variant: "destructive",
        })
        return
      }

      // Validar formato de email si se proporciona
      if (data.email && !/\S+@\S+\.\S+/.test(data.email)) {
        toast({
          title: "Error de validación", 
          description: "El email no tiene un formato válido",
          variant: "destructive",
        })
        return
      }

      // Validar formato de color hex
      if (data.color && !/^#[0-9A-F]{6}$/i.test(data.color)) {
        toast({
          title: "Error de validación",
          description: "El color debe estar en formato hexadecimal (ej: #10B981)",
          variant: "destructive", 
        })
        return
      }

      const professionalData = {
        name: data.name.trim(),
        email: data.email.trim() || null,
        phone: data.phone.trim() || null,
        specialty: data.specialty.trim() || null,
        color: data.color,
        photo_url: data.photo_url || null,
        bio: data.bio.trim() || null,
        active: data.active,
      }

      if (selectedProfessional) {
        // Update existing professional
        const { data: updatedProfessional, error } = await supabase
          .from('professionals')
          .update(professionalData)
          .eq('id', selectedProfessional.id)
          .select()
          .single()

        if (error) {
          console.error('Update error:', error)
          throw error
        }
        
        // Log audit event for professional update
        await supabase.from('audit_logs').insert([{
          action: 'professional.updated',
          entity_type: 'professional',
          entity_id: selectedProfessional.id,
          data: { 
            name: data.name,
            specialty: data.specialty,
            updated_fields: Object.keys(professionalData).filter(key => 
              professionalData[key as keyof typeof professionalData] !== (selectedProfessional as any)[key]
            )
          }
        }]);
        
        toast({ 
          title: "Profesional actualizado", 
          description: `${data.name} ha sido actualizado correctamente` 
        })
      } else {
        // Create new professional
        const { data: newProfessional, error } = await supabase
          .from('professionals')
          .insert([professionalData])
          .select()
          .single()

        if (error) {
          console.error('Insert error:', error)
          throw error
        }
        
        // Log audit event for professional creation
        if (newProfessional) {
          await supabase.from('audit_logs').insert([{
            action: 'professional.created',
            entity_type: 'professional',
            entity_id: newProfessional.id,
            data: { name: data.name, specialty: data.specialty }
          }]);
        }
        
        toast({ 
          title: "Profesional creado", 
          description: `${data.name} ha sido creado correctamente` 
        })
      }

      // Refetch data and close modal
      await fetchProfessionals()
      setDialogOpen(false)
      
    } catch (error: any) {
      console.error('Professional save error:', error)
      
      let errorMessage = "No se pudo guardar el profesional"
      
      // Proporcionar mensajes específicos según el tipo de error
      if (error.code === 'PGRST116') {
        errorMessage = "No tienes permisos para realizar esta acción"
      } else if (error.code === '23505') {
        errorMessage = "Ya existe un profesional con este email"
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast({
        title: "Error al guardar",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const openDeleteDialog = async (professional: Professional) => {
    setProfessionalToDelete(professional)
    setDeleteLoading(true)
    setDeleteDialogOpen(true)

    try {
      const { data, error } = await supabase.functions.invoke('delete-professional', {
        body: {
          professionalId: professional.id,
          confirm: false // Dry-run to get dependency counts
        }
      })

      if (error) throw error

      setDependencyCounts(data.counts)
      setCanHardDelete(data.canHardDelete)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo verificar las dependencias",
        variant: "destructive",
      })
      setDeleteDialogOpen(false)
    } finally {
      setDeleteLoading(false)
    }
  }

  const executeDeletion = async (action: 'deactivate' | 'hard_delete') => {
    if (!professionalToDelete) return

    setDeleteLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('delete-professional', {
        body: {
          professionalId: professionalToDelete.id,
          action,
          confirm: true
        }
      })

      if (error) throw error

      toast({
        title: "Éxito",
        description: data.message,
      })
      
      setDeleteDialogOpen(false)
      setProfessionalToDelete(null)
      setDependencyCounts(null)
      fetchProfessionals()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo procesar la eliminación",
        variant: "destructive",
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  useEffect(() => {
    fetchProfessionals()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profesionales"
        description="Gestión de profesionales del equipo"
        action={{
          label: "Nuevo Profesional",
          onClick: openCreateDialog,
        }}
      />

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={professionals}
            searchKey="name"
            searchPlaceholder="Buscar profesionales..."
          />
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedProfessional ? "Editar Profesional" : "Nuevo Profesional"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  name="specialty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Especialidad</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color (Calendario)</FormLabel>
                      <FormControl>
                        <Input type="color" {...field} />
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

              <FormField
                control={form.control}
                name="photo_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Foto del Profesional</FormLabel>
                    <FormControl>
                      <ImageUpload
                        value={field.value}
                        onChange={field.onChange}
                        professionalId={selectedProfessional?.id || 'temp'}
                        existingPhotoUrl={selectedProfessional?.photo_url || undefined}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Biografía</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      {selectedProfessional ? "Actualizando..." : "Creando..."}
                    </>
                  ) : (
                    selectedProfessional ? "Actualizar" : "Crear"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Schedule Management Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Gestionar Horarios - {professionalForSchedule?.name}
            </DialogTitle>
            <DialogDescription>
              Define los horarios de disponibilidad para este profesional
            </DialogDescription>
          </DialogHeader>
          {professionalForSchedule && (
            <ProfessionalHoursManager
              professionalId={professionalForSchedule.id}
              professionalName={professionalForSchedule.name}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Eliminar Profesional
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  ¿Estás seguro de que quieres eliminar a <strong>{professionalToDelete?.name}</strong>?
                </p>
                
                {deleteLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verificando dependencias...
                  </div>
                ) : dependencyCounts && (
                  <div className="space-y-3">
                    <div className="text-sm">
                      <p className="font-medium mb-2">Dependencias encontradas:</p>
                      <ul className="space-y-1 text-muted-foreground">
                        <li>• Servicios vinculados: {dependencyCounts.services}</li>
                        <li>• Clases vinculadas: {dependencyCounts.classes}</li>
                        <li>• Reservas futuras: {dependencyCounts.futureBookings}</li>
                        <li>• Sesiones futuras: {dependencyCounts.futureSessions}</li>
                        <li>• Usuarios del panel vinculados: {dependencyCounts.adminUsers}</li>
                      </ul>
                    </div>

                    {(dependencyCounts.futureBookings > 0 || dependencyCounts.futureSessions > 0 || dependencyCounts.adminUsers > 0) && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                        <p className="text-sm text-amber-800">
                          {dependencyCounts.futureBookings > 0 || dependencyCounts.futureSessions > 0 ? 
                            "No puedes eliminar mientras existan reservas o sesiones futuras. Cancela/reasigna primero." :
                            "Este profesional está vinculado a usuarios del panel. Ve a Roles para quitar el vínculo primero."
                          }
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleteLoading}>
              Cancelar
            </AlertDialogCancel>
            
            {!deleteLoading && dependencyCounts && (
              <>
                <Button
                  variant="outline"
                  onClick={() => executeDeletion('deactivate')}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Procesando...
                    </>
                  ) : (
                    "Desactivar"
                  )}
                </Button>
                
                {canHardDelete && (
                  <Button
                    variant="destructive"
                    onClick={() => executeDeletion('hard_delete')}
                    disabled={deleteLoading}
                  >
                    {deleteLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Eliminando...
                      </>
                    ) : (
                      "Eliminar definitivamente"
                    )}
                  </Button>
                )}
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Professional Services Modal */}
      <ProfessionalServicesModal
        open={servicesModalOpen}
        onOpenChange={setServicesModalOpen}
        professional={professionalForServices}
      />
    </div>
  )
}