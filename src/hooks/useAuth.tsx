import React, { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"
import { User, Session } from "@supabase/supabase-js"

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  role: 'gerente' | 'empleado' | null
  professionalId: string | null
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  role: null,
  professionalId: null,
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Debug: Check if React and hooks are properly available
  console.log('AuthProvider: React available?', !!React);
  console.log('AuthProvider: useState available?', !!useState);
  
  const [user, setUser] = React.useState<User | null>(null)
  const [session, setSession] = React.useState<Session | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [role, setRole] = React.useState<'gerente' | 'empleado' | null>(null)
  const [professionalId, setProfessionalId] = React.useState<string | null>(null)

  useEffect(() => {
    // Watchdog: Si loading no se resuelve en 2s, forzar loading=false
    const watchdog = setTimeout(() => {
      if (loading) {
        console.warn('Auth loading timeout - forcing completion')
        setLoading(false)
      }
    }, 2000)

    // Listen for auth changes (NO async en callback para evitar deadlock)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        
        if (session?.user) {
          // Defer admin_users fetch usando setTimeout para evitar bloqueo
          setTimeout(async () => {
            try {
              const { data: adminUser } = await supabase
                .from('admin_users')
                .select('role, professional_id')
                .eq('email', session.user.email)
                .single()
                
              if (adminUser) {
                setRole(adminUser.role as 'gerente' | 'empleado')
                setProfessionalId(adminUser.professional_id)
              }
            } catch (error) {
              console.error('Error fetching admin user:', error)
            }
          }, 0)
        } else {
          setRole(null)
          setProfessionalId(null)
        }
        setLoading(false)
        clearTimeout(watchdog)
      }
    )

    // Get initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        clearTimeout(watchdog)
      })
      .catch(() => {
        setLoading(false)
        clearTimeout(watchdog)
      })

    return () => {
      subscription.unsubscribe()
      clearTimeout(watchdog)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading, role, professionalId }}>
      {children}
    </AuthContext.Provider>
  )
}