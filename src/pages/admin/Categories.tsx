import { useState, useEffect } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Edit, Trash2, Tag, ArrowUp, ArrowDown } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImageUpload } from "@/components/ui/image-upload"

type Category = {
  id: string
  name: string
  description: string | null
  type: string
  icon_url: string | null
  active: boolean
  sort_order: number
  created_at: string
}

type CategoryFormData = {
  name: string
  description: string
  type: string
  icon_url: string
  active: boolean
  sort_order: number
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { toast } = useToast()

  const form = useForm<CategoryFormData>({
    defaultValues: {
      name: "",
      description: "",
      type: "both",
      icon_url: "",
      active: true,
      sort_order: 0,
    },
  })

  const columns: ColumnDef<Category>[] = [
    {
      accessorKey: "sort_order",
      header: "Orden",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className="text-sm">{row.getValue("sort_order")}</span>
          <div className="flex flex-col">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-4 w-4 p-0"
              onClick={(e) => {
                e.stopPropagation()
                changeOrder(row.original.id, "up")
              }}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-4 w-4 p-0"
              onClick={(e) => {
                e.stopPropagation()
                changeOrder(row.original.id, "down")
              }}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.icon_url ? (
            <img 
              src={row.original.icon_url} 
              alt="" 
              className="h-6 w-6 rounded-lg object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="h-6 w-6 rounded-lg bg-muted flex items-center justify-center">
              <Tag className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
          <span className="font-medium">{row.getValue("name")}</span>
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Descripción",
      cell: ({ row }) => (row.getValue("description") as string) || "—",
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => {
        const type = row.getValue("type") as string
        const typeLabels = {
          service: "Servicio",
          class: "Clase",
          both: "Ambos"
        }
        return (
          <Badge variant="outline">
            {typeLabels[type as keyof typeof typeLabels] || type}
          </Badge>
        )
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
              deleteCategory(row.original.id)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order')

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar las categorías",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const openEditDialog = (category: Category) => {
    setSelectedCategory(category)
    form.reset({
      name: category.name,
      description: category.description || "",
      type: category.type,
      icon_url: category.icon_url || "",
      active: category.active,
      sort_order: category.sort_order,
    })
    setDialogOpen(true)
  }

  const openCreateDialog = () => {
    setSelectedCategory(null)
    const nextOrder = Math.max(...categories.map(c => c.sort_order), -1) + 1
    form.reset({
      name: "",
      description: "",
      type: "both",
      icon_url: "",
      active: true,
      sort_order: nextOrder,
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: CategoryFormData) => {
    try {
      if (selectedCategory) {
        // Update
        const { error } = await supabase
          .from('categories')
          .update(data)
          .eq('id', selectedCategory.id)

        if (error) throw error
        toast({ title: "Éxito", description: "Categoría actualizada" })
      } else {
        // Create
        const { error } = await supabase
          .from('categories')
          .insert([data])

        if (error) throw error
        toast({ title: "Éxito", description: "Categoría creada" })
      }

      fetchCategories()
      setDialogOpen(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo guardar la categoría",
        variant: "destructive",
      })
    }
  }

  const deleteCategory = async (id: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta categoría?")) return

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      toast({ title: "Éxito", description: "Categoría eliminada" })
      fetchCategories()
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la categoría",
        variant: "destructive",
      })
    }
  }

  const changeOrder = async (id: string, direction: "up" | "down") => {
    const category = categories.find(c => c.id === id)
    if (!category) return

    const newOrder = direction === "up" 
      ? category.sort_order - 1 
      : category.sort_order + 1

    try {
      const { error } = await supabase
        .from('categories')
        .update({ sort_order: newOrder })
        .eq('id', id)

      if (error) throw error
      fetchCategories()
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo cambiar el orden",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorías"
        description="Gestión de categorías para servicios y clases"
        action={{
          label: "Nueva Categoría",
          onClick: openCreateDialog,
        }}
      />

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={categories}
            searchKey="name"
            searchPlaceholder="Buscar categorías..."
          />
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCategory ? "Editar Categoría" : "Nueva Categoría"}
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
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="service">Servicio</SelectItem>
                          <SelectItem value="class">Clase</SelectItem>
                          <SelectItem value="both">Ambos</SelectItem>
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="icon_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Icono de la Categoría</FormLabel>
                      <FormControl>
                        <ImageUpload
                          value={field.value || ""}
                          onChange={field.onChange}
                          categoryId={selectedCategory?.id || "temp"}
                          disabled={false}
                          existingPhotoUrl={field.value}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sort_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Orden</FormLabel>
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

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {selectedCategory ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}