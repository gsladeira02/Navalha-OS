window.currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
window.dateBR = (v) => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
window.todayISO = () => new Date().toISOString().slice(0, 10);
window.escapeHtml = (str = '') => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
window.badge = (status) => `<span class="badge ${status}">${status}</span>`;
window.activeShop = null;
window.currentSessionUser = null;
window.needsPasswordChange = (user) => !user?.user_metadata || user.user_metadata.must_change_password !== false;

window.requireAuth = async function(pageTitle, subtitle){
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    location.href = 'login.html';
    throw new Error('Sem sessão');
  }
  if (window.needsPasswordChange(session.user) && !location.pathname.endsWith('change-password.html')) {
    location.href = 'change-password.html';
    throw new Error('Troca de senha pendente');
  }
  const { data: shop, error } = await db
    .from('barbershops')
    .select('id,name,plan,active,subscription_status,slug,booking_min_advance_minutes')
    .eq('owner_id', session.user.id)
    .maybeSingle();
  if (error || !shop || !shop.active || shop.subscription_status !== 'active') {
    await db.auth.signOut();
    location.href = 'login.html';
    throw new Error('Acesso bloqueado');
  }
  window.activeShop = shop;
  window.currentSessionUser = session.user;
  const emailEl = document.getElementById('userEmail');
  const shopNameEl = document.getElementById('shopName');
  const titleEl = document.getElementById('pageTitle');
  const subtitleEl = document.getElementById('pageSubtitle');
  if (emailEl) emailEl.textContent = session.user.email;
  if (shopNameEl) shopNameEl.textContent = shop.name;
  if (titleEl) titleEl.textContent = pageTitle;
  if (subtitleEl) subtitleEl.textContent = subtitle || '';
  const current = location.pathname.split('/').pop().replace('.html','');
  document.querySelectorAll('[data-nav]').forEach(a => {
    if (a.dataset.nav === current) a.classList.add('active');
  });
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = async () => { await db.auth.signOut(); location.href = 'login.html'; };
  return { session, shop };
};


function slugifyBarbershopName(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getPublicBookingSlug(){
  return slugifyBarbershopName(activeShop?.slug || activeShop?.name || activeShop?.id);
}

function getPublicBookingLink(){
  return `https://navalha-os.vercel.app/agenda/${encodeURIComponent(getPublicBookingSlug())}`;
}

function setupBookingShare(){
  const bookingLink = getPublicBookingLink();
  const shareText = `Agende seu horário na ${activeShop.name}: ${bookingLink}`;

  const bookingInput = document.getElementById('bookingLink');
  if (bookingInput) bookingInput.value = bookingLink;

  const nameEl = document.getElementById('shareBarbershopName');
  if (nameEl) nameEl.textContent = activeShop.name;

  const copyBtn = document.getElementById('copyBookingLink');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(shareText);
        showToast('Mensagem com o nome da barbearia copiada.', 'success');
      } catch {
        if (bookingInput) {
          bookingInput.focus();
          bookingInput.select();
          document.execCommand('copy');
          showToast('Link copiado.', 'success');
        }
      }
    };
  }

  const shareBtn = document.getElementById('shareBookingLink');
  if (shareBtn) {
    shareBtn.onclick = async () => {
      try {
        if (navigator.share) {
          await navigator.share({
            title: `Agenda • ${activeShop.name}`,
            text: `Agende seu horário na ${activeShop.name}`,
            url: bookingLink
          });
        } else {
          await navigator.clipboard.writeText(shareText);
          showToast('Mensagem copiada para compartilhar.', 'success');
        }
      } catch (err) {}
    };
  }
}
