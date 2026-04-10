import { useState, useEffect } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Edit, Eye, EyeOff, LogIn } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useActiveOrganization } from "@/hooks/useActiveOrganization"
import { DataTable } from "@/components/ui/data-table"
import { PageHeader } from "@/components/ui/page-header"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

type Organization = {
  id: string
  name: string
  slug: string
  primary_color: string
  secondary_color: string
  logo_url: string | null
  stripe_public_key: string | null
  stripe_secret_key_enc: string | null
  stripe_webhook_secret_enc: string | null
  n8n_webhook_url: string | null
  active: boolean
  created_at: string
}

type OrganizationFormData = {
  name: string
  slug: string
  primary_color: string
  secondary_color: string
  logo_url: string
  stripe_public_key: string
  stripe_secret_key_enc: string
  stripe_webhook_secret_enc: string
  n8n_webhook_url: string
  active: boolean
}

export default function Organizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()
  const { setActiveOrgId } = useActiveOrganization()

  const handleManageOrg = async (org: Organization) => {
    await setActiveOrgId(org.id)
    navigate('/admin')
  }

  const form = useForm<OrganizationFormData>({
    defaultValues: {
      name: "",
      slug: "",
      primary_color: "#000000",
      secondary_color: "#ffffff",
      logo_url: "",
      stripe_public_key: "",
      stripe_secret_key_enc: "",
      stripe_webhook_secret_enc: "",
      n8n_webhook_url: "",
      active: true,
    },
  })

  const columns: ColumnDef<Organization>[] = [
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{row.getValue("name")}</span>
        </div>
      ),
    },
    {
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }) => (
        <code className="text-sm bg-muted px-2 py-1 rounded">
          {row.getValue("slug")}
        </code>
      ),
    },
    {
      id: "colors",
      header: "Colores",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div
            className="h-5 w-5 rounded border"
            style={{ backgroundColor: row.original.primary_color }}
            title={`Primario: ${row.original.primary_color}`}
          />
          <div
            className="h-5 w-5 rounded border"
            style={{ backgroundColor: row.original.secondary_color }}
            title={`Secundario: ${row.original.secondary_color}`}
          />
        </div>
      ),
    },
    {
      id: "stripe",
      header: "Stripe",
      cell: ({ row }) => (
        <Badge variant={row.original.stripe_public_key ? "default" : "secondary"}>
          {row.original.stripe_public_key ? "Configurado" : "Sin configurar"}
        </Badge>
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
              toggleActive(row.original)
            }}
          >
            {row.original.active ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleManageOrg(row.original)
            }}
            title="Gestionar"
          >
            <LogIn className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name')

      if (error) throw error
      setOrganizations(data || [])
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar las organizaciones",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const openEditDialog = (org: Organization) => {
    setSelectedOrg(org)
    form.reset({
      name: org.name,
      slug: org.slug,
      primary_color: org.primary_color,
      secondary_color: org.secondary_color,
      logo_url: org.logo_url || "",
      stripe_public_key: org.stripe_public_key || "",
      stripe_secret_key_enc: "",
      stripe_webhook_secret_enc: "",
      n8n_webhook_url: org.n8n_webhook_url || "",
      active: org.active,
    })
    setDialogOpen(true)
  }

  const openCreateDialog = () => {
    setSelectedOrg(null)
    form.reset({
      name: "",
      slug: "",
      primary_color: "#000000",
      secondary_color: "#ffffff",
      logo_url: "",
      stripe_public_key: "",
      stripe_secret_key_enc: "",
      stripe_webhook_secret_enc: "",
      n8n_webhook_url: "",
      active: true,
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: OrganizationFormData) => {
    try {
      const cleanedData: any = {
        name: data.name,
        slug: data.slug.toLowerCase().replace(/[^a-z0-9-]/g, ''),
        primary_color: data.primary_color,
        secondary_color: data.secondary_color,
        logo_url: data.logo_url || null,
        stripe_public_key: data.stripe_public_key || null,
        n8n_webhook_url: data.n8n_webhook_url || null,
        active: data.active,
      }

      // Solo enviar claves secretas si se han rellenado (no sobreescribir con vacio)
      if (data.stripe_secret_key_enc) {
        cleanedData.stripe_secret_key_enc = data.stripe_secret_key_enc
      }
      if (data.stripe_webhook_secret_enc) {
        cleanedData.stripe_webhook_secret_enc = data.stripe_webhook_secret_enc
      }

      if (selectedOrg) {
        const { error } = await supabase
          .from('organizations')
          .update(cleanedData)
          .eq('id', selectedOrg.id)

        if (error) throw error
        toast({ title: "Exito", description: "Organizacion actualizada" })
      } else {
        const { error } = await supabase
          .from('organizations')
          .insert([cleanedData])

        if (error) throw error
        toast({ title: "Exito", description: "Organizacion creada" })
      }

      fetchOrganizations()
      setDialogOpen(false)
    } catch (error: any) {
      const errorMessage = error?.message || "Error desconocido"
      toast({
        title: "Error",
        description: `No se pudo guardar la organizacion: ${errorMessage}`,
        variant: "destructive",
      })
    }
  }

  const toggleActive = async (org: Organization) => {
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ active: !org.active })
        .eq('id', org.id)

      if (error) throw error
      toast({
        title: "Exito",
        description: `Organizacion ${!org.active ? "activada" : "desactivada"}`,
      })
      fetchOrganizations()
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo cambiar el estado",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    fetchOrganizations()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizaciones"
        description="Gestion de organizaciones (tenants) de la plataforma"
        action={{
          label: "Nueva Organizacion",
          onClick: openCreateDialog,
        }}
      />

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={organizations}
            searchKey="name"
            searchPlaceholder="Buscar organizaciones..."
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedOrg ? "Editar Organizacion" : "Nueva Organizacion"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Datos basicos */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  rules={{ required: "El nombre es obligatorio" }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre *</FormLabel>
                      <FormControl>
                        <Input placeholder="Mi Clinica" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="slug"
                  rules={{
                    required: "El slug es obligatorio",
                    pattern: {
                      value: /^[a-z0-9-]+$/,
                      message: "Solo minusculas, numeros y guiones",
                    },
                  }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="mi-clinica"
                          {...field}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Activa</FormLabel>
                  </FormItem>
                )}
              />

              {/* Branding */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Branding</h4>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="primary_color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color primario</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input type="color" className="w-12 h-9 p-1 cursor-pointer" {...field} />
                          </FormControl>
                          <Input
                            value={field.value}
                            onChange={field.onChange}
                            className="flex-1"
                          />
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="secondary_color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color secundario</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input type="color" className="w-12 h-9 p-1 cursor-pointer" {...field} />
                          </FormControl>
                          <Input
                            value={field.value}
                            onChange={field.onChange}
                            className="flex-1"
                          />
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="logo_url"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel>URL del logo</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Stripe */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Stripe</h4>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="stripe_public_key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Publishable Key</FormLabel>
                        <FormControl>
                          <Input placeholder="pk_live_..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="stripe_secret_key_enc"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Secret Key
                          {selectedOrg?.stripe_secret_key_enc && (
                            <span className="text-xs text-muted-foreground ml-2">
                              (dejar vacio para mantener la actual)
                            </span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="sk_live_..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="stripe_webhook_secret_enc"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Webhook Secret
                          {selectedOrg?.stripe_webhook_secret_enc && (
                            <span className="text-xs text-muted-foreground ml-2">
                              (dejar vacio para mantener el actual)
                            </span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="whsec_..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Integraciones */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Integraciones</h4>
                <FormField
                  control={form.control}
                  name="n8n_webhook_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>n8n Webhook URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://n8n.example.com/webhook/..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {selectedOrg ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
