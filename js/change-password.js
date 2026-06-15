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
    const btn = e.target.querySelector('button[type="submit"]');
    if (newPassword.length < 6) {
      showToast('A nova senha deve ter pelo menos 6 caracteres.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('As senhas não coincidem.', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    const { error } = await db.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false, password_changed_at: new Date().toISOString() }
    });
    btn.disabled = false;
    btn.textContent = 'Salvar nova senha';
    if (error) {
      showToast('Não foi possível atualizar a senha.', 'error');
      return;
    }
    showToast('Senha atualizada com sucesso.', 'success');
    setTimeout(() => location.href = 'dashboard.html', 500);
  });
})();
