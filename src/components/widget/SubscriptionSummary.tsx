import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, Users, Tag, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  cycle: string;
  sessions_count: number | null;
  cap_per_cycle: number | null;
  photo_url: string | null;
  active: boolean;
  pack_type?: string | null;
  parent_plan_id?: string | null;
}

interface SubscriptionSummaryProps {
  planId?: string;
  onBack: () => void;
  onBuySubscription: (planId: string) => void;
  onUseSubscription: (planId: string) => void;
}

export default function SubscriptionSummary({ planId, onBack, onBuySubscription, onUseSubscription }: SubscriptionSummaryProps) {
  const { planId: urlPlanId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [packs, setPacks] = useState<SubscriptionPlan[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Use passed planId or fallback to URL planId
  const effectivePlanId = planId || urlPlanId;

  useEffect(() => {
    if (!effectivePlanId) {
      console.error('[SubscriptionSummary] No planId provided');
      onBack();
      return;
    }

    console.log('[SubscriptionSummary] mounted planId=', effectivePlanId);
    loadPlan();
  }, [effectivePlanId]);

  const loadPlan = async () => {
    if (!effectivePlanId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', effectivePlanId)
        .eq('active', true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast({
          title: 'Plan no encontrado',
          description: 'El plan de suscripción no está disponible',
          variant: 'destructive',
        });
        onBack();
        return;
      }

      setPlan(data);

      // Si es un plan principal con packs, cargar los packs
      if (data.pack_type === 'main') {
        const { data: childPacks, error: packsError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('parent_plan_id', data.id)
          .eq('active', true)
          .order('price', { ascending: true });

        if (packsError) throw packsError;
        
        if (childPacks && childPacks.length > 0) {
          setPacks(childPacks);
          // Preseleccionar el primer pack
          setSelectedPackId(childPacks[0].id);
        }
      }
    } catch (error) {
      console.error('[SubscriptionSummary] Error loading plan:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el plan de suscripción',
        variant: 'destructive',
      });
      onBack();
    } finally {
      setLoading(false);
    }
  };

  const handleBuySubscription = () => {
    // Si tiene packs, usar el pack seleccionado, si no usar el planId del plan principal
    const targetPlanId = packs.length > 0 && selectedPackId ? selectedPackId : effectivePlanId;
    if (!targetPlanId) return;
    
    console.log('[SubscriptionSummary] Buy subscription clicked for planId=', targetPlanId);
    onBuySubscription(targetPlanId);
  };

  const handleUseSubscription = () => {
    // Si tiene packs, usar el pack seleccionado, si no usar el planId del plan principal
    const targetPlanId = packs.length > 0 && selectedPackId ? selectedPackId : effectivePlanId;
    if (!targetPlanId) return;
    
    console.log('[SubscriptionSummary] Use subscription clicked for planId=', targetPlanId);
    onUseSubscription(targetPlanId);
  };

  const parseSubscriptionDescription = (description: string | null) => {
    if (!description) return '';
    try {
      const parsed = JSON.parse(description);
      return parsed.text || description;
    } catch {
      return description;
    }
  };

  const getCycleText = (cycle: string) => {
    switch (cycle) {
      case 'weekly':
        return 'semanal';
      case 'monthly':
        return 'mensual';
      default:
        return cycle;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-white hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Suscripciones disponibles</h1>
        </div>
      </header>

      {/* Plan Details */}
      <div className="p-4 space-y-6">
        <Card className="bg-slate-800 border-slate-700 text-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl text-white">Suscripción: {plan.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-blue-400 text-blue-400">
                    Ciclo: {getCycleText(plan.cycle)}
                  </Badge>
                  {plan.sessions_count && (
                    <Badge variant="outline" className="border-green-400 text-green-400">
                      <Users className="w-3 h-3 mr-1" />
                      Incluye: {plan.sessions_count} sesiones/{getCycleText(plan.cycle)}
                    </Badge>
                  )}
                </div>
              </div>
              {/* Solo mostrar precio si NO tiene packs */}
              {packs.length === 0 && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">
                    {plan.price}€
                  </div>
                  <div className="text-sm text-slate-300">
                    /{getCycleText(plan.cycle)}
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          
          {(plan.description || plan.cap_per_cycle) && (
            <CardContent className="pt-0">
              {plan.description && (
                <p className="text-slate-300 mb-3">{parseSubscriptionDescription(plan.description)}</p>
              )}
              {plan.cap_per_cycle && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Tag className="w-4 h-4" />
                  <span>Límite por ciclo: {plan.cap_per_cycle} sesiones</span>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Packs Selection - Si el plan tiene packs */}
        {packs.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Elige tu pack</h2>
            <p className="text-sm text-slate-300">Selecciona el plan que mejor se adapte a tus necesidades</p>
            
            {packs.map((pack) => (
              <Card
                key={pack.id}
                className={`bg-slate-800 border-2 cursor-pointer transition-all ${
                  selectedPackId === pack.id
                    ? 'border-blue-500 bg-slate-750'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
                onClick={() => setSelectedPackId(pack.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white">{pack.name}</h3>
                        {pack.pack_type === 'premium' && (
                          <Badge className="bg-yellow-600 text-white">Premium</Badge>
                        )}
                        {pack.pack_type === 'intermediate' && (
                          <Badge className="bg-purple-600 text-white">Intermedio</Badge>
                        )}
                        {pack.pack_type === 'basic' && (
                          <Badge className="bg-gray-600 text-white">Básico</Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 text-sm text-slate-300">
                        {pack.cap_per_cycle && (
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {pack.cap_per_cycle} sesiones/{getCycleText(pack.cycle)}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-2xl font-bold text-white">
                        {pack.price}€
                      </div>
                      <div className="text-xs text-slate-400">
                        /{getCycleText(pack.cycle)}
                      </div>
                      {pack.sessions_count && (
                        <div className="text-xs text-slate-300 mt-1">
                          {pack.sessions_count} sesiones
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={handleBuySubscription}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg font-semibold"
            disabled={packs.length > 0 && !selectedPackId}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Comprar suscripción
          </Button>
          
          <Button
            onClick={handleUseSubscription}
            variant="secondary"
            className="w-full py-3 text-lg font-semibold"
            disabled={packs.length > 0 && !selectedPackId}
          >
            Usar mi suscripción
          </Button>
        </div>
      </div>
    </div>
  );
}