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

window.appAuthCache = window.appAuthCache || {
  session: null,
  shop: null,
  loadedAt: 0
};

window.getCachedAuthContext = async function(force = false){
  const now = Date.now();
  if (!force && window.appAuthCache.session && window.appAuthCache.shop && (now - window.appAuthCache.loadedAt < 120000)) {
    return { session: window.appAuthCache.session, shop: window.appAuthCache.shop };
  }

  const { data: { session } } = await db.auth.getSession();
  if (!session) return { session: null, shop: null };

  const { data: shop, error } = await db
    .from('barbershops')
    .select('id,name,phone,cnpj,admin_name,admin_cpf,admin_phone,plan,active,subscription_status,slug,booking_min_advance_minutes')
    .eq('owner_id', session.user.id)
    .maybeSingle();

  if (error || !shop) return { session, shop: null };

  window.appAuthCache = { session, shop, loadedAt: Date.now() };
  return { session, shop };
};

window.applyAppShellData = function(pageTitle, subtitle, session, shop){
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

  const current = location.pathname.split('/').pop().replace('.html','') || 'dashboard';
  document.querySelectorAll('[data-nav]').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === current);
  });

  keepSelectedNavVisible();
};

window.pageScriptCache = window.pageScriptCache || {};
window.softNavigationRunning = false;

window.getPageScriptFromDocument = function(doc){
  const scripts = Array.from(doc.querySelectorAll('script[src]')).map(s => s.getAttribute('src') || '');
  return scripts.find(src => /^js\/[^/]+\.js$/.test(src) && ![
    'js/config.js',
    'js/supabase-client.js',
    'js/ui.js',
    'js/app.js'
  ].includes(src));
};

window.executePageScript = async function(scriptSrc){
  if (!scriptSrc) return;
  const normalized = scriptSrc.replace(/^\//, '');
  if (!window.pageScriptCache[normalized]) {
    const res = await fetch(normalized, { cache: 'no-store' });
    if (!res.ok) throw new Error('Não foi possível carregar a tela.');
    window.pageScriptCache[normalized] = await res.text();
  }

  // Executa isolado para evitar erro de redeclaração de variáveis entre abas.
  new Function(window.pageScriptCache[normalized] + `\n//# sourceURL=${normalized}`)();
};

window.replaceMainPageContent = function(nextDoc){
  const currentMain = document.querySelector('main.main');
  const nextMain = nextDoc.querySelector('main.main');
  if (!currentMain || !nextMain) return false;

  const currentTopbar = currentMain.querySelector('.topbar');
  const nextNodes = Array.from(nextMain.children).filter(el => !el.classList?.contains('topbar'));

  currentMain.querySelectorAll(':scope > :not(.topbar)').forEach(el => el.remove());

  const fragment = document.createDocumentFragment();
  nextNodes.forEach(node => fragment.appendChild(document.importNode(node, true)));
  currentMain.appendChild(fragment);

  if (currentTopbar && !currentMain.contains(currentTopbar)) {
    currentMain.prepend(currentTopbar);
  }

  return true;
};

window.softNavigate = async function(url, push = true){
  if (window.softNavigationRunning) return;
  window.softNavigationRunning = true;

  try {
    const cleanUrl = String(url || '').split('#')[0];
    const currentFile = location.pathname.split('/').pop() || 'dashboard.html';
    const targetFile = cleanUrl.split('/').pop() || cleanUrl;

    if (!targetFile || targetFile === currentFile) return;

    document.body.classList.add('soft-loading');

    const res = await fetch(cleanUrl, { cache: 'no-store' });
    if (!res.ok) {
      location.href = cleanUrl;
      return;
    }

    const html = await res.text();
    const nextDoc = new DOMParser().parseFromString(html, 'text/html');
    const pageScript = getPageScriptFromDocument(nextDoc);

    const replaced = replaceMainPageContent(nextDoc);
    if (!replaced) {
      location.href = cleanUrl;
      return;
    }

    document.title = nextDoc.title || document.title;
    if (push) history.pushState({ navalhaosSoftNav: true }, '', cleanUrl);

    const current = cleanUrl.split('/').pop().replace('.html','');
    document.querySelectorAll('[data-nav]').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === current);
    });
    keepSelectedNavVisible();

    await executePageScript(pageScript);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    location.href = url;
  } finally {
    document.body.classList.remove('soft-loading');
    window.softNavigationRunning = false;
  }
};

window.setupFluidNavigation = function(){
  if (window.fluidNavigationReady) return;
  window.fluidNavigationReady = true;

  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a[data-nav]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('#')) return;

    event.preventDefault();
    softNavigate(href, true);
  }, { capture:true });

  window.addEventListener('popstate', () => {
    const file = location.pathname.split('/').pop() || 'dashboard.html';
    if (file.endsWith('.html')) softNavigate(file, false);
  });
};


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
  const { session, shop } = await getCachedAuthContext(false);

  if (!session) {
    location.href = 'login.html';
    throw new Error('Sem sessão');
  }

  if (window.needsPasswordChange(session.user) && !location.pathname.endsWith('change-password.html')) {
    location.href = 'change-password.html';
    throw new Error('Troca de senha pendente');
  }

  if (!shop || !shop.active || !['active','renewal_pending'].includes(shop.subscription_status)) {
    await db.auth.signOut();
    window.appAuthCache = { session: null, shop: null, loadedAt: 0 };
    location.href = 'login.html';
    throw new Error('Acesso bloqueado');
  }

  applyAppShellData(pageTitle, subtitle, session, shop);
  await showSystemRenewalAlert(session.user.id, shop);

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await db.auth.signOut();
      window.appAuthCache = { session: null, shop: null, loadedAt: 0 };
      location.href = 'login.html';
    };
  }

  setupFluidNavigation();
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
  main.querySelectorAll('.system-renewal-alert').forEach(el => el.remove());

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
