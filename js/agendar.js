
let shop = null;
let services = [];
let units = [];
let barbers = [];
let barberServices = [];
let selectedSlot = '';

const params = new URLSearchParams(location.search);
const pathParts = location.pathname.split('/').filter(Boolean);
const slug = params.get('slug') || (pathParts[0] === 'agenda' ? decodeURIComponent(pathParts[1] || '') : '');

function timeToMinutes(t){
  const [h,m] = String(t).slice(0,5).split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(min){
  return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
}
function addMinutes(time, minutes){
  return minutesToTime(timeToMinutes(time) + Number(minutes || 30));
}
function overlaps(startA, endA, startB, endB){
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB);
}
function weekdayFromDate(dateValue){
  return new Date(dateValue + 'T00:00:00').getDay();
}

function updateBookingAddress(unitId){
  const addressEl = document.getElementById('shopAddress');
  if (!addressEl) return;
  const unit = units.find(u => u.id === unitId);
  const address = unit?.address || shop?.address || '';
  addressEl.textContent = address ? `📍 ${address}` : '';
  addressEl.classList.toggle('hidden', !address);
}

function barberCanDoService(barberId, serviceId){
  if (!serviceId) return true;
  if (!barberServices.length) return true;
  return barberServices.some(link => link.barber_id === barberId && link.service_id === serviceId);
}

function updatePublicBarberOptions(){
  const unitId = document.getElementById('unit_id').value;
  const serviceId = document.getElementById('service_id').value;
  updateBookingAddress(unitId);
  const filtered = unitId
    ? barbers.filter(b => b.unit_id === unitId && barberCanDoService(b.id, serviceId))
    : [];
  document.getElementById('barber_id').innerHTML =
    '<option value="">Escolha o profissional</option>' +
    filtered.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
}


