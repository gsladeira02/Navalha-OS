async function loadCustomers(){
  const { data } = await db.from('customers').select('*').eq('barbershop_id', activeShop.id).order('created_at',{ascending:false});
  const rows = document.getElementById('rows');
  rows.innerHTML = (data || []).length ? data.map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.phone || '-')}</td>
      <td>${dateBR(item.birthday)}</td>
      <td>${escapeHtml(item.notes || '-')}</td>
      <td><div class="actions"><button class="btn danger small" onclick="removeCustomer('${item.id}')">Excluir</button></div></td>
    </tr>`).join('') : `<tr><td colspan="5"><div class="empty">Nenhum cliente cadastrado.</div></td></tr>`;
}
window.removeCustomer = async (id) => {
  if (!confirm('Excluir cliente?')) return;
  await db.from('customers').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  loadCustomers();
};
(async () => {
  await requireAuth('Clientes', 'Cadastro e histórico base de clientes');
  await loadCustomers();
  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.from('customers').insert({
      barbershop_id: activeShop.id,
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      birthday: document.getElementById('birthday').value || null,
      notes: document.getElementById('notes').value.trim()
    });
    e.target.reset();
    loadCustomers();
  });
})();
