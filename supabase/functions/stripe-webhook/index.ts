import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getStripeKeysForOrg } from "../_shared/stripe-tenant.ts"

// Helper: convierte hex string a Uint8Array para verificación HMAC
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

// CORS helper function
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'https://gxofivnfnzefpfkzwqpe.supabase.co'
  ];

  if (origin && (origin.includes('.vercel.app') || !origin.includes('localhost') && !origin.includes('supabase.co'))) {
    allowedOrigins.push(origin);
  }

  const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : '*';

  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return new Response('Missing stripe-signature header', { status: 400 })
    }

    const body = await req.text()
    const event = JSON.parse(body)

    // Extraer organization_id de metadata del evento
    const organizationId = event.data?.object?.metadata?.organization_id
    if (!organizationId) {
      console.error('[Stripe] Missing organization_id in event metadata, event=', event.type, 'id=', event.id)
      return new Response(
        JSON.stringify({ error: 'Missing organization_id in event metadata' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Obtener claves Stripe del tenant
    const stripeKeys = await getStripeKeysForOrg(supabaseAdmin, organizationId)

    // Verificar firma del webhook con la clave del tenant
    if (stripeKeys.webhookSecret) {
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(stripeKeys.webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      )
      const sigParts = signature.split(',')
      const timestamp = sigParts.find(p => p.startsWith('t='))?.slice(2)
      const v1 = sigParts.find(p => p.startsWith('v1='))?.slice(3)

      if (!timestamp || !v1) {
        return new Response('Invalid stripe-signature format', { status: 400 })
      }

      const signedPayload = `${timestamp}.${body}`
      const valid = await crypto.subtle.verify(
        'HMAC',
        key,
        hexToBytes(v1),
        encoder.encode(signedPayload)
      )
      if (!valid) {
        console.error('[Stripe] Invalid webhook signature for org=', organizationId)
        return new Response('Invalid signature', { status: 400 })
      }
    } else {
      console.warn('[Stripe] No webhook secret configured for org=', organizationId, '— skipping signature verification')
    }

    console.log('[Stripe] webhook event=', event.type, 'id=', event.id, 'org=', organizationId)

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(organizationId, event, supabaseAdmin)
        break

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(organizationId, event, supabaseAdmin)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(organizationId, event, supabaseAdmin)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(organizationId, event, supabaseAdmin)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(organizationId, event, supabaseAdmin)
        break

      case 'charge.refunded':
        await handleChargeRefunded(organizationId, event, supabaseAdmin)
        break

      default:
        console.log('[Stripe] webhook unhandled event type:', event.type)
    }

    return new Response('Webhook processed', { status: 200 })

  } catch (error) {
    console.error('[Stripe] Webhook error:', error)
    return new Response('Webhook error', { status: 500 })
  }
})

