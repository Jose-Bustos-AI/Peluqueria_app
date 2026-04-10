// v2 - document_type fix
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    // ── TEST DE CONEXIÓN — no crea nada ─────────────────────────────
    if (body.test_connection === true) {
      const quipuAppId = Deno.env.get("QUIPU_APP_ID");
      const quipuAppSecret = Deno.env.get("QUIPU_APP_SECRET");

      if (!quipuAppId || !quipuAppSecret) {
        return new Response(JSON.stringify({ success: false, error: "Credenciales no configuradas en Supabase Secrets" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const credentials = btoa(`${quipuAppId}:${quipuAppSecret}`);
      const tokenRes = await fetch("https://getquipu.com/oauth/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: "scope=ecommerce&grant_type=client_credentials",
      });

      if (!tokenRes.ok) {
        return new Response(JSON.stringify({ success: false, error: "Credenciales Quipu inválidas" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ success: true, test: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { booking_id, triggered_by } = body;
    // triggered_by: 'automatic' | 'manual'
    // triggered_by_email: email del admin si es manual

    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── 1. IDEMPOTENCIA: ¿ya existe factura para esta reserva? ──────
    const { data: existing } = await supabase
      .from("quipu_invoices")
      .select("id, quipu_invoice_id, quipu_invoice_number, pdf_url")
      .eq("booking_id", booking_id)
      .eq("status", "created")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ 
        success: true, 
        already_exists: true, 
        invoice: existing 
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── 2. LEER CONFIGURACIÓN DE QUIPU ──────────────────────────────
    // Credenciales desde Supabase Secrets (nunca expuestas)
    const quipuAppId = Deno.env.get("QUIPU_APP_ID");
    const quipuAppSecret = Deno.env.get("QUIPU_APP_SECRET");

    // Config no sensible desde settings
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["quipu.vat_percent", "quipu.enabled"]);

    const cfg = Object.fromEntries(settings?.map(s => [s.key, s.value]) ?? []);

    if (cfg["quipu.enabled"] !== "true") {
      return new Response(JSON.stringify({ error: "Quipu no está activado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!quipuAppId || !quipuAppSecret) {
      return new Response(JSON.stringify({ error: "Credenciales Quipu no configuradas en secrets" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── 3. OBTENER DATOS DE LA RESERVA ──────────────────────────────
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id, type, status, payment_method, payment_status, origin,
        start_at, end_at, user_id,
        services!bookings_service_id_fkey(id, name, price),
        classes!bookings_class_id_fkey(id, name, price)
      `)
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: "Reserva no encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (booking.payment_status !== "paid") {
      return new Response(JSON.stringify({ error: "La reserva no está pagada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── 4. OBTENER DATOS DEL CLIENTE ─────────────────────────────────
    const { data: client } = await supabase
      .from("users_shadow")
      .select("id, name, email, phone, fiscal_name, nif, document_type, fiscal_address, fiscal_city, fiscal_zip")
      .eq("id", booking.user_id)
      .maybeSingle();

    // ── 5. OBTENER PAGO ASOCIADO ─────────────────────────────────────
    const { data: payment } = await supabase
      .from("payments")
      .select("id, amount, method, currency")
      .eq("booking_id", booking_id)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const totalAmount = payment?.amount ?? 0;
    const vatPercent = parseFloat(cfg["quipu.vat_percent"] ?? "10");
    // Los precios siempre incluyen IVA en este negocio
    // Calculamos la base imponible: total / (1 + IVA/100)
    const baseAmount = parseFloat((totalAmount / (1 + vatPercent / 100)).toFixed(2));
    const serviceName = booking.services?.name ?? booking.classes?.name ?? "Servicio de fisioterapia";

    console.log(`totalAmount: ${totalAmount}, vatPercent: ${vatPercent}, baseAmount: ${baseAmount}`);

    // ── 6. AUTENTICACIÓN QUIPU ───────────────────────────────────────
    const credentials = btoa(`${quipuAppId}:${quipuAppSecret}`);

    const tokenRes = await fetch("https://getquipu.com/oauth/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: "scope=ecommerce&grant_type=client_credentials",
    });

    if (!tokenRes.ok) {
      throw new Error(`Quipu auth failed: ${await tokenRes.text()}`);
    }

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    const quipuHeaders = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.quipu.v1+json",
      "Content-Type": "application/vnd.quipu.v1+json",
    };

    // ── 7. DECIDIR TIPO DE FACTURA ───────────────────────────────────
    // Con NIF → factura completa con contacto
    // Sin NIF → factura simplificada
    const hasNif = client?.nif && client.nif.trim() !== "";
    let quipuContactId: string | null = null;
    let invoiceType = "simplified_invoice";

    if (hasNif) {
      invoiceType = "invoice";

      // Buscar contacto existente por NIF
      const searchRes = await fetch(
        `https://getquipu.com/contacts?filter[tax_id]=${encodeURIComponent(client!.nif!)}`,
        { headers: quipuHeaders }
      );
      const searchData = await searchRes.json();

      if (searchData.data?.length > 0) {
        quipuContactId = searchData.data[0].id;
      } else {
        // Crear contacto nuevo
        console.log('client document_type raw:', JSON.stringify(client?.document_type));
        console.log('client nif:', client?.nif);
        console.log('client fiscal_name:', client?.fiscal_name);
        const contactBody = {
          data: {
            type: "contacts",
            attributes: {
              name: client!.fiscal_name ?? client!.name,
              tax_id: client!.nif,
              document_type: (["NIF", "CIF", "NIE"].includes(client!.document_type ?? "")) ? client!.document_type : "NIF",
              email: client!.email ?? "",
              phone: client!.phone ?? "",
              country_code: "es",
              zip_code: client!.fiscal_zip ?? "00000",
              town: client!.fiscal_city ?? "",
              address: client!.fiscal_address ?? "",
              is_client: true,
            },
          },
        };

        const contactRes = await fetch("https://getquipu.com/contacts", {
          method: "POST",
          headers: quipuHeaders,
          body: JSON.stringify(contactBody),
        });

        if (!contactRes.ok) {
          throw new Error(`Error creando contacto Quipu: ${await contactRes.text()}`);
        }

        const contactData = await contactRes.json();
        quipuContactId = contactData.data.id;
      }
    }

    // ── 8. CREAR FACTURA EN QUIPU ────────────────────────────────────
    const paymentMethodMap: Record<string, string> = {
      stripe: "bank_card",
      cash: "cash",
      voucher: "cash",
    };

    const quipuPaymentMethod = paymentMethodMap[booking.payment_method ?? "cash"] ?? "cash";
    // Fecha actual en formato YYYY-MM-DD (Madrid timezone)
    const today = new Date().toLocaleDateString('sv-SE', { 
      timeZone: 'Europe/Madrid' 
    }); // devuelve "2026-04-05"

    let invoiceBody: Record<string, unknown>;

    if (invoiceType === "invoice" && quipuContactId) {
      invoiceBody = {
        data: {
          type: "invoices",
          attributes: {
            kind: "income",
            paid_at: today,
            payment_method: quipuPaymentMethod,
            notes: `Reserva ${booking.id.slice(0, 8)} — ${serviceName}`,
            tags: "fisioterapia",
          },
          relationships: {
            contact: { data: { id: quipuContactId, type: "contacts" } },
            items: {
              data: [{
                type: "book_entry_items",
                attributes: {
                  concept: serviceName,
                  unitary_amount: String(baseAmount),
                  quantity: 1,
                  vat_percent: vatPercent,
                  retention_percent: 0,
                },
              }],
            },
          },
        },
      };
    } else {
      invoiceBody = {
        data: {
          type: "simplified_invoices",
          attributes: {
            kind: "income",
            paid_at: today,
            recipient_name: client?.name ?? "Cliente",
            payment_method: quipuPaymentMethod,
            notes: `Reserva ${booking.id.slice(0, 8)} — ${serviceName}`,
            tags: "fisioterapia",
          },
          relationships: {
            items: {
              data: [{
                type: "book_entry_items",
                attributes: {
                  concept: serviceName,
                  unitary_amount: String(baseAmount),
                  quantity: 1,
                  vat_percent: vatPercent,
                  retention_percent: 0,
                },
              }],
            },
          },
        },
      };
    }

    const endpoint = invoiceType === "invoice" ? "invoices" : "simplified_invoices";
    const invoiceRes = await fetch(`https://getquipu.com/${endpoint}`, {
      method: "POST",
      headers: quipuHeaders,
      body: JSON.stringify(invoiceBody),
    });

    if (!invoiceRes.ok) {
      const errText = await invoiceRes.text();
      await supabase.from("quipu_invoices").insert({
        booking_id,
        payment_id: payment?.id ?? null,
        quipu_invoice_id: "error",
        invoice_type: invoiceType,
        amount: totalAmount,
        vat_percent: vatPercent,
        status: "error",
        error_message: errText,
        is_automatic: triggered_by === "automatic",
        created_by_admin_email: body.triggered_by_email ?? null,
      });
      throw new Error(`Error creando factura Quipu: ${errText}`);
    }

    const invoiceData = await invoiceRes.json();
    let attrs = invoiceData.data.attributes;
    const quipuInvoiceId = invoiceData.data.id;

    console.log('Quipu invoice attrs after create:', JSON.stringify(attrs));

    // Si number sigue null, re-leer la factura para obtener el número asignado
    let invoiceNumber = attrs.number ?? null;
    if (!invoiceNumber) {
      const refetchRes = await fetch(`https://getquipu.com/${endpoint}/${quipuInvoiceId}`, {
        headers: quipuHeaders,
      });
      if (refetchRes.ok) {
        const refetchData = await refetchRes.json();
        attrs = refetchData.data.attributes;
        invoiceNumber = attrs.number ?? null;
        console.log('Quipu invoice attrs after refetch:', JSON.stringify(attrs));
      }
    }

    // ── 9. GUARDAR EN quipu_invoices ─────────────────────────────────
    const { data: savedInvoice } = await supabase
      .from("quipu_invoices")
      .insert({
        booking_id,
        payment_id: payment?.id ?? null,
        quipu_invoice_id: quipuInvoiceId,
        quipu_invoice_number: invoiceNumber,
        quipu_contact_id: quipuContactId,
        invoice_type: invoiceType,
        amount: totalAmount,
        vat_percent: vatPercent,
        status: "created",
        pdf_url: attrs.ephemeral_open_download_pdf_url ?? null,
        pdf_url_auth: attrs.download_pdf_url ?? null,
        is_automatic: triggered_by === "automatic",
        created_by_admin_email: body.triggered_by_email ?? null,
      })
      .select()
      .single();

    return new Response(JSON.stringify({ 
      success: true, 
      invoice: savedInvoice,
      quipu_invoice_number: invoiceNumber 
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("quipu-create-invoice error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
