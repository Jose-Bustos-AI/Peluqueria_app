import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Calendar, 
  Clock, 
  CreditCard, 
  Gift, 
  MapPin, 
  User, 
  Phone, 
  Mail,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Euro,
  Pencil
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

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

type UserBooking = {
  id: string
  type: string
  status: string
  payment_method: string
  payment_status: string
  origin: string
  start_at: string
  end_at: string
  notes?: string
  created_at: string
  service?: {
    name: string
    price: number
    currency: string
  }
  class?: {
    name: string
    price: number
    currency: string
  }
  professional: {
    name: string
    color?: string
  }
  location: {
    name: string
    address?: string
  }
}

type UserVoucher = {
  id: string
  code?: string
  status: string
  purchase_date: string
  expiry_date?: string
  sessions_remaining: number
  voucher_type: {
    name: string
    description?: string
    price: number
    currency: string
    sessions_count: number
  }
}

type UserSubscription = {
  id: string
  status: string
  start_date: string
  next_billing_date: string
  cancel_at_period_end: boolean
  created_at: string
  cap_remaining_in_cycle?: number
  plan: {
    name: string
    description?: string
    price: number
    currency: string
    cycle: string
    sessions_count?: number
    cap_per_cycle?: number
  }
}

interface UserDetailsModalProps {
  user: UserStatus | null
  open: boolean
  onClose: () => void
  onUserUpdated?: () => void
}

