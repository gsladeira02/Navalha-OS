import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Sessão inválida." }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return jsonResponse({ error: "Sessão inválida." }, 401);

    const { data: shop, error: shopError } = await supabase
      .from("barbershops")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (shopError || !shop) return jsonResponse({ error: "Barbearia não encontrada." }, 404);

    const { data: sub, error: subError } = await supabase
      .from("system_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("barbershop_id", shop.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError || !sub) return jsonResponse({ error: "Assinatura não encontrada." }, 404);

    const now = new Date().toISOString();
    const status = String(sub.status || "").toLowerCase();

    if (["trial", "renewal_pending", "pending", "overdue", "expired"].includes(status)) {
      const newStatus = status === "trial" ? "trial_canceled" : "canceled";

      await supabase
        .from("system_subscriptions")
        .update({
          status: newStatus,
          cancel_requested_at: now,
          canceled_at: now,
          cancel_at_period_end: false,
          updated_at: now,
        })
        .eq("id", sub.id);

      await supabase
        .from("barbershops")
        .update({
          active: false,
          subscription_status: "canceled",
          updated_at: now,
        })
        .eq("id", shop.id);

      return jsonResponse({
        ok: true,
        immediate: true,
        message: status === "trial"
          ? "Teste grátis cancelado. Nenhuma cobrança será gerada."
          : "Plano cancelado. A conta foi bloqueada e os dados foram mantidos.",
      });
    }

    if (status === "active") {
      await supabase
        .from("system_subscriptions")
        .update({
          status: "cancel_scheduled",
          cancel_requested_at: now,
          cancel_at_period_end: true,
          updated_at: now,
        })
        .eq("id", sub.id);

      await supabase
        .from("barbershops")
        .update({
          active: true,
          subscription_status: "active",
          updated_at: now,
        })
        .eq("id", shop.id);

      return jsonResponse({
        ok: true,
        immediate: false,
        message: "Cancelamento programado. O acesso fica ativo até o fim do período já pago.",
      });
    }

    if (status === "cancel_scheduled") {
      return jsonResponse({
        ok: true,
        immediate: false,
        message: "O cancelamento já está programado.",
      });
    }

    return jsonResponse({ error: "Esta assinatura não pode ser cancelada neste status." }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 400);
  }
});
