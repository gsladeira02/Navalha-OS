async function loadCommissions(){
  const start = document.getElementById('start').value;
  const end = document.getElementById('end').value;
  let query = db.from('appointments').select('*').eq('barbershop_id', activeShop.id).eq('status','concluido');
  if (start) query = query.gte('appointment_date', start);
  if (end) query = query.lte('appointment_date', end);
  const { data } = await query;
  const items = data || [];
  const grouped = {};
  items.forEach(item => {
    const key = item.barber_name || 'Sem barbeiro';
    if (!grouped[key]) grouped[key] = { count: 0, total: 0, commissionPercent: 0, commissionValue: 0 };
    const price = Number(item.price || 0);
    const percent = Number(item.commission_percent || 0);
    grouped[key].count += 1;
    grouped[key].total += price;
    grouped[key].commissionPercent = percent;
    grouped[key].commissionValue += price * (percent / 100);
  });
  const rows = document.getElementById('rows');
  const entries = Object.entries(grouped);
  rows.innerHTML = entries.length ? entries.map(([name, info]) => `
    <tr>
      <td>${escapeHtml(name)}</td>
      <td>${info.count}</td>
      <td>${currency.format(info.total)}</td>
      <td>${info.commissionPercent}%</td>
      <td>${currency.format(info.commissionValue)}</td>
    </tr>`).join('') : `<tr><td colspan="5"><div class="empty">Nenhum atendimento concluído no período.</div></td></tr>`;
  document.getElementById('grandTotal').textContent = currency.format(items.reduce((s,i)=>s+Number(i.price||0),0));
  document.getElementById('grandCommission').textContent = currency.format(entries.reduce((s,[,info])=>s+info.commissionValue,0));
}
(async () => {
  await requireAuth('Comissões', 'Consolidado por barbeiro e período');
  const today = todayISO();
  const startMonth = today.slice(0,8) + '01';
  document.getElementById('start').value = startMonth;
  document.getElementById('end').value = today;
  await loadCommissions();
  document.getElementById('filterBtn').addEventListener('click', loadCommissions);
})();
