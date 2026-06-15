import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (WEBHOOK_SECRET) {
      const received = req.headers.get("x-navalhaos-secret") || "";
      if (received !== WEBHOOK_SECRET) return jsonResponse({ error: "Webhook não autorizado." }, 401);
    }

    const payload = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const event = payload.event || payload.type;
    const payment = payload.payment || payload.data || payload;
    const externalPaymentId = payment.id || payment.payment?.id;
    const externalSubscriptionId = payment.subscription || payment.subscriptionId;

    if (!externalPaymentId && !externalSubscriptionId) {
      return jsonResponse({ ok: true, message: "Webhook recebido sem ID de pagamento." });
    }

    const status = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "payment.paid"].includes(event)
      ? "paid"
      : ["PAYMENT_OVERDUE", "payment.overdue"].includes(event)
        ? "overdue"
        : "pending";

    const { data: updated } = await supabase
      .from("subscription_payments")
      .update({
        status,
        paid_at: status === "paid" ? new Date().toISOString() : null,
        external_payment_id: externalPaymentId || null,
      })
      .or(`external_payment_id.eq.${externalPaymentId},external_subscription_id.eq.${externalSubscriptionId}`)
      .select();

    return jsonResponse({ ok: true, updated: updated?.length || 0 });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
