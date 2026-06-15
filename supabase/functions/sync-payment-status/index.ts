import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getAuthedUser } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_BASE_URL = Deno.env.get("ASAAS_BASE_URL") || "https://api.asaas.com/v3";

function mapAsaasPaymentStatus(status: unknown) {
  const value = String(status || "").toUpperCase();
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(value)) return "paid";
  if (value === "OVERDUE") return "overdue";
  if (["REFUNDED", "DELETED", "CANCELED", "CANCELLED"].includes(value)) return "canceled";
  return "pending";
}

async function getPaymentBySubscription(baseUrl: string, apiKey: string, subscriptionId: string) {
  const res = await fetch(`${baseUrl}/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=1`, {
    method: "GET",
    headers: { "Content-Type": "application/json", "access_token": apiKey },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.errors?.[0]?.description || "Erro ao consultar cobrança da assinatura no Asaas.");
  return Array.isArray(json?.data) ? json.data[0] || null : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const user = await getAuthedUser(supabase, req);
    const { paymentId } = await req.json();

    if (!paymentId) throw new Error("ID do pagamento não enviado.");

    const { data: payment, error: paymentError } = await supabase
      .from("subscription_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError) throw new Error(`Erro ao buscar pagamento: ${paymentError.message}`);
    if (!payment) throw new Error("Pagamento não encontrado.");

    const { data: shop } = await supabase
      .from("barbershops")
      .select("*")
      .eq("id", payment.barbershop_id)
      .eq("owner_id", user.id)
      .single();

    if (!shop) throw new Error("Você não tem permissão para esta barbearia.");

    const { data: integration } = await supabase
      .from("billing_integrations")
      .select("*")
      .eq("barbershop_id", shop.id)
      .maybeSingle();

    if (!integration?.payment_api_key) throw new Error("Configure a chave do gateway de pagamento.");
    if (integration.payment_provider !== "asaas") throw new Error("Atualização automática pronta para Asaas.");

    let asaasPayment = null;

    if (payment.external_payment_id) {
      const res = await fetch(`${ASAAS_BASE_URL}/payments/${payment.external_payment_id}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", "access_token": integration.payment_api_key },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.errors?.[0]?.description || "Erro ao consultar cobrança no Asaas.");
      asaasPayment = json;
    } else if (payment.external_subscription_id) {
      asaasPayment = await getPaymentBySubscription(ASAAS_BASE_URL, integration.payment_api_key, payment.external_subscription_id);
    }

    if (!asaasPayment) {
      throw new Error("Não encontrei ID de cobrança no Asaas para atualizar este status.");
    }

    const mappedStatus = mapAsaasPaymentStatus(asaasPayment.status);
    const { data: updated, error: updateError } = await supabase
      .from("subscription_payments")
      .update({
        status: mappedStatus,
        asaas_status: asaasPayment.status || null,
        external_payment_id: asaasPayment.id || payment.external_payment_id || null,
        checkout_url: asaasPayment.invoiceUrl || asaasPayment.bankSlipUrl || payment.checkout_url || null,
        status_checked_at: new Date().toISOString(),
        paid_at: mappedStatus === "paid" ? (asaasPayment.paymentDate ? `${asaasPayment.paymentDate}T00:00:00.000Z` : new Date().toISOString()) : payment.paid_at,
      })
      .eq("id", payment.id)
      .select()
      .single();

    if (updateError) throw new Error(`Erro ao salvar status: ${updateError.message}`);

    return jsonResponse({
      ok: true,
      payment: updated,
      message: `Status atualizado: ${mappedStatus === "paid" ? "pago" : mappedStatus === "overdue" ? "atrasado" : mappedStatus === "canceled" ? "cancelado" : "em aberto"}.`,
    });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
