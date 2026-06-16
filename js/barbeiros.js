
let units = [];
let services = [];
let barbers = [];
let barberServices = [];

function unitName(unitId){
  return units.find(u => u.id === unitId)?.name || 'Sem unidade';
}

function serviceName(serviceId){
  return services.find(s => s.id === serviceId)?.name || '';
}

function serviceNamesForBarber(barberId){
  const names = barberServices
    .filter(link => link.barber_id === barberId)
    .map(link => serviceName(link.service_id))
    .filter(Boolean);
  return names.length ? names.join(', ') : 'Nenhum serviço vinculado';
}

function selectedServiceIds(){
  return Array.from(document.querySelectorAll('#barberServices input[type="checkbox"]:checked')).map(input => input.value);
}

function renderServiceChecks(){
  const wrap = document.getElementById('barberServices');
  if (!wrap) return;

  if (!services.length) {
    wrap.innerHTML = '<div class="empty compact">Cadastre os serviços antes de cadastrar profissionais.</div>';
    return;
  }

  wrap.innerHTML = services.map(service => `
    <label class="check-card">
      <input type="checkbox" value="${service.id}">
      <span>${escapeHtml(service.name)}</span>
      <small>${currency.format(Number(service.price || 0))}</small>
    </label>
  `).join('');
}

function fillUnitSelects(){
  const options = units.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
  const unitSelect = document.getElementById('unit_id');
  if (unitSelect) unitSelect.innerHTML = `<option value="">Selecionar unidade</option>${options}`;

  const filter = document.getElementById('unitFilter');
  if (filter) filter.innerHTML = `<option value="">Todas as unidades</option>${options}`;
}

async function loadUnitsAndServices(){
  const [unitsRes, servicesRes] = await Promise.all([
    db.from('units').select('*').eq('barbershop_id', activeShop.id).order('created_at', { ascending:false }),
    db.from('services').select('*').eq('barbershop_id', activeShop.id).eq('active', true).order('name')
  ]);

  if (unitsRes.error) {
    showToast('Não foi possível carregar as unidades. Confira o SQL.', 'error');
    units = [];
  } else {
    units = unitsRes.data || [];
  }

  services = servicesRes.data || [];

  fillUnitSelects();
  renderServiceChecks();

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
    showToast('Não foi possível carregar profissionais.', 'error');
    barbers = [];
  } else {
    barbers = data || [];
  }

  if (barbers.length) {
    const { data: links } = await db
      .from('barber_services')
      .select('*')
      .eq('barbershop_id', activeShop.id)
      .in('barber_id', barbers.map(b => b.id));
    barberServices = links || [];
  } else {
    barberServices = [];
  }

  const selectedUnit = document.getElementById('unitFilter')?.value || '';
  const filtered = selectedUnit ? barbers.filter(b => b.unit_id === selectedUnit) : barbers;
  const rows = document.getElementById('rows');

  rows.innerHTML = filtered.length ? filtered.map(item => `
    <tr>
      <td data-label="Nome">${escapeHtml(item.name)}</td>
      <td data-label="Unidade">${escapeHtml(unitName(item.unit_id))}</td>
      <td data-label="Telefone">${escapeHtml(item.phone || '-')}</td>
      <td data-label="Serviços">${escapeHtml(serviceNamesForBarber(item.id))}</td>
      <td data-label="Comissão">${Number(item.commission_percent || 0)}%</td>
      <td data-label="Status"><span class="badge ${item.active ? 'ativo':'inativo'}">${item.active ? 'ativo':'inativo'}</span></td>
      <td data-label="Ações"><div class="actions">
        <button class="btn secondary small" onclick="toggleBarber('${item.id}', ${item.active ? 'false':'true'})">${item.active ? 'Inativar':'Ativar'}</button>
        <button class="btn danger small" onclick="removeBarber('${item.id}')">Excluir</button>
      </div></td>
    </tr>`).join('') : `<tr><td colspan="7"><div class="empty">Nenhum profissional cadastrado nesta unidade.</div></td></tr>`;
}

window.toggleUnit = async (id, active) => {
  await db.from('units').update({ active }).eq('id', id).eq('barbershop_id', activeShop.id);
  await loadUnitsAndServices();
  await loadBarbers();
  await refreshInitialSetupBanner();
};

window.removeUnit = async (id) => {
  if (!confirm('Excluir unidade? Os profissionais vinculados ficarão sem unidade.')) return;
  await db.from('barbers').update({ unit_id: null }).eq('unit_id', id).eq('barbershop_id', activeShop.id);
  await db.from('units').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  await loadUnitsAndServices();
  await loadBarbers();
  await refreshInitialSetupBanner();
};

window.toggleBarber = async (id, active) => {
  await db.from('barbers').update({ active }).eq('id', id).eq('barbershop_id', activeShop.id);
  await loadBarbers();
  await refreshInitialSetupBanner();
};

window.removeBarber = async (id) => {
  if (!confirm('Excluir profissional?')) return;
  await db.from('barbers').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  await loadBarbers();
  await refreshInitialSetupBanner();
};

(async () => {
  await requireAuth('Profissionais', 'Primeiro cadastre unidades. Depois vincule cada profissional à unidade e aos serviços que ele atende.');
  await loadUnitsAndServices();
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

    if (!payload.address || !payload.phone) {
      showToast('Informe endereço e telefone da unidade.', 'error');
      return;
    }

    const { error } = await db.from('units').insert(payload);
    if (error) {
      showToast('Não foi possível cadastrar a unidade.', 'error');
      return;
    }

    e.target.reset();
    showToast('Unidade cadastrada. Cadastre outra unidade ou avance para Serviços.', 'success');
    await loadUnitsAndServices();
    await refreshInitialSetupBanner();
  });

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const unitId = document.getElementById('unit_id').value;
    if (!unitId) {
      showToast('Selecione a unidade do profissional.', 'error');
      return;
    }

    const serviceIds = selectedServiceIds();
    if (!serviceIds.length) {
      showToast('Selecione pelo menos um serviço para este profissional.', 'error');
      return;
    }

    const { data: barber, error } = await db.from('barbers').insert({
      barbershop_id: activeShop.id,
      unit_id: unitId,
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      commission_percent: Number(document.getElementById('commission').value || 0),
      active: true
    }).select().single();

    if (error || !barber) {
      showToast('Não foi possível cadastrar o profissional.', 'error');
      return;
    }

    await db.from('barber_services').insert(serviceIds.map(serviceId => ({
      barbershop_id: activeShop.id,
      barber_id: barber.id,
      service_id: serviceId
    })));

    e.target.reset();
    document.getElementById('commission').value = 50;
    renderServiceChecks();
    showToast('Profissional cadastrado com unidade e serviços.', 'success');
    await loadBarbers();
    await refreshInitialSetupBanner();
  });
})();
