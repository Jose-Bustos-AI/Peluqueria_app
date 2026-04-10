import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, TestTube, Eye, EyeOff, Shield, Palette, Calendar, CreditCard, Ticket, Users, Monitor, Webhook, Database, FileText, CheckCircle2, XCircle } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

interface SettingsData {
  [key: string]: any;
}

interface StripeKeyResponse {
  success: boolean;
  masked?: string;
  error?: string;
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser } = usePermissions();
  const isSuperadmin = currentUser?.role === "superadmin";
  const [activeTab, setActiveTab] = useState("general");
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingStripe, setIsTestingStripe] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [formData, setFormData] = useState<SettingsData>({});

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*");
      
      if (error) throw error;
      
      // Convert array to object for easier access
      const settingsObj: SettingsData = {};
      data?.forEach(setting => {
        settingsObj[setting.key] = setting.value;
      });
      
      return settingsObj;
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (data: { key: string; value: any }[]) => {
      const results = await Promise.all(
        data.map(async ({ key, value }) => {
          const { error } = await supabase
            .from("settings")
            .upsert({ key, value }, { onConflict: "key" });
          
          if (error) throw error;
          return { key, value };
        })
      );
      return results;
    },
    onSuccess: () => {
      toast({
        title: "Configuración guardada",
        description: "Los cambios se han aplicado correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => {
      toast({
        title: "Error al guardar",
        description: "No se pudieron guardar los cambios",
        variant: "destructive",
      });
      console.error("Error saving settings:", error);
    },
  });

  const handleSave = async (tabData: SettingsData) => {
    setIsSaving(true);
    try {
      const updates = Object.entries(tabData).map(([key, value]) => ({
        key,
        value,
      }));
      
      await saveSettingsMutation.mutateAsync(updates);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStripeKeySave = async (keyType: 'secret' | 'webhook' | 'publishable', value: string) => {
    try {
      console.log(`[Admin.Payments] save key=${keyType} starting...`);
      
      // For publishable key, use different parameter name
      const payload = keyType === 'publishable' 
        ? { key: 'stripe.publishable_key', value }
        : { keyType, value };
      
      const { data, error } = await supabase.functions.invoke('save-stripe-key', {
        body: payload
      });

      if (error) {
        console.log(`[Admin.Payments] save key=${keyType} error:`, error);
        throw error;
      }

      const response = data as StripeKeyResponse;
      console.log(`[Admin.Payments] save key=${keyType} response:`, response);
      
      if (response.success) {
        console.log(`[Admin.Payments] save key=${keyType} status=success`);
        toast({
          title: "Clave guardada",
          description: `La clave ${keyType === 'publishable' ? 'pública' : keyType === 'secret' ? 'de Stripe' : 'de webhook'} se ha guardado correctamente`,
        });
        
        if (keyType === 'publishable') {
          // For publishable key, update the form data directly
          updateFormData('stripe.publishable_key', value);
        } else {
          // Update the masked display for secret keys
          setFormData(prev => ({
            ...prev,
            [keyType === 'secret' ? 'stripe.secret_key_masked' : 'stripe.webhook_secret_masked']: response.masked
          }));
        }
        
        // Refresh the form data to show updated values
        queryClient.invalidateQueries({ queryKey: ["settings"] });
      } else {
        console.log(`[Admin.Payments] save key=${keyType} status=failed:`, response.error);
        throw new Error(response.error || 'Error desconocido');
      }
    } catch (error) {
      console.error(`[Admin.Payments] save key=${keyType} status=error:`, error);
      toast({
        title: "Error al guardar clave",
        description: "No se pudo guardar la clave",
        variant: "destructive",
      });
    }
  };

  const testStripe = async () => {
    setIsTestingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-stripe', {});
      
      if (error) throw error;
      
      if (data.success) {
        toast({
          title: "Stripe conectado",
          description: "La conexión con Stripe funciona correctamente",
        });
      } else {
        throw new Error(data.error || 'Error en la prueba');
      }
    } catch (error) {
      toast({
        title: "Error de conexión",
        description: "No se pudo conectar con Stripe. Verifica las claves.",
        variant: "destructive",
      });
    } finally {
      setIsTestingStripe(false);
    }
  };

  const testWebhook = async () => {
    setIsTestingWebhook(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-n8n-webhook', {
        body: { 
          url: formData['webhooks.n8n_url'],
          secret: formData['webhooks.n8n_secret']
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast({
          title: "Webhook enviado",
          description: "El webhook de prueba se envió correctamente a n8n",
        });
      } else {
        throw new Error(data.error || 'Error en el webhook');
      }
    } catch (error) {
      toast({
        title: "Error en webhook",
        description: "No se pudo enviar el webhook de prueba",
        variant: "destructive",
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const updateFormData = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajustes"
        description="Configuración global del sistema"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className={cn("grid w-full h-auto p-1", isSuperadmin ? "grid-cols-5" : "grid-cols-4")}>
          <TabsTrigger value="general" className="flex items-center gap-2 text-xs">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="bookings" className="flex items-center gap-2 text-xs">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Reservas</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2 text-xs">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Calendario</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2 text-xs">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Pagos</span>
          </TabsTrigger>
          {isSuperadmin && (
            <TabsTrigger value="quipu" className="flex items-center gap-2 text-xs">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Facturación</span>
            </TabsTrigger>
          )}
          {/* Pestañas ocultas - descomentar cuando estén funcionales
          <TabsTrigger value="vouchers" className="flex items-center gap-2 text-xs">
            <Ticket className="h-4 w-4" />
            <span className="hidden sm:inline">Bonos</span>
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="flex items-center gap-2 text-xs">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Suscripciones</span>
          </TabsTrigger>
          <TabsTrigger value="widget" className="flex items-center gap-2 text-xs">
            <Monitor className="h-4 w-4" />
            <span className="hidden sm:inline">Widget</span>
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-2 text-xs">
            <Webhook className="h-4 w-4" />
            <span className="hidden sm:inline">Webhooks</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2 text-xs">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Seguridad</span>
          </TabsTrigger>
          */}
        </TabsList>

        {/* General & Branding */}
        <TabsContent value="general">
          <GeneralSettings
            data={formData}
            onUpdate={updateFormData}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </TabsContent>

        {/* Reservas */}
        <TabsContent value="bookings">
          <BookingsSettings
            data={formData}
            onUpdate={updateFormData}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </TabsContent>

        {/* Calendario */}
        <TabsContent value="calendar">
          <CalendarSettings
            data={formData}
            onUpdate={updateFormData}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </TabsContent>

        {/* Pagos */}
        <TabsContent value="payments">
          <PaymentsSettings
            data={formData}
            onUpdate={updateFormData}
            onSave={handleSave}
            onStripeKeySave={handleStripeKeySave}
            onTestStripe={testStripe}
            isSaving={isSaving}
            isTestingStripe={isTestingStripe}
            showSecret={showStripeSecret}
            onToggleSecret={() => setShowStripeSecret(!showStripeSecret)}
          />
        </TabsContent>

        {isSuperadmin && (
          <TabsContent value="quipu">
            <QuipuSettings
              data={formData}
              onUpdate={updateFormData}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </TabsContent>
        )}

        {/* Contenido oculto - descomentar cuando estén funcionales
        <TabsContent value="vouchers">
          <VouchersSettings
            data={formData}
            onUpdate={updateFormData}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </TabsContent>

        <TabsContent value="subscriptions">
          <SubscriptionsSettings
            data={formData}
            onUpdate={updateFormData}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </TabsContent>

        <TabsContent value="widget">
          <WidgetSettings
            data={formData}
            onUpdate={updateFormData}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </TabsContent>

        <TabsContent value="webhooks">
          <WebhooksSettings
            data={formData}
            onUpdate={updateFormData}
            onSave={handleSave}
            onTestWebhook={testWebhook}
            isSaving={isSaving}
            isTestingWebhook={isTestingWebhook}
            showSecret={showWebhookSecret}
            onToggleSecret={() => setShowWebhookSecret(!showWebhookSecret)}
          />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings
            data={formData}
            onUpdate={updateFormData}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </TabsContent>
        */}
      </Tabs>
    </div>
  );
}

// Individual tab components
const GeneralSettings = ({ data, onUpdate, onSave, isSaving }: any) => {
  const handleSave = () => {
    const tabData = {
      'app.name': data['app.name'] || '',
      'app.vat_number': data['app.vat_number'] || '',
      'app.email': data['app.email'] || '',
      'app.phone': data['app.phone'] || '',
      'app.language': data['app.language'] || 'es-ES',
      'app.timezone': data['app.timezone'] || 'Europe/Madrid',
      'app.currency': data['app.currency'] || 'EUR',
      'branding.logo_url': data['branding.logo_url'] || '',
      'branding.primary_color': data['branding.primary_color'] || '#3B82F6',
      'branding.secondary_color': data['branding.secondary_color'] || '#10B981',
      'branding.favicon_url': data['branding.favicon_url'] || '',
      'legal.terms_url': data['legal.terms_url'] || '',
      'legal.privacy_url': data['legal.privacy_url'] || '',
    };
    onSave(tabData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          General & Branding
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="app-name">Nombre comercial</Label>
            <Input
              id="app-name"
              value={data['app.name'] || ''}
              onChange={(e) => onUpdate('app.name', e.target.value)}
              placeholder="Reservas Pro"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-vat">NIF/CIF</Label>
            <Input
              id="app-vat"
              value={data['app.vat_number'] || ''}
              onChange={(e) => onUpdate('app.vat_number', e.target.value)}
              placeholder="B12345678"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-email">Email de contacto</Label>
            <Input
              id="app-email"
              type="email"
              value={data['app.email'] || ''}
              onChange={(e) => onUpdate('app.email', e.target.value)}
              placeholder="contacto@empresa.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-phone">Teléfono</Label>
            <Input
              id="app-phone"
              value={data['app.phone'] || ''}
              onChange={(e) => onUpdate('app.phone', e.target.value)}
              placeholder="+34 900 000 000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-language">Idioma por defecto</Label>
            <Select 
              value={data['app.language'] || 'es-ES'} 
              onValueChange={(value) => onUpdate('app.language', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar idioma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es-ES">Español (España)</SelectItem>
                <SelectItem value="en-US">English (US)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-timezone">Zona horaria</Label>
            <Select 
              value={data['app.timezone'] || 'Europe/Madrid'} 
              onValueChange={(value) => onUpdate('app.timezone', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar zona horaria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Europe/Madrid">Europe/Madrid</SelectItem>
                <SelectItem value="Europe/London">Europe/London</SelectItem>
                <SelectItem value="America/New_York">America/New_York</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-medium mb-4">Branding</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="logo-url">URL del logo</Label>
              <Input
                id="logo-url"
                value={data['branding.logo_url'] || ''}
                onChange={(e) => onUpdate('branding.logo_url', e.target.value)}
                placeholder="https://ejemplo.com/logo.png"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="favicon-url">URL del favicon</Label>
              <Input
                id="favicon-url"
                value={data['branding.favicon_url'] || ''}
                onChange={(e) => onUpdate('branding.favicon_url', e.target.value)}
                placeholder="https://ejemplo.com/favicon.ico"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="primary-color">Color primario</Label>
              <Input
                id="primary-color"
                type="color"
                value={data['branding.primary_color'] || '#3B82F6'}
                onChange={(e) => onUpdate('branding.primary_color', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondary-color">Color secundario</Label>
              <Input
                id="secondary-color"
                type="color"
                value={data['branding.secondary_color'] || '#10B981'}
                onChange={(e) => onUpdate('branding.secondary_color', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-medium mb-4">Enlaces legales</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="terms-url">Términos y condiciones</Label>
              <Input
                id="terms-url"
                value={data['legal.terms_url'] || ''}
                onChange={(e) => onUpdate('legal.terms_url', e.target.value)}
                placeholder="https://ejemplo.com/terminos"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="privacy-url">Política de privacidad</Label>
              <Input
                id="privacy-url"
                value={data['legal.privacy_url'] || ''}
                onChange={(e) => onUpdate('legal.privacy_url', e.target.value)}
                placeholder="https://ejemplo.com/privacidad"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const BookingsSettings = ({ data, onUpdate, onSave, isSaving }: any) => {
  const handleSave = () => {
    const tabData = {
      'bookings.min_advance_hours': data['bookings.min_advance_hours'] || 2,
      'bookings.max_advance_days': data['bookings.max_advance_days'] || 30,
    };
    onSave(tabData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración de Reservas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min-advance">Antelación mínima (horas)</Label>
              <Input
                id="min-advance"
                type="number"
                value={data['bookings.min_advance_hours'] || 2}
                onChange={(e) => onUpdate('bookings.min_advance_hours', parseInt(e.target.value))}
                min="0"
              />
              <p className="text-sm text-muted-foreground">
                Tiempo mínimo antes de la cita para poder reservar
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-advance">Antelación máxima (días)</Label>
              <Input
                id="max-advance"
                type="number"
                value={data['bookings.max_advance_days'] || 30}
                onChange={(e) => onUpdate('bookings.max_advance_days', parseInt(e.target.value))}
                min="1"
              />
              <p className="text-sm text-muted-foreground">
                Días máximos con antelación que se puede reservar
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const CalendarSettings = ({ data, onUpdate, onSave, isSaving }: any) => {
  const handleSave = () => {
    const tabData = {
      'calendar.default_view': data['calendar.default_view'] || 'today',
      'calendar.start_hour': data['calendar.start_hour'] || '08:00',
      'calendar.end_hour': data['calendar.end_hour'] || '20:00',
      'calendar.show_professional_colors': data['calendar.show_professional_colors'] ?? true,
    };
    onSave(tabData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración del Calendario</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="default-view">Vista por defecto</Label>
            <Select 
              value={data['calendar.default_view'] || 'today'} 
              onValueChange={(value) => onUpdate('calendar.default_view', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar vista" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="3days">3 próximos días</SelectItem>
                <SelectItem value="week">Semana completa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-hour">Hora de inicio</Label>
              <Input
                id="start-hour"
                type="time"
                value={data['calendar.start_hour'] || '08:00'}
                onChange={(e) => onUpdate('calendar.start_hour', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-hour">Hora de fin</Label>
              <Input
                id="end-hour"
                type="time"
                value={data['calendar.end_hour'] || '20:00'}
                onChange={(e) => onUpdate('calendar.end_hour', e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Mostrar colores por profesional</Label>
              <p className="text-sm text-muted-foreground">
                Usar el color asignado a cada profesional en las tarjetas del calendario
              </p>
            </div>
            <Switch
              checked={data['calendar.show_professional_colors'] ?? true}
              onCheckedChange={(checked) => onUpdate('calendar.show_professional_colors', checked)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const PaymentsSettings = ({ 
  data, 
  onUpdate, 
  onSave, 
  onStripeKeySave, 
  onTestStripe, 
  isSaving, 
  isTestingStripe, 
  showSecret, 
  onToggleSecret 
}: any) => {
  const [tempStripeSecret, setTempStripeSecret] = useState('');
  const [tempWebhookSecret, setTempWebhookSecret] = useState('');

  const handleSave = () => {
    console.log('[Admin.Payments] Saving general settings...');
    
    const tabData = {
      'payments.cash_enabled': data['payments.cash_enabled'] ?? true,
      'payments.card_enabled': data['payments.card_enabled'] ?? true,
      'stripe.publishable_key': data['stripe.publishable_key'] || '',
      'stripe.mode': data['stripe.mode'] || 'test',
      'payments.vat_percent': data['payments.vat_percent'] || 21,
      'payments.prices_include_vat': data['payments.prices_include_vat'] ?? true,
    };
    
    console.log('[Admin.Payments] Settings to save:', Object.keys(tabData));
    onSave(tabData);
  };

  const handleStripeSecretSave = () => {
    if (tempStripeSecret.trim()) {
      onStripeKeySave('secret', tempStripeSecret.trim());
      setTempStripeSecret('');
    }
  };

  const handleWebhookSecretSave = () => {
    if (tempWebhookSecret.trim()) {
      onStripeKeySave('webhook', tempWebhookSecret.trim());
      setTempWebhookSecret('');
    }
  };

  const handlePublishableKeySave = () => {
    const val = (data['stripe.publishable_key'] || '').trim();
    if (!val || !val.startsWith('pk_')) return;
    onStripeKeySave('publishable', val);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Configuración de Pagos (Stripe)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Permitir pagos en efectivo</Label>
              <p className="text-sm text-muted-foreground">
                Los usuarios pueden seleccionar efectivo como método de pago
              </p>
            </div>
            <Switch
              checked={data['payments.cash_enabled'] ?? true}
              onCheckedChange={(checked) => onUpdate('payments.cash_enabled', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Permitir pagos con tarjeta</Label>
              <p className="text-sm text-muted-foreground">
                Habilitar pagos online a través de Stripe
              </p>
            </div>
            <Switch
              checked={data['payments.card_enabled'] ?? true}
              onCheckedChange={(checked) => onUpdate('payments.card_enabled', checked)}
            />
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-medium mb-4">Configuración de Stripe</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stripe-mode">Modo</Label>
                <Select 
                  value={data['stripe.mode'] || 'test'} 
                  onValueChange={(value) => onUpdate('stripe.mode', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar modo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stripe-public">Publishable Key (pk_...)</Label>
                <div className="flex gap-2">
                  <Input
                    id="stripe-public"
                    value={data['stripe.publishable_key'] || ''}
                    onChange={(e) => onUpdate('stripe.publishable_key', e.target.value)}
                    placeholder="pk_test_..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePublishableKeySave}
                    disabled={!((data['stripe.publishable_key'] || '').startsWith('pk_')) || isSaving}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Guardar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Esta clave es segura para mostrarse en el frontend
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stripe-secret">Secret Key (sk_...)</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    {data['stripe.secret_key_masked'] ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={showSecret ? tempStripeSecret : data['stripe.secret_key_masked']}
                          onChange={(e) => setTempStripeSecret(e.target.value)}
                          onFocus={() => { if (!showSecret) onToggleSecret(); }}
                          onPaste={(e) => { const t = e.clipboardData.getData('text'); e.preventDefault(); if (!showSecret) onToggleSecret(); setTempStripeSecret(t); }}
                          placeholder={showSecret ? "Introducir nueva clave..." : "Pegar nueva clave sk_..."}
                          type={showSecret ? "text" : "password"}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={onToggleSecret}
                        >
                          {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    ) : (
                      <Input
                        id="stripe-secret"
                        type="password"
                        value={tempStripeSecret}
                        onChange={(e) => setTempStripeSecret(e.target.value)}
                        placeholder="sk_test_... o sk_live_..."
                      />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleStripeSecretSave}
                    disabled={!tempStripeSecret.trim()}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Guardar de forma segura
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Esta clave se guarda cifrada en el servidor y nunca se expone
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook-secret">Webhook Secret (whsec_...)</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    {data['stripe.webhook_secret_masked'] ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={showSecret ? tempWebhookSecret : data['stripe.webhook_secret_masked']}
                          onChange={(e) => setTempWebhookSecret(e.target.value)}
                          onFocus={() => { if (!showSecret) onToggleSecret(); }}
                          onPaste={(e) => { const t = e.clipboardData.getData('text'); e.preventDefault(); if (!showSecret) onToggleSecret(); setTempWebhookSecret(t); }}
                          placeholder={showSecret ? "Introducir nuevo secret..." : "Pegar nuevo whsec_..."}
                          type={showSecret ? "text" : "password"}
                        />
                      </div>
                    ) : (
                      <Input
                        id="webhook-secret"
                        type="password"
                        value={tempWebhookSecret}
                        onChange={(e) => setTempWebhookSecret(e.target.value)}
                        placeholder="whsec_..."
                      />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleWebhookSecretSave}
                    disabled={!tempWebhookSecret.trim()}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Guardar de forma segura
                  </Button>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={onTestStripe}
                disabled={isTestingStripe}
                className="w-full"
              >
                {isTestingStripe ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="mr-2 h-4 w-4" />
                )}
                Probar conexión con Stripe
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-medium mb-4">IVA y precios</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vat-percent">IVA por defecto (%)</Label>
                <Input
                  id="vat-percent"
                  type="number"
                  value={data['payments.vat_percent'] || 21}
                  onChange={(e) => onUpdate('payments.vat_percent', parseFloat(e.target.value))}
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Precios con IVA incluido</Label>
                  <p className="text-sm text-muted-foreground">
                    Los precios mostrados incluyen IVA
                  </p>
                </div>
                <Switch
                  checked={data['payments.prices_include_vat'] ?? true}
                  onCheckedChange={(checked) => onUpdate('payments.prices_include_vat', checked)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const VouchersSettings = ({ data, onUpdate, onSave, isSaving }: any) => {
  const handleSave = () => {
    const tabData = {
      'vouchers.return_on_cancel': data['vouchers.return_on_cancel'] ?? true,
      'vouchers.allow_multiple_redemption': data['vouchers.allow_multiple_redemption'] || false,
      'vouchers.expiry_warning_days': data['vouchers.expiry_warning_days'] || 7,
    };
    onSave(tabData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración de Bonos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Devolver crédito en cancelaciones</Label>
              <p className="text-sm text-muted-foreground">
                Devolver créditos del bono si se cancela dentro de la ventana permitida
              </p>
            </div>
            <Switch
              checked={data['vouchers.return_on_cancel'] ?? true}
              onCheckedChange={(checked) => onUpdate('vouchers.return_on_cancel', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Permitir redención múltiple</Label>
              <p className="text-sm text-muted-foreground">
                Usar varios créditos de bono en una sola reserva
              </p>
            </div>
            <Switch
              checked={data['vouchers.allow_multiple_redemption'] || false}
              onCheckedChange={(checked) => onUpdate('vouchers.allow_multiple_redemption', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiry-warning">Aviso de caducidad (días antes)</Label>
            <Input
              id="expiry-warning"
              type="number"
              value={data['vouchers.expiry_warning_days'] || 7}
              onChange={(e) => onUpdate('vouchers.expiry_warning_days', parseInt(e.target.value))}
              min="1"
              max="30"
            />
            <p className="text-sm text-muted-foreground">
              Enviar notificación cuando el bono esté próximo a caducar
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const SubscriptionsSettings = ({ data, onUpdate, onSave, isSaving }: any) => {
  const handleSave = () => {
    const tabData = {
      'subscriptions.reset_cap_on_cycle': data['subscriptions.reset_cap_on_cycle'] ?? true,
      'subscriptions.allow_pause': data['subscriptions.allow_pause'] || false,
      'subscriptions.max_pause_days': data['subscriptions.max_pause_days'] || 30,
      'subscriptions.block_on_past_due': data['subscriptions.block_on_past_due'] ?? true,
    };
    onSave(tabData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración de Suscripciones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Reiniciar cap al inicio de ciclo</Label>
              <p className="text-sm text-muted-foreground">
                Reiniciar el límite de reservas disponibles al comenzar cada nuevo ciclo
              </p>
            </div>
            <Switch
              checked={data['subscriptions.reset_cap_on_cycle'] ?? true}
              onCheckedChange={(checked) => onUpdate('subscriptions.reset_cap_on_cycle', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Permitir pausa de suscripción</Label>
              <p className="text-sm text-muted-foreground">
                Los usuarios pueden pausar temporalmente su suscripción
              </p>
            </div>
            <Switch
              checked={data['subscriptions.allow_pause'] || false}
              onCheckedChange={(checked) => onUpdate('subscriptions.allow_pause', checked)}
            />
          </div>

          {data['subscriptions.allow_pause'] && (
            <div className="space-y-2">
              <Label htmlFor="max-pause-days">Días máximos de pausa</Label>
              <Input
                id="max-pause-days"
                type="number"
                value={data['subscriptions.max_pause_days'] || 30}
                onChange={(e) => onUpdate('subscriptions.max_pause_days', parseInt(e.target.value))}
                min="1"
                max="365"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Bloquear reservas si past_due</Label>
              <p className="text-sm text-muted-foreground">
                Impedir nuevas reservas cuando el pago está vencido
              </p>
            </div>
            <Switch
              checked={data['subscriptions.block_on_past_due'] ?? true}
              onCheckedChange={(checked) => onUpdate('subscriptions.block_on_past_due', checked)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const WidgetSettings = ({ data, onUpdate, onSave, isSaving }: any) => {
  const handleSave = () => {
    const tabData = {
      'widget.register_url': data['widget.register_url'] || '',
      'widget.show_info': data['widget.show_info'] ?? true,
      'widget.show_treatments': data['widget.show_treatments'] ?? true,
      'widget.show_specialists': data['widget.show_specialists'] ?? true,
      'widget.show_vouchers': data['widget.show_vouchers'] ?? true,
      'widget.book_button_text': data['widget.book_button_text'] || 'Reservar ahora',
    };
    onSave(tabData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración del Widget</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="register-url">URL de registro</Label>
            <Input
              id="register-url"
              value={data['widget.register_url'] || ''}
              onChange={(e) => onUpdate('widget.register_url', e.target.value)}
              placeholder="https://app.ejemplo.com/registro"
            />
            <p className="text-sm text-muted-foreground">
              Deep link para el registro de usuarios desde el widget
            </p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-medium mb-4">Secciones visibles en inicio</h3>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-info"
                  checked={data['widget.show_info'] ?? true}
                  onCheckedChange={(checked) => onUpdate('widget.show_info', checked)}
                />
                <Label htmlFor="show-info">Información del centro</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-treatments"
                  checked={data['widget.show_treatments'] ?? true}
                  onCheckedChange={(checked) => onUpdate('widget.show_treatments', checked)}
                />
                <Label htmlFor="show-treatments">Tratamientos disponibles</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-specialists"
                  checked={data['widget.show_specialists'] ?? true}
                  onCheckedChange={(checked) => onUpdate('widget.show_specialists', checked)}
                />
                <Label htmlFor="show-specialists">Especialistas</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-vouchers"
                  checked={data['widget.show_vouchers'] ?? true}
                  onCheckedChange={(checked) => onUpdate('widget.show_vouchers', checked)}
                />
                <Label htmlFor="show-vouchers">Bonos disponibles</Label>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-medium mb-4">Textos personalizables</h3>
            
            <div className="space-y-2">
              <Label htmlFor="book-button">Texto del botón de reservar</Label>
              <Input
                id="book-button"
                value={data['widget.book_button_text'] || 'Reservar ahora'}
                onChange={(e) => onUpdate('widget.book_button_text', e.target.value)}
                placeholder="Reservar ahora"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const WebhooksSettings = ({ 
  data, 
  onUpdate, 
  onSave, 
  onTestWebhook, 
  isSaving, 
  isTestingWebhook, 
  showSecret, 
  onToggleSecret 
}: any) => {
  const { toast } = useToast();
  
  const webhookEvents = [
    { id: 'booking.created', label: 'Reserva creada' },
    { id: 'booking.cancelled', label: 'Reserva cancelada' },
    { id: 'booking.rescheduled', label: 'Reserva reprogramada' },
    { id: 'payment.succeeded', label: 'Pago exitoso' },
    { id: 'payment.failed', label: 'Pago fallido' },
    { id: 'voucher.consumed', label: 'Bono consumido' },
    { id: 'subscription.renewed', label: 'Suscripción renovada' },
    { id: 'subscription.past_due', label: 'Suscripción vencida' },
  ];

  const handleSave = () => {
    const tabData = {
      'webhooks.n8n_url': data['webhooks.n8n_url'] || '',
      'webhooks.n8n_secret': data['webhooks.n8n_secret'] || '',
      'webhooks.booking_created_url': data['webhooks.booking_created_url'] || '',
      'webhooks.enabled': data['webhooks.enabled'] ?? true,
      'webhooks.enabled_events': data['webhooks.enabled_events'] || [],
    };
    onSave(tabData);
  };

  const handleEventToggle = (eventId: string, checked: boolean) => {
    const currentEvents = data['webhooks.enabled_events'] || [];
    const newEvents = checked 
      ? [...currentEvents, eventId]
      : currentEvents.filter((id: string) => id !== eventId);
    onUpdate('webhooks.enabled_events', newEvents);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración de Webhooks (n8n)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {/* Webhook enabled toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="webhooks-enabled" className="flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Habilitar webhooks
            </Label>
            <Switch
              id="webhooks-enabled"
              checked={data['webhooks.enabled'] ?? true}
              onCheckedChange={(checked) => onUpdate('webhooks.enabled', checked)}
            />
          </div>

          {/* Booking creation webhook URL */}
          <div className="space-y-2">
            <Label htmlFor="booking-webhook-url">URL para reservas creadas</Label>
            <Input
              id="booking-webhook-url"
              value={data['webhooks.booking_created_url'] || ''}
              onChange={(e) => onUpdate('webhooks.booking_created_url', e.target.value)}
              placeholder="https://tu-webhook.com/endpoint"
              className="font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              URL donde se enviarán las notificaciones de nuevas reservas creadas desde el widget
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="n8n-url">URL del webhook de n8n</Label>
            <Input
              id="n8n-url"
              value={data['webhooks.n8n_url'] || ''}
              onChange={(e) => onUpdate('webhooks.n8n_url', e.target.value)}
              placeholder="https://tu-instancia.n8n.cloud/webhook/..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="n8n-secret">Secret del webhook</Label>
            <div className="flex gap-2">
              <Input
                id="n8n-secret"
                type={showSecret ? "text" : "password"}
                value={data['webhooks.n8n_secret'] || ''}
                onChange={(e) => onUpdate('webhooks.n8n_secret', e.target.value)}
                placeholder="Secret para firmar los webhooks"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onToggleSecret}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Se usa para firmar los webhooks con HMAC para verificar autenticidad
            </p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-medium mb-4">Eventos a enviar</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {webhookEvents.map((event) => (
                <div key={event.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={event.id}
                    checked={(data['webhooks.enabled_events'] || []).includes(event.id)}
                    onCheckedChange={(checked) => handleEventToggle(event.id, checked as boolean)}
                  />
                  <Label htmlFor={event.id} className="text-sm">
                    {event.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={onTestWebhook}
              disabled={isTestingWebhook || !data['webhooks.n8n_url']}
            >
              {isTestingWebhook ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="mr-2 h-4 w-4" />
              )}
              Probar webhook n8n
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const testWebhook = async () => {
                  try {
                    const webhookUrl = data['webhooks.booking_created_url'];
                    if (!webhookUrl) {
                      toast({
                        title: "Error",
                        description: "No hay URL configurada para el webhook de reservas",
                        variant: "destructive"
                      });
                      return;
                    }

                    const normalizedUrl = webhookUrl.trim().replace(/^["']|["']$/g, '');
                    
                    const testPayload = {
                      event: 'booking.test',
                      timestamp: new Date().toISOString(),
                      note: 'Test webhook from admin panel'
                    };

                    console.log('[Test Webhook] Sending to:', normalizedUrl);

                    const response = await fetch(normalizedUrl, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-ReservasPro-Event': 'booking.test'
                      },
                      body: JSON.stringify(testPayload)
                    });

                    let responseBody = '';
                    try {
                      responseBody = await response.text();
                    } catch (e) {
                      responseBody = 'Could not read response body';
                    }

                    console.log('[Test Webhook] Response:', {
                      status: response.status,
                      statusText: response.statusText,
                      body: responseBody
                    });

                    if (response.ok) {
                      toast({
                        title: "Webhook funcionando",
                        description: `Status: ${response.status} ${response.statusText}`,
                        variant: "default"
                      });
                    } else {
                      toast({
                        title: "Webhook falló",
                        description: `Status: ${response.status} ${response.statusText}`,
                        variant: "destructive"
                      });
                    }
                  } catch (error) {
                    console.error('[Test Webhook] Error:', error);
                    toast({
                      title: "Error de conexión",
                      description: error instanceof Error ? error.message : 'Error desconocido',
                      variant: "destructive"
                    });
                  }
                };
                testWebhook();
              }}
              disabled={!data['webhooks.booking_created_url']}
            >
              <TestTube className="mr-2 h-4 w-4" />
              Probar webhook reservas
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const SecuritySettings = ({ data, onUpdate, onSave, isSaving }: any) => {
  const handleSave = () => {
    const tabData = {
      'security.audit_retention_days': data['security.audit_retention_days'] || 90,
      'security.csv_export_enabled': data['security.csv_export_enabled'] ?? true,
      'security.two_factor_enabled': data['security.two_factor_enabled'] || false,
    };
    onSave(tabData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos & Seguridad</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="audit-retention">Retención de logs de auditoría (días)</Label>
            <Input
              id="audit-retention"
              type="number"
              value={data['security.audit_retention_days'] || 90}
              onChange={(e) => onUpdate('security.audit_retention_days', parseInt(e.target.value))}
              min="30"
              max="365"
            />
            <p className="text-sm text-muted-foreground">
              Los logs de auditoría se eliminarán automáticamente después de este período
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Exportación CSV habilitada</Label>
              <p className="text-sm text-muted-foreground">
                Permitir la exportación de datos en formato CSV
              </p>
            </div>
            <Switch
              checked={data['security.csv_export_enabled'] ?? true}
              onCheckedChange={(checked) => onUpdate('security.csv_export_enabled', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>2FA para usuarios del panel</Label>
              <p className="text-sm text-muted-foreground">
                Requerir autenticación de dos factores para acceder al panel
              </p>
            </div>
            <Switch
              checked={data['security.two_factor_enabled'] || false}
              onCheckedChange={(checked) => onUpdate('security.two_factor_enabled', checked)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ── Quipu Billing Settings (superadmin only) ──────────────────────
const QuipuSettings = ({ data, onUpdate, onSave, isSaving }: any) => {
  const { toast } = useToast();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const quipuEnabled = data['quipu.enabled'] === 'true' || data['quipu.enabled'] === true;

  const handleSave = () => {
    const tabData = {
      'quipu.enabled': quipuEnabled ? 'true' : 'false',
      'quipu.auto_invoice': (data['quipu.auto_invoice'] === 'true' || data['quipu.auto_invoice'] === true) ? 'true' : 'false',
      'quipu.vat_percent': String(data['quipu.vat_percent'] ?? 10),
    };
    onSave(tabData);
    toast({
      title: "Configuración de Quipu guardada",
    });
  };

  const testConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    try {
      const { data: result, error } = await supabase.functions.invoke('quipu-create-invoice', {
        body: { test_connection: true }
      });

      if (error) throw error;

      if (result?.success) {
        setConnectionStatus('ok');
        toast({ title: "✅ Conectado con Quipu correctamente" });
      } else {
        setConnectionStatus('error');
        toast({ title: "❌ Error de conexión", description: result?.error || "Credenciales inválidas", variant: "destructive" });
      }
    } catch (error: any) {
      setConnectionStatus('error');
      toast({ title: "❌ Error de conexión", description: error?.message || "No se pudo conectar con Quipu", variant: "destructive" });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Facturación — Quipu
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 3A — Toggle principal */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">Activar integración con Quipu</Label>
            <p className="text-sm text-muted-foreground">
              Habilita la conexión con Quipu para generar facturas
            </p>
          </div>
          <Switch
            checked={quipuEnabled}
            onCheckedChange={(checked) => onUpdate('quipu.enabled', checked ? 'true' : 'false')}
          />
        </div>

        {/* 3B — Credenciales API (info + verificar) */}
        <div className={cn("space-y-4 rounded-lg border p-4", !quipuEnabled && "opacity-50 pointer-events-none")}>
          <h3 className="text-sm font-medium">Credenciales API</h3>
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm text-muted-foreground">
              Las credenciales API deben configurarse directamente en{" "}
              <strong>Supabase → Edge Functions → Manage Secrets</strong>{" "}
              como variables <code className="text-xs bg-background px-1 py-0.5 rounded">QUIPU_APP_ID</code> y{" "}
              <code className="text-xs bg-background px-1 py-0.5 rounded">QUIPU_APP_SECRET</code>.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={!quipuEnabled || isTestingConnection}
            >
              {isTestingConnection ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
              Verificar conexión
            </Button>
            {connectionStatus === 'ok' && (
              <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <CheckCircle2 className="h-4 w-4" /> Conectado
              </span>
            )}
            {connectionStatus === 'error' && (
              <span className="flex items-center gap-1 text-sm text-red-600 font-medium">
                <XCircle className="h-4 w-4" /> Error de conexión
              </span>
            )}
          </div>
        </div>

        {/* 3C — Toggle facturación automática */}
        <div className={cn("flex items-center justify-between rounded-lg border p-4", !quipuEnabled && "opacity-50 pointer-events-none")}>
          <div className="space-y-0.5">
            <Label className="text-base font-medium">Facturación automática</Label>
            <p className="text-sm text-muted-foreground">
              Si está activado, se genera una factura en Quipu automáticamente cada vez que una reserva queda pagada. Si está desactivado, la factura se genera manualmente desde cada reserva.
            </p>
          </div>
          <Switch
            checked={data['quipu.auto_invoice'] === 'true' || data['quipu.auto_invoice'] === true}
            onCheckedChange={(checked) => onUpdate('quipu.auto_invoice', checked ? 'true' : 'false')}
            disabled={!quipuEnabled}
          />
        </div>

        {/* 3D — Campo IVA */}
        <div className={cn("rounded-lg border p-4 space-y-2", !quipuEnabled && "opacity-50 pointer-events-none")}>
          <Label htmlFor="quipu-vat">% IVA</Label>
          <Input
            id="quipu-vat"
            type="number"
            value={data['quipu.vat_percent'] ?? 10}
            onChange={(e) => onUpdate('quipu.vat_percent', parseFloat(e.target.value))}
            min="0"
            max="100"
            step="0.5"
            className="w-32"
            disabled={!quipuEnabled}
          />
          <p className="text-sm text-muted-foreground">
            IVA aplicado a los servicios de fisioterapia (10% tipo reducido)
          </p>
        </div>

        {/* 3E — Botón guardar */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};