async function handleCheckoutSessionCompleted(organizationId: string, event: any, supabaseAdmin: any) {
  const session = event.data.object
  const mode = session.mode
  const metadata = session.metadata

  console.log('[Stripe] webhook event=checkout.session.completed mode=', mode)

  if (mode === 'payment') {
    if (metadata?.action === 'voucher_purchase') {
      await handleVoucherPurchase(organizationId, session, supabaseAdmin)
      return
    }

    const booking_id = metadata?.booking_id || session.client_reference_id
    if (!booking_id) {
      console.error('[Stripe] Missing booking_id in metadata/client_reference_id')
      return
    }

    const intentId = session.payment_intent
    if (!intentId) {
      console.error('[Stripe] Missing payment_intent in session')
      return
    }

    const { data: existingPayment } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('stripe_payment_intent_id', intentId)
      .maybeSingle()

    if (existingPayment) {
      console.log('[Stripe] payment already recorded for intent', intentId)
      return
    }

    const amountCents = session.amount_total || 0
    const currency = (session.currency || 'eur').toLowerCase()

    const { error: insertPaymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        booking_id,
        amount: amountCents / 100,
        currency,
        method: 'stripe',
        status: 'succeeded',
        stripe_payment_intent_id: intentId,
        organization_id: organizationId
      })

    if (insertPaymentError) {
      console.error('[Stripe] Error inserting payment:', insertPaymentError)
    }

    const { error: bookingError } = await supabaseAdmin
      .from('bookings')
      .update({
        payment_status: 'paid',
        payment_method: 'stripe',
        updated_at: new Date().toISOString()
      })
      .eq('id', booking_id)

    if (bookingError) {
      console.error('[Stripe] Error updating booking:', bookingError)
      throw bookingError
    }

    console.log('[Stripe] webhook event=checkout.session.completed booking=', booking_id, '-> paid')

    await sendBookingWebhook(organizationId, booking_id, supabaseAdmin)

    try {
      const { data: autoInvoiceSetting } = await supabaseAdmin
        .from("settings")
        .select("value")
        .eq("key", "quipu.auto_invoice")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (autoInvoiceSetting?.value === "true") {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const invoiceResp = await fetch(`${supabaseUrl}/functions/v1/quipu-create-invoice`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            booking_id,
            organization_id: organizationId,
            triggered_by: "automatic"
          }),
        });
        console.log('[Quipu] auto-invoice response:', invoiceResp.status, await invoiceResp.text());
      }
    } catch (quipuError) {
      console.error("Quipu auto-invoice error (stripe):", quipuError);
    }

  } else if (mode === 'subscription') {
    const plan_id = metadata.plan_id
    const user_id = metadata.user_id || session.client_reference_id

    console.log('[Subs] session.completed sub=', session.subscription, 'user=', user_id);

    if (!plan_id || !user_id) {
      console.error('[Stripe] Missing plan_id or user_id in metadata')
      return
    }

    const customer_id = session.customer
    const subscription_id = session.subscription

    let subscriptionRecord;
    let subError;

    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('stripe_subscription_id', subscription_id)
      .maybeSingle()

    if (existingSub) {
      const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', subscription_id)
        .select('id')
        .single()
      subscriptionRecord = data
      subError = error
    } else {
      const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: user_id,
          plan_id: plan_id,
          status: 'active',
          stripe_subscription_id: subscription_id,
          stripe_customer_id: customer_id,
          start_date: new Date().toISOString(),
          next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          organization_id: organizationId
        })
        .select('id')
        .single()
      subscriptionRecord = data
      subError = error
    }

    if (subError) {
      console.error('[Stripe] Error creating subscription:', subError)
      throw subError
    }

    console.log('[Subs] session.completed sub=', subscription_id, '-> subscriptions upsert');

    if (session.invoice && subscriptionRecord) {
      console.log('[Subs] Creating initial invoice for session:', session.id, 'invoice:', session.invoice, 'amount:', session.amount_total);

      const { data: invoiceRecord, error: invoiceError } = await supabaseAdmin
        .from('subscription_invoices')
        .insert({
          subscription_id: subscriptionRecord.id,
          amount: session.amount_total / 100,
          currency: session.currency,
          status: 'paid',
          paid_at: new Date().toISOString(),
          cycle_start: new Date().toISOString(),
          cycle_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          stripe_invoice_id: session.invoice,
          organization_id: organizationId
        })
        .select('id')
        .single()

      if (invoiceError) {
        console.error('[Subs] Error creating initial invoice:', invoiceError);
      } else if (invoiceRecord) {
        console.log('[Subs] Initial invoice created:', invoiceRecord.id);

        const { data: existingPayByInv } = await supabaseAdmin
          .from('payments')
          .select('id')
          .eq('subscription_invoice_id', invoiceRecord.id)
          .maybeSingle();

        if (!existingPayByInv) {
          const { error: paymentError } = await supabaseAdmin
            .from('payments')
            .insert({
              amount: session.amount_total / 100,
              currency: session.currency.toUpperCase(),
              method: 'stripe',
              status: 'succeeded',
              stripe_payment_intent_id: session.payment_intent ?? null,
              subscription_invoice_id: invoiceRecord.id,
              organization_id: organizationId
            });

          if (paymentError) {
            console.error('[Subs] Error creating initial payment:', paymentError);
          } else {
            console.log('[Subs] Initial payment created for subscription:', subscription_id, '-> payment linked to invoice:', invoiceRecord.id);
          }
        } else {
          console.log('[Subs] Payment already exists for invoice:', invoiceRecord.id);
        }
      }
    } else {
      console.log('[Subs] Missing invoice or subscription record - session.invoice:', session.invoice, 'subscriptionRecord:', !!subscriptionRecord);
    }
  }
}

