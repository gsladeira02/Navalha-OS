
let shop = null;
let services = [];
let barbers = [];
let selectedSlot = '';
const params = new URLSearchParams(location.search);
const slug = params.get('slug');

function timeToMinutes(t){ const [h,m] = String(t).slice(0,5).split(':').map(Number); return h*60+m; }
function minutesToTime(min){ return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`; }
function addMinutes(time, minutes){ return minutesToTime(timeToMinutes(time) + Number(minutes || 30)); }

async function initBooking(){
  if (!slug) {
    document.getElementById('bookingCard').innerHTML = '<div class="success-panel"><h2>Link inválido</h2><p>Confira o link recebido.</p></div>';
    return;
  }
  const { data: shopData } = await db.from('barbershops').select('id,name,active,subscription_status,slug').eq('slug', slug).eq('active', true).eq('subscription_status', 'active').maybeSingle();
  if (!shopData) {
    document.getElementById('bookingCard').innerHTML = '<div class="success-panel"><h2>Agenda indisponível</h2><p>Confira o link recebido.</p></div>';
    return;
  }
  shop = shopData;
  document.getElementById('shopTitle').textContent = shop.name;
  const [servicesRes, barbersRes] = await Promise.all([
    db.from('services').select('*').eq('barbershop_id', shop.id).eq('active', true).order('name'),
    db.from('barbers').select('*').eq('barbershop_id', shop.id).eq('active', true).order('name')
  ]);
  services = servicesRes.data || [];
  barbers = barbersRes.data || [];
  document.getElementById('service_id').innerHTML = '<option value="">Escolha o serviço</option>' + services.map(s => `<option value="${s.id}">${escapeHtml(s.name)} - ${currency.format(Number(s.price || 0))}</option>`).join('');
  document.getElementById('barber_id').innerHTML = '<option value="">Escolha o barbeiro</option>' + barbers.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
  document.getElementById('appointment_date').value = todayISO();
  document.getElementById('appointment_date').min = todayISO();
  document.getElementById('service_id').addEventListener('change', renderSlots);
  document.getElementById('barber_id').addEventListener('change', renderSlots);
  document.getElementById('appointment_date').addEventListener('change', renderSlots);
  renderSlots();
}

async function renderSlots(){
  selectedSlot = '';
  const serviceId = document.getElementById('service_id').value;
  const barberId = document.getElementById('barber_id').value;
  const date = document.getElementById('appointment_date').value;
  const slotsEl = document.getElementById('slots');
  if (!serviceId || !barberId || !date) {
    slotsEl.innerHTML = '<div class="empty" style="grid-column:1/-1">Escolha serviço, barbeiro e data.</div>';
    return;
  }
  const { data: booked } = await db.from('appointments').select('start_time,status').eq('barbershop_id', shop.id).eq('barber_id', barberId).eq('appointment_date', date).in('status', ['marcado','confirmado','concluido']);
  const taken = new Set((booked || []).map(i => String(i.start_time).slice(0,5)));
  let html = '';
  for (let m = 8*60; m <= 20*60; m += 30) {
    const time = minutesToTime(m);
    html += `<button type="button" class="slot" ${taken.has(time) ? 'disabled' : ''} data-time="${time}">${time}</button>`;
  }
  slotsEl.innerHTML = html;
  document.querySelectorAll('.slot:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.slot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSlot = btn.dataset.time;
    });
  });
}

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedSlot) { alert('Escolha um horário disponível.'); return; }
  const service = services.find(s => s.id === document.getElementById('service_id').value);
  const barber = barbers.find(b => b.id === document.getElementById('barber_id').value);
  const customerName = document.getElementById('customer_name').value.trim();
  const customerPhone = document.getElementById('customer_phone').value.trim();
  const appointmentDate = document.getElementById('appointment_date').value;
  const { data: existingCustomer } = await db.from('customers').select('id').eq('barbershop_id', shop.id).eq('phone', customerPhone).maybeSingle();
  let customerId = existingCustomer?.id || null;
  if (!customerId) {
    const { data: newCustomer } = await db.from('customers').insert({ barbershop_id: shop.id, name: customerName, phone: customerPhone }).select('id').single();
    customerId = newCustomer?.id || null;
  }
  const { data: conflict } = await db.from('appointments').select('id').eq('barbershop_id', shop.id).eq('barber_id', barber.id).eq('appointment_date', appointmentDate).eq('start_time', selectedSlot).in('status', ['marcado','confirmado','concluido']);
  if ((conflict || []).length) { alert('Esse horário acabou de ser preenchido. Escolha outro.'); await renderSlots(); return; }
  const { error } = await db.from('appointments').insert({
    barbershop_id: shop.id, customer_id: customerId, barber_id: barber.id, service_id: service.id,
    customer_name: customerName, customer_phone: customerPhone, service_name: service.name, barber_name: barber.name,
    appointment_date: appointmentDate, start_time: selectedSlot, end_time: addMinutes(selectedSlot, service.duration_minutes || 30),
    price: Number(service.price || 0), commission_percent: service.commission_percent != null ? Number(service.commission_percent) : Number(barber.commission_percent || 0),
    status: 'marcado'
  });
  if (error) { alert('Não foi possível confirmar. Tente novamente.'); return; }
  document.getElementById('bookingCard').innerHTML = `<div class="success-panel"><h2>Horário confirmado</h2><p>${escapeHtml(customerName)}, seu horário foi marcado para ${dateBR(appointmentDate)} às ${selectedSlot}.</p><p>${escapeHtml(service.name)} com ${escapeHtml(barber.name)}</p></div>`;
});
initBooking();
