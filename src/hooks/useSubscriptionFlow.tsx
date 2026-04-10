import { useState, useEffect } from 'react';

export interface SubscriptionFlow {
  origin: string;
  subscriptionId: string;
  planId: string;
  allowedClassIds: string[];
  allowedServiceIds: string[];
  lockedProfessionalId?: string;
  sessionConfig?: {
    days_of_week: number[];
    time_slots: { start_time: string; end_time: string }[];
    professional_id: string;
    session_duration_min?: number;
  };
}

export function useSubscriptionFlow() {
  const [subscriptionFlow, setSubscriptionFlow] = useState<SubscriptionFlow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscriptionFlow();
  }, []);

  const loadSubscriptionFlow = () => {
    try {
      const saved = localStorage.getItem('reservasPro_subscriptionFlow');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('[SubscriptionFlow] Loaded from localStorage:', parsed);
        setSubscriptionFlow(parsed);
      }
    } catch (error) {
      console.error('[SubscriptionFlow] Error loading from localStorage:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSubscriptionFlow = (flow: SubscriptionFlow) => {
    try {
      localStorage.setItem('reservasPro_subscriptionFlow', JSON.stringify(flow));
      setSubscriptionFlow(flow);
      console.log('[SubscriptionFlow] Saved to localStorage:', flow);
    } catch (error) {
      console.error('[SubscriptionFlow] Error saving to localStorage:', error);
    }
  };

  const clearSubscriptionFlow = () => {
    try {
      localStorage.removeItem('reservasPro_subscriptionFlow');
      setSubscriptionFlow(null);
      console.log('[SubscriptionFlow] Cleared from localStorage');
    } catch (error) {
      console.error('[SubscriptionFlow] Error clearing from localStorage:', error);
    }
  };

  const isAllowedClass = (classId: string): boolean => {
    if (!subscriptionFlow) return false;
    return subscriptionFlow.allowedClassIds.includes(classId);
  };

  const isAllowedService = (serviceId: string): boolean => {
    if (!subscriptionFlow) return false;
    return subscriptionFlow.allowedServiceIds.includes(serviceId);
  };

  return {
    subscriptionFlow,
    loading,
    saveSubscriptionFlow,
    clearSubscriptionFlow,
    refreshSubscriptionFlow: loadSubscriptionFlow,
    isAllowedClass,
    isAllowedService,
  };
}