async function handleInvoicePaymentSucceeded(organizationId: string, event: any, supabaseAdmin: any) {
  console.log('[Subs] webhook event=invoice.payment_succeeded');

  const invoice = event.data.object;
  const subscription_id = invoice.subscription;

  console.log('[Subs] invoice data: subscription_id=', subscription_id, 'amount=', invoice.amount_paid, 'payment_intent=', invoice.payment_intent);

  if (!subscription_id) {
    console.log('[Subs] Invoice not related to subscription, skipping');
    return;
  }

  try {
    const { error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'active'
      })
      .eq('stripe_subscription_id', subscription_id);

    if (subscriptionError) {
      console.error('[Subs] Error updating subscription status:', subscriptionError);
    }

    const { data: subscription, error: fetchError } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('stripe_subscription_id', subscription_id)
      .single();

    if (fetchError || !subscription) {
      console.error('[Subs] Subscription not found for invoice:', subscription_id);
      return;
    }

    let invoiceRecord;

    const { data: existingInvoice } = await supabaseAdmin
      .from('subscription_invoices')
      .select('id')
      .eq('stripe_invoice_id', invoice.id)
      .maybeSingle();

    if (existingInvoice) {
      const { data, error } = await supabaseAdmin
        .from('subscription_invoices')
        .update({
          status: 'paid',
          paid_at: invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null
        })
        .eq('stripe_invoice_id', invoice.id)
        .select('id')
        .single();
      invoiceRecord = data;
      if (error) console.error('[Subs] Error updating subscription invoice:', error);
    } else {
      const { data, error } = await supabaseAdmin
        .from('subscription_invoices')
        .insert({
          subscription_id: subscription.id,
          stripe_invoice_id: invoice.id,
          amount: invoice.amount_paid / 100,
          currency: invoice.currency.toUpperCase(),
          cycle_start: new Date(invoice.period_start * 1000).toISOString(),
          cycle_end: new Date(invoice.period_end * 1000).toISOString(),
          paid_at: invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
          status: 'paid',
          organization_id: organizationId
        })
        .select('id')
        .single();
      invoiceRecord = data;
      if (error) console.error('[Subs] Error creating subscription invoice:', error);
    }

    if (invoiceRecord) {
      const { data: existingPaymentByInv } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('subscription_invoice_id', invoiceRecord.id)
        .maybeSingle();

      if (!existingPaymentByInv) {
        const { error: paymentError } = await supabaseAdmin
          .from('payments')
          .insert({
            amount: invoice.amount_paid / 100,
            currency: invoice.currency.toUpperCase(),
            method: 'stripe',
            status: 'succeeded',
            stripe_payment_intent_id: invoice.payment_intent ?? null,
            subscription_invoice_id: invoiceRecord.id,
            organization_id: organizationId
          });

        if (paymentError) {
          console.error('[Subs] Error creating payment record:', paymentError);
        } else {
          console.log('[Subs] invoice.succeeded sub=', subscription_id, 'inv=', invoice.id, '-> payment created for invoice:', invoiceRecord.id);
        }
      } else {
        console.log('[Subs] Payment already exists for invoice:', invoice.id);
      }
    }

  } catch (error) {
    console.error('[Subs] Error handling invoice payment succeeded:', error);
    throw error;
  }
}

async function handleInvoicePaymentFailed(organizationId: string, event: any, supabaseAdmin: any) {
  console.log('[Subs] webhook event=invoice.payment_failed');

  const invoice = event.data.object;
  const subscription_id = invoice.subscription;

  if (!subscription_id) {
    console.log('[Subs] Invoice not related to subscription, skipping');
    return;
  }

  try {
    const { error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'past_due'
      })
      .eq('stripe_subscription_id', subscription_id);

    if (subscriptionError) {
      console.error('[Subs] Error updating subscription status:', subscriptionError);
    }

    const { error: invoiceError } = await supabaseAdmin
      .from('subscription_invoices')
      .update({
        status: 'failed'
      })
      .eq('stripe_invoice_id', invoice.id);

    if (invoiceError) {
      console.error('[Subs] Error updating subscription invoice status:', invoiceError);
    }

    console.log('[Subs] invoice.failed sub=', subscription_id);

  } catch (error) {
    console.error('[Subs] Error handling invoice payment failed:', error);
    throw error;
  }
}

