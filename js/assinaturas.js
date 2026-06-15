
let customers = [];
let plans = [];
let subscriptions = [];
let payments = [];
let invoices = [];

function statusBadge(status){
  const normalized = String(status || '').toLowerCase();
  const cls = {
    active: 'ativo',
    inactive: 'inativo',
    canceled: 'cancelado',
    cancelled: 'cancelado',
    deleted: 'cancelado',
    pending: 'confirmado',
    open: 'confirmado',
    received: 'concluido',
    confirmed: 'concluido',
    paid: 'concluido',
    received_in_cash: 'concluido',
    overdue: 'cancelado',
    refunded: 'cancelado',
    issued: 'concluido',
    error: 'cancelado'
  }[normalized] || normalized;

  const label = {
    active: 'ativo',
    inactive: 'inativo',
    canceled: 'cancelado',
    cancelled: 'cancelado',
    deleted: 'cancelado',
    pending: 'em aberto',
    open: 'em aberto',
    received: 'pago',
    confirmed: 'pago',
    paid: 'pago',
    received_in_cash: 'pago',
    overdue: 'atrasado',
    refunded: 'estornado',
    issued: 'emitida',
    error: 'erro'
  }[normalized] || normalized || '-';

  return `<span class="badge ${cls}">${label}</span>`;
}

function fillSelect(el, items, firstLabel){
  el.innerHTML = `<option value="">${firstLabel}</option>` + items.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
}

function planById(id){ return plans.find(p => p.id === id); }
function customerById(id){ return customers.find(c => c.id === id); }
function subscriptionById(id){ return subscriptions.find(s => s.id === id); }

function paymentMethodLabel(value){
  return {
    PIX: 'Pix',
    CREDIT_CARD: 'Crédito',
    DEBIT_CARD: 'Débito',
    BOLETO: 'Boleto',
    UNDEFINED: 'Livre'
  }[value] || value || 'Pix';
}

function paymentStatusText(status){
  return {
    pending: 'em aberto',
    open: 'em aberto',
    paid: 'pago',
    received: 'pago',
    confirmed: 'pago',
    overdue: 'atrasado',
    canceled: 'cancelado',
    cancelled: 'cancelado',
    refunded: 'estornado',
    deleted: 'cancelado'
  }[String(status || '').toLowerCase()] || status || '-';
}


function normalizeBrazilPhone(value){
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

function buildPaymentShareMessage({ payment, customer, plan, shareData }){
  const customerName = String(customer?.name || payment?.customer_name || '').trim();
  const planName = String(plan?.name || payment?.plan_name || '').trim();
  const amountNumber = Number(payment?.amount || 0);
  const amount = currency.format(amountNumber);
  const dueValue = payment?.due_date || shareData?.dueDate || '';
  const due = dueValue ? dateBR(dueValue) : '';

  const paymentLink = shareData?.invoiceUrl || shareData?.bankSlipUrl || payment?.invoice_url || payment?.bank_slip_url || payment?.checkout_url || '';
  const pixPayload = shareData?.pixPayload || payment?.pix_payload || '';

  const hasBoleto = Boolean(shareData?.bankSlipUrl || payment?.bank_slip_url);
  const hasPix = Boolean(pixPayload);
  const tipo = hasBoleto ? 'boleto' : hasPix ? 'QR Code Pix' : 'link';

  const missing = [];
  if (!customerName) missing.push('nome do cliente');
  if (!planName) missing.push('nome do plano');
  if (!amountNumber) missing.push('valor');
  if (!due) missing.push('vencimento');
  if (!paymentLink && !pixPayload) missing.push('link, boleto ou Pix');

  if (missing.length) {
    throw new Error(`Não foi possível montar a mensagem. Falta: ${missing.join(', ')}.`);
  }

  const lines = [
    `Olá ${customerName}, este é o ${tipo} para pagamento do seu ${planName} no valor de ${amount} com vencimento em ${due}.`
  ];

  if (paymentLink) lines.push('', paymentLink);
  if (pixPayload) lines.push('', 'Pix copia e cola:', pixPayload);

  return lines.join('\n');
}

function openWhatsAppToCustomer(phone, message){
  const encoded = encodeURIComponent(message);
  const normalizedPhone = normalizeBrazilPhone(phone);
  const url = normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank');
}

function recurringLabel(item){
  const isRecurring = item?.is_recurring !== false;
  if (!isRecurring) return 'Não recorrente';
  return `A cada ${Number(item?.interval_days || 30)} dias`;
}

function updateIntervalVisibility(){
  const select = document.getElementById('subscription_is_recurring');
  const field = document.getElementById('subscriptionIntervalDaysField');
  if (!select || !field) return;
  const show = select.value === 'true';
  field.classList.toggle('hidden', !show);
  document.getElementById('subscription_interval_days').required = show;
}



async function callSecureFunction(name, body){
  const { data: { session } } = await db.auth.getSession();
  if (!session) throw new Error('Sessão expirada');

  const endpoint = `${window.NAVALHAOS_CONFIG.SUPABASE_URL}/functions/v1/${name}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.NAVALHAOS_CONFIG.SUPABASE_ANON_KEY
    },
    body: JSON.stringify(body || {})
  });

  let data = null;
  try { data = await response.json(); } catch (_) {}

  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Erro ${response.status} na função ${name}.`);
  }

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
  document.getElementById('pendingPayments').textContent = payments.filter(p => ['pending','open','overdue'].includes(String(p.status || '').toLowerCase())).length;
  document.getElementById('pendingInvoices').textContent = invoices.filter(i => i.status === 'pending' || i.status === 'error').length;
}

