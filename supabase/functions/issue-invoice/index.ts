import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getAuthedUser } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NFEIO_BASE_URL = Deno.env.get("NFEIO_BASE_URL") || "https://api.nfe.io/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const user = await getAuthedUser(supabase, req);
    const { paymentId } = await req.json();

    const { data: payment } = await supabase
      .from("subscription_payments")
      .select("*")
      .eq("id", paymentId)
      .single();
    if (!payment) throw new Error("Pagamento não encontrado.");

    const { data: shop } = await supabase
      .from("barbershops")
      .select("*")
      .eq("id", payment.barbershop_id)
      .eq("owner_id", user.id)
      .single();
    if (!shop) throw new Error("Você não tem permissão para esta barbearia.");

    const [{ data: integration }, { data: customer }] = await Promise.all([
      supabase.from("billing_integrations").select("*").eq("barbershop_id", shop.id).maybeSingle(),
      supabase.from("customers").select("*").eq("id", payment.customer_id).maybeSingle(),
    ]);

    if (!integration?.fiscal_api_key || !integration?.fiscal_company_id) {
      throw new Error("Configure a chave fiscal e o ID da empresa.");
    }

    let { data: invoice } = await supabase
      .from("fiscal_invoices")
      .select("*")
      .eq("payment_id", payment.id)
      .maybeSingle();

    if (!invoice) {
      const inserted = await supabase.from("fiscal_invoices").insert({
        barbershop_id: shop.id,
        payment_id: payment.id,
        subscription_id: payment.subscription_id,
        customer_id: payment.customer_id,
        customer_name: payment.customer_name,
        amount: Number(payment.amount || 0),
        status: "pending",
        service_description: `Assinatura recorrente - ${payment.plan_name || "Plano"}`,
      }).select().single();
      invoice = inserted.data;
    }

    if (integration.fiscal_provider !== "nfeio") {
      await supabase.from("fiscal_invoices").update({
        status: "pending",
        error_message: "Conector fiscal selecionado ainda precisa ser adaptado na Edge Function.",
      }).eq("id", invoice.id);
      return jsonResponse({ ok: true, message: "Nota pendente criada. Adapte o conector fiscal selecionado." });
    }

    const payload = {
      borrower: {
        name: customer?.name || payment.customer_name,
        federalTaxNumber: customer?.cpf_cnpj || undefined,
        email: customer?.email || undefined,
      },
      cityServiceCode: Deno.env.get("NFEIO_CITY_SERVICE_CODE") || "0107",
      description: invoice.service_description || `Assinatura recorrente - ${payment.plan_name || "Plano"}`,
      servicesAmount: Number(payment.amount || 0),
    };

    const res = await fetch(`${NFEIO_BASE_URL}/companies/${integration.fiscal_company_id}/serviceinvoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": integration.fiscal_api_key,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      await supabase.from("fiscal_invoices").update({ status: "error", error_message: JSON.stringify(json) }).eq("id", invoice.id);
      throw new Error("Erro ao emitir NFS-e. Confira dados fiscais e código de serviço.");
    }

    await supabase.from("fiscal_invoices").update({
      status: "issued",
      external_provider: "nfeio",
      external_invoice_id: json.id || null,
      invoice_number: json.number || json.rpsNumber || null,
      invoice_url: json.pdfUrl || json.url || null,
      issued_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", invoice.id);

    return jsonResponse({ ok: true, message: "Nota fiscal emitida.", invoice: json });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
