
// Troca direta de abas: desativa qualquer animação/transição de navegação
(function(){
  document.documentElement.classList.add('no-page-motion');

  window.addEventListener('pageshow', () => {
    document.body && document.body.classList.add('no-page-motion');
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a[data-nav]');
    if (!link) return;
    sessionStorage.setItem('navalhaos_disable_page_motion', '1');
  }, { capture:true });
})();


(function(){
  window.showToast = function(message, type = 'info'){
    let wrap = document.querySelector('.toast-wrap');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      el.style.transition = 'all .25s ease';
      setTimeout(() => el.remove(), 280);
    }, 3200);
  };
})();
