import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle } from 'lucide-react';

interface CancelSubscriptionModalProps {
  subscription: {
    id: string;
    next_billing_date: string;
    subscription_plans: {
      name: string;
    };
    users_shadow: {
      name: string;
      email: string;
    };
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CancelSubscriptionModal({
  subscription,
  open,
  onOpenChange,
}: CancelSubscriptionModalProps) {
  const [reason, setReason] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!subscription) throw new Error('No subscription selected');

      // Call the edge function to cancel in Stripe
      const { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: { subscription_id: subscription.id },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al cancelar');

      // Log to audit_logs
      const { error: auditError } = await supabase.from('audit_logs').insert({
        entity_type: 'subscription',
        entity_id: subscription.id,
        action: 'cancel',
        actor: (await supabase.auth.getUser()).data.user?.email || 'admin',
        data: {
          reason: reason || 'Sin motivo especificado',
          user_name: subscription.users_shadow.name,
          user_email: subscription.users_shadow.email,
          plan_name: subscription.subscription_plans.name,
          cancel_date: new Date().toISOString(),
        },
      });

      if (auditError) {
        console.error('Error logging audit:', auditError);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast({
        title: 'Suscripción cancelada',
        description: 'La suscripción se cancelará al final del período actual.',
      });
      setReason('');
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Cancel error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo cancelar la suscripción',
      });
    },
  });

  if (!subscription) return null;

  const endDate = new Date(subscription.next_billing_date).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Cancelar Suscripción
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                ¿Estás seguro de que deseas cancelar la suscripción de{' '}
                <span className="font-semibold">{subscription.users_shadow.name}</span>?
              </p>

              <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Plan:</span>{' '}
                  <span className="font-medium">{subscription.subscription_plans.name}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Email:</span>{' '}
                  {subscription.users_shadow.email}
                </p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 rounded-md text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">⚠️ Importante:</p>
                <p>
                  La suscripción seguirá activa hasta el{' '}
                  <span className="font-semibold">{endDate}</span>. Después de esa fecha, no se
                  realizarán más cobros y el acceso se desactivará.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Motivo de cancelación (opcional)</Label>
                <Textarea
                  id="cancel-reason"
                  placeholder="Escribe el motivo de la cancelación..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelMutation.isPending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              cancelMutation.mutate();
            }}
            disabled={cancelMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelación'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
