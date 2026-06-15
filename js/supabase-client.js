(function () {
  const cfg = window.NAVALHAOS_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes('COLE_AQUI')) {
    console.warn('Configure js/config.js com sua URL e anon key do Supabase.');
  }
  window.db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
})();
