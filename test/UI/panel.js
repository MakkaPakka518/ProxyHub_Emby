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
      <svg viewBox="0 0 260 180" fill="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="ui-deer-coat" x1="86" y1="61" x2="135" y2="137" gradientUnits="userSpaceOnUse"><stop stop-color="#e1b27b"/><stop offset=".52" stop-color="#bc824f"/><stop offset="1" stop-color="#91562f"/></linearGradient>
          <linearGradient id="ui-deer-scarf" x1="144" y1="70" x2="183" y2="90" gradientUnits="userSpaceOnUse"><stop stop-color="#d56670"/><stop offset=".5" stop-color="#b33a4f"/><stop offset="1" stop-color="#8d293e"/></linearGradient>
          <radialGradient id="ui-deer-bell" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(176 89) rotate(65) scale(8)"><stop stop-color="#fff0b8"/><stop offset=".55" stop-color="#e3b85d"/><stop offset="1" stop-color="#b27e36"/></radialGradient>
        </defs>
        <ellipse class="ui-deer-shadow" cx="113" cy="173" rx="57" ry="4" fill="#29362c" opacity=".12"/>
        <g class="ui-deer-bob">
          <g class="ui-deer-leg back far">
            <path d="M76 109c-12 1-20 12-20 23l-11 29 8 3 17-31 15-17-9-7Z" fill="#87532f"/>
            <path d="m45 157 11 4-3 8H41c-1-4 1-8 4-12Z" fill="#42352c"/>
          </g>
          <g class="ui-deer-leg front far">
            <path d="M145 105c-2 12 4 24 16 32l18 19 6-7-15-25-13-19h-12Z" fill="#925d36"/>
            <path d="m179 149 9 2 5 8c-5 4-10 2-16-4l2-6Z" fill="#42352c"/>
          </g>
          <path d="M57 92C40 88 36 76 28 74c-3 15 8 31 29 29" fill="#bb834e"/>
          <path d="M30 77c2 9 8 16 16 19-2-8-8-14-16-19Z" fill="#f2d8ac"/>
          <path d="M63 81c16-13 49-8 76-1 11-11 18-21 23-37 3-4 11-3 15 5l6 19c-6 10-6 24-19 42-2 17-16 24-31 22H87c-24 0-38-12-38-29-1-10 5-17 14-21Z" fill="url(#ui-deer-coat)"/>
          <path d="M61 103c13 18 40 28 72 20-4 7-20 10-39 8-18-1-30-10-33-28Z" fill="#efd0a1"/>
          <path d="M68 87c16-9 40-6 57 0" stroke="#f0cea0" stroke-width="3" stroke-linecap="round" opacity=".55"/>
          <path d="M166 63c10 9 10 28-7 49l-2-7-8 6 1-10-7 3 6-14c8-7 11-17 17-27Z" fill="#f2dab5"/>
          <path d="M151 89c7-5 12-11 14-16" stroke="#d2ad79" stroke-width="1.5" stroke-linecap="round"/>
          <g stroke-linecap="round" stroke-linejoin="round">
            <path d="M187 43c-3-12 6-22 8-35m-4 15 14-8 5-9m-15 5-7-6m16 12 10 1" stroke="#976d43" stroke-width="4"/>
            <path d="M174 43c-9-8-5-21-12-33m8 21c-12 0-22-8-18-19m1 10-9-7m25 8c10-4 14-11 10-17m0 10 9-4" stroke="#956a41" stroke-width="6"/>
            <path d="M174 43c-9-8-5-21-12-33m8 21c-12 0-22-8-18-19m1 10-9-7m25 8c10-4 14-11 10-17m0 10 9-4" stroke="#e2c795" stroke-width="3"/>
          </g>
          <path d="M178 45c-12 1-24-4-31-17 15-4 28 2 31 17Z" fill="#c58f59"/>
          <path d="M172 41c-7-1-14-4-19-10 9 0 16 3 19 10Z" fill="#ecc1a0"/>
          <path d="M171 44c4-11 19-10 27 0l10 11c7 1 18 1 22 8 1 7-6 15-16 16l-21-2c-10 2-18-5-19-14l-3-19Z" fill="#ce985f"/>
          <path d="M193 59c8 3 17 0 27 1 9 2 9 10 2 15-8 6-23 3-31-2l2-14Z" fill="#f1d8b1"/>
          <path d="M175 45c5-5 12-4 16-1" stroke="#e7bb80" stroke-width="2.5" stroke-linecap="round"/>
          <ellipse cx="189" cy="52" rx="3.5" ry="4.5" fill="#332d28"/>
          <circle cx="190" cy="50" r="1.2" fill="#fffdf3"/>
          <path d="M184 44c3-2 6-1 8 0" stroke="#785134" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M207 74c5 2 10 1 13-2" stroke="#986846" stroke-width="1.3" stroke-linecap="round"/>
          <ellipse cx="227" cy="63" rx="7" ry="6" fill="#ad3448"/>
          <ellipse cx="225" cy="61" rx="2.7" ry="1.4" transform="rotate(-20 225 61)" fill="#e88e97"/>
          <g class="ui-deer-scarf">
            <path d="M174 77c-13-4-24-8-38-3l14 9-9 6c14 4 29 0 38-5l-5-7Z" fill="url(#ui-deer-scarf)"/>
            <path d="m146 75 3 6m7-5 3 8m-13 4 1 2" stroke="#edaaa1" stroke-width="1.5" stroke-linecap="round"/>
          </g>
          <path d="m167 71 18 8-5 10-20-10 7-8Z" fill="url(#ui-deer-scarf)"/>
          <path d="m166 73 15 7m-18-3 16 7" stroke="#df9290" stroke-width="1.2" opacity=".75"/>
          <path d="m178 87-1 3" stroke="#e6c37c" stroke-width="1.5"/>
          <circle cx="177" cy="94" r="5.5" fill="url(#ui-deer-bell)"/>
          <path d="M173 97h8m-4-3v3" stroke="#9c702f" stroke-width="1.2" stroke-linecap="round"/>
          <g class="ui-deer-leg back near">
            <path d="M71 109c-7 8-6 20 1 28l11 8 7-8-9-10 4-15-14-3Z" fill="#ba7f49"/>
            <path d="m73 114 1 16 9 9" stroke="#d9a56a" stroke-width="3" stroke-linecap="round"/>
            <g class="ui-deer-shin back"><path d="m81 137 11 5-2 21-8 1 1-17-7-6 5-4Z" fill="#c58f58"/><path d="m82 159 10 2 1 8H80c-1-4 0-7 2-10Z" fill="#46372e"/><path d="M86 162v5" stroke="#7d6451" stroke-width="1"/></g>
          </g>
          <g class="ui-deer-leg front near">
            <path d="M144 107c-2 10 3 22 7 33l10-2-6-29-11-2Z" fill="#c58d55"/>
            <path d="m147 112 6 20" stroke="#e3b47b" stroke-width="2.5" stroke-linecap="round"/>
            <g class="ui-deer-shin front"><path d="m151 134 10 5-14 23-7-5 11-23Z" fill="#d3a16b"/><path d="m140 155 10 6-3 7-13-7 6-6Z" fill="#46372e"/><path d="m141 160 4 3" stroke="#7d6451" stroke-width="1"/></g>
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
