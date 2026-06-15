document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const button = e.target.querySelector('button');
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
    if (!shop || !shop.active || shop.subscription_status !== 'active') {
      await db.auth.signOut();
      alert('Acesso indisponível.');
      return;
    }
    window.location.href = 'dashboard.html';
  } catch (err) {
    alert('E-mail ou senha inválidos.');
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar';
  }
});
