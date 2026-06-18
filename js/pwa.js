(function(){
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);
  let deferredPrompt = null;

  function registerServiceWorker(){
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  }

  function shouldShowInstallBox(){
    if (isStandalone) return false;
    const dismissedAt = Number(localStorage.getItem('navalhaos_install_dismissed_at') || 0);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return !dismissedAt || Date.now() - dismissedAt > sevenDays;
  }

  function dismissInstallBox(){
    localStorage.setItem('navalhaos_install_dismissed_at', String(Date.now()));
    document.querySelectorAll('.pwa-install-box').forEach(el => el.remove());
  }

  function createInstallBox(mode){
    if (!shouldShowInstallBox()) return;
    if (document.querySelector('.pwa-install-box')) return;

    const box = document.createElement('div');
    box.className = 'pwa-install-box';
    const iosText = 'No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.';
    const chromeText = 'Instale o NavalhaOS no celular para abrir como aplicativo.';
    const bodyText = mode === 'ios' ? iosText : chromeText;

    box.innerHTML = `
      <button class="pwa-install-close" type="button" aria-label="Fechar">×</button>
      <div class="pwa-install-icon"><img src="/assets/icons/icon-192.png" alt=""></div>
      <div class="pwa-install-copy">
        <strong>Instalar NavalhaOS</strong>
        <span>${bodyText}</span>
      </div>
      ${mode === 'prompt' ? '<button class="btn primary small pwa-install-action" type="button">Instalar</button>' : ''}
    `;

    document.body.appendChild(box);

    box.querySelector('.pwa-install-close')?.addEventListener('click', dismissInstallBox);
    box.querySelector('.pwa-install-action')?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) {}
      deferredPrompt = null;
      dismissInstallBox();
    });
  }

  registerServiceWorker();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    createInstallBox('prompt');
  });

  window.addEventListener('appinstalled', dismissInstallBox);

  document.addEventListener('DOMContentLoaded', () => {
    if (isIOS && isSafari && !isStandalone) {
      setTimeout(() => createInstallBox('ios'), 900);
    }
  });
})();
