import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getAuthedUser } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_BASE_URL = Deno.env.get("ASAAS_BASE_URL") || "https://api.asaas.com/v3";

async function getFirstPaymentFromSubscription(baseUrl: string, apiKey: string, subscriptionId: string) {
  const res = await fetch(`${baseUrl}/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=1`, {
    method: "GET",
    headers: { "Content-Type": "application/json", "access_token": apiKey },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.errors?.[0]?.description || "Erro ao localizar cobrança da assinatura no Asaas.");
  return Array.isArray(json?.data) ? json.data[0] || null : null;
}

async function deleteAsaasPayment(baseUrl: string, apiKey: string, paymentId: string) {
  const res = await fetch(`${baseUrl}/payments/${encodeURIComponent(paymentId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "access_token": apiKey },
  });
  let json: any = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(json?.errors?.[0]?.description || "Erro ao cancelar cobrança no Asaas.");
  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const user = await getAuthedUser(supabase, req);
    const { paymentId } = await req.json();

    if (!paymentId) throw new Error("ID da cobrança não enviado.");

    const { data: payment, error: paymentError } = await supabase
      .from("subscription_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError) throw new Error(`Erro ao buscar cobrança: ${paymentError.message}`);
    if (!payment) throw new Error("Cobrança não encontrada.");

    const currentStatus = String(payment.status || "").toLowerCase();
    if (["paid", "received", "confirmed"].includes(currentStatus)) {
      throw new Error("Esta cobrança já está paga/confirmada e não deve ser cancelada por aqui.");
    }

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
    if (integration.payment_provider !== "asaas") throw new Error("Cancelamento automático pronto para Asaas.");

    let asaasPaymentId = payment.external_payment_id || null;

    if (!asaasPaymentId && payment.external_subscription_id) {
      const asaasPayment = await getFirstPaymentFromSubscription(ASAAS_BASE_URL, integration.payment_api_key, payment.external_subscription_id);
      asaasPaymentId = asaasPayment?.id || null;
    }

    if (!asaasPaymentId) {
      throw new Error("Esta cobrança não possui ID externo do Asaas. Ela será apenas marcada como cancelada no sistema.");
    }

    await deleteAsaasPayment(ASAAS_BASE_URL, integration.payment_api_key, asaasPaymentId);

    const { data: updated, error: updateError } = await supabase
      .from("subscription_payments")
      .update({
        status: "canceled",
        asaas_status: "DELETED",
        external_payment_id: asaasPaymentId,
        status_checked_at: new Date().toISOString(),
        canceled_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .select()
      .single();

    if (updateError) throw new Error(`Cobrança cancelada no Asaas, mas houve erro ao atualizar o sistema: ${updateError.message}`);

    return jsonResponse({
      ok: true,
      payment: updated,
      message: "Cobrança cancelada no Asaas e atualizada no NavalhaOS.",
    });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
