async function loadCustomers(){
  const { data } = await db.from('customers').select('*').eq('barbershop_id', activeShop.id).order('created_at',{ascending:false});
  const rows = document.getElementById('rows');
  rows.innerHTML = (data || []).length ? data.map(item => `
    <tr>
      <td data-label="Nome">${escapeHtml(item.name)}</td>
      <td data-label="Telefone">${escapeHtml(item.phone || '-')}</td>
      <td data-label="Observações">${escapeHtml(item.notes || '-')}</td>
      <td data-label="Ações"><div class="actions"><button class="btn danger small" onclick="removeCustomer('${item.id}')">Excluir</button></div></td>
    </tr>`).join('') : `<tr><td colspan="4"><div class="empty">Nenhum cliente cadastrado.</div></td></tr>`;
}
window.removeCustomer = async (id) => {
  if (!confirm('Excluir cliente?')) return;
  await db.from('customers').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  showToast('Cliente excluído.', 'success');
  loadCustomers();
};
(async () => {
  await requireAuth('Clientes', 'Cadastro simplificado e organizado da sua base de clientes');
  await loadCustomers();
  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.from('customers').insert({
      barbershop_id: activeShop.id,
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      notes: document.getElementById('notes').value.trim()
    });
    e.target.reset();
    showToast('Cliente cadastrado com sucesso.', 'success');
    loadCustomers();
  });
})();
