
let barbers = [];
const weekdays = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

function timeLabel(t){ return t ? String(t).slice(0,5) : ''; }

async function loadBarbers(){
  const { data } = await db.from('barbers').select('*').eq('barbershop_id', activeShop.id).eq('active', true).order('name');
  barbers = data || [];
  const options = '<option value="">Selecionar barbeiro</option>' + barbers.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
  document.getElementById('barber_id').innerHTML = options;
  document.getElementById('block_barber_id').innerHTML = '<option value="">Barbearia inteira</option>' + barbers.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
}

async function loadAvailability(){
  const { data } = await db
    .from('barber_availability')
    .select('*, barbers(name)')
    .eq('barbershop_id', activeShop.id)
    .order('weekday')
    .order('start_time');

  const rows = document.getElementById('availabilityRows');
  const items = data || [];
  rows.innerHTML = items.length ? items.map(item => `
    <tr>
      <td data-label="Barbeiro">${escapeHtml(item.barbers?.name || '-')}</td>
      <td data-label="Dia">${weekdays[item.weekday] || '-'}</td>
      <td data-label="Horário">${timeLabel(item.start_time)} às ${timeLabel(item.end_time)}</td>
      <td data-label="Intervalo">${item.break_start && item.break_end ? `${timeLabel(item.break_start)} às ${timeLabel(item.break_end)}` : '-'}</td>
      <td data-label="Ações"><button class="btn danger small" onclick="removeAvailability('${item.id}')">Excluir</button></td>
    </tr>
  `).join('') : `<tr><td colspan="5"><div class="empty">Nenhum horário semanal cadastrado.</div></td></tr>`;
}

async function loadBlocks(){
  const { data } = await db
    .from('schedule_blocks')
    .select('*, barbers(name)')
    .eq('barbershop_id', activeShop.id)
    .order('block_date', { ascending: true });

  const rows = document.getElementById('blockRows');
  const items = data || [];
  rows.innerHTML = items.length ? items.map(item => `
    <tr>
      <td data-label="Data">${dateBR(item.block_date)}</td>
      <td data-label="Barbeiro">${escapeHtml(item.barbers?.name || 'Barbearia inteira')}</td>
      <td data-label="Horário">${item.start_time && item.end_time ? `${timeLabel(item.start_time)} às ${timeLabel(item.end_time)}` : 'Dia inteiro'}</td>
      <td data-label="Motivo">${escapeHtml(item.reason || '-')}</td>
      <td data-label="Ações"><button class="btn danger small" onclick="removeBlock('${item.id}')">Excluir</button></td>
    </tr>
  `).join('') : `<tr><td colspan="5"><div class="empty">Nenhum bloqueio cadastrado.</div></td></tr>`;
}

window.removeAvailability = async (id) => {
  if (!confirm('Excluir este horário semanal?')) return;
  await db.from('barber_availability').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  loadAvailability();
};

window.removeBlock = async (id) => {
  if (!confirm('Excluir este bloqueio?')) return;
  await db.from('schedule_blocks').delete().eq('id', id).eq('barbershop_id', activeShop.id);
  loadBlocks();
};

(async () => {
  await requireAuth('Horários', 'Defina quando cada barbeiro atende e bloqueie dias específicos');
  await loadBarbers();
  await loadAvailability();
  await loadBlocks();

  document.getElementById('availabilityForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      barbershop_id: activeShop.id,
      barber_id: document.getElementById('barber_id').value,
      weekday: Number(document.getElementById('weekday').value),
      start_time: document.getElementById('start_time').value,
      end_time: document.getElementById('end_time').value,
      break_start: document.getElementById('break_start').value || null,
      break_end: document.getElementById('break_end').value || null,
      active: true
    };
    if (payload.start_time >= payload.end_time) { showToast('O horário final precisa ser depois do início.', 'error'); return; }
    if ((payload.break_start && !payload.break_end) || (!payload.break_start && payload.break_end)) { showToast('Preencha início e fim do intervalo.', 'error'); return; }
    await db.from('barber_availability').insert(payload);
    e.target.reset();
    showToast('Horário semanal salvo.', 'success');
    loadAvailability();
  });

  document.getElementById('blockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      barbershop_id: activeShop.id,
      barber_id: document.getElementById('block_barber_id').value || null,
      block_date: document.getElementById('block_date').value,
      start_time: document.getElementById('block_start').value || null,
      end_time: document.getElementById('block_end').value || null,
      reason: document.getElementById('reason').value.trim()
    };
    if ((payload.start_time && !payload.end_time) || (!payload.start_time && payload.end_time)) { showToast('Preencha início e fim do bloqueio, ou deixe os dois vazios para bloquear o dia inteiro.', 'error'); return; }
    if (payload.start_time && payload.start_time >= payload.end_time) { showToast('O horário final precisa ser depois do início.', 'error'); return; }
    await db.from('schedule_blocks').insert(payload);
    e.target.reset();
    showToast('Bloqueio salvo.', 'success');
    loadBlocks();
  });
})();
