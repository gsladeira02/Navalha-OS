
let customers = [];

function cleanDoc(value){
  return String(value || '').replace(/\D/g, '');
}

async function loadCustomers(){
  const { data, error } = await db
    .from('customers')
    .select('*')
    .eq('barbershop_id', activeShop.id)
    .order('created_at',{ascending:false});

  if (error) {
    showToast('Não foi possível carregar clientes. Confira o SQL atualizado.', 'error');
    customers = [];
  } else {
    customers = data || [];
  }

  const rows = document.getElementById('rows');
  rows.innerHTML = customers.length ? customers.map(item => `
    <tr>
      <td data-label="Nome">${escapeHtml(item.name)}</td>
      <td data-label="Telefone">${escapeHtml(item.phone || '-')}</td>
      <td data-label="E-mail">${escapeHtml(item.email || '-')}</td>
      <td data-label="CPF/CNPJ">${escapeHtml(item.cpf_cnpj || '-')}</td>
      <td data-label="Observações">${escapeHtml(item.notes || '-')}</td>
      <td data-label="Ações"><div class="actions"><button class="btn secondary small" onclick="editCustomer('${item.id}')">Editar</button><button class="btn danger small" onclick="removeCustomer('${item.id}')">Excluir</button></div></td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty">Nenhum cliente cadastrado.</div></td></tr>`;
}

window.editCustomer = async (id) => {
  const item = customers.find(c => c.id === id);
  if (!item) return;

  const name = prompt('Nome do cliente:', item.name || '');
  if (name === null || !name.trim()) return;

  const phone = prompt('Telefone:', item.phone || '');
  if (phone === null) return;

  const email = prompt('E-mail:', item.email || '');
  if (email === null) return;

  const cpfCnpj = prompt('CPF ou CNPJ:', item.cpf_cnpj || '');
  if (cpfCnpj === null) return;

  const notes = prompt('Observações:', item.notes || '');
  if (notes === null) return;

  const { error } = await db.from('customers')
    .update({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      cpf_cnpj: cleanDoc(cpfCnpj),
      notes: notes.trim()
    })
    .eq('id', id)
    .eq('barbershop_id', activeShop.id);

  if (error) {
    showToast('Não foi possível atualizar o cliente.', 'error');
    return;
  }

  showToast('Cliente atualizado.', 'success');
  loadCustomers();
};

window.removeCustomer = async (id) => {
  if (!confirm('Excluir cliente?')) return;
  await db.from('customers').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  showToast('Cliente excluído.', 'success');
  loadCustomers();
};

(async () => {
  await requireAuth('Clientes', 'Cadastre clientes com CPF/CNPJ para cobranças recorrentes e notas');
  await loadCustomers();

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const cpfCnpj = cleanDoc(document.getElementById('cpf_cnpj').value);
    if (!cpfCnpj) {
      showToast('Preencha o CPF ou CNPJ do cliente.', 'error');
      return;
    }

    const { error } = await db.from('customers').insert({
      barbershop_id: activeShop.id,
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      email: document.getElementById('email').value.trim(),
      cpf_cnpj: cpfCnpj,
      notes: document.getElementById('notes').value.trim()
    });

    if (error) {
      showToast('Não foi possível cadastrar o cliente. Confira se o SQL atualizado foi executado.', 'error');
      return;
    }

    e.target.reset();
    showToast('Cliente cadastrado com sucesso.', 'success');
    loadCustomers();
  });
})();
