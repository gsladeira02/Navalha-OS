
function subscriptionStatusLabel(status){
  const map = {
    trial: 'Teste grátis',
    active: 'Ativo',
    renewal_pending: 'Pagamento pendente',
    overdue: 'Atrasado',
    expired: 'Vencido',
    canceled: 'Cancelado',
    trial_canceled: 'Teste cancelado',
    cancel_scheduled: 'Cancelamento programado',
    pending: 'Pendente'
  };
  return map[String(status || '').toLowerCase()] || status || '-';
}

function daysUntil(dateValue){
  if (!dateValue) return null;
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(dateValue + 'T00:00:00');
  return Math.ceil((target - today) / 86400000);
}

async function callPrivateFunction(name, body){
  const { data: { session } } = await db.auth.getSession();
  if (!session) throw new Error('Sessão inválida.');

  const endpoint = `${window.NAVALHAOS_CONFIG.SUPABASE_URL}/functions/v1/${name}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': window.NAVALHAOS_CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body || {})
  });

  let data = null;
  try { data = await response.json(); } catch (_) {}

  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Erro ${response.status}.`);
  }

  return data;
}

async function loadSystemSubscription(){
  const { data, error } = await db
    .from('system_subscriptions')
    .select('*')
    .eq('user_id', currentSessionUser.id)
    .eq('barbershop_id', activeShop.id)
    .order('created_at', { ascending:false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function renderSubscription(sub){
  const box = document.getElementById('subscriptionBox');
  if (!sub) {
    box.innerHTML = '<div class="empty">Nenhuma assinatura encontrada.</div>';
    return;
  }

  const status = String(sub.status || '').toLowerCase();
  const trialDays = daysUntil(sub.trial_ends_at);
  const periodEnd = sub.current_period_end || sub.expected_period_end || null;
  const nextDue = sub.next_due_date || sub.next_charge_at || null;
  const canPay = !!sub.checkout_url && ['renewal_pending','overdue','expired','pending'].includes(status);
  const trialText = status === 'trial'
    ? (trialDays > 0 ? `Termina em ${trialDays} dia${trialDays === 1 ? '' : 's'}` : 'Termina hoje')
    : '-';

  box.innerHTML = `
    <div class="subscription-status-card ${escapeHtml(status)}">
      <span>Status</span>
      <strong>${escapeHtml(subscriptionStatusLabel(status))}</strong>
      ${status === 'trial' ? `<small>${escapeHtml(trialText)}</small>` : ''}
    </div>

    <div class="kpi-line"><span>Plano</span><strong>${escapeHtml(sub.plan_label || sub.plan_name || '-')}</strong></div>
    <div class="kpi-line"><span>Valor</span><strong>${escapeHtml(sub.plan_display_price || currency.format(Number(sub.amount || 0)))}</strong></div>
    <div class="kpi-line"><span>Fim do teste grátis</span><strong>${sub.trial_ends_at ? dateBR(sub.trial_ends_at) : '-'}</strong></div>
    <div class="kpi-line"><span>Fim do período atual</span><strong>${periodEnd ? dateBR(periodEnd) : '-'}</strong></div>
    <div class="kpi-line"><span>Próxima cobrança</span><strong>${nextDue ? dateBR(nextDue) : '-'}</strong></div>
    ${sub.cancel_at_period_end ? `<div class="link-note">Cancelamento programado. O acesso ficará ativo até ${dateBR(sub.current_period_end || sub.expected_period_end)}.</div>` : ''}
    ${canPay ? `<a class="btn primary full" href="${escapeHtml(sub.checkout_url)}" target="_blank" rel="noopener">Pagar agora</a>` : ''}
  `;
}

(async () => {
  await requireAuth('Configurações', 'Gerencie sua assinatura e os dados principais da barbearia');

  document.getElementById('configShopName').textContent = activeShop.name || '-';
  document.getElementById('configShopPhone').textContent = activeShop.phone || '-';
  document.getElementById('configShopStatus').textContent = activeShop.subscription_status || '-';

  let sub = await loadSystemSubscription();
  renderSubscription(sub);

  const cancelBtn = document.getElementById('cancelPlanBtn');
  const result = document.getElementById('cancelPlanResult');

  if (['canceled','trial_canceled','expired'].includes(String(sub?.status || '').toLowerCase())) {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Plano já cancelado';
  }

  cancelBtn.addEventListener('click', async () => {
    const status = String(sub?.status || '').toLowerCase();
    const message = status === 'trial'
      ? 'Cancelar o teste grátis? A conta será bloqueada e nenhuma cobrança será gerada.'
      : 'Cancelar o plano? Se já houver período pago, o acesso permanece até o fim do período atual.';

    if (!confirm(message)) return;

    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Cancelando...';
    result.textContent = '';

    try {
      const data = await callPrivateFunction('cancel-system-subscription', {});
      result.className = 'site-form-result success';
      result.textContent = data.message || 'Plano cancelado.';
      window.appAuthCache = { session: null, shop: null, loadedAt: 0 };
      sub = await loadSystemSubscription();
      renderSubscription(sub);
    } catch (err) {
      result.className = 'site-form-result error';
      result.textContent = err.message || 'Não foi possível cancelar.';
    } finally {
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancelar plano';
    }
  });
})();
