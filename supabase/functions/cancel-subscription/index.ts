import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getAuthedUser } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_BASE_URL = Deno.env.get("ASAAS_BASE_URL") || "https://api.asaas.com/v3";

async function deleteAsaasSubscription(baseUrl: string, apiKey: string, subscriptionId: string) {
  const res = await fetch(`${baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "access_token": apiKey },
  });
  let json: any = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(json?.errors?.[0]?.description || "Erro ao cancelar assinatura no Asaas.");
  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const user = await getAuthedUser(supabase, req);
    const { subscriptionId } = await req.json();

    if (!subscriptionId) throw new Error("ID da assinatura não enviado.");

    const { data: subscription, error: subError } = await supabase
      .from("customer_subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .maybeSingle();

    if (subError) throw new Error(`Erro ao buscar assinatura: ${subError.message}`);
    if (!subscription) throw new Error("Assinatura não encontrada.");

    const { data: shop } = await supabase
      .from("barbershops")
      .select("*")
      .eq("id", subscription.barbershop_id)
      .eq("owner_id", user.id)
      .single();

    if (!shop) throw new Error("Você não tem permissão para esta barbearia.");

    const { data: integration } = await supabase
      .from("billing_integrations")
      .select("*")
      .eq("barbershop_id", shop.id)
      .maybeSingle();

    if (subscription.external_subscription_id) {
      if (!integration?.payment_api_key) throw new Error("Configure a chave do gateway de pagamento.");
      if (integration.payment_provider !== "asaas") throw new Error("Cancelamento automático pronto para Asaas.");
      await deleteAsaasSubscription(ASAAS_BASE_URL, integration.payment_api_key, subscription.external_subscription_id);
    }

    const now = new Date().toISOString();

    const { data: updatedSub, error: updateSubError } = await supabase
      .from("customer_subscriptions")
      .update({
        status: "canceled",
        canceled_at: now,
      })
      .eq("id", subscription.id)
      .select()
      .single();

    if (updateSubError) throw new Error(`Erro ao atualizar assinatura local: ${updateSubError.message}`);

    await supabase
      .from("subscription_payments")
      .update({
        status: "canceled",
        asaas_status: "DELETED",
        status_checked_at: now,
        canceled_at: now,
      })
      .eq("subscription_id", subscription.id)
      .in("status", ["pending", "open", "overdue", "canceled"]);

    return jsonResponse({
      ok: true,
      subscription: updatedSub,
      message: subscription.external_subscription_id
        ? "Assinatura cancelada no Asaas e no NavalhaOS."
        : "Assinatura cancelada no NavalhaOS. Ela ainda não tinha ID do Asaas.",
    });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
