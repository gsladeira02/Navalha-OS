let customers = [];
let barbers = [];
let services = [];

function fillSelect(el, items, firstLabel){
  el.innerHTML = [`<option value="">${firstLabel}</option>`].concat(items.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`)).join('');
}

async function loadRefs(){
  const [c,b,s] = await Promise.all([
    db.from('customers').select('*').eq('barbershop_id', activeShop.id).order('name'),
    db.from('barbers').select('*').eq('barbershop_id', activeShop.id).eq('active', true).order('name'),
    db.from('services').select('*').eq('barbershop_id', activeShop.id).eq('active', true).order('name')
  ]);
  customers = c.data || [];
  barbers = b.data || [];
  services = s.data || [];
  fillSelect(document.getElementById('customer_id'), customers, 'Selecionar cliente');
  fillSelect(document.getElementById('barber_id'), barbers, 'Selecionar barbeiro');
  fillSelect(document.getElementById('service_id'), services, 'Selecionar serviço');
}

async function loadAppointments(){
  const filterDate = document.getElementById('filterDate').value || todayISO();
  const { data } = await db.from('appointments').select('*').eq('barbershop_id', activeShop.id).eq('appointment_date', filterDate).order('start_time');
  const items = data || [];
  const rows = document.getElementById('rows');
  rows.innerHTML = items.length ? items.map(item => `
    <tr>
      <td data-label="Hora">${item.start_time?.slice(0,5) || '-'}</td>
      <td data-label="Cliente">${escapeHtml(item.customer_name || '-')}</td>
      <td data-label="Barbeiro">${escapeHtml(item.barber_name || '-')}</td>
      <td data-label="Serviço">${escapeHtml(item.service_name || '-')}</td>
      <td data-label="Status">${badge(item.status)}</td>
      <td data-label="Valor">${currency.format(Number(item.price || 0))}</td>
      <td data-label="Ações"><div class="actions">${item.status !== 'concluido' ? `<button class="btn success small" onclick="completeAppointment('${item.id}')">Concluir</button>`:''}${item.status !== 'cancelado' ? `<button class="btn secondary small" onclick="cancelAppointment('${item.id}')">Cancelar</button>`:''}<button class="btn danger small" onclick="removeAppointment('${item.id}')">Excluir</button></div></td>
    </tr>`).join('') : `<tr><td colspan="7"><div class="empty">Nenhum horário nesta data.</div></td></tr>`;
}

window.removeAppointment = async (id) => {
  if (!confirm('Excluir horário?')) return;
  await db.from('appointments').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  loadAppointments();
};

window.cancelAppointment = async (id) => {
  await db.from('appointments').update({ status: 'cancelado' }).eq('id', id).eq('barbershop_id', activeShop.id);
  loadAppointments();
};

window.completeAppointment = async (id) => {
  const payment_method = prompt('Forma de pagamento: pix, dinheiro, cartao ou outro', 'pix');
  if (!payment_method) return;
  const { data: item } = await db.from('appointments').select('*').eq('id', id).eq('barbershop_id', activeShop.id).single();
  await db.from('appointments').update({ status: 'concluido', payment_method }).eq('id', id).eq('barbershop_id', activeShop.id);
  await db.from('cash_entries').insert({
    barbershop_id: activeShop.id,
    appointment_id: id,
    type: 'entrada',
    description: `Atendimento - ${item.service_name || 'Serviço'}`,
    amount: Number(item.price || 0),
    payment_method,
    entry_date: item.appointment_date
  });
  loadAppointments();
};

(async () => {
  await requireAuth('Agenda', 'Controle de horários da barbearia');
  document.getElementById('appointment_date').value = todayISO();
  document.getElementById('filterDate').value = todayISO();
  await loadRefs();
  await loadAppointments();

  document.getElementById('customer_id').addEventListener('change', (e) => {
    const item = customers.find(c => c.id === e.target.value);
    document.getElementById('customer_name').value = item?.name || '';
    document.getElementById('customer_phone').value = item?.phone || '';
  });

  document.getElementById('service_id').addEventListener('change', (e) => {
    const item = services.find(s => s.id === e.target.value);
    if (!item) return;
    document.getElementById('price').value = Number(item.price || 0);
    const start = document.getElementById('start_time').value;
    if (start) {
      const [h,m] = start.split(':').map(Number);
      const end = new Date(0,0,0,h,m + Number(item.duration_minutes || 0));
      document.getElementById('end_time').value = `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
    }
  });

  document.getElementById('start_time').addEventListener('change', () => {
    const item = services.find(s => s.id === document.getElementById('service_id').value);
    if (!item) return;
    const [h,m] = document.getElementById('start_time').value.split(':').map(Number);
    const end = new Date(0,0,0,h,m + Number(item.duration_minutes || 0));
    document.getElementById('end_time').value = `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
  });

  document.getElementById('filterDate').addEventListener('change', loadAppointments);

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const barber = barbers.find(i => i.id === document.getElementById('barber_id').value);
    const service = services.find(i => i.id === document.getElementById('service_id').value);
    const customerId = document.getElementById('customer_id').value || null;
    const date = document.getElementById('appointment_date').value;
    const startTime = document.getElementById('start_time').value;

    const { data: conflict } = await db.from('appointments').select('id').eq('barbershop_id', activeShop.id).eq('barber_id', barber?.id || '').eq('appointment_date', date).eq('start_time', startTime).neq('status','cancelado');
    if ((conflict || []).length) { showToast('Já existe um horário neste horário para este barbeiro.', 'error'); return; }

    await db.from('appointments').insert({
      barbershop_id: activeShop.id,
      customer_id: customerId,
      barber_id: barber?.id || null,
      service_id: service?.id || null,
      customer_name: document.getElementById('customer_name').value.trim(),
      customer_phone: document.getElementById('customer_phone').value.trim(),
      service_name: service?.name || '',
      barber_name: barber?.name || '',
      appointment_date: date,
      start_time: startTime,
      end_time: document.getElementById('end_time').value || null,
      price: Number(document.getElementById('price').value || 0),
      status: document.getElementById('status').value,
      notes: document.getElementById('notes').value.trim(),
      commission_percent: service?.commission_percent != null ? Number(service.commission_percent) : Number(barber?.commission_percent || 0)
    });
    e.target.reset();
    document.getElementById('appointment_date').value = todayISO();
    showToast('Horário salvo.', 'success');
    loadAppointments();
  });
})();