async function handleSubscriptionUpdated(organizationId: string, event: any, supabaseAdmin: any) {
  console.log('[Subs] webhook event=customer.subscription.updated');

  const subscription = event.data.object;
  const cancelAtPeriodEnd = subscription.cancel_at_period_end || false;

  try {
    let status = subscription.status;

    if (cancelAtPeriodEnd && status === 'active') {
      status = 'active';
    }

    const updateData: any = {
      status: status,
      cancel_at_period_end: cancelAtPeriodEnd,
      updated_at: new Date().toISOString()
    };

    if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
      updateData.next_billing_date = new Date(subscription.current_period_end * 1000).toISOString();
    }

    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update(updateData)
      .eq('stripe_subscription_id', subscription.id);

    if (error) {
      console.error('[Subs] Error updating subscription:', error);
      throw error;
    }

    console.log('[Subs] subscription.updated sub=', subscription.id, 'status=', status, 'cancel_at_period_end=', cancelAtPeriodEnd);

  } catch (error) {
    console.error('[Subs] Error handling subscription updated:', error);
    throw error;
  }
}

async function handleSubscriptionDeleted(organizationId: string, event: any, supabaseAdmin: any) {
  console.log('[Subs] webhook event=customer.subscription.deleted');

  const subscription = event.data.object;

  try {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancel_at_period_end: false,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscription.id);

    if (error) {
      console.error('[Subs] Error updating subscription status:', error);
      throw error;
    }

    console.log('[Subs] subscription.deleted sub=', subscription.id, 'status=cancelled');

  } catch (error) {
    console.error('[Subs] Error handling subscription deleted:', error);
    throw error;
  }
}

async function handleChargeRefunded(organizationId: string, event: any, supabaseAdmin: any) {
  const charge = event.data.object
  console.log('[Stripe] webhook event=charge.refunded')

  const { data: payment } = await supabaseAdmin
    .from('payments')
    .select('id')
    .eq('stripe_charge_id', charge.id)
    .single()

  if (payment) {
    await supabaseAdmin
      .from('refunds')
      .insert({
        payment_id: payment.id,
        amount: charge.amount_refunded / 100,
        status: 'completed',
        stripe_refund_id: charge.refunds.data[0]?.id,
        organization_id: organizationId
      })

    await supabaseAdmin
      .from('payments')
      .update({ status: 'refunded' })
      .eq('id', payment.id)
  }
}

async function sendBookingWebhook(organizationId: string, bookingId: string, supabaseAdmin: any) {
  try {
    console.log('[Webhook] Sending booking notification for:', bookingId);

    const { data: enabledSettings } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'webhooks.enabled')
      .eq('organization_id', organizationId)
      .single();

    if (!enabledSettings?.value) {
      console.log('[Webhook] Webhooks disabled, skipping');
      return;
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        services (id, name, duration_min, price, currency, category_id),
        classes (id, name, duration_min, price, currency, category_id),
        professionals (id, name, email),
        locations (id, name, timezone),
        users_shadow (name, email)
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[Webhook] Error fetching booking:', bookingError);
      return;
    }

    const serviceOrClass = booking.services || booking.classes;
    let category = null;
    if (serviceOrClass?.category_id) {
      const { data: categoryData } = await supabaseAdmin
        .from('categories')
        .select('id, name')
        .eq('id', serviceOrClass.category_id)
        .single();
      category = categoryData;
    }

    const { data: urlSettings } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'webhooks.booking_created_url')
      .eq('organization_id', organizationId)
      .single();

    let webhookUrl = urlSettings?.value as string;

    if (!webhookUrl) {
      // Fallback: buscar n8n_webhook_url de la organización
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('n8n_webhook_url')
        .eq('id', organizationId)
        .single();
      webhookUrl = org?.n8n_webhook_url;
    }

    if (!webhookUrl || (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://'))) {
      console.error('[Webhook] No valid webhook URL for org=', organizationId);
      return;
    }

    if (typeof webhookUrl === 'string') {
      webhookUrl = webhookUrl.trim().replace(/^["']|["']$/g, '');
    }

    const customerName = booking.users_shadow?.name || '';
    const nameParts = customerName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const webhookPayload = {
      event: 'booking.created',
      environment: 'production',
      source: 'stripe_webhook',
      timestamp: new Date().toISOString(),
      organization_id: organizationId,
      booking: {
        id: booking.id,
        start_at: booking.start_at,
        end_at: booking.end_at,
        duration_min: serviceOrClass?.duration_min,
        status: booking.status,
        payment_method: booking.payment_method,
        payment_status: booking.payment_status,
        price: serviceOrClass?.price,
        currency: serviceOrClass?.currency || 'EUR',
        notes: booking.notes
      },
      service: serviceOrClass ? {
        id: serviceOrClass.id,
        name: serviceOrClass.name,
        category_id: category?.id,
        category_name: category?.name
      } : null,
      professional: booking.professionals ? {
        id: booking.professionals.id,
        name: booking.professionals.name,
        email: booking.professionals.email
      } : null,
      location: booking.locations ? {
        id: booking.locations.id,
        name: booking.locations.name,
        timezone: booking.locations.timezone || 'Europe/Madrid'
      } : null,
      customer: {
        first_name: firstName,
        last_name: lastName,
        phone: '',
        email: booking.users_shadow?.email || ''
      },
      meta: {
        external_ref: `bk_${booking.id}`,
        widget_version: '1.0.0',
        payment_source: 'stripe'
      }
    };

    console.log('[Webhook] Sending to URL:', webhookUrl);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ReservasPro-Event': 'booking.created'
      },
      body: JSON.stringify(webhookPayload)
    });

    if (!response.ok) {
      console.error('[Webhook] Failed to send:', response.status, response.statusText);
    } else {
      console.log('[Webhook] Successfully sent to n8n');
    }

  } catch (error) {
    console.error('[Webhook] Error sending booking webhook:', error);
  }
}

