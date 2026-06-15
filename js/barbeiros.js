async function loadBarbers(){
  const { data } = await db.from('barbers').select('*').eq('barbershop_id', activeShop.id).order('created_at',{ascending:false});
  const rows = document.getElementById('rows');
  rows.innerHTML = (data || []).length ? data.map(item => `
    <tr>
      <td data-label="Nome">${escapeHtml(item.name)}</td>
      <td data-label="Telefone">${escapeHtml(item.phone || '-')}</td>
      <td data-label="Comissão">${Number(item.commission_percent || 0)}%</td>
      <td data-label="Status"><span class="badge ${item.active ? 'ativo':'inativo'}">${item.active ? 'ativo':'inativo'}</span></td>
      <td data-label="Ações"><div class="actions"><button class="btn secondary small" onclick="toggleBarber('${item.id}', ${item.active ? 'false':'true'})">${item.active ? 'Inativar':'Ativar'}</button><button class="btn danger small" onclick="removeBarber('${item.id}')">Excluir</button></div></td>
    </tr>`).join('') : `<tr><td colspan="5"><div class="empty">Nenhum barbeiro cadastrado.</div></td></tr>`;
}
window.toggleBarber = async (id, active) => { await db.from('barbers').update({ active }).eq('id', id).eq('barbershop_id', activeShop.id); loadBarbers(); };
window.removeBarber = async (id) => { if (!confirm('Excluir barbeiro?')) return; await db.from('barbers').delete().eq('id', id).eq('barbershop_id', activeShop.id); loadBarbers(); };
(async () => {
  await requireAuth('Barbeiros', 'Gerencie a equipe, comissões e status dos profissionais');
  await loadBarbers();
  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.from('barbers').insert({
      barbershop_id: activeShop.id,
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      commission_percent: Number(document.getElementById('commission').value || 0)
    });
    e.target.reset();
    document.getElementById('commission').value = 50;
    loadBarbers();
  });
})();
