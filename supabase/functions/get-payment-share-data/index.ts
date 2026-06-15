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

async function getPixQrCode(baseUrl: string, apiKey: string, paymentId: string) {
  try {
    const res = await fetch(`${baseUrl}/payments/${encodeURIComponent(paymentId)}/pixQrCode`, {
      method: "GET",
      headers: { "Content-Type": "application/json", "access_token": apiKey },
    });
    const json = await res.json();
    if (!res.ok) return null;
    return json;
  } catch (_) {
    return null;
  }
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
    if (integration.payment_provider !== "asaas") throw new Error("Compartilhamento automático pronto para Asaas.");

    let asaasPayment = null;

    if (payment.external_payment_id) {
      const res = await fetch(`${ASAAS_BASE_URL}/payments/${encodeURIComponent(payment.external_payment_id)}`, {
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
      throw new Error("Não encontrei a cobrança no Asaas para compartilhar.");
    }

    const billingType = String(asaasPayment.billingType || payment.payment_method || "").toUpperCase();
    const pixQr = ["PIX", "BOLETO", "UNDEFINED"].includes(billingType)
      ? await getPixQrCode(ASAAS_BASE_URL, integration.payment_api_key, asaasPayment.id)
      : null;

    const invoiceUrl = asaasPayment.invoiceUrl || payment.invoice_url || payment.checkout_url || null;
    const bankSlipUrl = asaasPayment.bankSlipUrl || payment.bank_slip_url || null;
    const pixPayload = pixQr?.payload || null;
    const pixEncodedImage = pixQr?.encodedImage || pixQr?.encoded_image || null;

    const mappedStatus = mapAsaasPaymentStatus(asaasPayment.status);
    const { data: updated } = await supabase
      .from("subscription_payments")
      .update({
        status: mappedStatus,
        asaas_status: asaasPayment.status || null,
        external_payment_id: asaasPayment.id || payment.external_payment_id || null,
        checkout_url: invoiceUrl || bankSlipUrl || payment.checkout_url || null,
        invoice_url: invoiceUrl,
        bank_slip_url: bankSlipUrl,
        pix_payload: pixPayload,
        pix_encoded_image: pixEncodedImage,
        status_checked_at: new Date().toISOString(),
        paid_at: mappedStatus === "paid" ? (asaasPayment.paymentDate ? `${asaasPayment.paymentDate}T00:00:00.000Z` : new Date().toISOString()) : payment.paid_at,
      })
      .eq("id", payment.id)
      .select()
      .single();

    return jsonResponse({
      ok: true,
      payment: updated || payment,
      share: {
        billingType,
        invoiceUrl,
        bankSlipUrl,
        pixPayload,
        pixEncodedImage,
        dueDate: asaasPayment.dueDate || payment.due_date,
        status: mappedStatus,
      },
      message: "Dados da cobrança prontos para WhatsApp.",
    });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
