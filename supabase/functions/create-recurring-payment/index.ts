import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getAuthedUser } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_BASE_URL = Deno.env.get("ASAAS_BASE_URL") || "https://sandbox.asaas.com/api/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const user = await getAuthedUser(supabase, req);
    const { subscriptionId } = await req.json();

    const { data: subscription, error: subError } = await supabase
      .from("customer_subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .single();
    if (subError || !subscription) throw new Error("Assinatura não encontrada.");

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
