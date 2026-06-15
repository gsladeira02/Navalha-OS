import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

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

async function activateSystemSubscriptions(supabase: any, subs: any[], payload: any) {
  const now = new Date();
  const nowIso = now.toISOString();

  for (const sub of subs || []) {
    const periodMonths = Number(sub.period_months || 1);
    const baseDate = sub.current_period_end && new Date(`${sub.current_period_end}T00:00:00.000Z`) > now
      ? new Date(`${sub.current_period_end}T00:00:00.000Z`)
      : now;

    const newEnd = addMonths(baseDate, periodMonths);
    const graceUntil = addDays(newEnd, Number(sub.grace_days || 3));

    await supabase
      .from("system_subscriptions")
      .update({
        status: "active",
        transaction_nsu: payload.transaction_nsu || payload.transactionNsu || sub.transaction_nsu || null,
        external_invoice_slug: payload.invoice_slug || payload.slug || sub.external_invoice_slug || null,
        receipt_url: payload.receipt_url || payload.receiptUrl || sub.receipt_url || null,
        capture_method: payload.capture_method || payload.captureMethod || sub.capture_method || null,
        paid_at: nowIso,
        current_period_start: isoDate(baseDate),
        current_period_end: isoDate(newEnd),
        grace_until: isoDate(graceUntil),
        next_due_date: isoDate(newEnd),
        next_charge_at: isoDate(newEnd),
        renewal_created_at: null,
        updated_at: nowIso,
      })
      .eq("id", sub.id);

    if (sub.barbershop_id) {
      await supabase
        .from("barbershops")
        .update({
          active: true,
          subscription_status: "active",
          updated_at: nowIso,
        })
        .eq("id", sub.barbershop_id);
    }
  }
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

      if (!orderNsu && !transactionNsu && !invoiceSlug) {
        return jsonResponse({ ok: true, message: "Webhook recebido sem identificador." });
      }

      const filters = [
        orderNsu ? `order_nsu.eq.${orderNsu}` : "",
        transactionNsu ? `transaction_nsu.eq.${transactionNsu}` : "",
        invoiceSlug ? `external_invoice_slug.eq.${invoiceSlug}` : "",
      ].filter(Boolean).join(",");

      const { data: found, error } = await supabase
        .from("system_subscriptions")
        .select("*")
        .or(filters);

      if (error) throw error;

      await activateSystemSubscriptions(supabase, found || [], payload);

      return jsonResponse({
        ok: true,
        provider: "infinitepay",
        systemSubscriptionsUpdated: found?.length || 0,
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

    const customerFilter = [
      externalPaymentId ? `external_payment_id.eq.${externalPaymentId}` : "",
      externalSubscriptionId ? `external_subscription_id.eq.${externalSubscriptionId}` : "",
    ].filter(Boolean).join(",");

    let updatedCustomerPayments: any[] = [];
    let updatedSystemSubscriptions: any[] = [];

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
        .select("*")
        .or(customerFilter);

      updatedSystemSubscriptions = data || [];

      if (status === "paid") {
        await activateSystemSubscriptions(supabase, updatedSystemSubscriptions, payment);
      } else if (updatedSystemSubscriptions.length) {
        await supabase
          .from("system_subscriptions")
          .update({
            status,
            updated_at: now,
          })
          .or(customerFilter);
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
