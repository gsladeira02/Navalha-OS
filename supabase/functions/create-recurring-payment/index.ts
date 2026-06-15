import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getAuthedUser } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_BASE_URL = Deno.env.get("ASAAS_BASE_URL") || "https://api.asaas.com/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const user = await getAuthedUser(supabase, req);
    const body = await req.json();
    const subscriptionId = String(body?.subscriptionId || "").trim();

    if (!subscriptionId || subscriptionId === "undefined" || subscriptionId === "null") {
      throw new Error("ID da assinatura não foi enviado pela tela. Atualize a página e tente novamente.");
    }

    let { data: subscription, error: subError } = await supabase
      .from("customer_subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .maybeSingle();

    if (subError) {
      throw new Error(`Erro ao buscar assinatura: ${subError.message}`);
    }

    if (!subscription && body?.barbershopId && body?.customerId && body?.planId) {
      const fallback = await supabase
        .from("customer_subscriptions")
        .select("*")
        .eq("barbershop_id", body.barbershopId)
        .eq("customer_id", body.customerId)
        .eq("plan_id", body.planId)
        .neq("status", "canceled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!fallback.error && fallback.data) subscription = fallback.data;
    }

    if (!subscription) {
      const { data: recent } = await supabase
        .from("customer_subscriptions")
        .select("id,barbershop_id,customer_id,plan_id,customer_name,plan_name,status,created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      throw new Error(`Assinatura não encontrada. ID enviado: ${subscriptionId}. Dados enviados: ${JSON.stringify(body)}. Últimas assinaturas vistas pela função: ${JSON.stringify(recent || [])}`);
    }

    const { data: shop } = await supabase
      .from("barbershops")
      .select("*")
      .eq("id", subscription.barbershop_id)
      .eq("owner_id", user.id)
      .single();
    if (!shop) throw new Error("Você não tem permissão para esta barbearia.");

    const [{ data: integration }, { data: plan }, { data: customer }] = await Promise.all([
      supabase.from("billing_integrations").select("*").eq("barbershop_id", shop.id).maybeSingle(),
      supabase.from("subscription_plans").select("*").eq("id", subscription.plan_id).single(),
      supabase.from("customers").select("*").eq("id", subscription.customer_id).single(),
    ]);

    if (!integration?.payment_api_key) throw new Error("Configure a chave do gateway de pagamento.");
    if (integration.payment_provider !== "asaas") {
      throw new Error("Esta função está pronta para Asaas. Mercado Pago fica como próximo conector.");
    }

    let customerExternalId = customer.external_payment_customer_id;
    if (!customerExternalId) {
      const customerRes = await fetch(`${ASAAS_BASE_URL}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": integration.payment_api_key,
        },
        body: JSON.stringify({
          name: customer.name,
          email: customer.email || undefined,
          mobilePhone: customer.phone || undefined,
          cpfCnpj: customer.cpf_cnpj || undefined,
        }),
      });
      const customerJson = await customerRes.json();
      if (!customerRes.ok) throw new Error(customerJson?.errors?.[0]?.description || "Erro ao criar cliente no Asaas.");
      customerExternalId = customerJson.id;
      await supabase.from("customers").update({ external_payment_customer_id: customerExternalId }).eq("id", customer.id);
    }

    const dueDate = subscription.next_billing_date || new Date().toISOString().slice(0, 10);

    const subRes = await fetch(`${ASAAS_BASE_URL}/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": integration.payment_api_key,
      },
      body: JSON.stringify({
        customer: customerExternalId,
        billingType: "UNDEFINED",
        value: Number(plan.price || 0),
        nextDueDate: dueDate,
        cycle: "MONTHLY",
        description: `Assinatura ${plan.name} - ${shop.name}`,
      }),
    });

    const subJson = await subRes.json();
    if (!subRes.ok) throw new Error(subJson?.errors?.[0]?.description || "Erro ao criar assinatura no Asaas.");

    await supabase
      .from("customer_subscriptions")
      .update({
        external_provider: "asaas",
        external_subscription_id: subJson.id,
        checkout_url: subJson.invoiceUrl || subJson.bankSlipUrl || subscription.checkout_url || null,
      })
      .eq("id", subscription.id);

    const { data: payment } = await supabase
      .from("subscription_payments")
      .insert({
        barbershop_id: shop.id,
        subscription_id: subscription.id,
        customer_id: customer.id,
        plan_id: plan.id,
        customer_name: customer.name,
        plan_name: plan.name,
        amount: Number(plan.price || 0),
        due_date: dueDate,
        status: "pending",
        checkout_url: subJson.invoiceUrl || subJson.bankSlipUrl || null,
        external_provider: "asaas",
        external_subscription_id: subJson.id,
      })
      .select()
      .single();

    return jsonResponse({ ok: true, payment, message: "Assinatura recorrente criada no Asaas." });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
