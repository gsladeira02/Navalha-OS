
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
