import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SubscriptionWithPlan {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  start_date: string;
  next_billing_date: string;
  cap_remaining_in_cycle?: number;
  created_at: string;
  updated_at: string;
  plan: {
    id: string;
    name: string;
    cycle: string;
    cap_per_cycle?: number;
    sessions_count?: number;
    price: number;
    currency: string;
  };
}

export interface SubscriptionUsage {
  subscription: SubscriptionWithPlan;
  used: number;
  remaining: number;
  isUnlimited: boolean;
  periodStart: Date;
  periodEnd: Date;
  nextCycleUsed?: number;
  nextCycleStart?: Date;
  nextCycleEnd?: Date;
}

export function useSubscriptionsByEmail(email?: string) {
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptions = async () => {
    if (!email) {
      setSubscriptions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // First get user by email
      const { data: user, error: userError } = await supabase
        .from('users_shadow')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (userError) throw userError;
      if (!user) {
        setSubscriptions([]);
        return;
      }

      // Get active subscriptions with plan details
      const { data, error: fetchError } = await supabase
        .from('subscriptions')
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setSubscriptions((data || []).filter(sub => sub.plan !== null));
    } catch (err) {
      console.error('[useSubscriptionsByEmail] Error:', err);
      setError(err instanceof Error ? err.message : 'Error loading subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [email]);

  return { subscriptions, loading, error, refetch: fetchSubscriptions };
}

// Calculate current period dates based on subscription cycle
export function calculateCurrentPeriod(subscription: SubscriptionWithPlan): { start: Date, end: Date } {
  const startDate = new Date(subscription.start_date);
  const now = new Date();
  
  if (subscription.plan.cycle === 'weekly') {
    // Find the current week
    const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const weeksSinceStart = Math.floor(daysSinceStart / 7);
    
    const periodStart = new Date(startDate);
    periodStart.setDate(startDate.getDate() + (weeksSinceStart * 7));
    
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);
    periodEnd.setHours(23, 59, 59, 999);
    
    return { start: periodStart, end: periodEnd };
  } else {
    // Monthly cycle
    const monthsSinceStart = Math.floor((now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth()));
    
    const periodStart = new Date(startDate);
    periodStart.setMonth(startDate.getMonth() + monthsSinceStart);
    
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodStart.getMonth() + 1);
    periodEnd.setDate(periodEnd.getDate() - 1);
    periodEnd.setHours(23, 59, 59, 999);
    
    return { start: periodStart, end: periodEnd };
  }
}

// Calculate subscription usage for current period with EXACT timestamps
export async function calculateSubscriptionUsage(subscription: SubscriptionWithPlan): Promise<SubscriptionUsage> {
  const startDate = new Date(subscription.start_date || subscription.created_at);
  const now = new Date();
  
  // Find current cycle using exact timestamps
  let currentCycleStart = new Date(startDate);
  let currentCycleEnd = new Date(startDate);
  
  // Set initial cycle end
  if (subscription.plan?.cycle === 'weekly') {
    currentCycleEnd.setDate(currentCycleEnd.getDate() + 7);
  } else {
    currentCycleEnd.setMonth(currentCycleEnd.getMonth() + 1);
  }
  
  // Advance cycle by cycle until we find the one containing "now"
  while (currentCycleEnd <= now) {
    currentCycleStart = new Date(currentCycleEnd);
    if (subscription.plan?.cycle === 'weekly') {
      currentCycleEnd.setDate(currentCycleEnd.getDate() + 7);
    } else {
      currentCycleEnd.setMonth(currentCycleEnd.getMonth() + 1);
    }
  }
  
  // Count bookings in current period using EXACT timestamps
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('origin', 'subscription')
    .neq('status', 'cancelled')
    .gte('start_at', currentCycleStart.toISOString())
    .lt('start_at', currentCycleEnd.toISOString())
    .or(`notes.like.%"subscriptionId":"${subscription.id}"%,notes.like.%"subscriptionId": "${subscription.id}"%`);

  if (error) {
    console.error('[calculateSubscriptionUsage] Error:', error);
    throw error;
  }

  const used = bookings?.length || 0;
  const isUnlimited = !subscription.plan.cap_per_cycle && !subscription.plan.sessions_count;
  const cap = subscription.plan.cap_per_cycle ?? subscription.plan.sessions_count ?? 0;
  const remaining = isUnlimited ? Infinity : Math.max(0, cap - used);

  // Calculate next cycle - starts exactly where current ends
  const nextPeriodStart = new Date(currentCycleEnd);
  const nextPeriodEnd = new Date(nextPeriodStart);
  
  if (subscription.plan?.cycle === 'weekly') {
    nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 7);
  } else {
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
  }
  
  // Count bookings in next cycle using EXACT timestamps
  const { data: nextCycleBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('origin', 'subscription')
    .neq('status', 'cancelled')
    .gte('start_at', nextPeriodStart.toISOString())
    .lt('start_at', nextPeriodEnd.toISOString())
    .or(`notes.like.%"subscriptionId":"${subscription.id}"%,notes.like.%"subscriptionId": "${subscription.id}"%`);
  
  const nextCycleUsed = nextCycleBookings?.length || 0;

  return {
    subscription,
    used,
    remaining,
    isUnlimited,
    periodStart: currentCycleStart,
    periodEnd: currentCycleEnd,
    nextCycleUsed,
    nextCycleStart: nextPeriodStart,
    nextCycleEnd: nextPeriodEnd
  };
}

// Check if a class/category is covered by subscription plans
export async function checkSubscriptionEligibility(classId?: string, categoryId?: string, subscriptions?: SubscriptionWithPlan[]): Promise<SubscriptionWithPlan[]> {
  if (!subscriptions?.length || (!classId && !categoryId)) {
    return [];
  }
  
  try {
    const eligibleSubscriptions: SubscriptionWithPlan[] = [];
    
    for (const subscription of subscriptions) {
      // Check if this plan covers the class/category
      let isEligible = false;
      
      if (categoryId) {
        const { data: planCategories } = await supabase
          .from('subscription_plan_categories')
          .select('category_id')
          .eq('plan_id', subscription.plan_id)
          .eq('category_id', categoryId);
        
        if (planCategories && planCategories.length > 0) {
          isEligible = true;
        }
      }
      
      if (!isEligible && classId) {
        // Get class category and check if it's covered
        const { data: classData } = await supabase
          .from('classes')
          .select('category_id')
          .eq('id', classId)
          .single();
        
        if (classData?.category_id) {
          const { data: planCategories } = await supabase
            .from('subscription_plan_categories')
            .select('category_id')
            .eq('plan_id', subscription.plan_id)
            .eq('category_id', classData.category_id);
          
          if (planCategories && planCategories.length > 0) {
            isEligible = true;
          }
        }
      }
      
      if (isEligible) {
        eligibleSubscriptions.push(subscription);
      }
    }
    
    return eligibleSubscriptions;
  } catch (error) {
    console.error('[checkSubscriptionEligibility] Error:', error);
    return [];
  }
}