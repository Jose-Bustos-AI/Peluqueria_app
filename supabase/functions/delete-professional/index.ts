import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create supabase client with service role for full access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Verify the user is authenticated and is panel admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Check if user is panel admin
    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('role, active')
      .eq('email', user.email)
      .single()

    if (adminError || !adminUser || !adminUser.active || !['superadmin', 'manager'].includes(adminUser.role)) {
      throw new Error('Insufficient permissions')
    }

    const { professionalId, action, confirm } = await req.json()

    if (!professionalId) {
      throw new Error('Professional ID is required')
    }

    console.log(`Processing deletion request for professional ${professionalId}, action: ${action}, confirm: ${confirm}`)

    // Check dependencies
    const [
      serviceLinks,
      classLinks,
      futureBookings,
      futureSessions,
      adminUsers
    ] = await Promise.all([
      supabase.from('service_professionals').select('id').eq('professional_id', professionalId),
      supabase.from('class_professionals').select('id').eq('professional_id', professionalId),
      supabase.from('bookings').select('id').eq('professional_id', professionalId).gte('start_at', new Date().toISOString()),
      supabase.from('class_sessions').select('id').eq('professional_id', professionalId).gte('start_at', new Date().toISOString()),
      supabase.from('admin_users').select('id').eq('professional_id', professionalId)
    ])

    const counts = {
      services: serviceLinks.data?.length || 0,
      classes: classLinks.data?.length || 0,
      futureBookings: futureBookings.data?.length || 0,
      futureSessions: futureSessions.data?.length || 0,
      adminUsers: adminUsers.data?.length || 0
    }

    const canHardDelete = counts.futureBookings === 0 && counts.futureSessions === 0 && counts.adminUsers === 0

    console.log('Dependency counts:', counts, 'canHardDelete:', canHardDelete)

    // If not confirming, just return the analysis
    if (!confirm) {
      return new Response(JSON.stringify({
        canHardDelete,
        counts,
        success: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Execute the action
    if (action === 'deactivate') {
      // Soft delete: deactivate professional and remove from service/class links
      const { error: deactivateError } = await supabase
        .from('professionals')
        .update({ active: false })
        .eq('id', professionalId)

      if (deactivateError) throw deactivateError

      // Remove from service and class links
      await Promise.all([
        supabase.from('service_professionals').delete().eq('professional_id', professionalId),
        supabase.from('class_professionals').delete().eq('professional_id', professionalId)
      ])

      // Log audit event
      await supabase.from('audit_logs').insert({
        action: 'professional.deactivated',
        entity_type: 'professional',
        entity_id: professionalId,
        actor: user.email,
        data: { counts }
      })

      return new Response(JSON.stringify({
        success: true,
        action: 'deactivated',
        message: 'Profesional desactivado correctamente'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    } else if (action === 'hard_delete') {
      if (!canHardDelete) {
        throw new Error('No se puede eliminar: existen reservas futuras, sesiones futuras o usuarios vinculados')
      }

      // Hard delete: remove all links and the professional
      await Promise.all([
        supabase.from('service_professionals').delete().eq('professional_id', professionalId),
        supabase.from('class_professionals').delete().eq('professional_id', professionalId)
      ])

      // Try to delete storage folder (best effort)
      try {
        const { data: files } = await supabase.storage
          .from('public-media')
          .list(`professionals/${professionalId}`, { limit: 100 })

        if (files && files.length > 0) {
          const filesToRemove = files.map(file => `professionals/${professionalId}/${file.name}`)
          await supabase.storage.from('public-media').remove(filesToRemove)
        }
      } catch (storageError) {
        console.log('Storage cleanup error (non-critical):', storageError)
      }

      // Delete the professional record
      const { error: deleteError } = await supabase
        .from('professionals')
        .delete()
        .eq('id', professionalId)

      if (deleteError) throw deleteError

      // Log audit event
      await supabase.from('audit_logs').insert({
        action: 'professional.deleted',
        entity_type: 'professional',
        entity_id: professionalId,
        actor: user.email,
        data: { counts }
      })

      return new Response(JSON.stringify({
        success: true,
        action: 'deleted',
        message: 'Profesional eliminado correctamente'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Invalid action')

  } catch (error) {
    console.error('Error in delete-professional function:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor'
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})