function isUUIDValue(value){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function slugifyPublicValue(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isBeforeMinimumAdvance(dateValue, timeValue){
  const minutes = Number(shop?.booking_min_advance_minutes || 0);
  if (!minutes) return false;
  const minDate = new Date(Date.now() + minutes * 60000);
  const slotDate = new Date(`${dateValue}T${timeValue}:00`);
  return slotDate < minDate;
}


async function initBooking(){
  if (!slug) {
    document.getElementById('bookingCard').innerHTML = '<div class="success-panel"><h2>Link inválido</h2><p>Confira o link recebido.</p></div>';
    return;
  }

  let shopData = null;
  let shopError = null;

  let directLookup;
  if (isUUIDValue(slug)) {
    directLookup = await db
      .from('barbershops')
      .select('id,name,address,active,subscription_status,slug,booking_min_advance_minutes')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .eq('active', true)
      .eq('subscription_status', 'active')
      .maybeSingle();
  } else {
    directLookup = await db
      .from('barbershops')
      .select('id,name,address,active,subscription_status,slug,booking_min_advance_minutes')
      .eq('slug', slug)
      .eq('active', true)
      .eq('subscription_status', 'active')
      .maybeSingle();
  }

  shopData = directLookup.data;
  shopError = directLookup.error;

  const fallbackLookup = await db
    .from('barbershops')
    .select('id,name,address,active,subscription_status,slug,booking_min_advance_minutes')
    .eq('active', true)
    .eq('subscription_status', 'active');

  if (!shopData && !fallbackLookup.error) {
    const normalizedSlug = slugifyPublicValue(slug).replace(/^barbearia-/, '');
    shopData = (fallbackLookup.data || []).find(item => {
      const itemSlug = slugifyPublicValue(item.slug || '');
      const itemName = slugifyPublicValue(item.name || '');
      const itemNameNoPrefix = itemName.replace(/^barbearia-/, '');
      return (
        itemSlug === slugifyPublicValue(slug) ||
        itemName === slugifyPublicValue(slug) ||
        itemNameNoPrefix === normalizedSlug ||
        itemSlug === normalizedSlug
      );
    });
  }

  if ((shopError && !shopData) || !shopData) {
    document.getElementById('bookingCard').innerHTML = '<div class="success-panel"><h2>Agenda indisponível</h2><p>Confira o link recebido ou fale com a barbearia.</p></div>';
    return;
  }

  shop = shopData;
  document.getElementById('shopTitle').textContent = shop.name;
  const shopAddressEl = document.getElementById('shopAddress');
  if (shopAddressEl) {
    shopAddressEl.textContent = shop.address ? `📍 ${shop.address}` : '';
    shopAddressEl.classList.toggle('hidden', !shop.address);
  }

  const [unitsRes, servicesRes, barbersRes, barberServicesRes] = await Promise.all([
    db.from('units').select('*').eq('barbershop_id', shop.id).eq('active', true).order('name'),
    db.from('services').select('*').eq('barbershop_id', shop.id).eq('active', true).order('name'),
    db.from('barbers').select('*').eq('barbershop_id', shop.id).eq('active', true).order('name'),
    db.from('barber_services').select('*').eq('barbershop_id', shop.id)
  ]);

  units = unitsRes.data || [];
  services = servicesRes.data || [];
  barbers = barbersRes.data || [];
  barberServices = barberServicesRes.data || [];

  document.getElementById('unit_id').innerHTML =
    '<option value="">Escolha a unidade</option>' +
    units.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');

  document.getElementById('service_id').innerHTML =
    '<option value="">Escolha o serviço</option>' +
    services.map(s => `<option value="${s.id}">${escapeHtml(s.name)} - ${currency.format(Number(s.price || 0))}</option>`).join('');

  document.getElementById('barber_id').innerHTML = '<option value="">Escolha a unidade primeiro</option>';

  document.getElementById('appointment_date').value = todayISO();
  document.getElementById('appointment_date').min = todayISO();

  document.getElementById('unit_id').addEventListener('change', () => {
    updatePublicBarberOptions();
    selectedSlot = '';
    renderSlots();
  });
  document.getElementById('service_id').addEventListener('change', () => {
    updatePublicBarberOptions();
    selectedSlot = '';
    renderSlots();
  });
  document.getElementById('barber_id').addEventListener('change', renderSlots);
  document.getElementById('appointment_date').addEventListener('change', renderSlots);

  renderSlots();
}

async function getBookedSlots(barberId, date){
  const { data, error } = await db.rpc('get_public_booked_slots', {
    target_barbershop_id: shop.id,
    target_barber_id: barberId,
    target_date: date
  });
  if (error) {
    showToast('Não foi possível carregar os horários ocupados.', 'error');
    return [];
  }
  return data || [];
}

async function renderSlots(){
  selectedSlot = '';
  const unitId = document.getElementById('unit_id').value;
  const serviceId = document.getElementById('service_id').value;
  const barberId = document.getElementById('barber_id').value;
  const date = document.getElementById('appointment_date').value;
  const slotsEl = document.getElementById('slots');

  if (!unitId || !serviceId || !barberId || !date) {
    slotsEl.innerHTML = '<div class="empty" style="grid-column:1/-1">Escolha unidade, serviço, barbeiro e data.</div>';
    return;
  }

  const service = services.find(s => s.id === serviceId);
  const duration = Number(service?.duration_minutes || 30);
  const weekday = weekdayFromDate(date);

  const [availabilityRes, specialRes, booked, blockRes] = await Promise.all([
    db.from('barber_availability')
      .select('*')
      .eq('barbershop_id', shop.id)
      .eq('barber_id', barberId)
      .eq('weekday', weekday)
      .eq('active', true),
    db.from('special_day_hours')
      .select('*')
      .eq('barbershop_id', shop.id)
      .eq('barber_id', barberId)
      .eq('special_date', date)
      .maybeSingle(),
    getBookedSlots(barberId, date),
    db.from('schedule_blocks')
      .select('*')
      .eq('barbershop_id', shop.id)
      .eq('block_date', date)
      .or(`barber_id.eq.${barberId},barber_id.is.null`)
  ]);

  const specialDay = specialRes.data || null;
  if (specialDay?.closed) {
    slotsEl.innerHTML = '<div class="empty" style="grid-column:1/-1">A barbearia não abrirá com este barbeiro nesta data.</div>';
    return;
  }

  const availabilities = specialDay
    ? [{
        start_time: specialDay.start_time,
        end_time: specialDay.end_time,
        break_start: specialDay.break_start,
        break_end: specialDay.break_end
      }]
    : (availabilityRes.data || []);
  const blocks = blockRes.data || [];

  if (!availabilities.length) {
    slotsEl.innerHTML = '<div class="empty" style="grid-column:1/-1">Este barbeiro não possui horários disponíveis nesta data.</div>';
    return;
  }

  const takenRanges = booked.map(i => ({
    start: String(i.start_time).slice(0,5),
    end: i.end_time ? String(i.end_time).slice(0,5) : addMinutes(String(i.start_time).slice(0,5), duration)
  }));

  const blockRanges = blocks.map(b => ({
    start: b.start_time ? String(b.start_time).slice(0,5) : '00:00',
    end: b.end_time ? String(b.end_time).slice(0,5) : '23:59'
  }));

  const slotSet = new Set();

  availabilities.forEach(av => {
    const start = timeToMinutes(av.start_time);
    const end = timeToMinutes(av.end_time);
    for (let m = start; m + duration <= end; m += 30) {
      const slotStart = minutesToTime(m);
      const slotEnd = minutesToTime(m + duration);

      if (isBeforeMinimumAdvance(date, slotStart)) continue;
      if (av.break_start && av.break_end && overlaps(slotStart, slotEnd, av.break_start, av.break_end)) continue;
      if (takenRanges.some(r => overlaps(slotStart, slotEnd, r.start, r.end))) continue;
      if (blockRanges.some(r => overlaps(slotStart, slotEnd, r.start, r.end))) continue;

      slotSet.add(slotStart);
    }
  });

  const slots = Array.from(slotSet).sort();
  if (!slots.length) {
    slotsEl.innerHTML = '<div class="empty" style="grid-column:1/-1">Não há horários livres para esta data.</div>';
    return;
  }

  slotsEl.innerHTML = slots.map(time => `<button type="button" class="slot" data-time="${time}">${time}</button>`).join('');

  document.querySelectorAll('.slot').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.slot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSlot = btn.dataset.time;
    });
  });
}

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!selectedSlot) {
    showToast('Escolha um horário disponível.', 'error');
    return;
  }

  const service = services.find(s => s.id === document.getElementById('service_id').value);
  const barber = barbers.find(b => b.id === document.getElementById('barber_id').value);
  const customerName = document.getElementById('customer_name').value.trim();
  const customerPhone = document.getElementById('customer_phone').value.trim();
  const appointmentDate = document.getElementById('appointment_date').value;

  if (!service || !barber || !customerName || !customerPhone) {
    showToast('Preencha todos os campos para confirmar.', 'error');
    return;
  }

  await db.from('customers').insert({
    barbershop_id: shop.id,
    name: customerName,
    phone: customerPhone
  });

  
  if (isBeforeMinimumAdvance(appointmentDate, selectedSlot)) {
    showToast('Esse horário está muito próximo. Escolha um horário com mais antecedência.', 'error');
    await renderSlots();
    return;
  }

  const booked = await getBookedSlots(barber.id, appointmentDate);
  const duration = Number(service.duration_minutes || 30);
  const selectedEnd = addMinutes(selectedSlot, duration);
  const conflict = booked.some(i => {
    const start = String(i.start_time).slice(0,5);
    const end = i.end_time ? String(i.end_time).slice(0,5) : addMinutes(start, duration);
    return overlaps(selectedSlot, selectedEnd, start, end);
  });

  if (conflict) {
    showToast('Esse horário acabou de ser preenchido. Escolha outro.', 'error');
    await renderSlots();
    return;
  }

  const { error } = await db.from('appointments').insert({
    barbershop_id: shop.id,
    customer_id: null,
    unit_id: document.getElementById('unit_id').value || null,
    barber_id: barber.id,
    service_id: service.id,
    customer_name: customerName,
    customer_phone: customerPhone,
    service_name: service.name,
    barber_name: barber.name,
    appointment_date: appointmentDate,
    start_time: selectedSlot,
    end_time: selectedEnd,
    price: Number(service.price || 0),
    commission_percent: service.commission_percent != null ? Number(service.commission_percent) : Number(barber.commission_percent || 0),
    status: 'marcado'
  });

  if (error) {
    showToast('Não foi possível confirmar. Tente novamente.', 'error');
    return;
  }

  document.getElementById('bookingCard').innerHTML = `
    <div class="success-panel">
      <h2>Horário confirmado</h2>
      <p>${escapeHtml(customerName)}, seu horário foi marcado para ${dateBR(appointmentDate)} às ${selectedSlot}.</p>
      <p>${escapeHtml(service.name)} com ${escapeHtml(barber.name)}</p>
    </div>
  `;
});

initBooking();
