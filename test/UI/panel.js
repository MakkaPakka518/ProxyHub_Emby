(() => {
  const $ = id => document.getElementById(id);
  const create = (tag, className, html = '') => {
    const el = document.createElement(tag);
    el.className = className;
    el.innerHTML = html;
    return el;
  };
  const text = (el, value) => { if (el.textContent !== String(value)) el.textContent = value; };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function keyboardButton(el, label) {
    if (!el) return;
    el.setAttribute('role', 'button'); el.tabIndex = 0;
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('keydown', event => {
      if (event.target === el && ['Enter', ' '].includes(event.key)) { event.preventDefault(); el.click(); }
    });
  }

  function workspace() {
    const topbar = document.querySelector('.topbar');
    const nav = document.querySelector('.ds-dock');
    const navigationHost = document.querySelector('.topbar-center');
    const compact = matchMedia('(max-width: 760px)');
    const placeNavigation = () => (compact.matches ? document.body : navigationHost).append(nav);
    placeNavigation(); compact.addEventListener('change', placeNavigation);
    const rtt = document.querySelector('.rtt-pill');
    const menu = create('button', 'ui-menu-toggle', I.lines + '<span>工具</span>');
    menu.type = 'button'; menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', '工具');
    const tools = document.querySelector('.topbar-actions');
    tools.id = 'ui-tools'; menu.setAttribute('aria-controls', tools.id);
    const closeTools = () => { tools.classList.remove('is-open'); menu.setAttribute('aria-expanded', 'false'); };
    menu.addEventListener('click', () => menu.setAttribute('aria-expanded', String(tools.classList.toggle('is-open'))));
    tools.querySelectorAll('button[title]').forEach(button => button.append(create('span', 'ui-tool-label', button.title)));
    const themeButton = $('themeToggle');
    const themeLabel = () => {
      const label = document.body.classList.contains('dark') ? '切换浅色模式' : '切换深色模式';
      themeButton.title = label; themeButton.setAttribute('aria-label', label);
      let span = themeButton.querySelector('.ui-tool-label');
      if (!span) { span = create('span', 'ui-tool-label'); themeButton.append(span); }
      text(span, label);
    };
    const themeObserver = new MutationObserver(themeLabel);
    themeObserver.observe(themeButton, { childList: true });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    themeLabel();
    tools.addEventListener('click', event => { if (event.target.closest('button')) closeTools(); });
    document.addEventListener('click', event => { if (!topbar.contains(event.target)) closeTools(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeTools(); });
    topbar.append(rtt, menu);
    const originalSwitchView = window.switchDsView;
    window.switchDsView = (...args) => {
      originalSwitchView(...args);
      if (reducedMotion.matches) window.scrollTo({ top: 0, behavior: 'instant' });
    };

    const hero = $('deploy-card');
    const heading = hero.querySelector('h1');
    const version = heading.querySelector('.hero-chip');
    heading.replaceChildren('媒体空间');
    hero.querySelector('.hero-sub').textContent = '挑选一条线路，开始下一场观影。';
    if (version) document.querySelector('.page-footer').append(version);

    const summary = create('div', 'ui-summary-bar', `
      <dl class="ui-counts">
        <div><dt>媒体节点</dt><dd data-ui-metric="total">—</dd></div>
        <div><dt>今日播放</dt><dd data-ui-metric="plays">—</dd></div>
      </dl>`);
    const inbox = create('details', 'ui-inbox');
    inbox.append(create('summary', 'ui-inbox-summary', I.warn + '保号提醒 <span data-ui-metric="attention">—</span>'));
    inbox.append($('watchAlerts'));
    summary.append(inbox); hero.after(summary);
    document.addEventListener('click', event => { if (!inbox.contains(event.target)) inbox.open = false; });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') inbox.open = false; });

    const stage = create('section', 'ui-focus', `
      <div class="ui-focus-main">
        <div class="ui-focus-icon" aria-hidden="true"></div>
        <div class="ui-focus-identity"><h2></h2><div class="ui-focus-address"><code></code><span class="ui-focus-mode"></span></div></div>
        <p class="ui-focus-age"></p>
        <div class="ui-focus-actions">
          <button type="button" data-focus-action="copy">${I.link} 复制入口</button>
          <button type="button" data-focus-action="edit">${I.pencil} 编辑节点</button>
          <button type="button" data-focus-action="import">${I.download} 导入播放器</button>
          <button type="button" data-focus-action="detail">线路详情</button>
        </div>
      </div>
      <div class="ui-focus-facts">
        <div class="ui-cycle"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ui-cycle-track" cx="60" cy="60" r="52"/><circle class="ui-cycle-value" cx="60" cy="60" r="52" pathLength="100"/></svg><div><strong class="ui-cycle-number">—</strong><span class="ui-cycle-label"></span></div></div>
        <div class="ui-cycle-description"><strong></strong><span></span></div>
        <dl class="ui-node-usage"><div><dt>今日流量</dt><dd data-focus-value="bandwidth">—</dd></div><div><dt>播放 / 累计</dt><dd data-focus-value="plays">—</dd></div></dl>
      </div>`);
    stage.hidden = true; stage.tabIndex = -1;
    const stageTitle = stage.querySelector('h2'); stageTitle.id = 'ui-focus-title';
    stage.setAttribute('aria-labelledby', stageTitle.id);
    summary.after(stage);

    const library = document.querySelector('.library-card');
    const modes = document.querySelector('.mode-cards-card');
    const arrow = $('nodesArrow');
    library.querySelector('.card-header h2').replaceChildren(arrow, '你的媒体库');
    library.querySelector('.card-header').after(modes);
    const batch = create('details', 'ui-batch admin-only', '<summary>批量管理</summary>');
    batch.append(library.querySelector('#nodesToolbar')); modes.after(batch);
    stage.after(library);
    const grid = $('list-grid');
    const emptySearch = create('p', 'ui-search-empty', '没有匹配的节点。试试其他关键词，或选择全部节点。');
    emptySearch.hidden = true; grid.after(emptySearch);

    let selectedPrefix = '';
    let firstLoad = true;
    let selectionAnimation;
    const cards = () => [...grid.querySelectorAll('.emby-card')];
    const selectedCard = () => cards().find(card => card.dataset.prefix === selectedPrefix);
    const canManageNode = () => ['admin', 'user'].includes(window.ROLE);
    function showSelection(prefix, animate = false) {
      const card = cards().find(item => item.dataset.prefix === prefix);
      const route = (window.globalRoutesData || []).find(item => item.prefix === prefix);
      if (!card || !route) return;
      selectedPrefix = prefix; stage.dataset.prefix = prefix; stage.hidden = false;
      cards().forEach(item => {
        const selected = item === card;
        item.classList.toggle('ui-selected', selected);
        item.querySelector('.ui-select-node')?.setAttribute('aria-pressed', String(selected));
      });
      text(stageTitle, route.remark || route.prefix);
      text(stage.querySelector('code'), '/' + route.prefix);
      text(stage.querySelector('.ui-focus-mode'), card.querySelector('.badge').textContent);
      const icon = stage.querySelector('.ui-focus-icon');
      if (icon.dataset.prefix !== prefix || icon.dataset.icon !== String(route.icon || '')) {
        icon.replaceChildren(card.querySelector('.emby-icon').cloneNode(true));
        icon.dataset.prefix = prefix; icon.dataset.icon = route.icon || '';
      }
      const state = getWatchState(route);
      text(stage.querySelector('.ui-focus-age'), watchAgeText(state));
      stage.dataset.watch = state.status;
      const overdue = state.status === 'overdue';
      const known = state.enabled && Number.isFinite(state.remainingDays);
      const days = known ? formatWatchDays(state.remainingDays) : '—';
      text(stage.querySelector('.ui-cycle-number'), days);
      stage.querySelector('.ui-cycle-number').classList.toggle('is-long', String(days).length > 4);
      text(stage.querySelector('.ui-cycle-label'), known ? (overdue ? '已超天数' : '剩余天数') : '暂无计时');
      text(stage.querySelector('.ui-cycle-description strong'), watchStateLabel(state));
      text(stage.querySelector('.ui-cycle-description span'), state.enabled ? '观看下限 ' + state.limit + ' 天' : '可在节点配置中设置');
      stage.querySelector('.ui-cycle-value').style.strokeDashoffset = known ? (overdue ? 0 : state.percent) : 100;
      text(stage.querySelector('[data-focus-value="bandwidth"]'), card.querySelector('.node-summary .bw-val')?.textContent || '—');
      text(stage.querySelector('[data-focus-value="plays"]'), (Number(route.todayReqs) || 0) + ' / ' + (Number(route.totalReqs) || Number(route.todayReqs) || 0));
      stage.querySelector('[data-focus-action="edit"]').hidden = !canManageNode();
      stage.querySelector('[data-focus-action="import"]').hidden = !canManageNode();
      if (animate && !reducedMotion.matches) {
        const identity = stage.querySelector('.ui-focus-main');
        const opacity = selectionAnimation?.playState === 'running' ? getComputedStyle(identity).opacity : .55;
        selectionAnimation?.cancel();
        selectionAnimation = identity.animate([{ opacity }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
      }
    }
    stage.addEventListener('click', event => {
      const action = event.target.closest('[data-focus-action]')?.dataset.focusAction;
      const card = selectedCard(); if (!action || !card) return;
      if (action === 'detail') {
        if (grid.style.display === 'none') toggleNodesCollapse();
        const detail = card.querySelector('.node-detail');
        if (detail.style.display === 'none') card.querySelector('.node-summary button[onclick^="toggleNodeDetail("]').click();
        detail.tabIndex = -1; detail.setAttribute('role', 'region'); detail.setAttribute('aria-label', '节点线路详情');
        detail.focus({ preventScroll: true });
        card.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
        return;
      }
      const selector = {
        copy: '.node-summary button[title="复制直达链接"]',
        edit: '.card-footer button[onclick^="editNode("]',
        import: '.card-footer button[onclick^="openImportModal("]'
      }[action];
      if ((action === 'edit' || action === 'import') && !canManageNode()) return;
      card.querySelector(selector)?.click();
    });
    grid.addEventListener('click', event => {
      const button = event.target.closest('.ui-select-node');
      if (button) {
        showSelection(button.closest('.emby-card').dataset.prefix, true);
        stage.focus({ preventScroll: true });
        stage.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      }
    });

    const selectMode = mode => modes.querySelectorAll('.mode-card').forEach(card => card.setAttribute('aria-pressed', String(card.dataset.mode === mode)));
    const originalFilter = window.filterByMode;
    window.filterByMode = mode => { originalFilter(mode); selectMode(mode); update(); };
    const originalReset = window.showAllNodes;
    window.showAllNodes = () => { originalReset(); selectMode('all'); update(); };
    const originalFocus = window.focusWatchNode;
    window.focusWatchNode = async prefix => {
      inbox.open = false; await originalFocus(prefix); selectMode('all'); showSelection(prefix, true);
      if (reducedMotion.matches) selectedCard()?.scrollIntoView({ block: 'center', behavior: 'instant' });
    };
    const originalSearch = window.filterNodesList;
    window.filterNodesList = (...args) => {
      const result = originalSearch(...args); selectMode($('searchNode').value.trim() ? '' : 'all'); update(); return result;
    };
    selectMode('all');

    for (const [id, title, detail] of [
      ['view-speed', '连接实验室', '测试线路，选择适合你的 DNS。'],
      ['view-settings', '空间设置', '访问权限、运行区域与数据备份。']
    ]) $(id).prepend(create('header', 'ui-page-heading', '<h1>' + title + '</h1><p>' + detail + '</p>'));
    const settings = $('view-settings');
    $('ipguard-card').after($('config-backup-card'));
    const settingsGrid = create('div', 'ui-settings-grid');
    [...settings.children].filter(el => el.matches('.card,#cf-trace-card')).forEach(el => settingsGrid.append(el));
    settings.querySelector('.ui-page-heading').after(settingsGrid);
    const about = settings.querySelector('a[href="https://t.me/MakkaPakkaOvO"]')?.parentElement;
    if (about) { about.classList.add('ui-about'); settingsGrid.after(about); }

    function update() {
      const routes = window.globalRoutesData; if (!Array.isArray(routes)) return;
      let attention = 0, plays = 0;
      routes.forEach(route => { if (['overdue', 'warning', 'unknown'].includes(getWatchState(route).status)) attention++; plays += Number(route.todayReqs) || 0; });
      for (const [name, value] of Object.entries({ total: routes.length, plays, attention })) document.querySelectorAll('[data-ui-metric="' + name + '"]').forEach(el => text(el, value));
      inbox.hidden = attention === 0;
      cards().forEach(card => {
        if (card.dataset.uiReady) return;
        card.dataset.uiReady = '1';
        const group = card.querySelector('.card-title-group');
        const title = group.querySelector('div:last-child');
        title.classList.add('ui-node-title');
        const button = create('button', 'ui-select-node'); button.type = 'button';
        button.setAttribute('aria-label', '选择节点 ' + title.textContent.trim());
        button.append(group.querySelector('.emby-icon'), title); group.append(button);
        card.querySelectorAll('button[title]').forEach(el => el.setAttribute('aria-label', el.title));
        card.querySelector('.node-cb')?.setAttribute('aria-label', '批量选择 ' + title.textContent.trim());
      });
      if (firstLoad && grid.childElementCount) {
        firstLoad = false; grid.style.display = 'grid'; $('nodesHint').style.display = 'none';
        if (window.ROLE === 'admin') $('nodesToolbar').style.display = 'flex';
      }
      const visible = cards().filter(card => card.style.display !== 'none');
      const selected = visible.find(card => card.dataset.prefix === selectedPrefix) || visible[0];
      emptySearch.hidden = !routes.length || !!visible.length;
      if (selected) showSelection(selected.dataset.prefix);
      else { stage.hidden = true; selectedPrefix = ''; }
    }
    let frame;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    new MutationObserver(schedule).observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    new MutationObserver(schedule).observe($('watchAlertList'), { childList: true });
    update();
  }

  // Preserve the existing dialog handlers while isolating keyboard interaction.
  function manageDialogFocus() {
    const dialogs = [['nodeModal', '节点配置'], ['importModal', '导入播放器']].map(([id, label]) => {
      const overlay = $(id), panel = overlay.querySelector('.modal-box') || overlay.firstElementChild;
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', label); panel.tabIndex = -1;
      panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation();
          overlay.querySelector('.close-x,button[onclick="closeImpModal()"]').click();
        }
        if (event.key !== 'Tab') return;
        const items = [...panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
          .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        if (!items.length) { event.preventDefault(); panel.focus(); return; }
        const edge = event.shiftKey ? items[0] : items.at(-1);
        if (document.activeElement === edge || document.activeElement === panel) {
          event.preventDefault(); (event.shiftKey ? items.at(-1) : items[0]).focus();
        }
      });
      return { overlay, panel };
    });
    let active, previousFocus, previousOverflow;
    const inert = new Map();
    const toast = $('toast');
    const toastHome = { parent: toast.parentNode, next: toast.nextSibling };
    const sync = () => {
      const next = dialogs.findLast(({ overlay }) => getComputedStyle(overlay).display !== 'none');
      if (next === active) return;
      if (active) {
        for (const [el, value] of inert) el.inert = value;
        inert.clear(); document.body.style.overflow = previousOverflow;
        toastHome.parent.insertBefore(toast, toastHome.next);
        if (!next) (previousFocus?.isConnected ? previousFocus : document.querySelector('.topbar-logo')).focus({ preventScroll: true });
      }
      active = next;
      if (!active) return;
      previousFocus = document.activeElement; previousOverflow = document.body.style.overflow;
      active.panel.append(toast);
      for (let node = active.overlay; node !== document.body; node = node.parentElement) {
        for (const sibling of node.parentElement.children) {
          if (sibling !== node && !['SCRIPT', 'STYLE'].includes(sibling.tagName)) { inert.set(sibling, sibling.inert); sibling.inert = true; }
        }
      }
      document.body.style.overflow = 'hidden';
      const first = active.panel.querySelector('input:not([type="hidden"]):not([readonly]),select,textarea') || active.panel;
      first.focus({ preventScroll: true });
    };
    const observer = new MutationObserver(sync);
    dialogs.forEach(({ overlay }) => observer.observe(overlay, { attributes: true, attributeFilter: ['style'] }));
    sync();
  }

  function ready() {
    if (!document.body.classList.contains('ui-login')) { workspace(); manageDialogFocus(); }
    document.querySelectorAll('.mode-card').forEach(el => keyboardButton(el, el.querySelector('.mc-name').textContent));
    keyboardButton(document.querySelector('.topbar-logo'), '账户设置');
    keyboardButton(document.querySelector('.page-footer'), '查看 ProxyHub 公开仓库');
    keyboardButton($('nodesHint'));
    document.querySelectorAll('.collapse-head[onclick],.card-header[onclick]').forEach(el => keyboardButton(el));
    document.querySelectorAll('button[title]').forEach(el => { if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.title); });
    if ($('toast')) { $('toast').setAttribute('role', 'status'); $('toast').setAttribute('aria-live', 'polite'); }
    document.querySelectorAll('.ds-dock-item').forEach(button => {
      const update = () => button.setAttribute('aria-current', button.classList.contains('active') ? 'page' : 'false');
      update(); new MutationObserver(update).observe(button, { attributes: true, attributeFilter: ['class'] });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
