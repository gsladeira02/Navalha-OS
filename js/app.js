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

window.keepSelectedNavVisible = function(){
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;

  const active = nav.querySelector('a.active') || nav.querySelector(`[data-nav="${location.pathname.split('/').pop().replace('.html','')}"]`);
  if (!active) return;

  const centerActive = () => {
    const navRect = nav.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    const currentLeft = nav.scrollLeft;
    const itemCenter = (itemRect.left - navRect.left) + currentLeft + (itemRect.width / 2);
    const targetLeft = Math.max(0, itemCenter - (nav.clientWidth / 2));
    nav.scrollTo({ left: targetLeft, behavior: 'auto' });
    sessionStorage.setItem('navalhaos_bottom_nav_scroll_left', String(targetLeft));
  };

  requestAnimationFrame(centerActive);

  nav.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', () => {
      sessionStorage.setItem('navalhaos_last_nav', link.dataset.nav || '');
      sessionStorage.setItem('navalhaos_bottom_nav_scroll_left', String(nav.scrollLeft || 0));
    });
  });

  let navScrollSaveTimer = null;
  nav.addEventListener('scroll', () => {
    clearTimeout(navScrollSaveTimer);
    navScrollSaveTimer = setTimeout(() => {
      sessionStorage.setItem('navalhaos_bottom_nav_scroll_left', String(nav.scrollLeft || 0));
    }, 160);
  }, { passive: true });
};


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
    .select('id,name,phone,cnpj,admin_name,admin_cpf,admin_phone,plan,active,subscription_status,slug,booking_min_advance_minutes')
    .eq('owner_id', session.user.id)
    .maybeSingle();
  if (error || !shop || !shop.active || !['active','renewal_pending'].includes(shop.subscription_status)) {
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
  keepSelectedNavVisible();
  await showSystemRenewalAlert(session.user.id, shop);
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = async () => { await db.auth.signOut(); location.href = 'login.html'; };
  return { session, shop };
};

window.showSystemRenewalAlert = async function(userId, shop){
  if (!shop || shop.subscription_status !== 'renewal_pending') return;

  const { data } = await db
    .from('system_subscriptions')
    .select('checkout_url,current_period_end,grace_until,plan_label,status')
    .eq('user_id', userId)
    .eq('barbershop_id', shop.id)
    .order('created_at', { ascending:false })
    .limit(1)
    .maybeSingle();

  const main = document.querySelector('.main');
  if (!main) return;

  const end = data?.current_period_end ? dateBR(data.current_period_end) : '';
  const grace = data?.grace_until ? dateBR(data.grace_until) : '';
  const alert = document.createElement('div');
  alert.className = 'system-renewal-alert';
  alert.innerHTML = `<span>Sua assinatura venceu${end ? ` em ${end}` : ''}. Renove até ${grace || 'o fim do prazo de tolerância'} para manter o acesso.</span>${data?.checkout_url ? `<a class="btn primary small" href="${escapeHtml(data.checkout_url)}" target="_blank">Renovar agora</a>` : ''}`;
  main.prepend(alert);
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
