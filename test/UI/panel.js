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
    if (!document.body.classList.contains('ui-login')) workspace();
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
  function workspace() {
    const $ = id => document.getElementById(id);
    const create = (tag, className, html = '') => {
      const element = document.createElement(tag);
      element.className = className;
      element.innerHTML = html;
      return element;
    };
    const rail = create('aside', 'ui-rail');
    const brand = document.querySelector('.topbar-brand');
    const rtt = brand.querySelector('.rtt-pill');
    const nav = document.querySelector('.ds-dock');
    rail.append(brand, nav);
    const note = create('div', 'ui-rail-footer', '<span class="ui-rail-symbol" aria-hidden="true">P</span><strong>你的媒体，你的入口。</strong><span>ProxyHub for Emby</span>');
    rail.append(note);
    document.body.prepend(rail);

    const topbar = document.querySelector('.topbar');
    const context = document.querySelector('.topbar-center');
    context.textContent = '媒体工作空间';
    const menu = create('button', 'ui-menu-toggle', '工具');
    menu.type = 'button'; menu.setAttribute('aria-expanded', 'false');
    const tools = document.querySelector('.topbar-actions');
    tools.id = 'ui-tools'; menu.setAttribute('aria-controls', tools.id);
    const closeTools = () => { tools.classList.remove('is-open'); menu.setAttribute('aria-expanded', 'false'); };
    menu.addEventListener('click', () => {
      const open = tools.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
    });
    tools.querySelectorAll('button[title]').forEach(button => button.append(create('span', 'ui-tool-label', button.title)));
    const themeButton = $('themeToggle');
    const themeLabel = () => {
      const label = document.body.classList.contains('dark') ? '切换浅色模式' : '切换深色模式';
      themeButton.title = label; themeButton.setAttribute('aria-label', label);
      let text = themeButton.querySelector('.ui-tool-label');
      if (!text) { text = create('span', 'ui-tool-label'); themeButton.append(text); }
      if (text.textContent !== label) text.textContent = label;
    };
    const themeObserver = new MutationObserver(themeLabel);
    themeObserver.observe(themeButton, { childList: true });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    themeLabel();
    tools.addEventListener('click', event => { if (event.target.closest('button')) closeTools(); });
    document.addEventListener('click', event => { if (!topbar.contains(event.target)) closeTools(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeTools(); });
    topbar.append(menu);

    const page = $('view-nodes');
    const hero = $('deploy-card');
    const heading = hero.querySelector('h1');
    const version = heading.querySelector('.hero-chip');
    heading.replaceChildren('媒体线路');
    hero.querySelector('.hero-sub').textContent = '连接媒体库，管理每一条观影线路。';
    if (version) note.append(version);
    const overview = create('section', 'ui-overview', `
      <div class="ui-overview-title"><strong>线路总览</strong><span>一个入口，连接所有媒体库</span></div>
      <dl class="ui-metrics">
        <div><dt>已配置节点</dt><dd data-ui-metric="total">—</dd></div>
        <div><dt>今日播放</dt><dd data-ui-metric="plays">—</dd></div>
        <div><dt>待关注</dt><dd data-ui-metric="attention">—</dd></div>
      </dl>
      <div class="ui-distribution"><span>反代模式分布</span><div class="ui-mode-bar" aria-hidden="true"></div></div>`);
    overview.setAttribute('aria-label', '当前媒体线路总览');
    hero.after(overview);
    const layout = create('div', 'ui-workspace');
    const main = create('div', 'ui-routes');
    const side = create('aside', 'ui-insights');
    const modes = document.querySelector('.mode-cards-card');
    const library = document.querySelector('.library-card');
    const libraryHeading = library.querySelector('.card-header h2');
    const arrow = $('nodesArrow');
    libraryHeading.replaceChildren(arrow, '媒体库');
    main.append(library);
    library.querySelector('.card-header').after(modes);
    const batch = create('details', 'ui-batch admin-only', '<summary>批量管理</summary>');
    batch.append(library.querySelector('#nodesToolbar')); modes.after(batch);
    const alertDetails = create('details', 'ui-inbox');
    alertDetails.append(create('summary', 'ui-inbox-summary', '保号提醒 <span data-ui-metric="attention">—</span>'));
    alertDetails.append($('watchAlerts'));
    side.append(alertDetails);
    const edge = create('div', 'ui-edge', '<strong>边缘连接</strong><p>设备到 Cloudflare 的往返延迟；节点按钮可检测源站线路。</p>');
    edge.append(rtt);
    side.append(edge);
    layout.append(main, side); overview.after(layout);
    const wide = matchMedia('(min-width: 1200px)');
    const adaptInbox = () => {
      alertDetails.open = wide.matches;
      if (wide.matches) edge.append(rtt);
      else menu.before(rtt);
    };
    adaptInbox(); wide.addEventListener('change', adaptInbox);
    const desktop = matchMedia('(min-width: 901px)');
    const adaptBatch = () => { batch.open = desktop.matches; };
    adaptBatch(); desktop.addEventListener('change', adaptBatch);
    const selectMode = mode => modes.querySelectorAll('.mode-card').forEach(card => {
      card.setAttribute('aria-pressed', String(card.dataset.mode === mode));
    });
    const originalFilter = window.filterByMode;
    window.filterByMode = mode => { originalFilter(mode); selectMode(mode); };
    const originalReset = window.showAllNodes;
    window.showAllNodes = () => { originalReset(); selectMode('all'); };
    const originalFocus = window.focusWatchNode;
    window.focusWatchNode = async prefix => { await originalFocus(prefix); selectMode('all'); };
    const originalSearch = window.filterNodesList;
    window.filterNodesList = (...args) => {
      const result = originalSearch(...args);
      selectMode($('searchNode').value.trim() ? '' : 'all');
      return result;
    };
    selectMode('all');

    for (const [id, title, detail] of [
      ['view-speed', '测速与 DNS', '选择优选源，测试连通性，再应用到你的域名。'],
      ['view-settings', '工作空间设置', '管理访问权限、运行区域和配置备份。']
    ]) {
      const view = $(id);
      view.prepend(create('header', 'ui-page-heading', '<h1>' + title + '</h1><p>' + detail + '</p>'));
    }
    const settings = $('view-settings');
    const backup = $('config-backup-card');
    $('ipguard-card').after(backup);
    const settingsGrid = create('div', 'ui-settings-grid');
    [...settings.children].filter(el => el.matches('.card,#cf-trace-card')).forEach(el => settingsGrid.append(el));
    settings.querySelector('.ui-page-heading').after(settingsGrid);
    const about = settings.querySelector('a[href="https://t.me/MakkaPakkaOvO"]')?.parentElement;
    if (about) { about.classList.add('ui-about'); settingsGrid.after(about); }

    // These nodes are redrawn by the original handlers after edits and retention refreshes.
    let firstLoad = true;
    function update() {
      const routes = window.globalRoutesData;
      if (!Array.isArray(routes)) return;
      const counts = { off: 0, realip_only: 0, dual: 0, strict: 0, emos: 0 };
      let attention = 0, plays = 0;
      for (const route of routes) {
        if (route.mode in counts) counts[route.mode]++;
        const state = getWatchState(route);
        if (['overdue', 'warning', 'unknown'].includes(state.status)) attention++;
        plays += Number(route.todayReqs) || 0;
      }
      for (const [name, value] of Object.entries({ total: routes.length, plays, attention })) {
        document.querySelectorAll('[data-ui-metric="' + name + '"]').forEach(el => {
          if (el.textContent !== String(value)) el.textContent = value;
        });
      }
      alertDetails.hidden = attention === 0;
      const bar = overview.querySelector('.ui-mode-bar');
      bar.replaceChildren(...Object.entries(counts).filter(([, count]) => count).map(([mode, count]) => {
        const segment = create('span', 'ui-mode-segment');
        segment.dataset.mode = mode; segment.style.flex = count;
        return segment;
      }));
      $('list-grid').querySelectorAll('.emby-card').forEach(card => {
        if (card.dataset.uiReady) return;
        card.dataset.uiReady = '1';
        const title = card.querySelector('.card-title-group > div:last-child');
        title.classList.add('ui-node-title');
        const actions = card.querySelector('.node-summary > div');
        actions.classList.add('ui-node-actions');
        card.querySelectorAll('button[title]').forEach(button => button.setAttribute('aria-label', button.title));
        const checkbox = card.querySelector('.node-cb');
        if (checkbox) checkbox.setAttribute('aria-label', '选择 ' + title.textContent.trim());
      });
      if (firstLoad && $('list-grid').childElementCount) {
        firstLoad = false;
        $('list-grid').style.display = 'grid';
        $('nodesHint').style.display = 'none';
        if (window.ROLE === 'admin') $('nodesToolbar').style.display = 'flex';
      }
    }
    new MutationObserver(update).observe($('list-grid'), { childList: true, subtree: true });
    new MutationObserver(update).observe($('watchAlertList'), { childList: true });
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
