import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INFINITEPAY_CHECKOUT_URL = Deno.env.get("INFINITEPAY_CHECKOUT_URL") || "https://api.checkout.infinitepay.io/links";
const INFINITEPAY_HANDLE = (Deno.env.get("INFINITEPAY_HANDLE") || Deno.env.get("NAVALHAOS_INFINITEPAY_HANDLE") || "").replace(/^\$/, "");
const WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "";
const PUBLIC_SITE_URL = (Deno.env.get("NAVALHAOS_PUBLIC_URL") || "").replace(/\/$/, "");

const PLANS: Record<string, any> = {
  monthly: {
    code: "monthly",
    label: "Mensal",
    displayPrice: "R$ 49,90",
    totalCents: 4990,
    periodMonths: 1,
    intervalDays: 30,
    installments: 1,
    description: "Plano Mensal - NavalhaOS",
  },
  quarterly: {
    code: "quarterly",
    label: "Trimestral",
    displayPrice: "3x de R$ 44,90",
    totalCents: 13470,
    periodMonths: 3,
    intervalDays: null,
    installments: 3,
    description: "Plano Trimestral - 3x de R$ 44,90 - NavalhaOS",
  },
  semiannual: {
    code: "semiannual",
    label: "Semestral",
    displayPrice: "6x de R$ 39,90",
    totalCents: 23940,
    periodMonths: 6,
    intervalDays: null,
    installments: 6,
    description: "Plano Semestral - 6x de R$ 39,90 - NavalhaOS",
  },
  annual: {
    code: "annual",
    label: "Anual",
    displayPrice: "12x de R$ 14,90",
    totalCents: 17880,
    periodMonths: 12,
    intervalDays: null,
    installments: 12,
    description: "Plano Anual - 12x de R$ 14,90 - NavalhaOS",
  },
};

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

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
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

