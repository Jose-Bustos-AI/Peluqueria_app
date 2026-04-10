import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, Phone, Calendar, RotateCcw, User, Clock, XCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface SubscriptionData {
  id: string;
  user_id: string;
  status: string;
  start_date: string;
  next_billing_date: string;
  cancel_at_period_end: boolean;
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

interface SubscriptionDetailsModalProps {
  subscription: SubscriptionData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelSubscription?: () => void;
}

interface SubscriptionDetails {
  used: number;
  remaining: number;
  total: number;
  isUnlimited: boolean;
  userPhone?: string;
  totalBookings: number;
  bookings: Array<{
    id: string;
    start_at: string;
    type: string;
    service_id?: string;
    class_id?: string;
    status: string;
  }>;
}

export function SubscriptionDetailsModal({ 
  subscription, 
  open, 
  onOpenChange,
  onCancelSubscription 
}: SubscriptionDetailsModalProps) {
  const [details, setDetails] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!subscription || !open) {
      setDetails(null);
      setLoading(true);
      return;
    }

    const loadDetails = async () => {
      try {
        // Calculate current cycle dates
        const now = new Date();
        let cycleStart: Date;
        let cycleEnd: Date;

        if (subscription.subscription_plans.cycle === 'weekly') {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          cycleStart = startOfWeek;
          cycleEnd = new Date(startOfWeek);
          cycleEnd.setDate(startOfWeek.getDate() + 6);
          cycleEnd.setHours(23, 59, 59, 999);
        } else {
          cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
          cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          cycleEnd.setHours(23, 59, 59, 999);
        }

        // Get bookings in current cycle from subscriptions
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, start_at, type, service_id, class_id, status, notes')
          .eq('user_id', subscription.user_id)
          .eq('origin', 'subscription')
          .neq('status', 'cancelled')
          .gte('start_at', cycleStart.toISOString())
          .lte('start_at', cycleEnd.toISOString())
          .order('start_at', { ascending: false });

        // Get total bookings from this subscription
        const { data: allBookings } = await supabase
          .from('bookings')
          .select('id, start_at, type, service_id, class_id, status')
          .eq('user_id', subscription.user_id)
          .eq('origin', 'subscription')
          .order('start_at', { ascending: false });

        // Extract phone from booking notes if available
        let userPhone: string | undefined;
        if (bookings && bookings.length > 0) {
          for (const booking of bookings) {
            if (booking.notes) {
              const phoneMatch = booking.notes.match(/Teléfono:\s*([+\d\s\-()]+)/);
              if (phoneMatch) {
                userPhone = phoneMatch[1].trim();
                break;
              }
            }
          }
        }

        const used = bookings?.length || 0;
        const total = subscription.subscription_plans.sessions_count || 0;
        const remaining = Math.max(0, total - used);

        setDetails({
          used,
          remaining,
          total,
          isUnlimited: !subscription.subscription_plans.sessions_count,
          userPhone,
          totalBookings: allBookings?.length || 0,
          bookings: bookings || []
        });

      } catch (error) {
        console.error('Error loading subscription details:', error);
        setDetails(null);
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [subscription, open]);

  if (!subscription) return null;

  const getStatusDisplay = () => {
    if (subscription.status === 'cancelled') {
      return { text: 'Cancelada', color: 'destructive' as const };
    }
    if (subscription.cancel_at_period_end) {
      return { text: 'Se cancelará', color: 'destructive' as const };
    }
    if (subscription.status === 'active') {
      return { text: 'Activa', color: 'default' as const };
    }
    if (subscription.status === 'paused') {
      return { text: 'Pausada', color: 'secondary' as const };
    }
    return { text: subscription.status || 'Desconocido', color: 'secondary' as const };
  };

  const statusInfo = getStatusDisplay();
  const canCancel = subscription.status === 'active' && !subscription.cancel_at_period_end;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Detalles de la Suscripción
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* User Info */}
          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">{subscription.users_shadow.name}</p>
              <p className="text-sm text-muted-foreground">{subscription.users_shadow.email}</p>
            </div>
          </div>

          {/* Plan Details */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">{subscription.subscription_plans.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Plan {subscription.subscription_plans.cycle === 'weekly' ? 'Semanal' : 'Mensual'}
                </p>
              </div>
              <Badge variant={statusInfo.color}>
                {statusInfo.text}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Precio:</span>
                <p className="font-medium">
                  {subscription.subscription_plans.price} {subscription.subscription_plans.currency}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Fecha de inicio:</span>
                <p className="font-medium">
                  {new Date(subscription.start_date).toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Usage Details */}
          {loading ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground">Cargando datos de uso...</p>
            </div>
          ) : details && (
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Uso de Sesiones (Ciclo Actual)
              </h3>
              
              <div className="bg-primary/5 p-4 rounded-lg">
                <div className="text-lg font-semibold text-center">
                  {details.isUnlimited ? (
                    "Sesiones Ilimitadas"
                  ) : (
                    `Usadas: ${details.used} / Restantes: ${details.remaining} (Total: ${details.total})`
                  )}
                </div>
                {!details.isUnlimited && (
                  <div className="w-full bg-muted rounded-full h-2 mt-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all" 
                      style={{ width: `${Math.min(100, (details.used / details.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total reservas históricas:</span>
                  <p className="font-medium">{details.totalBookings}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Reservas este ciclo:</span>
                  <p className="font-medium">{details.used}</p>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Billing Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-sm text-muted-foreground">
                  {subscription.cancel_at_period_end ? 'Se cancelará:' : 
                   subscription.status === 'cancelled' ? 'Cancelada:' : 
                   'Próxima renovación:'}
                </span>
                <p className="font-medium">
                  {new Date(subscription.next_billing_date).toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>

            {details?.userPhone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm text-muted-foreground">Teléfono del cliente:</span>
                  <p className="font-medium">{details.userPhone}</p>
                </div>
              </div>
            )}
          </div>

          {/* Recent Bookings */}
          {details && details.bookings.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Reservas Recientes (Ciclo Actual)
                </h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {details.bookings.slice(0, 5).map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                      <div>
                        <p className="font-medium">
                          {new Date(booking.start_at).toLocaleDateString('es-ES')} - {' '}
                          {new Date(booking.start_at).toLocaleTimeString('es-ES', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </p>
                        <p className="text-muted-foreground">
                          {booking.type === 'class' ? 'Clase' : 'Servicio'}
                        </p>
                      </div>
                      <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'} className="text-xs">
                        {booking.status === 'confirmed' ? 'Confirmada' : booking.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Cancel Button */}
          {canCancel && onCancelSubscription && (
            <>
              <Separator />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onCancelSubscription()}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelar suscripción
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
