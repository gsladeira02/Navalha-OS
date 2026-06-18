import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INFINITEPAY_CHECKOUT_URL = Deno.env.get("INFINITEPAY_CHECKOUT_URL") || "https://api.checkout.infinitepay.io/links";
const INFINITEPAY_HANDLE = (Deno.env.get("INFINITEPAY_HANDLE") || Deno.env.get("NAVALHAOS_INFINITEPAY_HANDLE") || "").replace(/^\$/, "");
const WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "";
const PUBLIC_SITE_URL = (Deno.env.get("NAVALHAOS_PUBLIC_URL") || "").replace(/\/$/, "");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function findCheckoutUrl(payload: any) {
  return payload?.url || payload?.link || payload?.checkout_url || payload?.checkoutUrl || payload?.payment_url || payload?.paymentUrl || payload?.data?.url || payload?.data?.link || null;
}

async function createInfinitePayCheckout(sub: any, reason = "Renovação") {
  if (!INFINITEPAY_HANDLE) throw new Error("Configure o gateway de pagamento nos Secrets do Supabase.");

  const orderNsu = crypto.randomUUID();
  const webhookUrl = `${SUPABASE_URL}/functions/v1/payment-webhook${WEBHOOK_SECRET ? `?secret=${encodeURIComponent(WEBHOOK_SECRET)}` : ""}`;
  const redirectUrl = PUBLIC_SITE_URL ? `${PUBLIC_SITE_URL}/login.html?pagamento=infinitepay&order_nsu=${encodeURIComponent(orderNsu)}` : undefined;

  const checkoutPayload: Record<string, unknown> = {
    handle: INFINITEPAY_HANDLE,
    items: [
      {
        quantity: 1,
        price: Number(sub.amount_cents || Math.round(Number(sub.amount || 0) * 100)),
        description: `${sub.plan_label || sub.plan_name || "Plano"} - ${reason} NavalhaOS (${sub.plan_display_price || ""})`,
      },
    ],
    order_nsu: orderNsu,
    webhook_url: webhookUrl,
    customer: {
      name: sub.admin_name,
      email: sub.admin_email,
      phone_number: sub.admin_phone ? `+55${String(sub.admin_phone).replace(/\D/g, "")}` : undefined,
    },
  };

  if (redirectUrl) checkoutPayload.redirect_url = redirectUrl;

  const linkRes = await fetch(INFINITEPAY_CHECKOUT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(checkoutPayload),
  });

  const linkJson = await linkRes.json();
  if (!linkRes.ok) {
    throw new Error(linkJson?.message || linkJson?.error || "Erro ao criar link de pagamento.");
  }

  const checkoutUrl = findCheckoutUrl(linkJson);
  if (!checkoutUrl) throw new Error("Checkout respondeu sem link.");

  return {
    orderNsu,
    checkoutUrl,
    invoiceSlug: linkJson?.slug || linkJson?.invoice_slug || linkJson?.data?.slug || null,
    response: linkJson,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = todayISO();
    const now = new Date().toISOString();

    let trialChargesCreated = 0;
    let renewalsCreated = 0;
    let accountsBlocked = 0;
    let cancellationsCompleted = 0;

    const { data: trialSubs, error: trialError } = await supabase
      .from("system_subscriptions")
      .select("*")
      .eq("status", "trial")
      .lte("trial_ends_at", today)
      .is("cancel_requested_at", null);

    if (trialError) throw trialError;

    for (const sub of trialSubs || []) {
      const checkout = await createInfinitePayCheckout(sub, "fim do teste grátis");
      const graceUntil = isoDate(addDays(new Date(`${today}T00:00:00.000Z`), Number(sub.grace_days || 3)));

      await supabase
        .from("system_subscriptions")
        .update({
          status: "renewal_pending",
          order_nsu: checkout.orderNsu,
          external_invoice_slug: checkout.invoiceSlug,
          checkout_url: checkout.checkoutUrl,
          invoice_url: checkout.checkoutUrl,
          infinitepay_payload: checkout.response,
          renewal_created_at: now,
          next_due_date: today,
          next_charge_at: today,
          grace_until: graceUntil,
          updated_at: now,
        })
        .eq("id", sub.id);

      if (sub.barbershop_id) {
        await supabase
          .from("barbershops")
          .update({
            active: true,
            subscription_status: "renewal_pending",
            updated_at: now,
          })
          .eq("id", sub.barbershop_id);
      }

      trialChargesCreated++;
    }

    const { data: dueSubs, error: dueError } = await supabase
      .from("system_subscriptions")
      .select("*")
      .eq("status", "active")
      .lte("next_charge_at", today);

    if (dueError) throw dueError;

    for (const sub of dueSubs || []) {
      if (sub.cancel_at_period_end || sub.cancel_requested_at) {
        await supabase
          .from("system_subscriptions")
          .update({
            status: "canceled",
            canceled_at: now,
            updated_at: now,
          })
          .eq("id", sub.id);

        if (sub.barbershop_id) {
          await supabase
            .from("barbershops")
            .update({
              active: false,
              subscription_status: "canceled",
              updated_at: now,
            })
            .eq("id", sub.barbershop_id);
        }

        cancellationsCompleted++;
        continue;
      }

      const checkout = await createInfinitePayCheckout(sub, "renovação");
      const baseDate = new Date(`${today}T00:00:00.000Z`);
      const graceUntil = isoDate(addDays(baseDate, Number(sub.grace_days || 3)));

      await supabase
        .from("system_subscriptions")
        .update({
          status: "renewal_pending",
          order_nsu: checkout.orderNsu,
          external_invoice_slug: checkout.invoiceSlug,
          checkout_url: checkout.checkoutUrl,
          invoice_url: checkout.checkoutUrl,
          infinitepay_payload: checkout.response,
          renewal_created_at: now,
          grace_until: graceUntil,
          updated_at: now,
        })
        .eq("id", sub.id);

      if (sub.barbershop_id) {
        await supabase
          .from("barbershops")
          .update({
            active: true,
            subscription_status: "renewal_pending",
            updated_at: now,
          })
          .eq("id", sub.barbershop_id);
      }

      renewalsCreated++;
    }

    const { data: expiredSubs, error: expiredError } = await supabase
      .from("system_subscriptions")
      .select("*")
      .in("status", ["renewal_pending", "overdue"])
      .lt("grace_until", today);

    if (expiredError) throw expiredError;

    for (const sub of expiredSubs || []) {
      await supabase
        .from("system_subscriptions")
        .update({
          status: "expired",
          updated_at: now,
        })
        .eq("id", sub.id);

      if (sub.barbershop_id) {
        await supabase
          .from("barbershops")
          .update({
            active: false,
            subscription_status: "expired",
            updated_at: now,
          })
          .eq("id", sub.barbershop_id);
        accountsBlocked++;
      }
    }

    return jsonResponse({
      ok: true,
      trialChargesCreated,
      renewalsCreated,
      accountsBlocked,
      cancellationsCompleted,
      message: "Assinaturas processadas.",
    });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
