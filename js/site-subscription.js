function onlyDigits(value){
  return String(value || '').replace(/\D/g, '');
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

async function callPublicFunction(name, body){
  const endpoint = `${window.NAVALHAOS_CONFIG.SUPABASE_URL}/functions/v1/${name}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': window.NAVALHAOS_CONFIG.SUPABASE_ANON_KEY
    },
    body: JSON.stringify(body || {})
  });

  let data = null;
  try { data = await response.json(); } catch (_) {}

  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Erro ${response.status} ao criar assinatura.`);
  }

  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  setupDocumentMask(document.getElementById('adminCpf'), 'cpf');
  setupDocumentMask(document.getElementById('barbershopCnpj'), 'cnpj');
  setupPhoneMask(document.getElementById('adminPhone'));
  setupPhoneMask(document.getElementById('barbershopPhone'));

  const form = document.getElementById('systemSubscriptionForm');
  const btn = document.getElementById('subscribeBtn');
  const result = document.getElementById('subscriptionResult');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      adminName: document.getElementById('adminName').value.trim(),
      adminEmail: document.getElementById('adminEmail').value.trim().toLowerCase(),
      adminPhone: onlyDigits(document.getElementById('adminPhone').value),
      adminCpf: onlyDigits(document.getElementById('adminCpf').value),
      adminPassword: document.getElementById('adminPassword').value,
      barbershopName: document.getElementById('barbershopName').value.trim(),
      barbershopCnpj: onlyDigits(document.getElementById('barbershopCnpj').value),
      barbershopPhone: onlyDigits(document.getElementById('barbershopPhone').value),
      paymentMethod: 'INFINITEPAY_CHECKOUT'
    };

    if (payload.adminCpf.length !== 11) {
      result.textContent = 'Preencha um CPF válido com 11 números.';
      result.className = 'site-form-result error';
      return;
    }

    if (payload.barbershopCnpj.length !== 14) {
      result.textContent = 'Preencha um CNPJ válido com 14 números.';
      result.className = 'site-form-result error';
      return;
    }

    if (payload.adminPassword.length < 6) {
      result.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
      result.className = 'site-form-result error';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Gerando cobrança...';
    result.textContent = '';

    try {
      const data = await callPublicFunction('create-system-subscription', payload);
      const paymentUrl = data?.checkoutUrl || data?.invoiceUrl || data?.bankSlipUrl;

      result.className = 'site-form-result success';
      result.innerHTML = paymentUrl
        ? `Assinatura criada. <a href="${paymentUrl}" target="_blank" rel="noopener">Clique aqui para pagar pela InfinitePay</a>. Após o pagamento, seu acesso será liberado automaticamente.`
        : 'Assinatura criada. Aguarde a confirmação do pagamento para liberação do acesso.';

      if (paymentUrl) {
        setTimeout(() => window.open(paymentUrl, '_blank'), 350);
      }
    } catch (err) {
      result.className = 'site-form-result error';
      result.textContent = err.message || 'Não foi possível criar a assinatura.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Gerar cobrança e assinar';
    }
  });
});