export function UserDetailsModal({ user, open, onClose, onUserUpdated }: UserDetailsModalProps) {
  const [bookings, setBookings] = useState<UserBooking[]>([])
  const [vouchers, setVouchers] = useState<UserVoucher[]>([])
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([])
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editFiscalName, setEditFiscalName] = useState('')
  const [editNif, setEditNif] = useState('')
  const [editDocumentType, setEditDocumentType] = useState('none')
  const [editFiscalAddress, setEditFiscalAddress] = useState('')
  const [editFiscalCity, setEditFiscalCity] = useState('')
  const [editFiscalZip, setEditFiscalZip] = useState('')
  const [fiscalData, setFiscalData] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (user && open) {
      setEditName(user.name)
      setEditEmail(user.email)
      setEditPhone(user.phone || '')
      setIsEditing(false)
      loadUserData()
      loadFiscalData()
    }
  }, [user, open])

  const loadFiscalData = async () => {
    if (!user) return
    const { data } = await supabase
      .from('users_shadow')
      .select('fiscal_name, nif, document_type, fiscal_address, fiscal_city, fiscal_zip')
      .eq('id', user.user_id)
      .single()
    if (data) {
      setFiscalData(data)
      setEditFiscalName(data.fiscal_name ?? '')
      setEditNif(data.nif ?? '')
      setEditDocumentType(data.document_type ?? 'none')
      setEditFiscalAddress(data.fiscal_address ?? '')
      setEditFiscalCity(data.fiscal_city ?? '')
      setEditFiscalZip(data.fiscal_zip ?? '')
    }
  }

  const loadUserData = async () => {
    if (!user) return
    
    setLoading(true)
    try {
      await Promise.all([
        loadBookings(),
        loadVouchers(),
        loadSubscriptions()
      ])
    } catch (error) {
      console.error('Error loading user data:', error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos del usuario",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const loadBookings = async () => {
    if (!user) return

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        type,
        status,
        payment_method,
        payment_status,
        origin,
        start_at,
        end_at,
        notes,
        created_at,
        service:services(
          name,
          price,
          currency
        ),
        class:classes(
          name,
          price,
          currency
        ),
        professional:professionals(
          name,
          color
        ),
        location:locations(
          name,
          address
        )
      `)
      .eq('user_id', user.user_id)
      .order('start_at', { ascending: false })

    if (error) throw error
    setBookings(data || [])
  }

  const loadVouchers = async () => {
    if (!user) return

    const { data, error } = await supabase
      .from('vouchers')
      .select(`
        id,
        code,
        status,
        purchase_date,
        expiry_date,
        sessions_remaining,
        voucher_type:voucher_types(
          name,
          description,
          price,
          currency,
          sessions_count
        )
      `)
      .eq('user_id', user.user_id)
      .order('purchase_date', { ascending: false })

    if (error) throw error
    setVouchers(data || [])
  }

  const loadSubscriptions = async () => {
    if (!user) return

    const { data, error } = await supabase
      .from('subscriptions')
      .select(`
        id,
        status,
        start_date,
        next_billing_date,
        cancel_at_period_end,
        created_at,
        cap_remaining_in_cycle,
        plan:subscription_plans(
          name,
          description,
          price,
          currency,
          cycle,
          sessions_count,
          cap_per_cycle
        )
      `)
      .eq('user_id', user.user_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    
    // Calculate usage for each subscription
    const subscriptionsWithUsage = await Promise.all(
      (data || []).map(async (subscription) => {
        const usage = await calculateSubscriptionUsage(subscription)
        return { ...subscription, usage }
      })
    )
    
    setSubscriptions(subscriptionsWithUsage)
  }

  const parseSubscriptionDescription = (description: string | undefined) => {
    if (!description) return '';
    try {
      const parsed = JSON.parse(description);
      return parsed.text || description;
    } catch {
      return description;
    }
  };

  const calculateCurrentPeriod = (subscription: any) => {
    const startDate = new Date(subscription.start_date)
    const now = new Date()
    
    let cycleStart = new Date(startDate)
    let cycleEnd = new Date(startDate)
    
    if (subscription.plan.cycle === 'weekly') {
      // Calculate current week
      const weeksSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
      cycleStart = new Date(startDate.getTime() + weeksSinceStart * 7 * 24 * 60 * 60 * 1000)
      cycleEnd = new Date(cycleStart.getTime() + 7 * 24 * 60 * 60 * 1000)
    } else if (subscription.plan.cycle === 'monthly') {
      // Calculate current month
      const monthsSinceStart = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth())
      cycleStart = new Date(startDate.getFullYear(), startDate.getMonth() + monthsSinceStart, startDate.getDate())
      cycleEnd = new Date(startDate.getFullYear(), startDate.getMonth() + monthsSinceStart + 1, startDate.getDate())
    }
    
    return { cycleStart, cycleEnd }
  }

  const calculateSubscriptionUsage = async (subscription: any) => {
    if (!user) return { used: 0, remaining: 0, total: 0, isUnlimited: false }
    
    const { cycleStart, cycleEnd } = calculateCurrentPeriod(subscription)
    
    // Count bookings in current cycle with subscription origin
    const { data: bookingsData, error } = await supabase
      .from('bookings')
      .select('id, origin, created_at')
      .eq('user_id', user.user_id)
      .eq('origin', 'subscription')
      .gte('created_at', cycleStart.toISOString())
      .lt('created_at', cycleEnd.toISOString())
      .neq('status', 'cancelled')

    if (error) {
      console.error('Error calculating subscription usage:', error)
      return { used: 0, remaining: 0, total: 0, isUnlimited: false }
    }

    const used = bookingsData?.length || 0
    const isUnlimited = subscription.plan.sessions_count === -1
    
    if (isUnlimited) {
      return { used, remaining: -1, total: -1, isUnlimited: true }
    }
    
    const total = subscription.plan.cap_per_cycle || subscription.plan.sessions_count || 0
    const remaining = Math.max(0, total - used)
    
    return { used, remaining, total, isUnlimited: false }
  }

  const getStatusBadge = (status: string, type?: string) => {
    const variants: Record<string, any> = {
      confirmed: { variant: 'default', icon: CheckCircle, text: 'Confirmada' },
      pending: { variant: 'secondary', icon: AlertCircle, text: 'Pendiente' },
      pending_cash: { variant: 'outline', icon: AlertCircle, text: 'Pendiente (Efectivo)' },
      pending_card: { variant: 'outline', icon: AlertCircle, text: 'Pendiente (Tarjeta)' },
      cancelled: { variant: 'destructive', icon: XCircle, text: 'Cancelada' },
      active: { variant: 'default', icon: CheckCircle, text: 'Activo' },
      expired: { variant: 'secondary', icon: Clock, text: 'Expirado' },
      used: { variant: 'outline', icon: CheckCircle, text: 'Usado' },
    }
    
    const config = variants[status] || { variant: 'outline', icon: AlertCircle, text: status }
    const Icon = config.icon
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    )
  }

  const getPaymentMethodBadge = (method: string) => {
    const methods: Record<string, any> = {
      card: { variant: 'default', icon: CreditCard, text: 'Tarjeta' },
      cash: { variant: 'secondary', icon: Euro, text: 'Efectivo' },
      stripe: { variant: 'default', icon: CreditCard, text: 'Stripe' },
      none: { variant: 'outline', icon: AlertCircle, text: 'Sin pago' },
    }
    
    const config = methods[method] || { variant: 'outline', icon: AlertCircle, text: method }
    const Icon = config.icon
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    )
  }

  const formatBookingNotes = (notes: string | undefined) => {
    if (!notes) return null
    
    try {
      const parsed = JSON.parse(notes)
      
      const labels: Record<string, string> = {
        createdBy: 'Creado por',
        clientName: 'Nombre cliente',
        clientEmail: 'Email cliente', 
        paymentMethod: 'Método de pago',
        planName: 'Plan',
        planId: 'ID Plan',
        subscriptionId: 'ID Suscripción',
        voucherId: 'ID Bono',
        voucherName: 'Nombre bono'
      }
      
      const paymentMethods: Record<string, string> = {
        cash: 'Efectivo (Pago en clínica)',
        card: 'Tarjeta (Pago en app)',
        stripe: 'Stripe'
      }
      
      const createdByLabels: Record<string, string> = {
        admin_panel: 'Panel de administración',
        widget: 'Widget público',
        subscription: 'Suscripción'
      }
      
      return (
        <div className="space-y-1">
          {Object.entries(parsed).map(([key, value]) => {
            if (['planId', 'subscriptionId', 'voucherId'].includes(key)) return null
            
            let displayValue = String(value)
            
            if (key === 'paymentMethod' && paymentMethods[displayValue]) {
              displayValue = paymentMethods[displayValue]
            }
            if (key === 'createdBy' && createdByLabels[displayValue]) {
              displayValue = createdByLabels[displayValue]
            }
            
            const label = labels[key] || key
            
            return (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{label}:</span>
                <span className="font-medium">{displayValue}</span>
              </div>
            )
          })}
        </div>
      )
    } catch {
      return <p className="text-sm">{notes}</p>
    }
  }

  const handleSaveUser = async () => {
    if (!user) return

    // Validar formato del documento fiscal si se ha introducido
    const trimmedNif = editNif.trim().toUpperCase();
    if (trimmedNif) {
      const docType = editDocumentType;
      let isValid = false;
      let errorMsg = '';

      console.log('[VALIDATION] nif:', trimmedNif, 'docType:', docType);

      if (docType === 'NIF') {
        isValid = /^[0-9]{8}[A-Z]$/.test(trimmedNif);
        errorMsg = 'El NIF debe tener 8 números seguidos de una letra (ej: 12345678A)';
      } else if (docType === 'NIE') {
        isValid = /^[XYZ][0-9]{7}[A-Z]$/.test(trimmedNif);
        errorMsg = 'El NIE debe empezar por X, Y o Z seguido de 7 números y una letra (ej: X1234567A)';
      } else if (docType === 'CIF') {
        isValid = /^[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J]$/.test(trimmedNif);
        errorMsg = 'El CIF debe empezar por una letra seguida de 7 números y un dígito o letra (ej: B12345678)';
      } else if (docType === 'passport') {
        isValid = /^[A-Z0-9]{5,20}$/.test(trimmedNif);
        errorMsg = 'El número de pasaporte no es válido';
      } else {
        isValid = false;
        errorMsg = 'Selecciona el tipo de documento antes de introducir el número';
      }

      console.log('[VALIDATION] isValid:', isValid);

      if (!isValid) {
        toast({
          title: 'Documento fiscal inválido',
          description: errorMsg,
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('users_shadow')
        .update({
          name: editName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim() || null,
          fiscal_name: editFiscalName.trim() || null,
          nif: editNif.trim() || null,
          document_type: editDocumentType || 'none',
          fiscal_address: editFiscalAddress.trim() || null,
          fiscal_city: editFiscalCity.trim() || null,
          fiscal_zip: editFiscalZip.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.user_id)
      
      if (error) throw error
      
      toast({
        title: "Guardado",
        description: "Los datos del usuario se han actualizado correctamente",
      })
      
      setIsEditing(false)
      loadFiscalData()
      onUserUpdated?.()
    } catch (error) {
      console.error('Error updating user:', error)
      toast({
        title: "Error",
        description: "No se pudieron guardar los cambios",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Detalles del Usuario
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[80vh]">
          <div className="space-y-6 pr-4">
            {/* Header with user info and key metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main User Info */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {isEditing ? (
                        <Input 
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="text-xl font-semibold"
                        />
                      ) : (
                        <CardTitle className="text-xl">{user.name}</CardTitle>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <Button 
                            onClick={handleSaveUser} 
                            disabled={saving}
                            size="sm"
                          >
                            {saving ? 'Guardando...' : 'Guardar'}
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setIsEditing(false)
                              setEditName(user.name)
                              setEditEmail(user.email)
                              setEditPhone(user.phone || '')
                              if (fiscalData) {
                                setEditFiscalName(fiscalData.fiscal_name ?? '')
                                setEditNif(fiscalData.nif ?? '')
                                setEditDocumentType(fiscalData.document_type ?? 'none')
                                setEditFiscalAddress(fiscalData.fiscal_address ?? '')
                                setEditFiscalCity(fiscalData.fiscal_city ?? '')
                                setEditFiscalZip(fiscalData.fiscal_zip ?? '')
                              }
                            }}
                            size="sm"
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <Button 
                          variant="outline" 
                          onClick={() => setIsEditing(true)}
                          size="sm"
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar datos
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-2">
                  {isEditing ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="edit_email" className="text-xs">Email</Label>
                        <Input 
                          id="edit_email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="h-8 text-sm"
                          type="email"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit_phone" className="text-xs">Teléfono</Label>
                        <Input 
                          id="edit_phone"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="h-8 text-sm"
                          type="tel"
                          placeholder="Sin teléfono"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="font-medium text-foreground">{user.email}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          <span className="font-medium text-foreground">{user.phone || 'Sin teléfono'}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Registro: {format(new Date(user.created_at), 'dd/MM/yyyy', { locale: es })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Última actividad: {user.last_booking_at 
                            ? format(new Date(user.last_booking_at), 'dd/MM/yyyy', { locale: es })
                            : "Nunca"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {user.has_active_voucher && (
                          <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                            <Gift className="h-3 w-3" />
                            Bono activo
                          </Badge>
                        )}
                        {user.has_active_subscription && (
                          <Badge variant="default" className="flex items-center gap-1 text-xs">
                            <CreditCard className="h-3 w-3" />
                            Suscripción activa
                          </Badge>
                        )}
                        {user.days_since_last_booking >= 30 && (
                          <Badge variant="outline" className="flex items-center gap-1 text-xs">
                            <AlertCircle className="h-3 w-3" />
                            Inactivo {user.days_since_last_booking} días
                          </Badge>
                        )}
                        {!user.has_active_voucher && !user.has_active_subscription && user.days_since_last_booking < 30 && (
                          <Badge variant="outline" className="flex items-center gap-1 text-xs">
                            <CheckCircle className="h-3 w-3" />
                            Cliente activo
                          </Badge>
                        )}
                      </div>
                    </>
                  )}

                  {/* Datos fiscales */}
                  {isEditing ? (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Datos de facturación <span className="font-normal">(opcional)</span>
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="fiscal_name" className="text-xs">Nombre fiscal</Label>
                          <Input
                            id="fiscal_name"
                            value={editFiscalName}
                            onChange={(e) => setEditFiscalName(e.target.value)}
                            placeholder="Razón social"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="nif" className="text-xs">NIF / CIF</Label>
                          <Input
                            id="nif"
                            value={editNif}
                            onChange={(e) => setEditNif(e.target.value.toUpperCase())}
                            placeholder="12345678A"
                            maxLength={9}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="document_type" className="text-xs">Tipo doc.</Label>
                          <select
                            id="document_type"
                            value={editDocumentType}
                            onChange={(e) => setEditDocumentType(e.target.value)}
                            className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="none">Sin especificar</option>
                            <option value="NIF">NIF</option>
                            <option value="CIF">CIF</option>
                            <option value="NIE">NIE</option>
                            <option value="passport">Pasaporte</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="fiscal_address" className="text-xs">Dirección fiscal</Label>
                          <Input
                            id="fiscal_address"
                            value={editFiscalAddress}
                            onChange={(e) => setEditFiscalAddress(e.target.value)}
                            placeholder="Calle y número"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="fiscal_city" className="text-xs">Ciudad</Label>
                          <Input
                            id="fiscal_city"
                            value={editFiscalCity}
                            onChange={(e) => setEditFiscalCity(e.target.value)}
                            placeholder="Ciudad"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="fiscal_zip" className="text-xs">C.P.</Label>
                          <Input
                            id="fiscal_zip"
                            value={editFiscalZip}
                            onChange={(e) => setEditFiscalZip(e.target.value)}
                            placeholder="28001"
                            maxLength={5}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Datos de facturación
                      </p>
                      {(fiscalData?.nif || fiscalData?.fiscal_name || fiscalData?.fiscal_address) ? (
                        <div className="space-y-0.5">
                          {fiscalData.fiscal_name && (
                            <p className="text-sm">{fiscalData.fiscal_name}</p>
                          )}
                          {fiscalData.nif && (
                            <p className="text-sm text-muted-foreground">
                              {fiscalData.document_type !== 'none' ? fiscalData.document_type : 'NIF'}: {fiscalData.nif}
                            </p>
                          )}
                          {fiscalData.fiscal_address && (
                            <p className="text-sm text-muted-foreground">
                              {fiscalData.fiscal_address}{fiscalData.fiscal_city ? `, ${fiscalData.fiscal_city}` : ''}{fiscalData.fiscal_zip ? ` ${fiscalData.fiscal_zip}` : ''}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Sin datos fiscales</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Resumen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total reservas</span>
                    <Badge variant="outline">{bookings.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Bonos activos</span>
                    <Badge variant="secondary">{vouchers.filter(v => v.status === 'active' && v.sessions_remaining > 0).length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Suscripciones</span>
                    <Badge variant="default">{subscriptions.filter(s => s.status === 'active').length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Días de inactividad</span>
                    <Badge variant={user.days_since_last_booking >= 30 ? "destructive" : "outline"}>
                      {user.days_since_last_booking}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs for detailed data */}
            <Tabs defaultValue="bookings" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="bookings" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Reservas ({bookings.length})
                </TabsTrigger>
                <TabsTrigger value="vouchers" className="flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  Bonos ({vouchers.length})
                </TabsTrigger>
                <TabsTrigger value="subscriptions" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Suscripciones ({subscriptions.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="bookings" className="space-y-4 mt-4">
                {loading ? (
                  <div className="text-center py-4">Cargando reservas...</div>
                ) : bookings.length === 0 ? (
                  <Card>
                    <CardContent className="py-8">
                      <div className="text-center text-muted-foreground">
                        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No hay reservas registradas</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {bookings.map((booking) => (
                      <Card key={booking.id}>
                        <CardContent className="pt-4">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium">
                                  {booking.service?.name || booking.class?.name}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {booking.type === 'service' ? 'Servicio' : 'Clase'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium">
                                  {(booking.service?.price || booking.class?.price || 0).toFixed(2)} €
                                </p>
                                <p className="text-sm text-muted-foreground capitalize">
                                  {booking.origin}
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span>{format(new Date(booking.start_at), 'dd/MM/yyyy HH:mm', { locale: es })}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span>{booking.location.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span>{booking.professional.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span>#{booking.id.slice(-8)}</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex gap-2">
                                {getStatusBadge(booking.status)}
                                {getPaymentMethodBadge(booking.payment_method)}
                                {booking.payment_status !== 'paid' && (
                                  <Badge variant="outline" className="flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {booking.payment_status === 'unpaid' ? 'Sin pagar' : booking.payment_status}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            {booking.notes && (
                              <div className="bg-muted/50 p-2 rounded-md">
                                <p className="text-sm font-medium mb-1">Notas:</p>
                                {formatBookingNotes(booking.notes)}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="vouchers" className="space-y-4 mt-4">
                {loading ? (
                  <div className="text-center py-4">Cargando bonos...</div>
                ) : vouchers.length === 0 ? (
                  <Card>
                    <CardContent className="py-8">
                      <div className="text-center text-muted-foreground">
                        <Gift className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No hay bonos registrados</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {vouchers.map((voucher) => (
                      <Card key={voucher.id}>
                        <CardContent className="pt-4">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium">{voucher.voucher_type.name}</h4>
                                {voucher.voucher_type.description && (
                                  <p className="text-sm text-muted-foreground">
                                    {voucher.voucher_type.description}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="font-medium">
                                  {voucher.voucher_type.price.toFixed(2)} {voucher.voucher_type.currency}
                                </p>
                                {voucher.code && (
                                  <p className="text-sm text-muted-foreground">
                                    #{voucher.code}
                                  </p>
                                )}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span>Comprado: {format(new Date(voucher.purchase_date), 'dd/MM/yyyy', { locale: es })}</span>
                              </div>
                              {voucher.expiry_date && (
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                  <span>Expira: {format(new Date(voucher.expiry_date), 'dd/MM/yyyy', { locale: es })}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <Gift className="h-4 w-4 text-muted-foreground" />
                                <span>{voucher.sessions_remaining} / {voucher.voucher_type.sessions_count} sesiones</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex gap-2">
                                {getStatusBadge(voucher.status)}
                                {voucher.sessions_remaining === 0 && (
                                  <Badge variant="secondary" className="flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3" />
                                    Agotado
                                  </Badge>
                                )}
                              </div>
                              
                              {voucher.sessions_remaining > 0 && (
                                <div className="text-right text-sm text-muted-foreground">
                                  <p>{((voucher.sessions_remaining / voucher.voucher_type.sessions_count) * 100).toFixed(0)}% restante</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="subscriptions" className="space-y-4 mt-4">
                {loading ? (
                  <div className="text-center py-4">Cargando suscripciones...</div>
                ) : subscriptions.length === 0 ? (
                  <Card>
                    <CardContent className="py-8">
                      <div className="text-center text-muted-foreground">
                        <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No hay suscripciones registradas</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {subscriptions.map((subscription: any) => (
                      <Card key={subscription.id}>
                        <CardContent className="pt-4">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="font-medium text-lg">{subscription.plan.name}</h4>
                                {subscription.plan.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {(() => {
                                      const parsed = parseSubscriptionDescription(subscription.plan.description);
                                      return parsed.length > 100 ? `${parsed.substring(0, 100)}...` : parsed;
                                    })()}
                                  </p>
                                )}
                              </div>
                              <div className="text-right ml-4">
                                <p className="font-medium text-lg">
                                  {subscription.plan.price.toFixed(2)} {subscription.plan.currency}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {subscription.plan.cycle === 'weekly' ? 'Semanal' : 
                                   subscription.plan.cycle === 'monthly' ? 'Mensual' : subscription.plan.cycle}
                                </p>
                              </div>
                            </div>
                            
                            {/* Usage Information */}
                            {subscription.usage && (
                              <div className="bg-muted/50 p-4 rounded-lg">
                                <h5 className="font-medium mb-3 flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  Uso en el período actual
                                </h5>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                  <div className="text-center">
                                    <p className="text-2xl font-bold text-primary">{subscription.usage.used}</p>
                                    <p className="text-muted-foreground">Usadas</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-2xl font-bold text-green-600">
                                      {subscription.usage.isUnlimited ? '∞' : subscription.usage.remaining}
                                    </p>
                                    <p className="text-muted-foreground">Restantes</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-2xl font-bold text-muted-foreground">
                                      {subscription.usage.isUnlimited ? '∞' : subscription.usage.total}
                                    </p>
                                    <p className="text-muted-foreground">Total</p>
                                  </div>
                                </div>
                                {!subscription.usage.isUnlimited && subscription.usage.total > 0 && (
                                  <div className="mt-3">
                                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                      <span>Progreso</span>
                                      <span>{((subscription.usage.used / subscription.usage.total) * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-2">
                                      <div 
                                        className="bg-primary h-2 rounded-full transition-all" 
                                        style={{ 
                                          width: `${Math.min(100, (subscription.usage.used / subscription.usage.total) * 100)}%` 
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span>Inicio: {format(new Date(subscription.start_date), 'dd/MM/yyyy', { locale: es })}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span>Siguiente pago: {format(new Date(subscription.next_billing_date), 'dd/MM/yyyy', { locale: es })}</span>
                              </div>
                              {subscription.plan.sessions_count && (
                                <div className="flex items-center gap-2 col-span-2">
                                  <Gift className="h-4 w-4 text-muted-foreground" />
                                  <span>
                                    {subscription.plan.sessions_count === -1 
                                      ? 'Sesiones ilimitadas' 
                                      : `${subscription.plan.sessions_count} sesiones por ${subscription.plan.cycle === 'weekly' ? 'semana' : 'mes'}`
                                    }
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center justify-between pt-2 border-t">
                              <div className="flex gap-2">
                                {getStatusBadge(subscription.status)}
                                {subscription.cancel_at_period_end && (
                                  <Badge variant="outline" className="flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Se cancela al final del período
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}