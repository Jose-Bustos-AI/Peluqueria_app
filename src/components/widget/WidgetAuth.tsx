import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mail, Lock, User, Phone, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ShadowUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  auth_user_id: string | null;
  organization_id: string | null;
}

interface WidgetAuthProps {
  onSuccess: (authUserId: string, shadowUser: ShadowUser) => void;
  organizationId: string | null;
  slug: string | null;
}

type AuthView = 'login' | 'register' | 'magic-link-sent' | 'loading';

export default function WidgetAuth({ onSuccess, organizationId, slug }: WidgetAuthProps) {
  const { toast } = useToast();
  const [view, setView] = useState<AuthView>('login');
  const [loading, setLoading] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
  }, []);

  // Listen for auth state changes (magic link callback)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await resolveOrCreateShadow(session.user.id, session.user.email || '');
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  const checkExistingSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await resolveOrCreateShadow(session.user.id, session.user.email || '');
    }
  };

  const resolveOrCreateShadow = async (authUserId: string, email: string) => {
    try {
      // 1. Try to find shadow by auth_user_id
      let { data: shadow } = await supabase
        .from('users_shadow')
        .select('id, email, name, phone, auth_user_id, organization_id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      // 2. If not found, try by email (existing legacy user)
      if (!shadow) {
        const { data: legacyShadow } = await supabase
          .from('users_shadow')
          .select('id, email, name, phone, auth_user_id, organization_id')
          .eq('email', email.toLowerCase().trim())
          .is('auth_user_id', null)
          .maybeSingle();

        if (legacyShadow) {
          // Link legacy shadow to auth user
          await supabase
            .from('users_shadow')
            .update({
              auth_user_id: authUserId,
              organization_id: organizationId || legacyShadow.organization_id,
              updated_at: new Date().toISOString()
            })
            .eq('id', legacyShadow.id);

          shadow = { ...legacyShadow, auth_user_id: authUserId };
        }
      }

      // 3. If still not found, create new shadow
      if (!shadow) {
        const { data: newShadow, error: insertError } = await supabase
          .from('users_shadow')
          .insert({
            email: email.toLowerCase().trim(),
            name: regName || email.split('@')[0],
            phone: regPhone || null,
            app_user_id: `auth:${authUserId}`,
            auth_user_id: authUserId,
            organization_id: organizationId
          })
          .select('id, email, name, phone, auth_user_id, organization_id')
          .single();

        if (insertError) throw insertError;
        shadow = newShadow;
      }

      if (!shadow) throw new Error('Failed to resolve user profile');

      // Save to localStorage for backwards compatibility
      localStorage.setItem('reservasPro_user', JSON.stringify({
        userShadowId: shadow.id,
        email: shadow.email,
        name: shadow.name,
        phone: shadow.phone,
        savedAt: new Date().toISOString()
      }));

      onSuccess(authUserId, shadow as ShadowUser);
    } catch (error) {
      console.error('[WidgetAuth] Error resolving shadow user:', error);
      toast({
        title: "Error",
        description: "No se pudo cargar el perfil de usuario",
        variant: "destructive"
      });
    }
  };

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      toast({ title: "Error", description: "Completa email y contrasena", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast({ title: "Error", description: "Email o contrasena incorrectos", variant: "destructive" });
        } else {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        }
        return;
      }

      if (data.user) {
        await resolveOrCreateShadow(data.user.id, data.user.email || '');
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al iniciar sesion", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regEmail.trim() || !regPassword || !regName.trim()) {
      toast({ title: "Error", description: "Completa nombre, email y contrasena", variant: "destructive" });
      return;
    }
    if (regPassword.length < 6) {
      toast({ title: "Error", description: "La contrasena debe tener al menos 6 caracteres", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: regEmail.trim().toLowerCase(),
        password: regPassword,
        options: {
          data: { name: regName.trim() }
        }
      });

      if (error) {
        if (error.message.includes('already registered')) {
          toast({ title: "Error", description: "Este email ya esta registrado. Prueba a iniciar sesion.", variant: "destructive" });
        } else {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        }
        return;
      }

      if (data.user && data.session) {
        // Auto-confirmed (or confirm_email disabled)
        await resolveOrCreateShadow(data.user.id, data.user.email || '');
      } else if (data.user && !data.session) {
        // Needs email confirmation
        toast({
          title: "Revisa tu email",
          description: "Te hemos enviado un enlace de verificacion"
        });
        setView('magic-link-sent');
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al crear la cuenta", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    const email = (view === 'login' ? loginEmail : regEmail).trim().toLowerCase();
    if (!email) {
      toast({ title: "Error", description: "Ingresa tu email primero", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const redirectUrl = slug
        ? `${window.location.origin}/widget?slug=${slug}`
        : `${window.location.origin}/widget`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectUrl }
      });

      if (error) throw error;

      toast({
        title: "Enlace enviado",
        description: "Revisa tu bandeja de entrada"
      });
      setView('magic-link-sent');
    } catch (error) {
      toast({ title: "Error", description: "No se pudo enviar el enlace", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (view === 'loading') {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (view === 'magic-link-sent') {
    return (
      <Card className="mx-4 mt-8">
        <CardHeader className="text-center">
          <Mail className="h-12 w-12 mx-auto text-primary mb-2" />
          <CardTitle>Revisa tu email</CardTitle>
          <CardDescription>
            Te hemos enviado un enlace para acceder. Haz clic en el enlace del email para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setView('login')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al inicio de sesion
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (view === 'register') {
    return (
      <Card className="mx-4 mt-8">
        <CardHeader>
          <CardTitle className="text-lg">Crear cuenta</CardTitle>
          <CardDescription>Registrate para gestionar tus reservas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reg-name">Nombre *</Label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="reg-name"
                placeholder="Tu nombre"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-email">Email *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="reg-email"
                type="email"
                placeholder="tu@email.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-phone">Telefono</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="reg-phone"
                type="tel"
                placeholder="+34 600 000 000"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-password">Contrasena *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="reg-password"
                type="password"
                placeholder="Minimo 6 caracteres"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleRegister}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Crear cuenta
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">o</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleMagicLink}
            disabled={loading}
          >
            <Mail className="h-4 w-4 mr-2" />
            Recibir enlace por email
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Ya tienes cuenta?{' '}
            <button
              className="text-primary underline hover:no-underline"
              onClick={() => setView('login')}
            >
              Iniciar sesion
            </button>
          </p>
        </CardContent>
      </Card>
    );
  }

  // Login view (default)
  return (
    <Card className="mx-4 mt-8">
      <CardHeader>
        <CardTitle className="text-lg">Iniciar sesion</CardTitle>
        <CardDescription>Accede para gestionar tus reservas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="login-email"
              type="email"
              placeholder="tu@email.com"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="pl-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="login-password">Contrasena</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="login-password"
              type="password"
              placeholder="Tu contrasena"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="pl-10"
            />
          </div>
        </div>

        <Button
          className="w-full"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Entrar
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">o</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={handleMagicLink}
          disabled={loading}
        >
          <Mail className="h-4 w-4 mr-2" />
          Recibir enlace por email
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          No tienes cuenta?{' '}
          <button
            className="text-primary underline hover:no-underline"
            onClick={() => setView('register')}
          >
            Registrate
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
