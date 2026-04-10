import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  cycle: string;
  sessions_count?: number;
  cap_per_cycle?: number;
  active: boolean;
  photo_url?: string;
  created_at: string;
  updated_at: string;
  pack_type?: string | null;
  parent_plan_id?: string | null;
  packs?: SubscriptionPlan[]; // Packs hijos si es un plan principal
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  start_date: string;
  next_billing_date: string;
  cap_remaining_in_cycle?: number;
  cancel_at_period_end?: boolean;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  created_at: string;
  updated_at: string;
  plan: SubscriptionPlan;
}

export interface SubscriptionEligibility {
  eligible: boolean;
  hasActiveSubscription: boolean;
  activeSubscriptions: UserSubscription[];
}

export function usePublicSubscriptionPlans() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setError(null);

      // Primero obtener todos los planes activos
      const { data, error: fetchError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('active', true)
        .order('price', { ascending: true });

      if (fetchError) throw fetchError;

      // Filtrar solo planes principales o independientes (no packs)
      const mainPlans = (data || []).filter(plan => !plan.parent_plan_id);
      
      // Para cada plan principal que tenga packs, cargar sus packs hijos
      const plansWithPacks = await Promise.all(
        mainPlans.map(async (plan) => {
          if (plan.pack_type === 'main') {
            const { data: childPacks } = await supabase
              .from('subscription_plans')
              .select('*')
              .eq('parent_plan_id', plan.id)
              .eq('active', true)
              .order('price', { ascending: true });
            
            return {
              ...plan,
              packs: childPacks || []
            };
          }
          return plan;
        })
      );

      setPlans(plansWithPacks);
    } catch (err) {
      console.error('[usePublicSubscriptionPlans] Error:', err);
      setError(err instanceof Error ? err.message : 'Error loading subscription plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  return { plans, loading, error, refetch: fetchPlans };
}

export function useUserSubscriptions(userId?: string) {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserSubscriptions = async () => {
    if (!userId) {
      setSubscriptions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('subscriptions')
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setSubscriptions(data || []);
    } catch (err) {
      console.error('[useUserSubscriptions] Error:', err);
      setError(err instanceof Error ? err.message : 'Error loading user subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserSubscriptions();
  }, [userId]);

  return { subscriptions, loading, error, refetch: fetchUserSubscriptions };
}

export function useSubscriptionEligibility(serviceId?: string, categoryId?: string, userId?: string): SubscriptionEligibility {
  const [eligibility, setEligibility] = useState<SubscriptionEligibility>({
    eligible: false,
    hasActiveSubscription: false,
    activeSubscriptions: []
  });

  const { subscriptions: userSubscriptions } = useUserSubscriptions(userId);

  useEffect(() => {
    const checkEligibility = async () => {
      if (!serviceId && !categoryId) {
        setEligibility({ eligible: false, hasActiveSubscription: false, activeSubscriptions: [] });
        return;
      }

      try {
        // Get subscription plans that cover this service or category
        let eligiblePlanIds: string[] = [];

        if (categoryId) {
          const { data: categoryPlans } = await supabase
            .from('subscription_plan_categories')
            .select('plan_id')
            .eq('category_id', categoryId);
          
          if (categoryPlans) {
            eligiblePlanIds.push(...categoryPlans.map(p => p.plan_id));
          }
        }

        if (serviceId) {
          // For services, check if their category is covered by any plan
          const { data: serviceData } = await supabase
            .from('services')
            .select('category_id')
            .eq('id', serviceId)
            .single();

          if (serviceData?.category_id) {
            const { data: categoryPlans } = await supabase
              .from('subscription_plan_categories')
              .select('plan_id')
              .eq('category_id', serviceData.category_id);
            
            if (categoryPlans) {
              eligiblePlanIds.push(...categoryPlans.map(p => p.plan_id));
            }
          }
        }

        // Filter user subscriptions by eligible plans and active status
        const activeSubscriptions = userSubscriptions.filter(sub => 
          sub.status === 'active' && eligiblePlanIds.includes(sub.plan_id)
        );

        setEligibility({
          eligible: eligiblePlanIds.length > 0,
          hasActiveSubscription: activeSubscriptions.length > 0,
          activeSubscriptions
        });

      } catch (err) {
        console.error('[useSubscriptionEligibility] Error:', err);
        setEligibility({ eligible: false, hasActiveSubscription: false, activeSubscriptions: [] });
      }
    };

    checkEligibility();
  }, [serviceId, categoryId, userSubscriptions]);

  return eligibility;
}