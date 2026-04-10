import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface DefaultLocation {
  id: string;
  name: string;
  timezone: string;
}

// In-memory cache
let defaultLocationCache: DefaultLocation | null = null;
let locationsCount = 0;
let cacheExpiry = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Bootstrap function to get default location when only one active location exists
 * Caches result in memory + localStorage
 */
export async function getDefaultLocation(): Promise<DefaultLocation | null> {
  const now = Date.now();
  
  // Check memory cache first
  if (defaultLocationCache && now < cacheExpiry) {
    if (import.meta.env.DEV) {
      console.log('[DefaultLocation] using cached id=' + defaultLocationCache.id + ' tz=' + defaultLocationCache.timezone);
    }
    return defaultLocationCache;
  }

  // Check localStorage cache
  const cachedData = localStorage.getItem('defaultLocationCache');
  const cachedExpiry = localStorage.getItem('defaultLocationCacheExpiry');
  
  if (cachedData && cachedExpiry && now < parseInt(cachedExpiry)) {
    const cached = JSON.parse(cachedData);
    defaultLocationCache = cached.location;
    locationsCount = cached.count;
    cacheExpiry = parseInt(cachedExpiry);
    
    if (import.meta.env.DEV) {
      console.log('[DefaultLocation] using localStorage cached id=' + defaultLocationCache?.id + ' tz=' + defaultLocationCache?.timezone);
    }
    return defaultLocationCache;
  }

  // Fetch from database
  try {
    const { data: locations, error } = await supabase
      .from('locations')
      .select('id, name, timezone')
      .eq('active', true)
      .limit(2);

    if (error) throw error;

    locationsCount = locations?.length || 0;
    const newExpiry = now + CACHE_DURATION;

    if (locationsCount === 0) {
      // No active locations - show error and block
      toast({
        title: "Error",
        description: "No hay ubicaciones activas",
        variant: "destructive"
      });
      
      defaultLocationCache = null;
      cacheExpiry = newExpiry;
      
      // Cache the empty result
      localStorage.setItem('defaultLocationCache', JSON.stringify({ location: null, count: 0 }));
      localStorage.setItem('defaultLocationCacheExpiry', newExpiry.toString());
      
      return null;
    }

    if (locationsCount === 1) {
      // Exactly one location - use as default
      const location = locations[0];
      defaultLocationCache = {
        id: location.id,
        name: location.name,
        timezone: location.timezone || 'Europe/Madrid'
      };
      
      if (import.meta.env.DEV) {
        console.log('[DefaultLocation] using id=' + defaultLocationCache.id + ' tz=' + defaultLocationCache.timezone);
      }
    } else {
      // Multiple locations - no default
      defaultLocationCache = null;
      
      if (import.meta.env.DEV) {
        console.log('[DefaultLocation] multiple locations (' + locationsCount + '), no default');
      }
    }

    // Update caches
    cacheExpiry = newExpiry;
    localStorage.setItem('defaultLocationCache', JSON.stringify({ 
      location: defaultLocationCache, 
      count: locationsCount 
    }));
    localStorage.setItem('defaultLocationCacheExpiry', newExpiry.toString());

    return defaultLocationCache;
  } catch (error) {
    console.error('[DefaultLocation] Error fetching locations:', error);
    toast({
      title: "Error",
      description: "Error al cargar las ubicaciones",
      variant: "destructive"
    });
    return null;
  }
}

/**
 * Get the count of active locations (from cache if available)
 */
export function getActiveLocationsCount(): number {
  return locationsCount;
}

/**
 * Check if there's exactly one active location
 */
export function hasSingleActiveLocation(): boolean {
  return locationsCount === 1;
}

/**
 * Clear the default location cache
 */
export function clearDefaultLocationCache(): void {
  defaultLocationCache = null;
  cacheExpiry = 0;
  localStorage.removeItem('defaultLocationCache');
  localStorage.removeItem('defaultLocationCacheExpiry');
  
  if (import.meta.env.DEV) {
    console.log('[DefaultLocation] cache cleared');
  }
}