function renderPlans(){
  const rows = document.getElementById('planRows');
  rows.innerHTML = plans.length ? plans.map(item => `
    <tr>
      <td data-label="Plano">${escapeHtml(item.name)}<br><small>${escapeHtml(item.description || '')}</small></td>
      <td data-label="Valor">${currency.format(Number(item.price || 0))}</td>
      <td data-label="Dia base">Dia ${item.billing_day || '-'}</td>
      <td data-label="Status">${statusBadge(item.active ? 'active' : 'inactive')}</td>
      <td data-label="Ações"><div class="actions">
        <button class="btn secondary small" onclick="togglePlan('${item.id}', ${item.active ? 'false':'true'})">${item.active ? 'Inativar':'Ativar'}</button>
        <button class="btn danger small" onclick="removePlan('${item.id}')">Excluir</button>
      </div></td>
    </tr>`).join('') : `<tr><td colspan="5"><div class="empty">Nenhum plano cadastrado.</div></td></tr>`;
}

function renderSubscriptions(){
  const rows = document.getElementById('subscriptionRows');
  rows.innerHTML = subscriptions.length ? subscriptions.map(item => {
    const plan = planById(item.plan_id);
    const customer = customerById(item.customer_id);
    return `
      <tr>
        <td data-label="Cliente">${escapeHtml(customer?.name || item.customer_name || '-')}</td>
        <td data-label="Plano">${escapeHtml(plan?.name || item.plan_name || '-')}<br>${statusBadge(item.status)}</td>
        <td data-label="Método">${paymentMethodLabel(item.payment_method || plan?.payment_method || 'PIX')}</td>
        <td data-label="Tipo">${recurringLabel(item)}</td>
        <td data-label="Próxima cobrança">${dateBR(item.next_billing_date)}</td>
        <td data-label="Ações"><div class="actions">
          ${item.checkout_url ? `<button class="btn primary small" onclick="sendSubscriptionWhatsApp('${item.id}')">Enviar por WhatsApp</button>` : ''}
          <button class="btn primary small" onclick="createPayment('${item.id}')">Gerar cobrança</button>
          <button class="btn danger small" onclick="cancelSubscription('${item.id}')">Cancelar</button>
        </div></td>
      </tr>`;
  }).join('') : `<tr><td colspan="6"><div class="empty">Nenhuma assinatura/cobrança ativa.</div></td></tr>`;
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
        <td data-label="Método">${paymentMethodLabel(item.payment_method || plan?.payment_method || 'PIX')}</td>
        <td data-label="Vencimento">${dateBR(item.due_date)}</td>
        <td data-label="Valor">${currency.format(Number(item.amount || 0))}</td>
        <td data-label="Status">${statusBadge(item.status)}${item.asaas_status ? `<br><small>Asaas: ${escapeHtml(item.asaas_status)}</small>` : ''}${item.status_checked_at ? `<br><small>Atualizado: ${new Date(item.status_checked_at).toLocaleString('pt-BR')}</small>` : ''}</td>
        <td data-label="Ações"><div class="actions">
          <button class="btn primary small" onclick="sendPaymentWhatsApp('${item.id}')">Enviar por WhatsApp</button>
          <button class="btn secondary small" onclick="syncPaymentStatus('${item.id}')">Atualizar status</button>
          ${!['paid','received','confirmed','canceled','cancelled','deleted'].includes(String(item.status || '').toLowerCase()) ? `<button class="btn danger small" onclick="cancelPayment('${item.id}')">Cancelar cobrança</button>` : ''}
          ${!['paid','received','confirmed'].includes(String(item.status || '').toLowerCase()) ? `<button class="btn success small" onclick="markPaymentPaid('${item.id}')">Marcar pago</button>` : ''}
          <button class="btn primary small" onclick="createInvoiceFromPayment('${item.id}')">Nota</button>
        </div></td>
      </tr>`;
  }).join('') : `<tr><td colspan="7"><div class="empty">Nenhum pagamento registrado.</div></td></tr>`;
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
  if (!confirm('Cancelar esta assinatura? Se ela já existir no Asaas, as cobranças pendentes/vencidas da assinatura também serão canceladas.')) return;

  try {
    showToast('Cancelando assinatura no Asaas...', 'info');
    const data = await callSecureFunction('cancel-subscription', { subscriptionId: id });
    showToast(data?.message || 'Assinatura cancelada.', 'success');
    await loadAll();
  } catch (err) {
    showToast(err.message || 'Não foi possível cancelar a assinatura.', 'error');
  }
};

window.createPayment = async (subscriptionId) => {
  if (!subscriptionId || subscriptionId === 'undefined' || subscriptionId === 'null') {
    showToast('ID da assinatura não foi encontrado na tela. Atualize a página e tente novamente.', 'error');
    return;
  }

  const sub = subscriptionById(subscriptionId);
  const plan = planById(sub?.plan_id);
  const customer = customerById(sub?.customer_id);

  try {
    showToast('Gerando cobrança recorrente...', 'info');
    const data = await callSecureFunction('create-recurring-payment', {
      subscriptionId,
      barbershopId: activeShop.id,
      customerId: sub?.customer_id || null,
      planId: sub?.plan_id || null,
      customerName: customer?.name || sub?.customer_name || null,
      planName: plan?.name || sub?.plan_name || null,
      paymentMethod: sub?.payment_method || 'PIX',
      isRecurring: sub?.is_recurring !== false,
      intervalDays: Number(sub?.interval_days || 30)
    });
    showToast(data?.message || 'Cobrança criada com sucesso.', 'success');
    await loadAll();
  } catch (err) {
    showToast(err.message || 'Não foi possível gerar a cobrança automática.', 'error');
  }
};

window.sendSubscriptionWhatsApp = async (subscriptionId) => {
  const sub = subscriptionById(subscriptionId);
  if (!sub) {
    showToast('Assinatura não encontrada na tela.', 'error');
    return;
  }

  const relatedPayments = payments
    .filter(p => p.subscription_id === subscriptionId)
    .sort((a, b) => String(b.created_at || b.due_date || '').localeCompare(String(a.created_at || a.due_date || '')));

  if (relatedPayments.length) {
    return sendPaymentWhatsApp(relatedPayments[0].id);
  }

  const customer = customerById(sub.customer_id);
  const plan = planById(sub.plan_id);
  const fakePayment = {
    id: '',
    subscription_id: sub.id,
    customer_id: sub.customer_id,
    plan_id: sub.plan_id,
    customer_name: customer?.name || sub.customer_name,
    plan_name: plan?.name || sub.plan_name,
    amount: Number(plan?.price || 0),
    due_date: sub.next_billing_date,
    payment_method: sub.payment_method,
    checkout_url: sub.checkout_url
  };

  try {
    const message = buildPaymentShareMessage({
      payment: fakePayment,
      customer,
      plan,
      shareData: {
        invoiceUrl: sub.checkout_url,
        dueDate: sub.next_billing_date
      }
    });
    openWhatsAppToCustomer(customer?.phone || '', message);
    showToast('WhatsApp aberto com a mensagem pronta.', 'success');
  } catch (err) {
    showToast(err.message || 'Não foi possível montar a mensagem da cobrança.', 'error');
  }
};

window.sendPaymentWhatsApp = async (paymentId) => {
  const payment = payments.find(p => p.id === paymentId);
  if (!payment) {
    showToast('Cobrança não encontrada na tela.', 'error');
    return;
  }

  const sub = subscriptionById(payment.subscription_id);
  const customer = customerById(payment.customer_id || sub?.customer_id);
  const plan = planById(payment.plan_id || sub?.plan_id);

  try {
    showToast('Preparando mensagem para WhatsApp...', 'info');
    const data = await callSecureFunction('get-payment-share-data', { paymentId });
    const shareData = data?.share || {};
    const updatedPayment = data?.payment || payment;
    const message = buildPaymentShareMessage({ payment: updatedPayment, customer, plan, shareData });

    if (shareData?.pixPayload) {
      try { await navigator.clipboard.writeText(shareData.pixPayload); } catch (_) {}
    }

    openWhatsAppToCustomer(customer?.phone || payment?.customer_phone || '', message);
    showToast(shareData?.pixPayload ? 'WhatsApp aberto com a mensagem pronta. Pix copia e cola também foi copiado.' : 'WhatsApp aberto com a mensagem pronta.', 'success');
    await loadAll();
  } catch (err) {
    try {
      const fallbackMessage = buildPaymentShareMessage({ payment, customer, plan, shareData: { invoiceUrl: payment.invoice_url || payment.bank_slip_url || payment.checkout_url, pixPayload: payment.pix_payload, dueDate: payment.due_date } });
      openWhatsAppToCustomer(customer?.phone || payment?.customer_phone || '', fallbackMessage);
      showToast('WhatsApp aberto com os dados disponíveis da cobrança.', 'success');
    } catch (fallbackErr) {
      showToast(err.message || fallbackErr.message || 'Não foi possível montar a mensagem com os dados reais da cobrança.', 'error');
    }
  }
};

window.cancelPayment = async (paymentId) => {
  const payment = payments.find(p => p.id === paymentId);
  if (!payment) {
    showToast('Cobrança não encontrada na tela.', 'error');
    return;
  }

  if (['paid','received','confirmed'].includes(String(payment.status || '').toLowerCase())) {
    showToast('Cobrança paga não deve ser cancelada pelo sistema.', 'error');
    return;
  }

  if (!confirm('Cancelar esta cobrança? Ela será cancelada de fato no Asaas quando houver ID externo.')) return;

  try {
    showToast('Cancelando cobrança no Asaas...', 'info');
    const data = await callSecureFunction('cancel-payment', { paymentId });
    showToast(data?.message || 'Cobrança cancelada.', 'success');
    await loadAll();
  } catch (err) {
    showToast(err.message || 'Não foi possível cancelar a cobrança.', 'error');
  }
};

window.syncPaymentStatus = async (paymentId) => {
  try {
    showToast('Consultando status no Asaas...', 'info');
    const data = await callSecureFunction('sync-payment-status', { paymentId });
    showToast(data?.message || 'Status atualizado.', 'success');
    await loadAll();
  } catch (err) {
    showToast(err.message || 'Não foi possível atualizar o status.', 'error');
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
  await requireAuth('Assinaturas', 'Planos, cobranças avulsas ou recorrentes e notas fiscais dos clientes');
  document.getElementById('subscription_start').value = todayISO();
  document.getElementById('subscription_next_billing').value = todayISO();
  await loadAll();
  await loadIntegrationSettings();
  document.getElementById('subscription_is_recurring')?.addEventListener('change', updateIntervalVisibility);
  updateIntervalVisibility();

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
      payment_method: document.getElementById('subscription_payment_method').value,
      is_recurring: document.getElementById('subscription_is_recurring').value === 'true',
      interval_days: document.getElementById('subscription_is_recurring').value === 'true' ? Number(document.getElementById('subscription_interval_days').value || 30) : null,
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
    document.getElementById('subscription_payment_method').value = 'PIX';
    document.getElementById('subscription_is_recurring').value = 'true';
    document.getElementById('subscription_interval_days').value = 30;
    updateIntervalVisibility();
    document.getElementById('subscription_start').value = todayISO();
    document.getElementById('subscription_next_billing').value = todayISO();
    showToast('Assinatura ativada. Agora clique em Gerar cobrança para criar o link no Asaas.', 'success');
    await loadAll();
  });
})();
