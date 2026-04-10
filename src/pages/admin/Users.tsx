import { useState, useEffect } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Eye, Gift, CreditCard, X, Clock } from "lucide-react"
import { DataTable } from "@/components/ui/data-table"
import { PageHeader } from "@/components/ui/page-header"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { UserDetailsModal } from "@/components/admin/UserDetailsSheet"

type UserStatus = {
  user_id: string
  name: string
  email: string
  phone?: string | null
  created_at: string
  app_user_id: string
  last_booking_at: string | null
  days_since_last_booking: number
  has_active_subscription: boolean
  has_active_voucher: boolean
}

type FilterState = {
  hasActiveVoucher: boolean | null
  hasActiveSubscription: boolean | null
  inactivityDays: number | null
}

export default function Users() {
  const [users, setUsers] = useState<UserStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<UserStatus | null>(null)
  const [filters, setFilters] = useState<FilterState>(() => {
    // Load filters from localStorage
    const savedFilters = localStorage.getItem('userFilters')
    return savedFilters ? JSON.parse(savedFilters) : {
      hasActiveVoucher: null,
      hasActiveSubscription: null,
      inactivityDays: null
    }
  })
  const { toast } = useToast()

  const columns: ColumnDef<UserStatus>[] = [
    {
      accessorKey: "name",
      header: "Nombre",
    },
    {
      accessorKey: "email", 
      header: "Email",
    },
    {
      accessorKey: "last_booking_at",
      header: "Última Reserva",
      cell: ({ row }) => {
        const lastBooking = row.getValue("last_booking_at") as string | null
        if (!lastBooking) return "Nunca"
        return new Date(lastBooking).toLocaleDateString('es-ES')
      },
    },
    {
      id: "status",
      header: "Estado",
      cell: ({ row }) => {
        const user = row.original
        const badges = []
        
        if (user.has_active_voucher) {
          badges.push(
            <TooltipProvider key="voucher">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="flex items-center gap-1" aria-label="Bono activo">
                    <Gift className="h-3 w-3" />
                    Bono
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Bono activo</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        }
        
        if (user.has_active_subscription) {
          badges.push(
            <TooltipProvider key="subscription">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="default" className="flex items-center gap-1" aria-label="Suscripción activa">
                    <CreditCard className="h-3 w-3" />
                    Suscripción
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Suscripción activa</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        }
        
        const inactivityThreshold = filters.inactivityDays || 30
        if (user.days_since_last_booking >= inactivityThreshold) {
          badges.push(
            <TooltipProvider key="inactive">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="flex items-center gap-1" aria-label={`Inactivo ${user.days_since_last_booking}d`}>
                    <Clock className="h-3 w-3" />
                    Inactivo {user.days_since_last_booking}d
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Inactivo desde hace {user.days_since_last_booking} días</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        }
        
        return <div className="flex flex-wrap gap-1">{badges}</div>
      },
    },
    {
      accessorKey: "created_at",
      header: "Registro",
      cell: ({ row }) => {
        return new Date(row.getValue("created_at") as string).toLocaleDateString('es-ES')
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            setSelectedUser(row.original)
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  const buildFiltersQuery = () => {
    const params = new URLSearchParams()
    let query = supabase.from('user_status_vw').select('*')
    
    if (filters.hasActiveVoucher === true) {
      query = query.eq('has_active_voucher', true)
      params.set('voucher', 'true')
    }
    
    if (filters.hasActiveSubscription === true) {
      query = query.eq('has_active_subscription', true)
      params.set('subscription', 'true')
    }
    
    if (filters.inactivityDays !== null) {
      query = query.gte('days_since_last_booking', filters.inactivityDays)
      params.set('inactive', filters.inactivityDays.toString())
    }
    
    // Update URL with filters
    const newUrl = new URL(window.location.href)
    params.forEach((value, key) => newUrl.searchParams.set(key, value))
    if (params.toString() === '') {
      ['voucher', 'subscription', 'inactive'].forEach(key => newUrl.searchParams.delete(key))
    }
    window.history.replaceState({}, '', newUrl.toString())
    
    return query.order('created_at', { ascending: false })
  }

  const fetchUsers = async () => {
    try {
      const startTime = performance.now()
      const query = buildFiltersQuery()
      
      console.log('Fetching users with filters:', filters)
      
      const { data, error } = await query
      
      if (error) throw error
      
      const endTime = performance.now()
      console.log(`Users query completed in ${endTime - startTime} milliseconds`)
      
      setUsers(data || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los usuarios",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const updateFilters = (newFilters: Partial<FilterState>) => {
    const updatedFilters = { ...filters, ...newFilters }
    setFilters(updatedFilters)
    localStorage.setItem('userFilters', JSON.stringify(updatedFilters))
  }

  const clearFilter = (filterKey: keyof FilterState) => {
    updateFilters({ [filterKey]: null })
  }

  const clearAllFilters = () => {
    const clearedFilters = {
      hasActiveVoucher: null,
      hasActiveSubscription: null,
      inactivityDays: null
    }
    setFilters(clearedFilters)
    localStorage.setItem('userFilters', JSON.stringify(clearedFilters))
  }

  // Load filters from URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const urlFilters: FilterState = { ...filters }
    
    if (urlParams.get('voucher') === 'true') urlFilters.hasActiveVoucher = true
    if (urlParams.get('subscription') === 'true') urlFilters.hasActiveSubscription = true
    if (urlParams.get('inactive')) urlFilters.inactivityDays = parseInt(urlParams.get('inactive')!)
    
    setFilters(urlFilters)
    localStorage.setItem('userFilters', JSON.stringify(urlFilters))
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [filters])

  const hasActiveFilters = filters.hasActiveVoucher || filters.hasActiveSubscription || filters.inactivityDays !== null

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Gestión de usuarios registrados"
      />

      {/* Filter Chips */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              variant={filters.hasActiveVoucher ? "default" : "outline"}
              size="sm"
              onClick={() => updateFilters({ hasActiveVoucher: filters.hasActiveVoucher ? null : true })}
              className="flex items-center gap-2"
            >
              <Gift className="h-4 w-4" />
              Bono activo
              {filters.hasActiveVoucher && (
                <X 
                  className="h-3 w-3 ml-1" 
                  onClick={(e) => {
                    e.stopPropagation()
                    clearFilter('hasActiveVoucher')
                  }}
                />
              )}
            </Button>

            <Button
              variant={filters.hasActiveSubscription ? "default" : "outline"}
              size="sm"
              onClick={() => updateFilters({ hasActiveSubscription: filters.hasActiveSubscription ? null : true })}
              className="flex items-center gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Suscripción activa
              {filters.hasActiveSubscription && (
                <X 
                  className="h-3 w-3 ml-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearFilter('hasActiveSubscription')
                  }}
                />
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <Select
                value={filters.inactivityDays ? String(filters.inactivityDays) : "all"}
                onValueChange={(value) =>
                  updateFilters({ inactivityDays: value === "all" ? null : parseInt(value) })
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Inactivos..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="30">≥ 30 días</SelectItem>
                  <SelectItem value="90">≥ 90 días</SelectItem>
                  <SelectItem value="180">≥ 180 días</SelectItem>
                  <SelectItem value="360">≥ 360 días</SelectItem>
                </SelectContent>
              </Select>
              {filters.inactivityDays && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearFilter('inactivityDays')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-muted-foreground"
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable 
            columns={columns} 
            data={users}
            searchKey="name"
            searchPlaceholder="Buscar por nombre..."
            onRowClick={(user: UserStatus) => setSelectedUser(user)}
          />
        </CardContent>
      </Card>

      {/* User Details Modal */}
      <UserDetailsModal
        user={selectedUser}
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        onUserUpdated={() => {
          fetchUsers()
          setSelectedUser(null)
        }}
      />
    </div>
  )
}