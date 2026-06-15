const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const todayISO = () => new Date().toISOString().slice(0,10);
const money = (v) => fmtBRL.format(Number(v || 0));

function toast(msg, type='ok'){
  const old = document.querySelector('.toast'); if(old) old.remove();
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg;
  document.body.appendChild(el); setTimeout(()=>el.remove(), 3600);
}

function statusBadge(status){ return `<span class="status ${status || ''}">${status || '-'}</span>`; }

async function getSession(){
  const { data } = await db.auth.getSession();
  return data.session;
}

async function requireAuth(){
  const session = await getSession();
  if(!session){ window.location.href = 'login.html'; return null; }
  return session;
}

async function signOut(){ await db.auth.signOut(); window.location.href = 'login.html'; }

async function getMyShop(){
  const session = await requireAuth(); if(!session) return null;
  const { data, error } = await db.from('barbershops').select('*').eq('owner_id', session.user.id).maybeSingle();
  if(error){ toast(error.message, 'err'); return null; }
  if(!data){
    document.querySelector('main')?.insertAdjacentHTML('afterbegin', `<div class="notice">Sua conta existe no Supabase Auth, mas ainda não foi vinculada a uma barbearia. Cadastre a barbearia manualmente no Supabase antes de liberar o acesso.</div>`);
    return null;
  }
  if(data.active === false || data.subscription_status !== 'active'){
    document.querySelector('main')?.insertAdjacentHTML('afterbegin', `<div class="notice">Assinatura inativa. O acesso a esta barbearia está bloqueado.</div>`);
    document.querySelectorAll('button:not(#logoutBtn), input, select, textarea').forEach(el => el.disabled = true);
  }
  return data;
}

function setActiveNav(){
  const file = location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.nav a').forEach(a=>{ if(a.getAttribute('href') === file) a.classList.add('active'); });
}

async function bootLayout(title, subtitle){
  setActiveNav();
  const logout = document.getElementById('logoutBtn'); if(logout) logout.onclick = signOut;
  const session = await requireAuth();
  const emailEl = document.getElementById('userEmail'); if(emailEl && session) emailEl.textContent = session.user.email;
  const titleEl = document.getElementById('pageTitle'); if(titleEl) titleEl.textContent = title;
  const subEl = document.getElementById('pageSubtitle'); if(subEl) subEl.textContent = subtitle;
  return await getMyShop();
}

async function loadOptions(table, shopId, selectId, label='name'){
  const el = document.getElementById(selectId); if(!el) return [];
  const { data, error } = await db.from(table).select('*').eq('barbershop_id', shopId).order(label);
  if(error){ toast(error.message, 'err'); return []; }
  el.innerHTML = '<option value="">Selecione</option>' + (data||[]).map(x=>`<option value="${x.id}">${x[label]}</option>`).join('');
  return data || [];
}

async function getShopData(shopId){
  const [barbers, services, customers] = await Promise.all([
    db.from('barbers').select('*').eq('barbershop_id', shopId).eq('active', true).order('name'),
    db.from('services').select('*').eq('barbershop_id', shopId).eq('active', true).order('name'),
    db.from('customers').select('*').eq('barbershop_id', shopId).order('name')
  ]);
  return { barbers: barbers.data || [], services: services.data || [], customers: customers.data || [] };
}
