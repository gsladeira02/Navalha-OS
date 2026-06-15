import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INFINITEPAY_CHECKOUT_URL = Deno.env.get("INFINITEPAY_CHECKOUT_URL") || "https://api.checkout.infinitepay.io/links";
const INFINITEPAY_HANDLE = (Deno.env.get("INFINITEPAY_HANDLE") || Deno.env.get("NAVALHAOS_INFINITEPAY_HANDLE") || "").replace(/^\$/, "");
const WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "";
const PUBLIC_SITE_URL = (Deno.env.get("NAVALHAOS_PUBLIC_URL") || "").replace(/\/$/, "");
const PLAN_NAME = Deno.env.get("NAVALHAOS_PLAN_NAME") || "NavalhaOS Completo";
const PLAN_PRICE = Number(Deno.env.get("NAVALHAOS_PLAN_PRICE") || "14.90");

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function slugify(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function makeUniqueSlug(supabase: any, baseName: string) {
  const base = slugify(baseName) || `barbearia-${Date.now()}`;
  let candidate = base;

  for (let i = 0; i < 20; i++) {
    const { data } = await supabase
      .from("barbershops")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (!data) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 7)}`;
  }

  return `${base}-${Date.now()}`;
}

function getRequestOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const referer = req.headers.get("referer");
  if (referer) {
    try { return new URL(referer).origin; } catch (_) {}
  }
  return PUBLIC_SITE_URL;
}

function findCheckoutUrl(payload: any) {
  return payload?.url || payload?.link || payload?.checkout_url || payload?.checkoutUrl || payload?.payment_url || payload?.paymentUrl || payload?.data?.url || payload?.data?.link || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let userIdToDelete: string | null = null;
  let barbershopIdToDelete: string | null = null;

  try {
    if (!INFINITEPAY_HANDLE) {
      throw new Error("Configure o gateway InfinitePay: falta INFINITEPAY_HANDLE nos Secrets do Supabase.");
    }

    const body = await req.json();
    const adminName = String(body?.adminName || "").trim();
    const adminEmail = String(body?.adminEmail || "").trim().toLowerCase();
    const adminPhone = onlyDigits(body?.adminPhone);
    const adminCpf = onlyDigits(body?.adminCpf);
    const adminPassword = String(body?.adminPassword || "");
    const barbershopName = String(body?.barbershopName || "").trim();
    const barbershopCnpj = onlyDigits(body?.barbershopCnpj);
    const barbershopPhone = onlyDigits(body?.barbershopPhone);

    if (!adminName) throw new Error("Informe o nome do administrador.");
    if (!validateEmail(adminEmail)) throw new Error("Informe um e-mail válido.");
    if (adminPassword.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    if (adminCpf.length !== 11) throw new Error("Informe um CPF válido do administrador.");
    if (!barbershopName) throw new Error("Informe o nome da barbearia.");
    if (barbershopCnpj.length !== 14) throw new Error("Informe um CNPJ válido da barbearia.");
    if (adminPhone.length < 10 || barbershopPhone.length < 10) throw new Error("Informe os celulares com DDD.");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: existingSystemSub } = await supabase
      .from("system_subscriptions")
      .select("id,status,checkout_url")
      .eq("admin_email", adminEmail)
      .in("status", ["pending", "active", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSystemSub) {
      throw new Error("Já existe uma assinatura criada para este e-mail. Use outro e-mail ou acesse o link de pagamento já gerado.");
    }

    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        must_change_password: false,
        setup_completed: true,
        admin_name: adminName,
        admin_cpf: adminCpf,
        admin_phone: adminPhone,
      },
    });

    if (createUserError || !createdUser?.user) {
      throw new Error(createUserError?.message || "Não foi possível criar o usuário.");
    }

    const user = createdUser.user;
    userIdToDelete = user.id;

    const slug = await makeUniqueSlug(supabase, barbershopName);

    const { data: barbershop, error: shopError } = await supabase
      .from("barbershops")
      .insert({
        owner_id: user.id,
        name: barbershopName,
        phone: barbershopPhone,
        cnpj: barbershopCnpj,
        admin_name: adminName,
        admin_cpf: adminCpf,
        admin_phone: adminPhone,
        plan: "complete",
        subscription_status: "pending",
        active: false,
        slug,
        setup_completed: true,
        setup_completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (shopError || !barbershop) {
      throw new Error(shopError?.message || "Não foi possível criar a barbearia.");
    }

    barbershopIdToDelete = barbershop.id;

    const amountCents = Math.round(PLAN_PRICE * 100);
    const orderNsu = crypto.randomUUID();
    const origin = getRequestOrigin(req);
    const redirectUrl = origin ? `${origin}/login.html?pagamento=infinitepay&order_nsu=${encodeURIComponent(orderNsu)}` : undefined;

    const { data: systemSubscription, error: systemSubError } = await supabase
      .from("system_subscriptions")
      .insert({
        user_id: user.id,
        barbershop_id: barbershop.id,
        admin_name: adminName,
        admin_email: adminEmail,
        admin_phone: adminPhone,
        admin_cpf: adminCpf,
        barbershop_name: barbershopName,
        barbershop_cnpj: barbershopCnpj,
        barbershop_phone: barbershopPhone,
        plan_name: PLAN_NAME,
        amount: PLAN_PRICE,
        cycle: "MONTHLY",
        payment_method: "INFINITEPAY_CHECKOUT",
        status: "pending",
        external_provider: "infinitepay",
        order_nsu: orderNsu,
        next_due_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();

    if (systemSubError || !systemSubscription) {
      throw new Error(systemSubError?.message || "Não foi possível salvar a assinatura do sistema.");
    }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/payment-webhook${WEBHOOK_SECRET ? `?secret=${encodeURIComponent(WEBHOOK_SECRET)}` : ""}`;

    const infinitePayload: Record<string, unknown> = {
      handle: INFINITEPAY_HANDLE,
      items: [
        {
          quantity: 1,
          price: amountCents,
          description: PLAN_NAME,
        },
      ],
      order_nsu: orderNsu,
      webhook_url: webhookUrl,
      customer: {
        name: adminName,
        email: adminEmail,
        phone_number: `+55${adminPhone}`,
      },
    };

    if (redirectUrl) infinitePayload.redirect_url = redirectUrl;

    const linkRes = await fetch(INFINITEPAY_CHECKOUT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(infinitePayload),
    });

    const linkJson = await linkRes.json();
    if (!linkRes.ok) {
      throw new Error(linkJson?.message || linkJson?.error || "Erro ao criar link de pagamento na InfinitePay.");
    }

    const checkoutUrl = findCheckoutUrl(linkJson);
    if (!checkoutUrl) {
      throw new Error(`InfinitePay respondeu sem link de checkout. Resposta: ${JSON.stringify(linkJson)}`);
    }

    const invoiceSlug = linkJson?.slug || linkJson?.invoice_slug || linkJson?.data?.slug || null;

    const { data: updatedSub, error: updateError } = await supabase
      .from("system_subscriptions")
      .update({
        checkout_url: checkoutUrl,
        invoice_url: checkoutUrl,
        external_invoice_slug: invoiceSlug,
        infinitepay_payload: linkJson,
        updated_at: new Date().toISOString(),
      })
      .eq("id", systemSubscription.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Link criado na InfinitePay, mas houve erro ao salvar no NavalhaOS: ${updateError.message}`);
    }

    userIdToDelete = null;
    barbershopIdToDelete = null;

    return jsonResponse({
      ok: true,
      subscription: updatedSub,
      checkoutUrl,
      invoiceUrl: checkoutUrl,
      gateway: "infinitepay",
      message: "Assinatura do NavalhaOS criada na InfinitePay. Após a confirmação do pagamento, o acesso será liberado.",
    });
  } catch (err) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      if (barbershopIdToDelete) await supabase.from("barbershops").delete().eq("id", barbershopIdToDelete);
      if (userIdToDelete) await supabase.auth.admin.deleteUser(userIdToDelete);
    } catch (_) {}

    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
