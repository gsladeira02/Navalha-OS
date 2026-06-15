(async function(){
  const shop = await bootLayout('Dashboard', 'Resumo da sua barbearia em tempo real.'); if(!shop) return;
  const today = todayISO();
  const monthStart = today.slice(0,8)+'01';
  const [{data: appts},{data: cash},{data: customers},{data: barbers}] = await Promise.all([
    db.from('appointments').select('*').eq('barbershop_id', shop.id).gte('appointment_date', monthStart),
    db.from('cash_entries').select('*').eq('barbershop_id', shop.id).gte('entry_date', monthStart),
    db.from('customers').select('id').eq('barbershop_id', shop.id),
    db.from('barbers').select('id').eq('barbershop_id', shop.id).eq('active', true)
  ]);
  const todays = (appts||[]).filter(a=>a.appointment_date===today);
  const doneToday = todays.filter(a=>a.status==='concluido');
  const monthRevenue = (cash||[]).filter(c=>c.type==='entrada').reduce((s,c)=>s+Number(c.amount||0),0);
  const todayRevenue = (cash||[]).filter(c=>c.entry_date===today && c.type==='entrada').reduce((s,c)=>s+Number(c.amount||0),0);
  document.getElementById('todayRevenue').textContent = money(todayRevenue);
  document.getElementById('monthRevenue').textContent = money(monthRevenue);
  document.getElementById('todayAppointments').textContent = todays.length;
  document.getElementById('doneToday').textContent = doneToday.length;
  document.getElementById('customersCount').textContent = (customers||[]).length;
  document.getElementById('barbersCount').textContent = (barbers||[]).length;
  const tbody = document.getElementById('todayRows');
  tbody.innerHTML = todays.length ? todays.sort((a,b)=>a.start_time.localeCompare(b.start_time)).map(a=>`<tr><td>${a.start_time?.slice(0,5)}</td><td>${a.customer_name||'-'}</td><td>${a.barber_name||'-'}</td><td>${a.service_name||'-'}</td><td>${statusBadge(a.status)}</td><td>${money(a.price)}</td></tr>`).join('') : `<tr><td colspan="6" class="empty">Nenhum horário marcado hoje.</td></tr>`;
})();
