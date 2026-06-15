
function onlyDigits(value){
  return String(value || '').replace(/\D/g, '');
}

function slugifySetupName(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getUniqueSlug(base, currentShopId, userId){
  let slug = slugifySetupName(base) || `barbearia-${String(userId || Date.now()).slice(0,8)}`;
  const { data: conflict } = await db
    .from('barbershops')
    .select('id')
    .eq('slug', slug)
    .neq('id', currentShopId)
    .maybeSingle();

  if (!conflict) return slug;

  const suffix = String(userId || Date.now()).replace(/-/g, '').slice(0, 6);
  return `${slug}-${suffix}`;
}

function setupDocumentMask(input, type){
  input.addEventListener('input', () => {
    const digits = onlyDigits(input.value).slice(0, type === 'cpf' ? 11 : 14);
    if (type === 'cpf') {
      input.value = digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
    } else {
      input.value = digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
  });
}

function setupPhoneMask(input){
  input.addEventListener('input', () => {
    const digits = onlyDigits(input.value).slice(0, 11);
    input.value = digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  });
}

(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    location.href = 'login.html';
    return;
  }

  if (!needsPasswordChange(session.user)) {
    location.href = 'dashboard.html';
    return;
  }

  const { data: shop, error: shopError } = await db
    .from('barbershops')
    .select('id,name,phone,slug,admin_name,admin_cpf,admin_phone,cnpj')
    .eq('owner_id', session.user.id)
    .maybeSingle();

  if (shopError || !shop) {
    showToast('Não foi possível carregar a barbearia deste usuário.', 'error');
    return;
  }

  const barbershopName = document.getElementById('barbershopName');
  const barbershopPhone = document.getElementById('barbershopPhone');
  const barbershopCnpj = document.getElementById('barbershopCnpj');
  const adminName = document.getElementById('adminName');
  const adminCpf = document.getElementById('adminCpf');
  const adminPhone = document.getElementById('adminPhone');

  barbershopName.value = shop.name || '';
  barbershopPhone.value = shop.phone || '';
  barbershopCnpj.value = shop.cnpj || '';
  adminName.value = shop.admin_name || session.user.user_metadata?.admin_name || '';
  adminCpf.value = shop.admin_cpf || session.user.user_metadata?.admin_cpf || '';
  adminPhone.value = shop.admin_phone || session.user.user_metadata?.admin_phone || '';

  setupDocumentMask(adminCpf, 'cpf');
  setupDocumentMask(barbershopCnpj, 'cnpj');
  setupPhoneMask(adminPhone);
  setupPhoneMask(barbershopPhone);

  [['toggleNewPassword','newPassword'], ['toggleConfirmPassword','confirmPassword']].forEach(([btnId,inputId]) => {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'Ver' : 'Ocultar';
    });
  });

  document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    const payload = {
      admin_name: adminName.value.trim(),
      admin_cpf: onlyDigits(adminCpf.value),
      admin_phone: onlyDigits(adminPhone.value),
      barbershop_name: barbershopName.value.trim(),
      barbershop_cnpj: onlyDigits(barbershopCnpj.value),
      barbershop_phone: onlyDigits(barbershopPhone.value),
    };

    if (newPassword.length < 6) {
      showToast('A nova senha deve ter pelo menos 6 caracteres.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('As senhas não coincidem.', 'error');
      return;
    }
    if (!payload.admin_name || !payload.barbershop_name) {
      showToast('Preencha o nome do administrador e o nome da barbearia.', 'error');
      return;
    }
    if (payload.admin_cpf.length !== 11) {
      showToast('Preencha um CPF do administrador com 11 números.', 'error');
      return;
    }
    if (payload.barbershop_cnpj.length !== 14) {
      showToast('Preencha um CNPJ da barbearia com 14 números.', 'error');
      return;
    }
    if (payload.admin_phone.length < 10 || payload.barbershop_phone.length < 10) {
      showToast('Preencha os celulares com DDD.', 'error');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      const slug = shop.slug || await getUniqueSlug(payload.barbershop_name, shop.id, session.user.id);

      const { error: updateShopError } = await db
        .from('barbershops')
        .update({
          name: payload.barbershop_name,
          phone: payload.barbershop_phone,
          cnpj: payload.barbershop_cnpj,
          admin_name: payload.admin_name,
          admin_cpf: payload.admin_cpf,
          admin_phone: payload.admin_phone,
          slug,
          setup_completed: true,
          setup_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', shop.id)
        .eq('owner_id', session.user.id);

      if (updateShopError) throw updateShopError;

      const { error } = await db.auth.updateUser({
        password: newPassword,
        data: {
          must_change_password: false,
          password_changed_at: new Date().toISOString(),
          setup_completed: true,
          admin_name: payload.admin_name,
          admin_cpf: payload.admin_cpf,
          admin_phone: payload.admin_phone
        }
      });

      if (error) throw error;

      showToast('Primeiro acesso configurado com sucesso.', 'success');
      setTimeout(() => location.href = 'dashboard.html', 600);
    } catch (err) {
      showToast(err.message || 'Não foi possível salvar os dados do primeiro acesso.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar dados e acessar';
    }
  });
})();
