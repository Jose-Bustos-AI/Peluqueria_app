import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Calendar, MapPin, Clock, User, AlertCircle, Ticket, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from "@/hooks/use-toast";
import { getDefaultLocation } from '@/lib/default-location';

interface VoucherType {
  id: string;
  name: string;
  description?: string;
  sessions_count: number;
  price: number;
  currency: string;
  validity_days?: number;
  validity_end_date?: string;
  session_duration_min?: number;
  professional_id?: string;
  photo_url?: string;
  active: boolean;
}

interface UserVoucher {
  id: string;
  voucher_type_id: string;
  sessions_remaining: number;
  purchase_date: string;
  expiry_date?: string;
  status: string;
  voucher_type: VoucherType;
}

interface Professional {
  id: string;
  name: string;
  photo_url?: string;
  specialty?: string;
}

interface Location {
  id: string;
  name: string;
  timezone?: string;
}

interface VoucherDetailViewProps {
  voucherTypeId: string; // Changed from voucherId to voucherTypeId
  onBack: () => void;
  onReserveClick: (voucherTypeId: string, professionalId: string, locationId: string) => void;
  onPurchaseClick?: (voucherTypeId: string) => void;
}

export default function VoucherDetailView({ 
  voucherTypeId, // Changed from voucherId
  onBack, 
  onReserveClick,
  onPurchaseClick
}: VoucherDetailViewProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [voucherType, setVoucherType] = useState<VoucherType | null>(null); // Changed from voucher to voucherType
  const [availableProfessionals, setAvailableProfessionals] = useState<Professional[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [location, setLocation] = useState<Location | null>(null);
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    loadVoucherData();
  }, [voucherTypeId]); // Changed from voucherId

  const loadVoucherData = async () => {
    try {
      setLoading(true);

      // Load default location
      const defaultLocation = await getDefaultLocation();
      if (defaultLocation) {
        setLocation(defaultLocation);
      }

      // Fetch voucher type info
      const { data: voucherTypeData, error: voucherTypeError } = await supabase
        .from('voucher_types')
        .select('*')
        .eq('id', voucherTypeId)
        .eq('active', true)
        .maybeSingle();

      if (voucherTypeError) throw voucherTypeError;
      if (!voucherTypeData) {
        setVoucherType(null);
        return;
      }

      setVoucherType(voucherTypeData);

      // Determine available professionals
      if (voucherTypeData.professional_id) {
        // Single professional assigned to voucher type
        const { data: professionalData, error: profError } = await supabase
          .from('professionals')
          .select('*')
          .eq('id', voucherTypeData.professional_id)
          .eq('active', true)
          .maybeSingle();

        if (profError) throw profError;
        if (professionalData) {
          setAvailableProfessionals([professionalData]);
          setSelectedProfessionalId(professionalData.id);
        }
      } else {
        // Get professionals from service/category mappings
        const serviceIds: string[] = [];
        const categoryIds: string[] = [];

        // Get services covered by this voucher type
        const { data: serviceVouchers } = await supabase
          .from('voucher_type_services')
          .select('service_id')
          .eq('voucher_type_id', voucherTypeData.id);

        if (serviceVouchers) {
          serviceIds.push(...serviceVouchers.map(v => v.service_id));
        }

        // Get categories covered by this voucher type
        const { data: categoryVouchers } = await supabase
          .from('voucher_type_categories')
          .select('category_id')
          .eq('voucher_type_id', voucherTypeData.id);

        if (categoryVouchers) {
          categoryIds.push(...categoryVouchers.map(v => v.category_id));
        }

        // Get professionals from services and categories
        const professionalIds = new Set<string>();

        if (serviceIds.length > 0) {
          const { data: serviceProfessionals } = await supabase
            .from('service_professionals')
            .select('professional_id')
            .in('service_id', serviceIds);

          if (serviceProfessionals) {
            serviceProfessionals.forEach(sp => professionalIds.add(sp.professional_id));
          }
        }

        if (categoryIds.length > 0) {
          // Get services from categories first
          const { data: categoryServices } = await supabase
            .from('services')
            .select('id')
            .in('category_id', categoryIds)
            .eq('active', true);

          if (categoryServices) {
            const categoryServiceIds = categoryServices.map(s => s.id);
            const { data: catServiceProfessionals } = await supabase
              .from('service_professionals')
              .select('professional_id')
              .in('service_id', categoryServiceIds);

            if (catServiceProfessionals) {
              catServiceProfessionals.forEach(sp => professionalIds.add(sp.professional_id));
            }
          }
        }

        // Fetch professional details
        if (professionalIds.size > 0) {
          const { data: professionalsData } = await supabase
            .from('professionals')
            .select('*')
            .in('id', Array.from(professionalIds))
            .eq('active', true);

          if (professionalsData) {
            setAvailableProfessionals(professionalsData);
            if (professionalsData.length === 1) {
              setSelectedProfessionalId(professionalsData[0].id);
            }
          }
        }
      }

      // Load services and categories for display
      await loadCoveredItems(voucherTypeData.id);

    } catch (error) {
      console.error('Error loading voucher:', error);
      toast({
        title: "Error",
        description: "No se pudo cargar la información del bono",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCoveredItems = async (voucherTypeId: string) => {
    try {
      // Get covered services
      const { data: serviceVouchers } = await supabase
        .from('voucher_type_services')
        .select(`
          service_id,
          services(name, description)
        `)
        .eq('voucher_type_id', voucherTypeId);

      if (serviceVouchers) {
        setServices(serviceVouchers.map(sv => sv.services).filter(Boolean));
      }

      // Get covered categories
      const { data: categoryVouchers } = await supabase
        .from('voucher_type_categories')
        .select(`
          category_id,
          categories(name, description)
        `)
        .eq('voucher_type_id', voucherTypeId);

      if (categoryVouchers) {
        setCategories(categoryVouchers.map(cv => cv.categories).filter(Boolean));
      }
    } catch (error) {
      console.error('Error loading covered items:', error);
    }
  };

  const handleReserve = () => {
    console.log('[VoucherDetailView] handleReserve called');
    console.log('[VoucherDetailView] selectedProfessionalId:', selectedProfessionalId);
    console.log('[VoucherDetailView] location:', location);
    
    if (!selectedProfessionalId) {
      console.log('[VoucherDetailView] No professional selected');
      toast({
        title: "Error",
        description: "Selecciona un profesional para continuar",
        variant: "destructive",
      });
      return;
    }

    if (!location) {
      console.log('[VoucherDetailView] No location available');
      toast({
        title: "Error",
        description: "No se pudo determinar la ubicación",
        variant: "destructive",
      });
      return;
    }

    console.log('[VoucherDetailView] About to call onReserveClick with:', { 
      voucherTypeId, 
      selectedProfessionalId, 
      locationId: location.id 
    });
    
    // Use the callback to navigate to verification
    onReserveClick(voucherTypeId, selectedProfessionalId, location.id);
    
    console.log('[VoucherDetailView] onReserveClick called successfully');
  };

  const isVoucherTypeValid = () => {
    if (!voucherType) return false;
    return voucherType.active;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-3/4"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!voucherType) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Bono no encontrado</h3>
        <p className="text-muted-foreground mb-4">
          No se pudo encontrar el bono solicitado.
        </p>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
      </div>
    );
  }

  const validVoucherType = isVoucherTypeValid();

  return (
    <div className="min-h-screen bg-widget-primary p-4">
      <Button 
        onClick={onBack} 
        variant="ghost" 
        className="mb-4 text-widget-text hover:bg-white/10"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver a bonos
      </Button>

      <div className="space-y-4 max-w-4xl mx-auto">
        {/* Voucher Header */}
        <Card className="bg-brand-blue/20 border-white/30 backdrop-blur-sm shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              {voucherType.photo_url && (
                <img 
                  src={voucherType.photo_url} 
                  alt={voucherType.name}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-lg flex items-center gap-2 truncate text-white">
                  <Ticket className="h-5 w-5 text-white flex-shrink-0" />
                  {voucherType.name}
                </h2>
                {voucherType.description && (
                  <p className="text-white/90 text-sm mt-1 line-clamp-2">
                    {voucherType.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30 text-xs">
                    {voucherType.sessions_count} sesiones
                  </Badge>
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30 text-xs">
                    {voucherType.price}€
                  </Badge>
                  {voucherType.validity_days && (
                    <Badge variant="outline" className="text-xs border-white/40 text-white bg-white/10">
                      {voucherType.validity_days} días
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Professional Selection */}
        {validVoucherType && availableProfessionals.length > 0 && (
          <Card className="bg-white/10 border-white/20 backdrop-blur-sm">
            <CardContent className="p-4">
              <h3 className="font-medium flex items-center gap-2 mb-3 text-white">
                <User className="h-4 w-4 text-blue-400" />
                {availableProfessionals.length === 1 ? 'Profesional' : 'Selecciona Profesional'}
              </h3>
              {availableProfessionals.length === 1 ? (
                <div className="flex items-center gap-3">
                  {availableProfessionals[0].photo_url && (
                    <img 
                      src={availableProfessionals[0].photo_url} 
                      alt={availableProfessionals[0].name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <p className="font-medium text-white">{availableProfessionals[0].name}</p>
                    {availableProfessionals[0].specialty && (
                      <p className="text-sm text-white/70">{availableProfessionals[0].specialty}</p>
                    )}
                  </div>
                </div>
              ) : (
                <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un profesional" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProfessionals.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        <div className="flex items-center gap-2">
                          {prof.photo_url && (
                            <img 
                              src={prof.photo_url} 
                              alt={prof.name}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          )}
                          <span>{prof.name}</span>
                          {prof.specialty && (
                            <span className="text-muted-foreground">- {prof.specialty}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        )}

        {/* Coverage Information */}
        {validVoucherType && (services.length > 0 || categories.length > 0) && (
          <Card className="bg-white/10 border-white/20 backdrop-blur-sm">
            <CardContent className="p-4">
              <h3 className="font-medium mb-3 text-white">¿Qué incluye este bono?</h3>
              <div className="space-y-3">
                {services.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-white">Servicios específicos:</h4>
                    <div className="flex flex-wrap gap-2">
                      {services.map((service, index) => (
                        <Badge key={index} className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                          {service.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {categories.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-white">Categorías incluidas:</h4>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((category, index) => (
                        <Badge key={index} className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                          {category.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Purchase and Reserve Buttons */}
        {validVoucherType && (
          <Card className="bg-white/10 border-white/20 backdrop-blur-sm">
            <CardContent className="p-4 space-y-3">
              {/* Purchase Button */}
              {onPurchaseClick && (
                <Button 
                  onClick={() => onPurchaseClick(voucherTypeId)}
                  size="lg"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0"
                  variant="default"
                >
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Comprar bono por {voucherType.price}€
                </Button>
              )}
              
              {/* Reserve Button - only if professionals available */}
              {availableProfessionals.length > 0 && (
                <Button 
                  onClick={handleReserve}
                  disabled={availableProfessionals.length > 1 && !selectedProfessionalId}
                  size="lg"
                  className="w-full bg-widget-secondary hover:bg-widget-secondary/90 text-white"
                  variant="default"
                >
                  <Calendar className="mr-2 h-5 w-5" />
                  Reservar con este bono
                </Button>
              )}
              
              {availableProfessionals.length > 1 && !selectedProfessionalId && (
                <p className="text-sm text-widget-text-muted text-center">
                  Selecciona un profesional para continuar
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* No professionals available */}
        {validVoucherType && availableProfessionals.length === 0 && (
          <Card className="bg-white/10 border-white/20 backdrop-blur-sm">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-white/60 mb-4" />
              <h3 className="font-medium mb-2 text-white">No hay profesionales disponibles</h3>
              <p className="text-white/70">
                Este bono no tiene profesionales asignados o disponibles en este momento.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}