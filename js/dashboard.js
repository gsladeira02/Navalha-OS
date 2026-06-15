(async () => {
  await requireAuth('Dashboard', 'Acompanhe sua operação e compartilhe a agenda online da barbearia');
  const shopId = activeShop.id;
  setupBookingShare();
  const today = todayISO();
  const monthStart = today.slice(0, 8) + '01';

  const [cashRes, appointmentsRes, customersRes, barbersRes, servicesRes] = await Promise.all([
    db.from('cash_entries').select('*').eq('barbershop_id', shopId),
    db.from('appointments').select('*').eq('barbershop_id', shopId),
    db.from('customers').select('id').eq('barbershop_id', shopId),
    db.from('barbers').select('id').eq('barbershop_id', shopId).eq('active', true),
    db.from('services').select('id').eq('barbershop_id', shopId).eq('active', true)
  ]);

  const cash = cashRes.data || [];
  const appointments = appointmentsRes.data || [];
  const todayCash = cash.filter(i => i.entry_date === today && i.type === 'entrada');
  const monthCash = cash.filter(i => i.entry_date >= monthStart && i.type === 'entrada');
  const todayAppts = appointments.filter(i => i.appointment_date === today);
  const todayDone = todayAppts.filter(i => i.status === 'concluido');
  const todayRevenueValue = currency.format(todayCash.reduce((s,i)=>s+Number(i.amount||0),0));

  document.getElementById('todayRevenue').textContent = todayRevenueValue;
  document.getElementById('todayRevenueHero').textContent = todayRevenueValue;
  document.getElementById('monthRevenue').textContent = currency.format(monthCash.reduce((s,i)=>s+Number(i.amount||0),0));
  document.getElementById('todayAppointments').textContent = todayAppts.length;
  document.getElementById('doneToday').textContent = todayDone.length;
  document.getElementById('customersCount').textContent = (customersRes.data || []).length;
  document.getElementById('barbersCount').textContent = (barbersRes.data || []).length;
  document.getElementById('servicesCount').textContent = (servicesRes.data || []).length;
  document.getElementById('cashCount').textContent = todayCash.length;

  const rows = document.getElementById('todayRows');
  const sorted = todayAppts.sort((a,b)=> String(a.start_time).localeCompare(String(b.start_time)));
  rows.innerHTML = sorted.length ? sorted.map(item => `
    <tr>
      <td data-label="Hora">${item.start_time?.slice(0,5) || '-'}</td>
      <td data-label="Cliente">${escapeHtml(item.customer_name || '-')}</td>
      <td data-label="Barbeiro">${escapeHtml(item.barber_name || '-')}</td>
      <td data-label="Serviço">${escapeHtml(item.service_name || '-')}</td>
      <td data-label="Status">${badge(item.status)}</td>
      <td data-label="Valor">${currency.format(Number(item.price || 0))}</td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty">Nenhum horário para hoje.</div></td></tr>`;
})();

function setupBookingShare(){
  const bookingLink = `${location.origin}/agendar.html?slug=${encodeURIComponent(activeShop.slug || activeShop.id)}`;
  const shareText = `Agende seu horário na ${activeShop.name}: ${bookingLink}`;
  const bookingInput = document.getElementById('bookingLink');
  if (bookingInput) bookingInput.value = bookingLink;
  const copyBtn = document.getElementById('copyBookingLink');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(shareText);
        showToast('Mensagem com o nome da barbearia copiada.', 'success');
      } catch {
        if (bookingInput) {
          bookingInput.focus();
          bookingInput.select();
          document.execCommand('copy');
          showToast('Link copiado.', 'success');
        }
      }
    };
  }
  const shareBtn = document.getElementById('shareBookingLink');
  if (shareBtn) {
    shareBtn.onclick = async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: `Agenda • ${activeShop.name}`, text: `Agende seu horário na ${activeShop.name}`, url: bookingLink });
        } else {
          await navigator.clipboard.writeText(shareText);
          showToast('Mensagem copiada para compartilhar.', 'success');
        }
      } catch (err) {}
    };
  }
  const note = document.getElementById('shareBarbershopName');
  if (note) note.textContent = activeShop.name;
}
