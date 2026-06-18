import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PLANS: Record<string, any> = {
  monthly: {
    code: "monthly",
    label: "Mensal",
    displayPrice: "R$ 49,90",
    totalCents: 4990,
    periodMonths: 1,
    intervalDays: 30,
    installments: 1,
  },
  quarterly: {
    code: "quarterly",
    label: "Trimestral",
    displayPrice: "3x de R$ 44,90",
    totalCents: 13470,
    periodMonths: 3,
    intervalDays: null,
    installments: 3,
  },
  semiannual: {
    code: "semiannual",
    label: "Semestral",
    displayPrice: "6x de R$ 39,90",
    totalCents: 23940,
    periodMonths: 6,
    intervalDays: null,
    installments: 6,
  },
  annual: {
    code: "annual",
    label: "Anual",
    displayPrice: "12x de R$ 14,90",
    totalCents: 17880,
    periodMonths: 12,
    intervalDays: null,
    installments: 12,
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

  try {
    const body = await req.json();
    const plan = PLANS[String(body?.planCode || "annual")] || PLANS.annual;
    const adminName = String(body?.adminName || "").trim();
    const adminEmail = String(body?.adminEmail || "").trim().toLowerCase();
    const adminPhone = onlyDigits(body?.adminPhone);
    const adminCpf = onlyDigits(body?.adminCpf);
    const adminPassword = String(body?.adminPassword || "");
    const barbershopName = String(body?.barbershopName || "").trim();
    const barbershopAddress = String(body?.barbershopAddress || "").trim();
    const barbershopCnpj = onlyDigits(body?.barbershopCnpj);
    const barbershopPhone = onlyDigits(body?.barbershopPhone);

    if (!adminName) throw new Error("Informe o nome do administrador.");
    if (!validateEmail(adminEmail)) throw new Error("Informe um e-mail válido.");
    if (adminPassword.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    if (adminCpf.length !== 11) throw new Error("Informe um CPF válido do administrador.");
    if (!barbershopName) throw new Error("Informe o nome da barbearia.");
    if (barbershopAddress.length < 8) throw new Error("Informe o endereço da barbearia.");
    if (barbershopCnpj && barbershopCnpj.length !== 14) throw new Error("Se preencher CNPJ, informe um CNPJ válido da barbearia.");
    if (adminPhone.length < 10 || barbershopPhone.length < 10) throw new Error("Informe os celulares com DDD.");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: existing } = await supabase
      .from("system_subscriptions")
      .select("*")
      .eq("admin_email", adminEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && ["trial", "active", "renewal_pending", "overdue", "cancel_scheduled"].includes(String(existing.status || "").toLowerCase())) {
      throw new Error("Este e-mail já possui uma assinatura. Entre no sistema para gerenciar o plano.");
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const trialEnd = addDays(now, 3);

    let userId: string;
    let barbershopId: string;
    let reused = false;

    if (existing && ["expired", "canceled", "cancelled", "trial_canceled", "pending"].includes(String(existing.status || "").toLowerCase()) && existing.user_id && existing.barbershop_id) {
      reused = true;
      userId = existing.user_id;
      barbershopId = existing.barbershop_id;

      await updateUserPasswordAndMetadata(supabase, userId, {
        adminName, adminCpf, adminPhone, adminPassword,
      });

      await supabase
        .from("barbershops")
        .update({
          name: barbershopName,
          phone: barbershopPhone,
          address: barbershopAddress,
          cnpj: barbershopCnpj,
          admin_name: adminName,
          admin_cpf: adminCpf,
          admin_phone: adminPhone,
          active: true,
          subscription_status: "trial",
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
          address: barbershopAddress,
          cnpj: barbershopCnpj,
          admin_name: adminName,
          admin_cpf: adminCpf,
          admin_phone: adminPhone,
          plan: "complete",
          subscription_status: "trial",
          active: true,
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

    const subscriptionPayload = {
      user_id: userId,
      barbershop_id: barbershopId,
      admin_name: adminName,
      admin_email: adminEmail,
      admin_phone: adminPhone,
      admin_cpf: adminCpf,
      barbershop_name: barbershopName,
      barbershop_address: barbershopAddress,
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
      status: "trial",
      external_provider: "infinitepay",
      order_nsu: null,
      external_invoice_slug: null,
      checkout_url: null,
      invoice_url: null,
      infinitepay_payload: null,
      trial_started_at: nowIso,
      trial_ends_at: isoDate(trialEnd),
      expected_period_start: isoDate(now),
      expected_period_end: isoDate(trialEnd),
      expected_grace_until: isoDate(trialEnd),
      current_period_start: isoDate(now),
      current_period_end: isoDate(trialEnd),
      grace_until: isoDate(trialEnd),
      next_due_date: isoDate(trialEnd),
      next_charge_at: isoDate(trialEnd),
      renewal_created_at: null,
      paid_at: null,
      canceled_at: null,
      cancel_requested_at: null,
      cancel_at_period_end: false,
      updated_at: nowIso,
    };

    let saved: any = null;
    if (reused && existing?.id) {
      const { data, error } = await supabase
        .from("system_subscriptions")
        .update(subscriptionPayload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error(`Erro ao salvar o teste grátis: ${error.message}`);
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("system_subscriptions")
        .insert(subscriptionPayload)
        .select()
        .single();
      if (error) throw new Error(`Erro ao salvar o teste grátis: ${error.message}`);
      saved = data;
    }

    userIdToDelete = null;
    barbershopIdToDelete = null;

    return jsonResponse({
      ok: true,
      trial: true,
      subscription: saved,
      trialEndsAt: isoDate(trialEnd),
      message: "Teste grátis criado. Acesso liberado por 3 dias.",
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