async function createCheckout(req: Request, plan: any, orderNsu: string, customer: any) {
  const origin = getRequestOrigin(req);
  const redirectUrl = origin ? `${origin}/login.html?pagamento=ok&order_nsu=${encodeURIComponent(orderNsu)}` : undefined;
  const webhookUrl = `${SUPABASE_URL}/functions/v1/payment-webhook${WEBHOOK_SECRET ? `?secret=${encodeURIComponent(WEBHOOK_SECRET)}` : ""}`;

  const checkoutPayload: Record<string, unknown> = {
    handle: INFINITEPAY_HANDLE,
    items: [
      {
        quantity: 1,
        price: plan.totalCents,
        description: `${plan.description} (${plan.displayPrice})`,
      },
    ],
    order_nsu: orderNsu,
    webhook_url: webhookUrl,
    customer: {
      name: customer.adminName,
      email: customer.adminEmail,
      phone_number: `+55${customer.adminPhone}`,
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
  if (!checkoutUrl) {
    throw new Error(`O checkout respondeu sem link de pagamento. Resposta: ${JSON.stringify(linkJson)}`);
  }

  return {
    checkoutUrl,
    response: linkJson,
    invoiceSlug: linkJson?.slug || linkJson?.invoice_slug || linkJson?.data?.slug || null,
  };
}

function getReplacedOrderList(existing: any) {
  const list = Array.isArray(existing?.replaced_order_nsus) ? existing.replaced_order_nsus : [];
  const current = existing?.order_nsu ? String(existing.order_nsu) : "";
  return current && !list.includes(current) ? [...list, current] : list;
}

async function updateUserPasswordAndMetadata(supabase: any, userId: string, body: any) {
  const updates: Record<string, unknown> = {
    user_metadata: {
      must_change_password: false,
      setup_completed: true,
      admin_name: body.adminName,
      admin_cpf: body.adminCpf,
      admin_phone: body.adminPhone,
    },
  };

  if (String(body.adminPassword || "").length >= 6) {
    updates.password = body.adminPassword;
  }

  await supabase.auth.admin.updateUserById(userId, updates);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let userIdToDelete: string | null = null;
  let barbershopIdToDelete: string | null = null;
  let systemSubscriptionIdToDelete: string | null = null;

  try {
    if (!INFINITEPAY_HANDLE) {
      throw new Error("Configure o gateway de pagamento nos Secrets do Supabase.");
    }

    const body = await req.json();
    const plan = PLANS[String(body?.planCode || "annual")] || PLANS.annual;
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

    const { data: existing } = await supabase
      .from("system_subscriptions")
      .select("*")
      .eq("admin_email", adminEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    const nowIso = now.toISOString();
    const expectedEnd = addMonths(now, plan.periodMonths);
    const graceUntil = addDays(expectedEnd, 3);
    const orderNsu = crypto.randomUUID();

    let userId: string;
    let barbershopId: string;
    let replaced = false;
    let replacedOrderNsus: string[] = [];

    if (existing && ["active", "renewal_pending", "overdue"].includes(String(existing.status || "").toLowerCase())) {
      throw new Error("Este e-mail já possui uma assinatura ativa. Para trocar de plano, acesse o sistema e solicite a mudança para a próxima renovação.");
    }

    if (existing && ["pending", "expired", "canceled", "cancelled"].includes(String(existing.status || "").toLowerCase()) && existing.user_id && existing.barbershop_id) {
      replaced = true;
      userId = existing.user_id;
      barbershopId = existing.barbershop_id;
      replacedOrderNsus = getReplacedOrderList(existing);

      await updateUserPasswordAndMetadata(supabase, userId, {
        adminName, adminCpf, adminPhone, adminPassword,
      });

      await supabase
        .from("barbershops")
        .update({
          name: barbershopName,
          phone: barbershopPhone,
          cnpj: barbershopCnpj,
          admin_name: adminName,
          admin_cpf: adminCpf,
          admin_phone: adminPhone,
          active: false,
          subscription_status: "pending",
          updated_at: nowIso,
        })
        .eq("id", barbershopId);
    } else {
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

      userId = createdUser.user.id;
      userIdToDelete = userId;

      const slug = await makeUniqueSlug(supabase, barbershopName);

      const { data: barbershop, error: shopError } = await supabase
        .from("barbershops")
        .insert({
          owner_id: userId,
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
          setup_completed_at: nowIso,
        })
        .select()
        .single();

      if (shopError || !barbershop) {
        throw new Error(shopError?.message || "Não foi possível criar a barbearia.");
      }

      barbershopId = barbershop.id;
      barbershopIdToDelete = barbershopId;
    }

    const checkout = await createCheckout(req, plan, orderNsu, {
      adminName, adminEmail, adminPhone,
    });

    const subscriptionPayload = {
      user_id: userId,
      barbershop_id: barbershopId,
      admin_name: adminName,
      admin_email: adminEmail,
      admin_phone: adminPhone,
      admin_cpf: adminCpf,
      barbershop_name: barbershopName,
      barbershop_cnpj: barbershopCnpj,
      barbershop_phone: barbershopPhone,
      plan_code: plan.code,
      plan_label: plan.label,
      plan_name: plan.label,
      plan_display_price: plan.displayPrice,
      amount: plan.totalCents / 100,
      amount_cents: plan.totalCents,
      installments: plan.installments,
      period_months: plan.periodMonths,
      interval_days: plan.intervalDays,
      grace_days: 3,
      cycle: plan.code === "monthly" ? "30_DAYS" : `${plan.periodMonths}_MONTHS`,
      payment_method: "CHECKOUT",
      status: "pending",
      external_provider: "infinitepay",
      order_nsu: orderNsu,
      replaced_order_nsus: replacedOrderNsus,
      link_replaced_at: replaced ? nowIso : null,
      external_invoice_slug: checkout.invoiceSlug,
      checkout_url: checkout.checkoutUrl,
      invoice_url: checkout.checkoutUrl,
      infinitepay_payload: checkout.response,
      expected_period_start: isoDate(now),
      expected_period_end: isoDate(expectedEnd),
      expected_grace_until: isoDate(graceUntil),
      current_period_start: null,
      current_period_end: null,
      grace_until: null,
      next_charge_at: null,
      renewal_created_at: null,
      paid_at: null,
      next_due_date: isoDate(now),
      updated_at: nowIso,
    };

    let saved: any = null;

    if (replaced && existing?.id) {
      const { data, error } = await supabase
        .from("system_subscriptions")
        .update(subscriptionPayload)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw new Error(`Novo link criado, mas houve erro ao salvar a troca: ${error.message}`);
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("system_subscriptions")
        .insert(subscriptionPayload)
        .select()
        .single();

      if (error) throw new Error(`Cobrança criada, mas houve erro ao salvar a assinatura: ${error.message}`);
      saved = data;
      systemSubscriptionIdToDelete = null;
    }

    userIdToDelete = null;
    barbershopIdToDelete = null;

    return jsonResponse({
      ok: true,
      replaced,
      subscription: saved,
      checkoutUrl: checkout.checkoutUrl,
      invoiceUrl: checkout.checkoutUrl,
      plan,
      message: replaced
        ? "Novo link gerado. O link anterior foi substituído e não liberará acesso automaticamente."
        : "Assinatura criada. Após a confirmação do pagamento, o acesso será liberado.",
    });
  } catch (err) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      if (systemSubscriptionIdToDelete) await supabase.from("system_subscriptions").delete().eq("id", systemSubscriptionIdToDelete);
      if (barbershopIdToDelete) await supabase.from("barbershops").delete().eq("id", barbershopIdToDelete);
      if (userIdToDelete) await supabase.auth.admin.deleteUser(userIdToDelete);
    } catch (_) {}

    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