async function handleVoucherPurchase(organizationId: string, session: any, supabaseAdmin: any) {
  const intentId = session.payment_intent
  const amountCents = session.amount_total || 0
  const currency = (session.currency || 'eur').toLowerCase()
  const voucher_type_id = session.metadata.voucher_type_id
  const user_id = session.metadata.user_id

  console.log('[Stripe] webhook voucher_purchase session.completed voucher_type=', voucher_type_id, 'user=', user_id)

  if (!voucher_type_id || !user_id || !intentId) {
    console.error('[Stripe] Missing required voucher purchase metadata')
    return
  }

  const { data: existingPayment } = await supabaseAdmin
    .from('payments')
    .select('id')
    .eq('stripe_payment_intent_id', intentId)
    .maybeSingle()

  if (existingPayment) {
    console.log('[Stripe] voucher payment already recorded for intent', intentId)
    return
  }

  const { data: voucherType } = await supabaseAdmin
    .from('voucher_types')
    .select('sessions_count, validity_days, validity_end_date')
    .eq('id', voucher_type_id)
    .single()

  if (!voucherType) {
    console.error('[Stripe] Voucher type not found:', voucher_type_id)
    return
  }

  let expiry_date: string | null = null
  if (voucherType.validity_days) {
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + voucherType.validity_days)
    expiry_date = expiryDate.toISOString()
  } else if (voucherType.validity_end_date) {
    expiry_date = new Date(voucherType.validity_end_date).toISOString()
  }

  const { data: voucher, error: voucherError } = await supabaseAdmin
    .from('vouchers')
    .insert({
      voucher_type_id,
      user_id,
      status: 'active',
      sessions_remaining: voucherType.sessions_count,
      purchase_date: new Date().toISOString(),
      expiry_date,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      organization_id: organizationId
    })
    .select('id')
    .single()

  if (voucherError) {
    console.error('[Stripe] Error creating voucher:', voucherError)
    throw voucherError
  }

  const { error: paymentError } = await supabaseAdmin
    .from('payments')
    .insert({
      amount: amountCents / 100,
      currency,
      method: 'stripe',
      status: 'succeeded',
      stripe_payment_intent_id: intentId,
      booking_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      organization_id: organizationId
    })

  if (paymentError) {
    console.error('[Stripe] Error creating voucher payment:', paymentError)
    throw paymentError
  }

  console.log('[Stripe] webhook voucher_purchase session.completed voucher_type=', voucher_type_id, 'user=', user_id, '-> voucher=', voucher?.id)
}
