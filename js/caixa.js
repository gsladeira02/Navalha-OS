async function loadCash(){
  const filterDate = document.getElementById('filterDate').value || todayISO();
  const { data } = await db.from('cash_entries').select('*').eq('barbershop_id', activeShop.id).eq('entry_date', filterDate).order('created_at',{ascending:false});
  const items = data || [];
  const totalIn = items.filter(i=>i.type==='entrada').reduce((s,i)=>s+Number(i.amount||0),0);
  const totalOut = items.filter(i=>i.type==='saida').reduce((s,i)=>s+Number(i.amount||0),0);
  document.getElementById('totalIn').textContent = currency.format(totalIn);
  document.getElementById('totalOut').textContent = currency.format(totalOut);
  document.getElementById('totalNet').textContent = currency.format(totalIn-totalOut);
  const rows = document.getElementById('rows');
  rows.innerHTML = items.length ? items.map(item => `
    <tr>
      <td>${dateBR(item.entry_date)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.description)}</td>
      <td>${escapeHtml(item.payment_method || '-')}</td>
      <td>${currency.format(Number(item.amount || 0))}</td>
      <td><button class="btn danger small" onclick="removeCash('${item.id}')">Excluir</button></td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty">Nenhum lançamento para esta data.</div></td></tr>`;
}
window.removeCash = async (id) => { if (!confirm('Excluir lançamento?')) return; await db.from('cash_entries').delete().eq('id', id).eq('barbershop_id', activeShop.id); loadCash(); };
(async () => {
  await requireAuth('Caixa', 'Entradas e saídas da barbearia');
  document.getElementById('filterDate').value = todayISO();
  document.getElementById('entry_date').value = todayISO();
  await loadCash();
  document.getElementById('filterDate').addEventListener('change', loadCash);
  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.from('cash_entries').insert({
      barbershop_id: activeShop.id,
      type: document.getElementById('type').value,
      description: document.getElementById('description').value.trim(),
      amount: Number(document.getElementById('amount').value || 0),
      payment_method: document.getElementById('payment_method').value,
      entry_date: document.getElementById('entry_date').value
    });
    e.target.reset();
    document.getElementById('entry_date').value = todayISO();
    loadCash();
  });
})();
