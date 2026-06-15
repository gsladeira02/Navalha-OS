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

window.requireAuth = async function(pageTitle, subtitle){
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    location.href = 'login.html';
    throw new Error('Sem sessão');
  }
  const { data: shop, error } = await db
    .from('barbershops')
    .select('id,name,plan,active,subscription_status,slug')
    .eq('owner_id', session.user.id)
    .maybeSingle();
  if (error || !shop || !shop.active || shop.subscription_status !== 'active') {
    await db.auth.signOut();
    location.href = 'login.html';
    throw new Error('Acesso bloqueado');
  }
  window.activeShop = shop;
  document.getElementById('userEmail').textContent = session.user.email;
  document.getElementById('shopName').textContent = shop.name;
  document.getElementById('pageTitle').textContent = pageTitle;
  document.getElementById('pageSubtitle').textContent = subtitle || '';
  const current = location.pathname.split('/').pop().replace('.html','');
  document.querySelectorAll('[data-nav]').forEach(a => {
    if (a.dataset.nav === current) a.classList.add('active');
  });
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = async () => { await db.auth.signOut(); location.href = 'login.html'; };
  return { session, shop };
};
