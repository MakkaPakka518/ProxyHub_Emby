(() => {
  const $ = id => document.getElementById(id);
  const create = (tag, className, html = '') => {
    const el = document.createElement(tag); el.className = className; el.innerHTML = html; return el;
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const holidayArt = `<svg viewBox="0 0 104 112" fill="none" aria-hidden="true" focusable="false">
    <path d="M51 18v77" stroke="#cfaf73" stroke-width="2" stroke-linecap="round"/>
    <path d="m51 26-15 14h10L28 57h14L20 77h25L14 96h76L59 77h25L62 57h14L57 40h10L51 26Z" fill="#387557"/>
    <path d="m51 27-4 69h43L59 77h25L62 57h14L57 40h10L51 27Z" fill="#2a624b"/>
    <path d="m51 3 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1 3-7Z" fill="#f3dca5"/>
    <path d="M35 55c13 8 22 9 35 11M27 78c19 9 29 11 48 10" stroke="#e6c383" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="43" cy="48" r="4" fill="#cf6571"/><circle cx="62" cy="71" r="4" fill="#e9b471"/><circle cx="35" cy="87" r="4" fill="#cf6571"/>
    <path d="M46 96h11v12H46z" fill="#ad8058"/><path d="M8 102h27v10H8z" fill="#b74858"/><path d="M18 102v10" stroke="#f3dca5" stroke-width="3"/>
    <path d="M72 99h23v13H72z" fill="#d6b77b"/><path d="M82 99v13" stroke="#fcf2d6" stroke-width="3"/>
    <path d="M13 37v6m-3-3h6m73-20v6m-3-3h6m1 29v4m-2-2h4" stroke="#ecdbb7" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;

  function holidayMotion() {
    const snowIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4M17 19l-1-4 4-1M4 14l4 1-1 4M17 5l-1 4 4 1"/></svg>';
    const effects = create('div', 'ui-holiday-effects');
    effects.setAttribute('aria-hidden', 'true'); effects.inert = true;
    const snowfall = create('div', 'ui-snowfall');
    for (let i = 0; i < 28; i++) {
      const flake = create('span', 'ui-snowflake' + (i % 4 === 0 ? ' is-crystal' : ''), i % 4 === 0 ? snowIcon : '');
      flake.style.setProperty('--snow-left', ((i * 37 + 7) % 100) + '%');
      flake.style.setProperty('--snow-time', (14 + i % 9 * 1.4) + 's');
      flake.style.setProperty('--snow-delay', -(i * 1.7 % 24) + 's');
      flake.style.setProperty('--snow-size', (i % 4 === 0 ? 12 : 3 + i % 3) + 'px');
      flake.style.setProperty('--snow-drift', (-24 + i % 5 * 12) + 'px');
      snowfall.append(flake);
    }
    const trail = create('div', 'ui-deer-trail', `<div class="ui-reindeer">
      <svg viewBox="0 0 180 116" fill="none" aria-hidden="true" focusable="false">
        <g class="ui-deer-bob">
          <g stroke="#885334" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
            <path class="ui-deer-leg back far" d="M64 67 55 85 65 104"/>
            <path class="ui-deer-leg front far" d="M104 66 116 86 110 104"/>
          </g>
          <path d="m49 53-15-9c-4 9 2 19 18 19" fill="#c48b59"/>
          <path d="M109 59c7-10 7-23 15-30l13 7c-3 12-4 26-14 35" fill="#b9794b"/>
          <ellipse cx="81" cy="61" rx="36" ry="20" fill="#c48b59"/>
          <path d="M55 68c13 14 35 16 53 4-20 3-33-1-53-4Z" fill="#e6b987"/>
          <path d="m123 29-8-14c9-2 17 3 16 13" fill="#c48b59"/>
          <path d="m121 24-3-6c6 0 8 3 8 7" fill="#e6b987"/>
          <path d="M131 24 127 12 121 6m7 9 8-7m-10 4-11 1m24 12 3-12 8-7m-9 10-7-8m9 5 11 2" stroke="#dfc39a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          <ellipse cx="140" cy="33" rx="21" ry="13" transform="rotate(-10 140 33)" fill="#c48b59"/>
          <ellipse cx="155" cy="36" rx="12" ry="9" fill="#e6b987"/>
          <circle cx="140" cy="28" r="2.5" fill="#352b25"/>
          <circle cx="141" cy="27" r=".8" fill="#fff7e8"/>
          <ellipse cx="165" cy="33" rx="5.5" ry="5" fill="#bf3b4c"/>
          <path d="M151 42c3 1 5 0 6-1" stroke="#885334" stroke-width="1.5" stroke-linecap="round"/>
          <path d="m119 44 15 6-4 8-14-6Z" fill="#b73e51"/>
          <path d="m117 47-23-3 8 7-6 4 23-3" fill="#cc5c67"/>
          <circle cx="124" cy="57" r="3" fill="#f2d18a"/>
          <g stroke="#b9794b" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
            <path class="ui-deer-leg back near" d="M61 69 53 87 58 106"/>
            <path class="ui-deer-leg front near" d="M106 68 102 87 115 104"/>
          </g>
        </g>
      </svg></div>`);
    effects.append(snowfall, trail); document.body.append(effects);

    const control = create('button', 'ui-motion-toggle', snowIcon + '<span></span>');
    control.type = 'button';
    const tools = document.querySelector('.topbar-actions .tb-group');
    if (tools) { control.classList.add('tb-icon-btn'); control.querySelector('span').className = 'ui-tool-label'; tools.prepend(control); }
    else { control.classList.add('ui-login-motion'); document.querySelector('.login-wrap').append(control); }
    const storageKey = 'proxyhub_holiday_motion';
    let enabled = true;
    try { enabled = localStorage.getItem(storageKey) !== 'off'; } catch {}
    const sync = () => {
      const active = enabled && !reducedMotion.matches;
      effects.hidden = !active;
      effects.classList.toggle('is-paused', document.hidden);
      control.disabled = reducedMotion.matches;
      const label = reducedMotion.matches ? '系统已减少动态效果' : enabled ? '暂停圣诞动效' : '开启圣诞动效';
      control.title = label; control.setAttribute('aria-label', label); control.setAttribute('aria-pressed', String(active));
      control.querySelector('span').textContent = label;
    };
    control.addEventListener('click', () => {
      enabled = !enabled;
      try { localStorage.setItem(storageKey, enabled ? 'on' : 'off'); } catch {}
      sync();
    });
    reducedMotion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
  }

  function keyboardButton(el, label) {
    if (!el) return;
    el.setAttribute('role', 'button'); el.tabIndex = 0;
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('keydown', event => {
      if (event.target === el && ['Enter', ' '].includes(event.key)) { event.preventDefault(); el.click(); }
    });
  }

  function workspace() {
    const rail = create('aside', 'ui-rail');
    const brand = document.querySelector('.topbar-brand');
    const rtt = brand.querySelector('.rtt-pill');
    const nav = document.querySelector('.ds-dock');
    rail.append(brand, nav);
    const note = create('div', 'ui-rail-footer', '<div class="ui-holiday-art">' + holidayArt + '</div><strong>温暖长夜，好片相伴。</strong><span>ProxyHub Christmas</span>');
    rail.append(note); document.body.prepend(rail);
    const topbar = document.querySelector('.topbar');
    document.querySelector('.topbar-center').textContent = '媒体工作空间';
    const menu = create('button', 'ui-menu-toggle', '工具');
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
      if (span.textContent !== label) span.textContent = label;
    };
    const themeObserver = new MutationObserver(themeLabel);
    themeObserver.observe(themeButton, { childList: true });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    themeLabel();
    tools.addEventListener('click', event => { if (event.target.closest('button')) closeTools(); });
    document.addEventListener('click', event => { if (!topbar.contains(event.target)) closeTools(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeTools(); });
    topbar.append(menu);
    const originalSwitch = window.switchDsView;
    window.switchDsView = (...args) => { originalSwitch(...args); if (reducedMotion.matches) window.scrollTo({ top: 0, behavior: 'instant' }); };

    const hero = $('deploy-card');
    const heading = hero.querySelector('h1');
    const version = heading.querySelector('.hero-chip');
    heading.replaceChildren('媒体线路');
    hero.querySelector('.hero-sub').textContent = '连接媒体库，管理每一条观影线路。';
    if (version) note.append(version);
    const overview = create('section', 'ui-overview', `
      <div class="ui-overview-title"><div class="ui-holiday-art">${holidayArt}</div><div><strong>圣诞放映季</strong><span>把好电影，留给冬日长夜。</span></div></div>
      <dl class="ui-metrics"><div><dt>已配置节点</dt><dd data-ui-metric="total">—</dd></div><div><dt>今日播放</dt><dd data-ui-metric="plays">—</dd></div><div><dt>待关注</dt><dd data-ui-metric="attention">—</dd></div></dl>
      <div class="ui-distribution"><span>反代模式分布</span><div class="ui-mode-bar" aria-hidden="true"></div></div>`);
    overview.setAttribute('aria-label', '当前媒体线路总览'); hero.after(overview);
    const layout = create('div', 'ui-workspace');
    const main = create('div', 'ui-routes');
    const side = create('aside', 'ui-insights');
    const modes = document.querySelector('.mode-cards-card');
    const library = document.querySelector('.library-card');
    const arrow = $('nodesArrow');
    library.querySelector('.card-header h2').replaceChildren(arrow, '媒体库');
    main.append(library); library.querySelector('.card-header').after(modes);
    const batch = create('details', 'ui-batch admin-only', '<summary>批量管理</summary>');
    batch.append(library.querySelector('#nodesToolbar')); modes.after(batch);
    const inbox = create('details', 'ui-inbox');
    inbox.append(create('summary', 'ui-inbox-summary', '保号提醒 <span data-ui-metric="attention">—</span>'));
    inbox.append($('watchAlerts')); side.append(inbox);
    const edge = create('div', 'ui-edge', '<strong>边缘连接</strong><p>设备到 Cloudflare 的往返延迟；节点按钮可检测源站线路。</p>');
    edge.append(rtt); side.append(edge); layout.append(main, side); overview.after(layout);
    const wide = matchMedia('(min-width: 1200px)');
    const adaptInbox = () => { inbox.open = wide.matches; if (wide.matches) edge.append(rtt); else menu.before(rtt); };
    adaptInbox(); wide.addEventListener('change', adaptInbox);
    const desktop = matchMedia('(min-width: 901px)');
    const adaptBatch = () => { batch.open = desktop.matches; };
    adaptBatch(); desktop.addEventListener('change', adaptBatch);
    const selectMode = mode => modes.querySelectorAll('.mode-card').forEach(card => card.setAttribute('aria-pressed', String(card.dataset.mode === mode)));
    const originalFilter = window.filterByMode;
    window.filterByMode = mode => { originalFilter(mode); selectMode(mode); };
    const originalReset = window.showAllNodes;
    window.showAllNodes = () => { originalReset(); selectMode('all'); };
    const originalFocus = window.focusWatchNode;
    window.focusWatchNode = async prefix => { await originalFocus(prefix); selectMode('all'); };
    const originalSearch = window.filterNodesList;
    window.filterNodesList = (...args) => { const result = originalSearch(...args); selectMode($('searchNode').value.trim() ? '' : 'all'); return result; };
    selectMode('all');

    for (const [id, title, detail] of [['view-speed', '测速与 DNS', '选择优选源，测试连通性，再应用到你的域名。'], ['view-settings', '工作空间设置', '管理访问权限、运行区域和配置备份。']]) {
      $(id).prepend(create('header', 'ui-page-heading', '<h1>' + title + '</h1><p>' + detail + '</p>'));
    }
    const settings = $('view-settings');
    $('ipguard-card').after($('config-backup-card'));
    const settingsGrid = create('div', 'ui-settings-grid');
    [...settings.children].filter(el => el.matches('.card,#cf-trace-card')).forEach(el => settingsGrid.append(el));
    settings.querySelector('.ui-page-heading').after(settingsGrid);
    const about = settings.querySelector('a[href="https://t.me/MakkaPakkaOvO"]')?.parentElement;
    if (about) { about.classList.add('ui-about'); settingsGrid.after(about); }

    let firstLoad = true;
    function update() {
      const routes = window.globalRoutesData; if (!Array.isArray(routes)) return;
      const counts = { off: 0, realip_only: 0, dual: 0, strict: 0, emos: 0 };
      let attention = 0, plays = 0;
      for (const route of routes) {
        if (route.mode in counts) counts[route.mode]++;
        if (['overdue', 'warning', 'unknown'].includes(getWatchState(route).status)) attention++;
        plays += Number(route.todayReqs) || 0;
      }
      for (const [name, value] of Object.entries({ total: routes.length, plays, attention })) {
        document.querySelectorAll('[data-ui-metric="' + name + '"]').forEach(el => { if (el.textContent !== String(value)) el.textContent = value; });
      }
      inbox.hidden = attention === 0;
      overview.querySelector('.ui-mode-bar').replaceChildren(...Object.entries(counts).filter(([, n]) => n).map(([mode, count]) => {
        const segment = create('span', 'ui-mode-segment'); segment.dataset.mode = mode; segment.style.flex = count; return segment;
      }));
      $('list-grid').querySelectorAll('.emby-card').forEach(card => {
        if (card.dataset.uiReady) return;
        card.dataset.uiReady = '1';
        const title = card.querySelector('.card-title-group > div:last-child'); title.classList.add('ui-node-title');
        card.querySelectorAll('button[title]').forEach(el => el.setAttribute('aria-label', el.title));
        card.querySelector('.node-cb')?.setAttribute('aria-label', '选择 ' + title.textContent.trim());
      });
      if (firstLoad && $('list-grid').childElementCount) {
        firstLoad = false; $('list-grid').style.display = 'grid'; $('nodesHint').style.display = 'none';
        if (window.ROLE === 'admin') $('nodesToolbar').style.display = 'flex';
      }
    }
    new MutationObserver(update).observe($('list-grid'), { childList: true, subtree: true });
    new MutationObserver(update).observe($('watchAlertList'), { childList: true });
    update();
  }

  // Preserve the inherited handlers and keep validation feedback in the active dialog.
  function manageDialogFocus() {
    const dialogs = [['nodeModal', '节点配置'], ['importModal', '导入播放器']].map(([id, label]) => {
      const overlay = $(id), panel = overlay.querySelector('.modal-box') || overlay.firstElementChild;
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', label); panel.tabIndex = -1;
      panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); overlay.querySelector('.close-x,button[onclick="closeImpModal()"]').click(); }
        if (event.key !== 'Tab') return;
        const items = [...panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        if (!items.length) { event.preventDefault(); panel.focus(); return; }
        if (document.activeElement === (event.shiftKey ? items[0] : items.at(-1)) || document.activeElement === panel) { event.preventDefault(); (event.shiftKey ? items.at(-1) : items[0]).focus(); }
      });
      return { overlay, panel };
    });
    let active, previousFocus, previousOverflow;
    const inert = new Map(), toast = $('toast'), toastHome = { parent: toast.parentNode, next: toast.nextSibling };
    const sync = () => {
      const next = dialogs.findLast(({ overlay }) => getComputedStyle(overlay).display !== 'none');
      if (next === active) return;
      if (active) {
        for (const [el, value] of inert) el.inert = value;
        inert.clear(); document.body.style.overflow = previousOverflow; toastHome.parent.insertBefore(toast, toastHome.next);
        if (!next) (previousFocus?.isConnected ? previousFocus : document.querySelector('.topbar-logo')).focus({ preventScroll: true });
      }
      active = next; if (!active) return;
      previousFocus = document.activeElement; previousOverflow = document.body.style.overflow; active.panel.append(toast);
      for (let node = active.overlay; node !== document.body; node = node.parentElement) {
        for (const sibling of node.parentElement.children) if (sibling !== node && !['SCRIPT', 'STYLE'].includes(sibling.tagName)) { inert.set(sibling, sibling.inert); sibling.inert = true; }
      }
      document.body.style.overflow = 'hidden';
      (active.panel.querySelector('input:not([type="hidden"]):not([readonly]),select,textarea') || active.panel).focus({ preventScroll: true });
    };
    const observer = new MutationObserver(sync);
    dialogs.forEach(({ overlay }) => observer.observe(overlay, { attributes: true, attributeFilter: ['style'] })); sync();
  }

  function ready() {
    if (!document.body.classList.contains('ui-login')) { workspace(); manageDialogFocus(); }
    else document.querySelector('.login-box').append(create('div', 'ui-login-art ui-holiday-art', holidayArt));
    holidayMotion();
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
