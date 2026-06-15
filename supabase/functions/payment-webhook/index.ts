import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "";

function mapPaymentStatus(event: string, asaasStatus: unknown) {
  const normalizedEvent = String(event || "");
  const normalizedStatus = String(asaasStatus || "").toUpperCase();

  if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED_IN_CASH", "payment.paid"].includes(normalizedEvent) || ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(normalizedStatus)) {
    return "paid";
  }

  if (["PAYMENT_OVERDUE", "payment.overdue"].includes(normalizedEvent) || normalizedStatus === "OVERDUE") {
    return "overdue";
  }

  if (["PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_CANCELED"].includes(normalizedEvent) || ["DELETED", "REFUNDED", "CANCELED", "CANCELLED"].includes(normalizedStatus)) {
    return "canceled";
  }

  return "pending";
}

function getProvider(payload: any) {
  if (payload?.order_nsu || payload?.invoice_slug || payload?.transaction_nsu || payload?.capture_method) return "infinitepay";
  return "asaas";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (WEBHOOK_SECRET) {
      const url = new URL(req.url);
      const received = req.headers.get("x-navalhaos-secret") || url.searchParams.get("secret") || "";
      if (received !== WEBHOOK_SECRET) return jsonResponse({ error: "Webhook não autorizado." }, 401);
    }

    const payload = await req.json();
    const provider = getProvider(payload);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date().toISOString();

    if (provider === "infinitepay") {
      const orderNsu = payload.order_nsu || payload.orderNsu || null;
      const transactionNsu = payload.transaction_nsu || payload.transactionNsu || null;
      const invoiceSlug = payload.invoice_slug || payload.slug || null;
      const receiptUrl = payload.receipt_url || payload.receiptUrl || null;
      const captureMethod = payload.capture_method || payload.captureMethod || null;

      if (!orderNsu && !transactionNsu && !invoiceSlug) {
        return jsonResponse({ ok: true, message: "Webhook InfinitePay recebido sem identificador." });
      }

      const filters = [
        orderNsu ? `order_nsu.eq.${orderNsu}` : "",
        transactionNsu ? `transaction_nsu.eq.${transactionNsu}` : "",
        invoiceSlug ? `external_invoice_slug.eq.${invoiceSlug}` : "",
      ].filter(Boolean).join(",");

      const { data: updatedSystemSubscriptions, error: updateError } = await supabase
        .from("system_subscriptions")
        .update({
          status: "active",
          asaas_status: "PAID",
          transaction_nsu: transactionNsu,
          external_invoice_slug: invoiceSlug,
          receipt_url: receiptUrl,
          capture_method: captureMethod,
          paid_at: now,
          updated_at: now,
        })
        .or(filters)
        .select();

      if (updateError) throw updateError;

      const barbershopIds = (updatedSystemSubscriptions || []).map((s: any) => s.barbershop_id).filter(Boolean);
      if (barbershopIds.length) {
        await supabase
          .from("barbershops")
          .update({
            active: true,
            subscription_status: "active",
            updated_at: now,
          })
          .in("id", barbershopIds);
      }

      return jsonResponse({
        ok: true,
        provider: "infinitepay",
        systemSubscriptionsUpdated: updatedSystemSubscriptions?.length || 0,
      });
    }

    const event = payload.event || payload.type;
    const payment = payload.payment || payload.data || payload;
    const externalPaymentId = payment.id || payment.payment?.id || null;
    const externalSubscriptionId = payment.subscription || payment.subscriptionId || null;

    if (!externalPaymentId && !externalSubscriptionId) {
      return jsonResponse({ ok: true, message: "Webhook recebido sem ID de pagamento." });
    }

    const asaasStatus = payment.status || null;
    const status = mapPaymentStatus(event, asaasStatus);

    let updatedCustomerPayments: any[] = [];
    let updatedSystemSubscriptions: any[] = [];

    const customerFilter = [
      externalPaymentId ? `external_payment_id.eq.${externalPaymentId}` : "",
      externalSubscriptionId ? `external_subscription_id.eq.${externalSubscriptionId}` : "",
    ].filter(Boolean).join(",");

    if (customerFilter) {
      const { data } = await supabase
        .from("subscription_payments")
        .update({
          status,
          asaas_status: asaasStatus,
          status_checked_at: now,
          checkout_url: payment.invoiceUrl || payment.bankSlipUrl || null,
          invoice_url: payment.invoiceUrl || null,
          bank_slip_url: payment.bankSlipUrl || null,
          paid_at: status === "paid" ? now : null,
          external_payment_id: externalPaymentId || null,
        })
        .or(customerFilter)
        .select();

      updatedCustomerPayments = data || [];
    }

    if (customerFilter) {
      const { data } = await supabase
        .from("system_subscriptions")
        .update({
          status: status === "paid" ? "active" : status,
          asaas_status: asaasStatus,
          checkout_url: payment.invoiceUrl || payment.bankSlipUrl || null,
          invoice_url: payment.invoiceUrl || null,
          bank_slip_url: payment.bankSlipUrl || null,
          external_payment_id: externalPaymentId || null,
          paid_at: status === "paid" ? now : null,
          updated_at: now,
        })
        .or(customerFilter)
        .select();

      updatedSystemSubscriptions = data || [];

      if (updatedSystemSubscriptions.length) {
        const barbershopIds = updatedSystemSubscriptions.map((s: any) => s.barbershop_id).filter(Boolean);
        if (barbershopIds.length) {
          await supabase
            .from("barbershops")
            .update({
              active: status === "paid",
              subscription_status: status === "paid" ? "active" : status,
              updated_at: now,
            })
            .in("id", barbershopIds);
        }
      }
    }

    return jsonResponse({
      ok: true,
      provider: "asaas",
      customerPaymentsUpdated: updatedCustomerPayments.length,
      systemSubscriptionsUpdated: updatedSystemSubscriptions.length,
    });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
