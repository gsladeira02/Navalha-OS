const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('togglePassword');

if (togglePasswordBtn && passwordInput) {
  togglePasswordBtn.addEventListener('click', () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    togglePasswordBtn.textContent = showing ? 'Ver' : 'Ocultar';
  });
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = passwordInput.value;
  const button = e.target.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Entrando...';
  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: shop, error: shopError } = await db
      .from('barbershops')
      .select('id,name,active,subscription_status')
      .eq('owner_id', data.user.id)
      .maybeSingle();
    if (shopError) throw shopError;
    if (!shop || !shop.active || !['active','renewal_pending'].includes(shop.subscription_status)) {
      await db.auth.signOut();
      showToast('Acesso indisponível. Fale com o responsável pelo sistema.', 'error');
      return;
    }
    showToast('Login realizado com sucesso.', 'success');
    const mustChange = !data.user?.user_metadata || data.user.user_metadata.must_change_password !== false;
    setTimeout(() => window.location.href = mustChange ? 'change-password.html' : 'dashboard.html', 450);
  } catch (err) {
    showToast('E-mail ou senha inválidos.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar no sistema';
  }
});
