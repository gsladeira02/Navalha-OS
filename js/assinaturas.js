
let customers = [];
let plans = [];
let subscriptions = [];
let payments = [];
let invoices = [];

function statusBadge(status){
  const cls = {
    active: 'ativo',
    inactive: 'inativo',
    canceled: 'cancelado',
    pending: 'confirmado',
    paid: 'concluido',
    overdue: 'cancelado',
    issued: 'concluido',
    error: 'cancelado'
  }[status] || status;
  const label = {
    active: 'ativo',
    inactive: 'inativo',
    canceled: 'cancelado',
    pending: 'pendente',
    paid: 'pago',
    overdue: 'atrasado',
    issued: 'emitida',
    error: 'erro'
  }[status] || status;
  return `<span class="badge ${cls}">${label}</span>`;
}

function fillSelect(el, items, firstLabel){
  el.innerHTML = `<option value="">${firstLabel}</option>` + items.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
}

function planById(id){ return plans.find(p => p.id === id); }
function customerById(id){ return customers.find(c => c.id === id); }
function subscriptionById(id){ return subscriptions.find(s => s.id === id); }

async function callSecureFunction(name, body){
  const { data: { session } } = await db.auth.getSession();
  if (!session) throw new Error('Sessão expirada');
  const { data, error } = await db.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function loadIntegrationSettings(){
  const { data } = await db
    .from('billing_integrations')
    .select('payment_provider,fiscal_provider,fiscal_company_id,active')
    .eq('barbershop_id', activeShop.id)
    .maybeSingle();

  if (!data) return;
  const paymentProvider = document.getElementById('payment_provider');
  const fiscalProvider = document.getElementById('fiscal_provider');
  const fiscalCompany = document.getElementById('fiscal_company_id');
  if (paymentProvider) paymentProvider.value = data.payment_provider || 'asaas';
  if (fiscalProvider) fiscalProvider.value = data.fiscal_provider || 'nfeio';
  if (fiscalCompany) fiscalCompany.value = data.fiscal_company_id || '';
}



async function loadAll(){
  const [customersRes, plansRes, subsRes, paymentsRes, invoicesRes] = await Promise.all([
    db.from('customers').select('*').eq('barbershop_id', activeShop.id).order('name'),
    db.from('subscription_plans').select('*').eq('barbershop_id', activeShop.id).order('created_at', { ascending:false }),
    db.from('customer_subscriptions').select('*').eq('barbershop_id', activeShop.id).order('created_at', { ascending:false }),
    db.from('subscription_payments').select('*').eq('barbershop_id', activeShop.id).order('due_date', { ascending:false }),
    db.from('fiscal_invoices').select('*').eq('barbershop_id', activeShop.id).order('created_at', { ascending:false })
  ]);

  if (plansRes.error || subsRes.error || paymentsRes.error || invoicesRes.error) {
    showToast('Confira se o SQL de assinaturas foi executado no Supabase.', 'error');
  }

  customers = customersRes.data || [];
  plans = plansRes.data || [];
  subscriptions = subsRes.data || [];
  payments = paymentsRes.data || [];
  invoices = invoicesRes.data || [];

  fillSelect(document.getElementById('subscription_customer_id'), customers, 'Selecionar cliente');
  fillSelect(document.getElementById('subscription_plan_id'), plans.filter(p => p.active), 'Selecionar plano');

  renderMetrics();
  renderPlans();
  renderSubscriptions();
  renderPayments();
  renderInvoices();
}

function renderMetrics(){
  const activeSubs = subscriptions.filter(s => s.status === 'active');
  const mrr = activeSubs.reduce((sum, sub) => sum + Number(planById(sub.plan_id)?.price || 0), 0);
  document.getElementById('activeSubscriptions').textContent = activeSubs.length;
  document.getElementById('monthlyRecurring').textContent = currency.format(mrr);
  document.getElementById('pendingPayments').textContent = payments.filter(p => p.status === 'pending' || p.status === 'overdue').length;
  document.getElementById('pendingInvoices').textContent = invoices.filter(i => i.status === 'pending' || i.status === 'error').length;
}

function renderPlans(){
  const rows = document.getElementById('planRows');
  rows.innerHTML = plans.length ? plans.map(item => `
    <tr>
      <td data-label="Plano">${escapeHtml(item.name)}<br><small>${escapeHtml(item.description || '')}</small></td>
      <td data-label="Valor">${currency.format(Number(item.price || 0))}</td>
      <td data-label="Cobrança">Todo dia ${item.billing_day || '-'}</td>
      <td data-label="Status">${statusBadge(item.active ? 'active' : 'inactive')}</td>
      <td data-label="Ações"><div class="actions">
        <button class="btn secondary small" onclick="togglePlan('${item.id}', ${item.active ? 'false':'true'})">${item.active ? 'Inativar':'Ativar'}</button>
        <button class="btn danger small" onclick="removePlan('${item.id}')">Excluir</button>
      </div></td>
    </tr>`).join('') : `<tr><td colspan="5"><div class="empty">Nenhum plano recorrente cadastrado.</div></td></tr>`;
}

function renderSubscriptions(){
  const rows = document.getElementById('subscriptionRows');
  rows.innerHTML = subscriptions.length ? subscriptions.map(item => {
    const plan = planById(item.plan_id);
    const customer = customerById(item.customer_id);
    return `
      <tr>
        <td data-label="Cliente">${escapeHtml(customer?.name || item.customer_name || '-')}</td>
        <td data-label="Plano">${escapeHtml(plan?.name || item.plan_name || '-')}</td>
        <td data-label="Status">${statusBadge(item.status)}</td>
        <td data-label="Próxima cobrança">${dateBR(item.next_billing_date)}</td>
        <td data-label="Ações"><div class="actions">
          ${item.checkout_url ? `<a class="btn secondary small" href="${escapeHtml(item.checkout_url)}" target="_blank">Link</a>` : ''}
          <button class="btn primary small" onclick="createPayment('${item.id}')">Gerar cobrança</button>
          <button class="btn danger small" onclick="cancelSubscription('${item.id}')">Cancelar</button>
        </div></td>
      </tr>`;
  }).join('') : `<tr><td colspan="5"><div class="empty">Nenhuma assinatura ativa.</div></td></tr>`;
}

function renderPayments(){
  const rows = document.getElementById('paymentRows');
  rows.innerHTML = payments.length ? payments.map(item => {
    const sub = subscriptionById(item.subscription_id);
    const customer = customerById(item.customer_id || sub?.customer_id);
    const plan = planById(item.plan_id || sub?.plan_id);
    return `
      <tr>
        <td data-label="Cliente">${escapeHtml(customer?.name || item.customer_name || '-')}</td>
        <td data-label="Plano">${escapeHtml(plan?.name || item.plan_name || '-')}</td>
        <td data-label="Vencimento">${dateBR(item.due_date)}</td>
        <td data-label="Valor">${currency.format(Number(item.amount || 0))}</td>
        <td data-label="Status">${statusBadge(item.status)}</td>
        <td data-label="Ações"><div class="actions">
          ${item.checkout_url ? `<a class="btn secondary small" href="${escapeHtml(item.checkout_url)}" target="_blank">Cobrança</a>` : ''}
          ${item.status !== 'paid' ? `<button class="btn success small" onclick="markPaymentPaid('${item.id}')">Marcar pago</button>` : ''}
          <button class="btn primary small" onclick="createInvoiceFromPayment('${item.id}')">Nota</button>
        </div></td>
      </tr>`;
  }).join('') : `<tr><td colspan="6"><div class="empty">Nenhum pagamento recorrente registrado.</div></td></tr>`;
}

function renderInvoices(){
  const rows = document.getElementById('invoiceRows');
  rows.innerHTML = invoices.length ? invoices.map(item => {
    const customer = customerById(item.customer_id);
    return `
      <tr>
        <td data-label="Cliente">${escapeHtml(customer?.name || item.customer_name || '-')}</td>
        <td data-label="Valor">${currency.format(Number(item.amount || 0))}</td>
        <td data-label="Status">${statusBadge(item.status)}</td>
        <td data-label="Número/Link">${escapeHtml(item.invoice_number || '-')} ${item.invoice_url ? `<br><a href="${escapeHtml(item.invoice_url)}" target="_blank">Abrir nota</a>` : ''}</td>
        <td data-label="Ações"><div class="actions">
          <button class="btn primary small" onclick="markInvoiceIssued('${item.id}')">Marcar emitida</button>
          <button class="btn danger small" onclick="removeInvoice('${item.id}')">Excluir</button>
        </div></td>
      </tr>`;
  }).join('') : `<tr><td colspan="5"><div class="empty">Nenhuma nota fiscal registrada.</div></td></tr>`;
}

window.togglePlan = async (id, active) => {
  await db.from('subscription_plans').update({ active }).eq('id', id).eq('barbershop_id', activeShop.id);
  await loadAll();
};

window.removePlan = async (id) => {
  if (!confirm('Excluir este plano?')) return;
  await db.from('subscription_plans').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  await loadAll();
};

window.cancelSubscription = async (id) => {
  if (!confirm('Cancelar assinatura?')) return;
  await db.from('customer_subscriptions').update({ status:'canceled', canceled_at: new Date().toISOString() }).eq('id', id).eq('barbershop_id', activeShop.id);
  showToast('Assinatura cancelada.', 'success');
  await loadAll();
};

window.createPayment = async (subscriptionId) => {
  const sub = subscriptionById(subscriptionId);
  if (!sub) return;

  try {
    showToast('Gerando cobrança recorrente...', 'info');
    const data = await callSecureFunction('create-recurring-payment', { subscriptionId });
    showToast(data?.message || 'Cobrança criada com sucesso.', 'success');
    await loadAll();
  } catch (err) {
    showToast(err.message || 'Não foi possível gerar a cobrança automática.', 'error');
  }
};

window.markPaymentPaid = async (paymentId) => {
  const { error } = await db.from('subscription_payments')
    .update({ status:'paid', paid_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('barbershop_id', activeShop.id);

  if (error) {
    showToast('Não foi possível marcar como pago.', 'error');
    return;
  }

  await createInvoiceFromPayment(paymentId, true);
  showToast('Pagamento marcado como pago e nota pendente criada.', 'success');
  await loadAll();
};

window.createInvoiceFromPayment = async (paymentId, silent = false) => {
  try {
    if (!silent) showToast('Solicitando emissão da nota fiscal...', 'info');
    const data = await callSecureFunction('issue-invoice', { paymentId });
    if (!silent) showToast(data?.message || 'Nota fiscal processada.', 'success');
    await loadAll();
  } catch (err) {
    if (!silent) showToast(err.message || 'Não foi possível emitir a nota fiscal.', 'error');
  }
};

window.markInvoiceIssued = async (id) => {
  const number = prompt('Número da nota fiscal emitida:', '');
  const url = prompt('Link da nota fiscal, se houver:', '');
  await db.from('fiscal_invoices')
    .update({ status:'issued', invoice_number: number || null, invoice_url: url || null, issued_at: new Date().toISOString() })
    .eq('id', id)
    .eq('barbershop_id', activeShop.id);
  showToast('Nota marcada como emitida.', 'success');
  await loadAll();
};

window.removeInvoice = async (id) => {
  if (!confirm('Excluir registro da nota?')) return;
  await db.from('fiscal_invoices').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  await loadAll();
};

(async () => {
  await requireAuth('Assinaturas', 'Planos recorrentes, cobranças e notas fiscais dos clientes');
  document.getElementById('subscription_start').value = todayISO();
  document.getElementById('subscription_next_billing').value = todayISO();
  await loadAll();
  await loadIntegrationSettings();

  const integrationForm = document.getElementById('integrationForm');
  if (integrationForm) {
    integrationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        barbershop_id: activeShop.id,
        payment_provider: document.getElementById('payment_provider').value,
        payment_api_key: document.getElementById('payment_api_key').value.trim() || null,
        fiscal_provider: document.getElementById('fiscal_provider').value,
        fiscal_api_key: document.getElementById('fiscal_api_key').value.trim() || null,
        fiscal_company_id: document.getElementById('fiscal_company_id').value.trim() || null,
        active: true
      };
      const { error } = await db.from('billing_integrations').upsert(payload, { onConflict: 'barbershop_id' });
      if (error) {
        showToast('Não foi possível salvar as integrações.', 'error');
        return;
      }
      document.getElementById('payment_api_key').value = '';
      document.getElementById('fiscal_api_key').value = '';
      showToast('Integrações salvas.', 'success');
    });
  }

  document.getElementById('planForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await db.from('subscription_plans').insert({
      barbershop_id: activeShop.id,
      name: document.getElementById('plan_name').value.trim(),
      price: Number(document.getElementById('plan_price').value || 0),
      billing_day: Number(document.getElementById('plan_billing_day').value || 10),
      description: document.getElementById('plan_description').value.trim(),
      active: true
    });
    if (error) {
      showToast('Não foi possível cadastrar o plano.', 'error');
      return;
    }
    e.target.reset();
    document.getElementById('plan_billing_day').value = 10;
    showToast('Plano recorrente cadastrado.', 'success');
    await loadAll();
  });

  document.getElementById('subscriptionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const customer = customerById(document.getElementById('subscription_customer_id').value);
    const plan = planById(document.getElementById('subscription_plan_id').value);
    if (!customer || !plan) {
      showToast('Selecione cliente e plano.', 'error');
      return;
    }

    const { error } = await db.from('customer_subscriptions').insert({
      barbershop_id: activeShop.id,
      customer_id: customer.id,
      plan_id: plan.id,
      customer_name: customer.name,
      plan_name: plan.name,
      status: 'active',
      start_date: document.getElementById('subscription_start').value,
      next_billing_date: document.getElementById('subscription_next_billing').value,
      checkout_url: null
    });

    if (error) {
      showToast('Não foi possível criar a assinatura.', 'error');
      return;
    }

    e.target.reset();
    document.getElementById('subscription_start').value = todayISO();
    document.getElementById('subscription_next_billing').value = todayISO();
    showToast('Assinatura ativada. Agora clique em Gerar cobrança para criar o link no Asaas.', 'success');
    await loadAll();
  });
})();
