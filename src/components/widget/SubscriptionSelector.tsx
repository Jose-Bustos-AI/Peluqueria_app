import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, Users, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Class {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  capacity: number;
  photo_url: string | null;
  category_id: string;
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  photo_url: string | null;
  category_id: string;
  currency: string;
}

interface SubscriptionSelectorProps {
  subscriptionFlow: {
    origin: string;
    subscriptionId: string;
    planId: string;
    allowedClassIds: string[];
    allowedServiceIds: string[];
    lockedProfessionalId?: string;
  };
  onBack: () => void;
  onSelectClass: (classData: Class) => void;
  onSelectService: (serviceData: Service) => void;
}

export default function SubscriptionSelector({ 
  subscriptionFlow, 
  onBack, 
  onSelectClass, 
  onSelectService 
}: SubscriptionSelectorProps) {
  const { toast } = useToast();
  const [classes, setClasses] = useState<Class[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const hasClasses = subscriptionFlow.allowedClassIds.length > 0;
  const hasServices = subscriptionFlow.allowedServiceIds.length > 0;
  const totalItems = subscriptionFlow.allowedClassIds.length + subscriptionFlow.allowedServiceIds.length;

  useEffect(() => {
    // If only one item total, we should redirect directly
    if (totalItems === 1) {
      if (hasClasses) {
        loadSingleClass();
      } else if (hasServices) {
        loadSingleService();
      }
    } else {
      loadAllowedItems();
    }
  }, [subscriptionFlow]);

  const loadSingleClass = async () => {
    try {
      const classId = subscriptionFlow.allowedClassIds[0];
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .eq('active', true)
        .single();

      if (error) throw error;
      
      console.log('[Calendar] origin=subscription element=class allowed=true');
      onSelectClass(data);
    } catch (error) {
      console.error('Error loading single class:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la clase',
        variant: 'destructive',
      });
      onBack();
    }
  };

  const loadSingleService = async () => {
    try {
      const serviceId = subscriptionFlow.allowedServiceIds[0];
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .eq('active', true)
        .single();

      if (error) throw error;
      
      console.log('[Calendar] origin=subscription element=service allowed=true');
      onSelectService(data);
    } catch (error) {
      console.error('Error loading single service:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el servicio',
        variant: 'destructive',
      });
      onBack();
    }
  };

  const loadAllowedItems = async () => {
    try {
      setLoading(true);

      // Load allowed classes
      if (hasClasses) {
        const { data: classData, error: classError } = await supabase
          .from('classes')
          .select('*')
          .in('id', subscriptionFlow.allowedClassIds)
          .eq('active', true)
          .order('name', { ascending: true });

        if (classError) throw classError;
        setClasses(classData || []);
      }

      // Load allowed services
      if (hasServices) {
        const { data: serviceData, error: serviceError } = await supabase
          .from('services')
          .select('*')
          .in('id', subscriptionFlow.allowedServiceIds)
          .eq('active', true)
          .order('name', { ascending: true });

        if (serviceError) throw serviceError;
        setServices(serviceData || []);
      }

    } catch (error) {
      console.error('Error loading allowed items:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los elementos incluidos',
        variant: 'destructive',
      });
      onBack();
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClass = (classData: Class) => {
    console.log('[Calendar] origin=subscription element=class allowed=true');
    onSelectClass(classData);
  };

  const handleSelectService = (serviceData: Service) => {
    console.log('[Calendar] origin=subscription element=service allowed=true');
    onSelectService(serviceData);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

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
          <h1 className="text-lg font-semibold">Servicios incluidos</h1>
        </div>
      </header>

      {/* Content */}
      <div className="p-4 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-white">
            Elige qué quieres reservar
          </h2>
          <p className="text-slate-300">
            Estos servicios están incluidos en tu suscripción
          </p>
        </div>

        {/* Classes Section */}
        {classes.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-slate-200 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Clases
            </h3>
            {classes.map((classItem) => (
              <Card
                key={classItem.id}
                className="bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-750 transition-colors"
                onClick={() => handleSelectClass(classItem)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Class Image */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
                      {classItem.photo_url ? (
                        <img 
                          src={classItem.photo_url} 
                          alt={classItem.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Users className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-start flex-1">
                      <div className="space-y-1 flex-1">
                        <h4 className="font-semibold text-white">{classItem.name}</h4>
                        {classItem.description && (
                          <p className="text-sm text-slate-300">{classItem.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-sm text-slate-400">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {classItem.duration_min} min
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            Máx. {classItem.capacity} personas
                          </div>
                        </div>
                      </div>
                      <Badge className="bg-green-600 text-white">
                        Incluido
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Services Section */}
        {services.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-slate-200 flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Servicios
            </h3>
            {services.map((service) => (
              <Card
                key={service.id}
                className="bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-750 transition-colors"
                onClick={() => handleSelectService(service)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Service Image */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
                      {service.photo_url ? (
                        <img 
                          src={service.photo_url} 
                          alt={service.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Tag className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-start flex-1">
                      <div className="space-y-1 flex-1">
                        <h4 className="font-semibold text-white">{service.name}</h4>
                        {service.description && (
                          <p className="text-sm text-slate-300">{service.description}</p>
                        )}
                        <div className="flex items-center gap-1 text-sm text-slate-400">
                          <Clock className="w-4 h-4" />
                          {service.duration_min} min
                        </div>
                      </div>
                      <Badge className="bg-green-600 text-white">
                        Incluido
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {classes.length === 0 && services.length === 0 && (
          <div className="text-center py-8">
            <p className="text-slate-300">No hay servicios disponibles en tu suscripción</p>
            <Button
              onClick={onBack}
              variant="outline"
              className="mt-4 border-slate-600 text-white hover:bg-slate-700"
            >
              Volver
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}