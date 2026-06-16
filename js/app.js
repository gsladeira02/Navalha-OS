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

window.initialSetupCache = window.initialSetupCache || {
  data: null,
  loadedAt: 0
};

window.getInitialSetupState = async function(force = false){
  const now = Date.now();
  if (!force && window.initialSetupCache.data && (now - window.initialSetupCache.loadedAt < 15000)) {
    return window.initialSetupCache.data;
  }

  if (!window.activeShop?.id) return null;
  const shopId = window.activeShop.id;

  const [unitsRes, servicesRes, barbersRes, linksRes, availabilityRes] = await Promise.all([
    db.from('units').select('id', { count:'exact' }).eq('barbershop_id', shopId).eq('active', true),
    db.from('services').select('id', { count:'exact' }).eq('barbershop_id', shopId).eq('active', true),
    db.from('barbers').select('id', { count:'exact' }).eq('barbershop_id', shopId).eq('active', true),
    db.from('barber_services').select('barber_id,service_id').eq('barbershop_id', shopId),
    db.from('barber_availability').select('id,barber_id', { count:'exact' }).eq('barbershop_id', shopId).eq('active', true)
  ]);

  const barbers = barbersRes.data || [];
  const links = linksRes.data || [];
  const barberIds = barbers.map(b => b.id);
  const barbersWithoutServices = barberIds.filter(id => !links.some(link => link.barber_id === id)).length;

  const state = {
    unitsCount: unitsRes.count ?? (unitsRes.data || []).length,
    servicesCount: servicesRes.count ?? (servicesRes.data || []).length,
    barbersCount: barbersRes.count ?? barbers.length,
    barberServiceLinksCount: links.length,
    barbersWithoutServices,
    availabilityCount: availabilityRes.count ?? (availabilityRes.data || []).length,
    complete: false
  };

  state.complete = state.unitsCount > 0
    && state.servicesCount > 0
    && state.barbersCount > 0
    && state.barbersWithoutServices === 0
    && state.availabilityCount > 0;

  window.initialSetupCache = { data: state, loadedAt: Date.now() };
  return state;
};

window.getInitialSetupTarget = function(state){
  if (!state) return null;
  if (state.unitsCount <= 0) return { page:'barbeiros.html', step:'unidades', title:'1. Cadastre as unidades' };
  if (state.servicesCount <= 0) return { page:'servicos.html', step:'servicos', title:'2. Cadastre os serviços' };
  if (state.barbersCount <= 0 || state.barbersWithoutServices > 0) return { page:'barbeiros.html', step:'profissionais', title:'3. Cadastre os profissionais' };
  if (state.availabilityCount <= 0) return { page:'horarios.html', step:'horarios', title:'4. Cadastre os horários' };
  return null;
};

window.getCurrentInternalPage = function(){
  return location.pathname.split('/').pop() || 'dashboard.html';
};

window.maybeRedirectInitialSetup = async function(){
  const current = getCurrentInternalPage();
  if (['login.html','index.html','change-password.html','agendar.html','privacidade.html','termos.html'].includes(current)) return;

  const state = await getInitialSetupState(false);
  if (!state || state.complete) return;

  const target = getInitialSetupTarget(state);
  if (!target) return;

  if (current !== target.page) {
    const url = `${target.page}?setup=${encodeURIComponent(target.step)}`;
    if (window.softNavigate && document.querySelector('main.main')) {
      await softNavigate(url, true);
    } else {
      location.href = url;
    }
    throw new Error('Configuração inicial pendente');
  }
};

window.renderInitialSetupBanner = async function(force = false){
  const main = document.querySelector('main.main');
  if (!main || !window.activeShop?.id) return;

  main.querySelectorAll('.initial-setup-banner').forEach(el => el.remove());

  const state = await getInitialSetupState(force);
  if (!state || state.complete) return;

  const target = getInitialSetupTarget(state);
  if (!target) return;

  const steps = [
    { key:'unidades', label:'Unidades', done: state.unitsCount > 0, page:'barbeiros.html' },
    { key:'servicos', label:'Serviços', done: state.servicesCount > 0, page:'servicos.html' },
    { key:'profissionais', label:'Profissionais', done: state.barbersCount > 0 && state.barbersWithoutServices === 0, page:'barbeiros.html' },
    { key:'horarios', label:'Horários', done: state.availabilityCount > 0, page:'horarios.html' },
  ];

  const banner = document.createElement('section');
  banner.className = 'initial-setup-banner';
  banner.innerHTML = `
    <div>
      <span class="setup-kicker">Configuração inicial</span>
      <h3>${escapeHtml(target.title)}</h3>
      <p>Antes de usar a agenda, configure nessa ordem: unidades, serviços, profissionais e horários.</p>
    </div>
    <div class="setup-steps">
      ${steps.map((s, index) => `
        <a href="${s.page}" data-setup-link="${s.page}" class="setup-step ${s.done ? 'done' : s.key === target.step ? 'current' : ''}">
          <b>${index + 1}</b>
          <span>${escapeHtml(s.label)}</span>
        </a>
      `).join('')}
    </div>
    <div class="setup-actions">
      <a href="${target.page}" data-setup-link="${target.page}" class="btn primary small">Ir para esta etapa</a>
    </div>
  `;

  const topbar = main.querySelector('.topbar');
  if (topbar?.nextSibling) {
    main.insertBefore(banner, topbar.nextSibling);
  } else {
    main.prepend(banner);
  }

  banner.querySelectorAll('[data-setup-link]').forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      softNavigate(link.getAttribute('href'), true);
    });
  });
};

window.refreshInitialSetupBanner = async function(){
  window.initialSetupCache = { data: null, loadedAt: 0 };
  await renderInitialSetupBanner(true);
};


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
  await renderInitialSetupBanner(false);
  await maybeRedirectInitialSetup();
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
