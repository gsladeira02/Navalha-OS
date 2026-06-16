async function loadServices(){
  const { data } = await db.from('services').select('*').eq('barbershop_id', activeShop.id).order('created_at',{ascending:false});
  const rows = document.getElementById('rows');
  rows.innerHTML = (data || []).length ? data.map(item => `
    <tr>
      <td data-label="Serviço">${escapeHtml(item.name)}</td>
      <td data-label="Preço">${currency.format(Number(item.price || 0))}</td>
      <td data-label="Duração">${item.duration_minutes} min</td>
      <td data-label="Comissão">${item.commission_percent != null ? Number(item.commission_percent) + '%' : '-'}</td>
      <td data-label="Status"><span class="badge ${item.active ? 'ativo':'inativo'}">${item.active ? 'ativo':'inativo'}</span></td>
      <td data-label="Ações"><div class="actions"><button class="btn secondary small" onclick="toggleService('${item.id}', ${item.active ? 'false':'true'})">${item.active ? 'Inativar':'Ativar'}</button><button class="btn danger small" onclick="removeService('${item.id}')">Excluir</button></div></td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty">Nenhum serviço cadastrado.</div></td></tr>`;
}
window.toggleService = async (id, active) => { await db.from('services').update({ active }).eq('id', id).eq('barbershop_id', activeShop.id); loadServices(); };
window.removeService = async (id) => { if (!confirm('Excluir serviço?')) return; await db.from('services').delete().eq('id', id).eq('barbershop_id', activeShop.id); loadServices(); };
(async () => {
  await requireAuth('Serviços', 'Organize serviços, preços, duração e comissão específica');
  await loadServices();
  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.from('services').insert({
      barbershop_id: activeShop.id,
      name: document.getElementById('name').value.trim(),
      price: Number(document.getElementById('price').value || 0),
      duration_minutes: Number(document.getElementById('duration').value || 30),
      commission_percent: document.getElementById('commission').value ? Number(document.getElementById('commission').value) : null
    });
    e.target.reset();
    document.getElementById('duration').value = 30;
    await loadServices();
    await refreshInitialSetupBanner();
  });
})();
