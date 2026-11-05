(() => {
  function keyboardButton(element, label) {
    if (!element) return;
    element.setAttribute('role', 'button');
    element.tabIndex = 0;
    if (label) element.setAttribute('aria-label', label);
    element.addEventListener('keydown', event => {
      if (event.target === element && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        element.click();
      }
    });
  }
  function ready() {
    document.querySelectorAll('.mode-card').forEach(card => keyboardButton(card, card.querySelector('.mc-name').textContent));
    keyboardButton(document.querySelector('.topbar-logo'), '账户设置');
    keyboardButton(document.querySelector('.page-footer'), '查看 ProxyHub 公开仓库');
    keyboardButton(document.getElementById('nodesHint'));
    document.querySelectorAll('.collapse-head[onclick], .card-header[onclick]').forEach(header => keyboardButton(header));
    document.querySelectorAll('button[title]').forEach(button => {
      if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', button.title);
    });
    const toast = document.getElementById('toast');
    if (toast) { toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); }
    document.querySelectorAll('.ds-dock-item').forEach(button => {
      const update = () => button.setAttribute('aria-current', button.classList.contains('active') ? 'page' : 'false');
      update();
      new MutationObserver(update).observe(button, { attributes: true, attributeFilter: ['class'] });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
