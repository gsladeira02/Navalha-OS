
let units = [];
let barbers = [];

function unitName(unitId){
  return units.find(u => u.id === unitId)?.name || 'Sem unidade';
}

function fillUnitSelects(){
  const options = units.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
  const unitSelect = document.getElementById('unit_id');
  if (unitSelect) unitSelect.innerHTML = `<option value="">Selecionar unidade</option>${options}`;

  const filter = document.getElementById('unitFilter');
  if (filter) filter.innerHTML = `<option value="">Todas as unidades</option>${options}`;
}

async function loadUnits(){
  const { data, error } = await db
    .from('units')
    .select('*')
    .eq('barbershop_id', activeShop.id)
    .order('created_at', { ascending:false });

  if (error) {
    showToast('Não foi possível carregar as unidades. Confira o SQL.', 'error');
    units = [];
  } else {
    units = data || [];
  }

  fillUnitSelects();

  const rows = document.getElementById('unitRows');
  rows.innerHTML = units.length ? units.map(item => `
    <tr>
      <td data-label="Unidade">${escapeHtml(item.name)}</td>
      <td data-label="Endereço">${escapeHtml(item.address || '-')}</td>
      <td data-label="Status"><span class="badge ${item.active ? 'ativo':'inativo'}">${item.active ? 'ativo':'inativo'}</span></td>
      <td data-label="Ações"><div class="actions">
        <button class="btn secondary small" onclick="toggleUnit('${item.id}', ${item.active ? 'false':'true'})">${item.active ? 'Inativar':'Ativar'}</button>
        <button class="btn danger small" onclick="removeUnit('${item.id}')">Excluir</button>
      </div></td>
    </tr>`).join('') : `<tr><td colspan="4"><div class="empty">Nenhuma unidade cadastrada.</div></td></tr>`;
}

async function loadBarbers(){
  const { data, error } = await db
    .from('barbers')
    .select('*')
    .eq('barbershop_id', activeShop.id)
    .order('created_at',{ascending:false});

  if (error) {
    showToast('Não foi possível carregar barbeiros.', 'error');
    barbers = [];
  } else {
    barbers = data || [];
  }

  const selectedUnit = document.getElementById('unitFilter')?.value || '';
  const filtered = selectedUnit ? barbers.filter(b => b.unit_id === selectedUnit) : barbers;
  const rows = document.getElementById('rows');

  rows.innerHTML = filtered.length ? filtered.map(item => `
    <tr>
      <td data-label="Nome">${escapeHtml(item.name)}</td>
      <td data-label="Unidade">${escapeHtml(unitName(item.unit_id))}</td>
      <td data-label="Telefone">${escapeHtml(item.phone || '-')}</td>
      <td data-label="Comissão">${Number(item.commission_percent || 0)}%</td>
      <td data-label="Status"><span class="badge ${item.active ? 'ativo':'inativo'}">${item.active ? 'ativo':'inativo'}</span></td>
      <td data-label="Ações"><div class="actions">
        <button class="btn secondary small" onclick="toggleBarber('${item.id}', ${item.active ? 'false':'true'})">${item.active ? 'Inativar':'Ativar'}</button>
        <button class="btn danger small" onclick="removeBarber('${item.id}')">Excluir</button>
      </div></td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty">Nenhum barbeiro cadastrado nesta unidade.</div></td></tr>`;
}

window.toggleUnit = async (id, active) => {
  await db.from('units').update({ active }).eq('id', id).eq('barbershop_id', activeShop.id);
  await loadUnits();
  await loadBarbers();
};

window.removeUnit = async (id) => {
  if (!confirm('Excluir unidade? Os barbeiros vinculados ficarão sem unidade.')) return;
  await db.from('barbers').update({ unit_id: null }).eq('unit_id', id).eq('barbershop_id', activeShop.id);
  await db.from('units').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  await loadUnits();
  await loadBarbers();
};

window.toggleBarber = async (id, active) => {
  await db.from('barbers').update({ active }).eq('id', id).eq('barbershop_id', activeShop.id);
  loadBarbers();
};

window.removeBarber = async (id) => {
  if (!confirm('Excluir barbeiro?')) return;
  await db.from('barbers').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  loadBarbers();
};

(async () => {
  await requireAuth('Equipe', 'Cadastre unidades e vincule cada barbeiro à unidade correta');
  await loadUnits();
  await loadBarbers();

  document.getElementById('unitFilter').addEventListener('change', loadBarbers);

  document.getElementById('unitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      barbershop_id: activeShop.id,
      name: document.getElementById('unit_name').value.trim(),
      address: document.getElementById('unit_address').value.trim(),
      phone: document.getElementById('unit_phone').value.trim(),
      active: true
    };

    const { error } = await db.from('units').insert(payload);
    if (error) {
      showToast('Não foi possível cadastrar a unidade.', 'error');
      return;
    }

    e.target.reset();
    showToast('Unidade cadastrada.', 'success');
    await loadUnits();
  });

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const unitId = document.getElementById('unit_id').value;
    if (!unitId) {
      showToast('Selecione a unidade do barbeiro.', 'error');
      return;
    }

    const { error } = await db.from('barbers').insert({
      barbershop_id: activeShop.id,
      unit_id: unitId,
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      commission_percent: Number(document.getElementById('commission').value || 0),
      active: true
    });

    if (error) {
      showToast('Não foi possível cadastrar o barbeiro.', 'error');
      return;
    }

    e.target.reset();
    document.getElementById('commission').value = 50;
    showToast('Barbeiro cadastrado.', 'success');
    loadBarbers();
  });
})();
