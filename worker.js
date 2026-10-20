// VERSION: 3.4.45
// 更新内容:数据大屏统计统一北京时间(UTC+8)——今日请求分时趋势/今日来源地区/今日请求数改北京时间 00:00 起,分时按北京时间归桶;7天/30天流量与请求数按北京时间日期范围查询
const CURRENT_VERSION = "3.4.45"; 

// ============ PlaybackInfo 起播缓存(内存,单 isolate) ============
const PLAYBACK_INFO_CACHE_TTL = 300000;   // 5 分钟
const PLAYBACK_INFO_CACHE_MAX = 24;       // 有界:最多缓存条数
const playbackInfoCache = new Map();

// ============ 路由表 schema 初始化内存标记(仅首次执行,节点接口提速) ============
let routesSchemaReady = false;
let lastLogsCleanAt = 0;
const BANDWIDTH_CACHE_TTL = 120000; // 带宽统计内存缓存:2 分钟
const bandwidthCache = new Map();
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/MakkaPakka518/ProxyHub_Emby/refs/heads/main/worker.js";
const CHANGELOG_URL = "https://raw.githubusercontent.com/MakkaPakka518/ProxyHub_Emby/refs/heads/main/changelog.json";

// ============ 边缘缓存全局配置(可在此关闭) ============
// EDGE_CACHE_STATIC_TTL:静态资源(图片/js/css/字体)边缘缓存秒数(默认 1 天,与旧版一致)
// 注:3.4.43 移除「Static 直连视频边缘缓存」——视频流进 CF 边缘缓存(cacheEverything)会拖慢首播,视频一律直接反代
const EDGE_CACHE_STATIC_TTL = 86400;

// ==========================================
// 1. 网页界面
// ==========================================

const SVG_EYE = `<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
const SVG_COPY = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
const SVG_TG = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;margin-right:8px;fill:#0088cc;"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/></svg>`;

const EMBY_LOGO = 'https://raw.githubusercontent.com/MakkaPakka518/Icon/refs/heads/main/MAKKA_EMBY.JPG';  // 玛卡巴卡的头像(外链);加载失败时 topbar 有内置占位兜底,可在账户设置→更换头像

const I = {
  rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8-.8-.7-2.2-.7-3 .8z"/><path d="M12 15l-3-3c.5-4 4-7.5 8-8 2 .2 3.8 2 4 4-.5 4-4 7.5-8 8l-1-1z"/><path d="M9 12c-2 1-3.5 3-4 5"/><circle cx="15" cy="9" r="0.5"/></svg>',
  xmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17.5h.01"/></svg>',
  film:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.1 6.2-5.5-3-5.5 3 1.1-6.2L3 9.5l6.3-.8L12 3z"/></svg>',
  sparkles:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14zM6 14l.6 1.7L8.5 16l-1.9.7L6 18.5l-.6-1.8L3.5 16l1.9-.3L6 14z"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 3v5h-5"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 1 1 0-8 5 5 0 0 1 9.6 1.3A3.5 3.5 0 0 1 17 18H7z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  location:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8L7 17M17 7l2.8-2.8"/></svg>',
  lines:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  antenna:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.4 2a14 14 0 0 0 0 20M17.6 2a14 14 0 0 1 0 20M9.8 5.5a9 9 0 0 0 0 13M14.2 5.5a9 9 0 0 1 0 13"/><circle cx="12" cy="12" r="1.5"/></svg>',
  bulb:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M8 14.5A6 6 0 0 1 12 5a6 6 0 0 1 4 9.5c-.8.8-1 1.6-1 2.5h-6c0-.9-.2-1.7-1-2.5z"/></svg>',
  tv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
  flame:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-5-.5 1-1 2-1 3 0 2.5 3 3 3 6 1-2 0-4 0-4 2 1 3 3 3 4.5A6.5 6.5 0 0 1 12 22 6.5 6.5 0 0 1 5.5 15C5.5 9 12 2 12 2z"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0l-2.83 2.83a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>',
  crown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7z"/><path d="M6 19h12"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  arrowdown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  robot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/><path d="M2 13v3M22 13v3"/></svg>',
  spy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="11" r="7"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M9.5 14c1 .8 4 .8 5 0"/></svg>',
  flask:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V3"/><path d="M7 15h10"/></svg>',
  broom:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3l8 8M11 11l8-8M4 20l7-7 1 1-7 7-2-1z"/><path d="M6 8l4 4"/></svg>',
  checksquare:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16"/></svg>',
  db:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  dotblue:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#007aff"/></svg>',
  dotorange:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#ff9500"/></svg>',
  dotgreen:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#34c759"/></svg>',
  dotpurple:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#af52de"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

const E2I = { '${I.rocket}':'rocket','${I.xmark}':'xmark','${I.check}':'check','${I.warn}':'warn','${I.film}':'film','${I.star}':'star','${I.sparkles}':'sparkles','${I.sparkles}':'sparkles','${I.globe}':'globe','${I.globe}':'globe','${I.bolt}':'bolt','${I.refresh}':'refresh','${I.chart}':'chart','${I.cloud}':'cloud','${I.trash}':'trash','${I.search}':'search','${I.location}':'location','${I.trophy}':'trophy','${I.moon}':'moon','${I.sun}':'sun','${I.dotblue}':'dotblue','${I.dotorange}':'dotorange','${I.dotgreen}':'dotgreen','${I.dotpurple}':'dotpurple','${I.robot}':'robot','${I.spy}':'spy','${I.flame}':'flame','${I.link}':'link','${I.tv}':'tv','${I.box}':'box','${I.download}':'download','${I.antenna}':'antenna','${I.bulb}':'bulb','${I.crown}':'crown','${I.target}':'target','${I.arrowdown}':'arrowdown','${I.xmark}':'xmark','${I.pencil}':'pencil','${I.gear}':'gear','${I.lines}':'lines','${I.flask}':'flask','${I.broom}':'broom','${I.checksquare}':'checksquare','${I.upload}':'upload' };
function toSvg(s){
  if(!s) return s;
  return String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, function(ch){
    if(ch==='\uFE0F') return '';
    var key = E2I[ch];
    return (key && I[key]) ? '<span class="ti">'+I[key]+'</span>' : '';
  });
}


const CSS_COMMON = `
    /* =====================================================
       NEBULA 星云 —— 深空科幻设计系统
       默认深色夜空（霓虹发光）/ 可选晨曦浅色
       变量名与主 JS 完全兼容（--bg/--card/--primary/--border/--text 等）
       ===================================================== */
    :root {
        --primary:#3d7bff;
        --primary-2:#00d4ff;
        --primary-hover:#2f6bff;
        --primary-soft:rgba(61,123,255,.14);
        --primary-grad:linear-gradient(135deg,#00d4ff 0%,#3d7bff 100%);
        --primary-grad-2:linear-gradient(135deg,#7c5cff 0%,#00d4ff 100%);
        --bg:#f6f7fd;
        --bg-soft:#eef1fb;
        --bg-2:#e9ecf8;
        --card:#ffffff;
        --card-glass:rgba(255,255,255,.7);
        --glass-border:rgba(255,255,255,.6);
        --text:#131627;
        --text-sec:#5d6480;
        --text-faint:#9aa1bd;
        --border:#e3e7f4;
        --border-strong:#cdd4ea;
        --success:#0fbf7f;
        --success-soft:rgba(15,191,127,.12);
        --warning:#f5a623;
        --warning-soft:rgba(245,166,35,.14);
        --danger:#ff4d6a;
        --danger-soft:rgba(255,77,106,.12);
        --info:#22b8ff;
        --violet:#8b5cf6;
        --radius:18px;
        --radius-card:18px;
        --radius-md:13px;
        --radius-sm:10px;
        --shadow-sm:0 1px 2px rgba(20,24,50,.05),0 2px 6px rgba(20,24,50,.06);
        --shadow:0 2px 6px rgba(20,24,50,.06),0 8px 22px rgba(20,24,50,.08);
        --shadow-lg:0 6px 16px rgba(20,24,50,.1),0 20px 46px rgba(20,24,50,.14);
        --blur:blur(22px) saturate(180%);
        --topbar-h:62px;
        --font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        --ease:cubic-bezier(.22,.7,.28,1);
    }
    body.dark {
        --primary:#4da3ff;
        --primary-2:#00e5ff;
        --primary-hover:#3d97ff;
        --primary-soft:rgba(77,163,255,.16);
        --primary-grad:linear-gradient(135deg,#00e5ff 0%,#4da3ff 100%);
        --primary-grad-2:linear-gradient(135deg,#8b5cf6 0%,#00e5ff 100%);
        --bg:#060a13;
        --bg-soft:#0b1220;
        --bg-2:#0a0f1c;
        --card:#0d1526;
        --card-glass:rgba(10,16,30,.72);
        --glass-border:rgba(0,229,255,.14);
        --text:#e8eefc;
        --text-sec:#9aa5c2;
        --text-faint:#7d89ad;
        --border:#243350;
        --border-strong:#2a3a5c;
        --success:#22e39a;
        --success-soft:rgba(34,227,154,.14);
        --warning:#ffb84d;
        --warning-soft:rgba(255,184,77,.15);
        --danger:#ff5c7a;
        --danger-soft:rgba(255,92,122,.14);
        --info:#38bdf8;
        --violet:#a78bfa;
        --shadow-sm:0 1px 3px rgba(0,0,0,.4);
        --shadow:0 2px 8px rgba(0,0,0,.4),0 10px 26px rgba(0,0,0,.42);
        --shadow-lg:0 4px 14px rgba(0,0,0,.5),0 18px 44px rgba(0,0,0,.55),0 0 40px rgba(77,163,255,.05);
        --glow:0 0 0 1px rgba(0,229,255,.06), 0 0 24px rgba(0,229,255,.08);
    }

    /* ============ 基础 ============ */
    *{box-sizing:border-box;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    html{background:var(--bg)}
    html,body{margin:0;padding:0}
    html.dark{background:#060a13} /* 同步 body.dark --bg,防 iOS Safari 橡皮筋露白 */
    body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);min-height:100vh;-webkit-text-size-adjust:100%;transition:background-color .35s,color .35s;letter-spacing:.1px;overflow-x:hidden}
    /* 星云背景：星点 + 极光 */
    body::before{content:'';position:fixed;inset:0;z-index:-2;pointer-events:none;background:
        radial-gradient(2px 2px at 12% 22%, rgba(255,255,255,.5), transparent 40%),
        radial-gradient(1.5px 1.5px at 78% 12%, rgba(0,229,255,.6), transparent 40%),
        radial-gradient(2px 2px at 34% 78%, rgba(255,255,255,.4), transparent 40%),
        radial-gradient(1.5px 1.5px at 62% 58%, rgba(139,92,246,.6), transparent 40%),
        radial-gradient(2px 2px at 88% 82%, rgba(255,255,255,.35), transparent 40%),
        radial-gradient(1.5px 1.5px at 5% 62%, rgba(0,229,255,.45), transparent 40%),
        radial-gradient(1.5px 1.5px at 45% 8%, rgba(255,255,255,.4), transparent 40%),
        radial-gradient(1100px 480px at 12% -8%, rgba(61,123,255,.14), transparent 62%),
        radial-gradient(900px 460px at 108% 6%, rgba(0,213,255,.1), transparent 60%),
        radial-gradient(760px 480px at 50% 118%, rgba(139,92,246,.12), transparent 62%);
        background-repeat:no-repeat;
    }
    body.dark::before{background:
        radial-gradient(2px 2px at 12% 22%, rgba(255,255,255,.7), transparent 40%),
        radial-gradient(1.5px 1.5px at 78% 12%, rgba(0,229,255,.9), transparent 40%),
        radial-gradient(2px 2px at 34% 78%, rgba(255,255,255,.6), transparent 40%),
        radial-gradient(1.5px 1.5px at 62% 58%, rgba(139,92,246,.9), transparent 40%),
        radial-gradient(2px 2px at 88% 82%, rgba(255,255,255,.5), transparent 40%),
        radial-gradient(1.5px 1.5px at 5% 62%, rgba(0,229,255,.7), transparent 40%),
        radial-gradient(1.5px 1.5px at 45% 8%, rgba(255,255,255,.6), transparent 40%),
        radial-gradient(1100px 480px at 12% -8%, rgba(77,163,255,.16), transparent 62%),
        radial-gradient(900px 460px at 108% 6%, rgba(0,229,255,.1), transparent 60%),
        radial-gradient(760px 480px at 50% 118%, rgba(139,92,246,.14), transparent 62%);
        background-repeat:no-repeat;}
    /* 网格线层 */
    body::after{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.5;
        background-image:
            linear-gradient(rgba(0,229,255,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,255,.025) 1px, transparent 1px);
        background-size:44px 44px;
        mask-image:radial-gradient(ellipse 90% 60% at 50% 0%, #000 20%, transparent 75%);}
    body.dark::after{opacity:.8;background-image:
        linear-gradient(rgba(0,229,255,.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,229,255,.045) 1px, transparent 1px);
        background-size:44px 44px;
        mask-image:radial-gradient(ellipse 90% 60% at 50% 0%, #000 20%, transparent 75%);}
    ::selection{background:rgba(77,163,255,.3)}
    a{color:var(--primary);text-decoration:none}
    input,select,button,textarea{font-family:inherit;outline:none;font-size:14px}
    input::placeholder,textarea::placeholder{color:var(--text-sec)}
    input,select,textarea{transition:border-color .18s,box-shadow .18s,background .18s}
    input:focus,select:focus,textarea:focus{border-color:var(--primary)!important;box-shadow:0 0 0 3px var(--primary-soft), 0 0 16px rgba(0,229,255,.12)!important}
    .container{max-width:1200px;margin:0 auto;width:100%;min-height:100vh;display:flex;flex-direction:column;padding:calc(var(--topbar-h) + 56px) 24px 100px}

    /* ============ 分区标题（HUD 标签） ============ */
    .section-head{display:flex;align-items:center;gap:10px;margin:36px 2px 16px;font-size:11.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--text-sec)}
    .section-head:first-child{margin-top:6px}
    .section-head::before{content:'';width:8px;height:8px;background:var(--primary-grad);transform:rotate(45deg);box-shadow:0 0 10px var(--primary);flex-shrink:0}
    .section-head::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--border),transparent)}

    /* ============ 卡片（深空舱板） ============ */
    .card{background:var(--card);padding:24px;border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:20px;border:1px solid var(--border);transition:box-shadow .25s,border-color .25s,transform .25s;position:relative}
    .card:hover{box-shadow:var(--shadow-lg);border-color:var(--border-strong)}
    body.dark .card{background:linear-gradient(160deg, rgba(13,21,38,.9), rgba(10,16,30,.95));border-color:rgba(0,229,255,.08)}
    body.dark .card:hover{border-color:rgba(0,229,255,.25);box-shadow:var(--shadow-lg), var(--glow)}
    .card h2,.card h3{display:flex;align-items:center;gap:9px;margin:0}
    .card h2{font-size:16px;font-weight:700;letter-spacing:.1px}
    .card h2 svg,.card h3 svg{color:var(--primary)}
    .card h3{font-size:14.5px;font-weight:700;color:var(--text)}
    .card-header{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
    .card-tools{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-left:auto}
    .card-sub{font-size:12.5px;color:var(--text-sec);font-weight:500}

    /* Hero 大标题卡（星云主视觉） */
    .hero-card{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:30px 30px;background:var(--card);overflow:hidden}
    body.dark .hero-card{background:
        radial-gradient(520px 240px at 88% -30%, rgba(139,92,246,.22), transparent 65%),
        radial-gradient(480px 260px at 12% 130%, rgba(0,229,255,.16), transparent 60%),
        linear-gradient(160deg, rgba(13,21,38,.92), rgba(8,13,24,.96))}
    .hero-card::after{content:'';position:absolute;right:-90px;top:-90px;width:260px;height:260px;border-radius:50%;border:1px solid rgba(0,229,255,.14);box-shadow:0 0 60px rgba(0,229,255,.1), inset 0 0 40px rgba(139,92,246,.08);pointer-events:none;animation:heroPulse 5s ease-in-out infinite}
    .hero-card::before{content:'';position:absolute;left:-70px;bottom:-70px;width:180px;height:180px;border-radius:50%;border:1px dashed rgba(0,229,255,.1);pointer-events:none}
    @keyframes heroPulse{0%,100%{opacity:.8}50%{opacity:.35}}
    .hero-card h1{font-size:24px;font-weight:800;margin:0;display:flex;align-items:center;gap:12px;letter-spacing:-.3px;position:relative}
    body.dark .hero-card h1{background:linear-gradient(120deg,#7ec9ff 0%,#00e5ff 45%,#a78bfa 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 18px rgba(0,229,255,.25))}
    .hero-card h1 svg{width:26px;height:26px}
    body.dark .hero-card h1 svg{color:var(--primary-2)}
    .hero-card .hero-sub{font-size:13px;color:var(--text-sec);margin-top:5px;font-weight:500}
    .hero-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;letter-spacing:1.5px;color:var(--primary);background:var(--primary-soft);border:1px solid rgba(61,123,255,.3);padding:4px 11px;border-radius:999px;vertical-align:middle;text-transform:uppercase}
    body.dark .hero-chip{color:var(--primary-2);background:rgba(0,229,255,.08);border-color:rgba(0,229,255,.28);box-shadow:0 0 16px rgba(0,229,255,.15)}

    /* ============ 顶栏（指挥舱玻璃） ============ */
    .topbar{position:fixed;top:0;left:0;right:0;z-index:900;display:flex;align-items:center;gap:14px;padding:0 20px;height:var(--topbar-h);background:var(--card-glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border-bottom:1px solid var(--border);box-shadow:0 1px 2px rgba(16,24,40,.04),0 4px 18px rgba(16,24,40,.05)}
    body.dark .topbar{background:rgba(7,12,22,.72);border-bottom:1px solid rgba(0,229,255,.12);box-shadow:0 1px 0 rgba(0,229,255,.08), 0 8px 30px rgba(0,0,0,.4)}
    .topbar-brand{display:flex;align-items:center;gap:11px;min-width:0;flex-shrink:0}
    .topbar-logo{width:36px;height:36px;border-radius:11px;object-fit:cover;flex-shrink:0;box-shadow:0 3px 12px rgba(0,0,0,.25);border:1px solid var(--border);cursor:pointer;transition:box-shadow .2s}
    body.dark .topbar-logo{box-shadow:0 0 18px rgba(0,229,255,.3), 0 3px 12px rgba(0,0,0,.3);border-color:rgba(0,229,255,.25)}
    .topbar-logo:hover{box-shadow:0 0 24px rgba(0,229,255,.4)}
    .topbar-title{font-weight:700;font-size:15px;letter-spacing:.2px;white-space:nowrap;line-height:1.15}
    .topbar-title small{display:block;font-size:10.5px;font-weight:700;color:var(--text-sec);letter-spacing:1.2px;text-transform:uppercase}
    body.dark .topbar-title small{color:rgba(0,229,255,.7)}
    .topbar-center{display:flex;align-items:center;gap:8px;justify-content:center;flex:1;min-width:0;overflow:hidden}
    .topbar-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
    .topbar-actions .tb-group{display:flex;align-items:center;gap:2px;padding:4px;background:var(--bg-soft);border:1px solid var(--border);border-radius:13px}
    body.dark .topbar-actions .tb-group{background:rgba(11,18,32,.8);border-color:rgba(0,229,255,.14)}
    .tb-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;border:none;background:transparent;cursor:pointer;color:var(--text-sec);padding:0;transition:all .18s;font-family:inherit}
    .tb-icon-btn:hover{color:var(--primary);background:var(--card);box-shadow:var(--shadow-sm)}
    body.dark .tb-icon-btn:hover{color:var(--primary-2);background:rgba(13,21,38,.9);box-shadow:0 0 14px rgba(0,229,255,.15)}
    .tb-icon-btn svg{width:17px;height:17px;fill:currentColor}
    .tb-icon-btn.danger:hover{color:var(--danger);background:var(--card)}
    body.dark .tb-icon-btn.danger:hover{background:rgba(255,92,122,.12)}

    /* ============ 按钮（霓虹系统） ============ */
    .btn-submit,.btn-danger,.btn-ghost,.btn-edit,.btn-del,.btn-dns,.pill-btn,.pill-close{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;cursor:pointer;font-weight:600;transition:all .18s;white-space:nowrap;font-family:inherit;line-height:1}
    .btn-submit{background:var(--primary-grad);color:#fff;padding:11px 20px;border-radius:var(--radius-sm);box-shadow:0 4px 16px rgba(61,123,255,.4);text-shadow:0 1px 2px rgba(0,0,0,.15);position:relative;overflow:hidden}
    .btn-submit::after{content:'';position:absolute;top:0;left:-80%;width:50%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-25deg);transition:left .5s var(--ease)}
    .btn-submit:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(61,123,255,.5);filter:brightness(1.06)}
    .btn-submit:hover::after{left:130%}
    .btn-submit:active{transform:translateY(0) scale(.98)}
    .btn-submit:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none;filter:none}
    body.dark .btn-submit{background:linear-gradient(135deg,#0a84ff 0%,#00d4ff 100%);box-shadow:0 4px 18px rgba(0,213,255,.35), 0 0 20px rgba(0,213,255,.15)}
    body.dark .btn-submit:hover{box-shadow:0 8px 28px rgba(0,213,255,.45), 0 0 30px rgba(0,213,255,.2)}
    .btn-danger{background:linear-gradient(135deg,#ff7a5c,#ff4d6a);color:#fff;padding:11px 20px;border-radius:var(--radius-sm);box-shadow:0 4px 16px rgba(255,77,106,.35)}
    body.dark .btn-danger{background:linear-gradient(135deg,#ff6b81,#ff2e4d);box-shadow:0 4px 18px rgba(255,46,77,.3), 0 0 20px rgba(255,46,77,.12)}
    .btn-danger:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(255,77,106,.45)}
    .btn-danger:active{transform:translateY(0) scale(.98)}
    .btn-ghost{background:transparent;color:var(--primary);border:1px solid var(--border);padding:9px 14px;border-radius:var(--radius-sm);font-size:13px}
    .btn-ghost:hover{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}
    .btn-edit{background:var(--card);color:var(--primary);border:1px solid var(--primary);padding:8px 14px;border-radius:9px;font-size:13px}
    .btn-edit:hover{background:var(--primary-soft)}
    .btn-del{background:var(--card);color:var(--danger);border:1px solid var(--danger);padding:8px 14px;border-radius:9px;font-size:13px}
    .btn-del:hover{background:var(--danger-soft)}
    .btn-dns{background:var(--card);color:var(--success);border:1px solid var(--success);padding:8px 14px;border-radius:9px;font-size:13px}
    .btn-dns:hover{background:var(--success-soft)}
    .btn-dns:disabled{opacity:.5;cursor:not-allowed}
    .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;border:1px solid var(--border);background:var(--card);cursor:pointer;color:var(--text-sec);padding:0;transition:all .18s;flex-shrink:0}
    .icon-btn:hover{color:var(--primary);border-color:var(--primary);box-shadow:0 3px 12px var(--primary-soft)}
    body.dark .icon-btn{background:rgba(11,18,32,.6)}
    body.dark .icon-btn:hover{border-color:var(--primary-2);color:var(--primary-2);box-shadow:0 0 14px rgba(0,229,255,.2)}
    .icon-btn svg{width:15px;height:15px;fill:currentColor}
    .pill-btn{padding:6px 14px;border-radius:999px;background:var(--primary-soft);border:1px solid rgba(61,123,255,.28);color:var(--primary);font-size:13px}
    .pill-btn:hover{background:rgba(61,123,255,.18)}
    body.dark .pill-btn{background:rgba(0,229,255,.1);border-color:rgba(0,229,255,.25);color:var(--primary-2)}
    .pill-close{width:30px;height:30px;border-radius:999px;background:var(--danger-soft);border:1px solid rgba(255,77,106,.32);color:var(--danger)}
    .pill-close:hover{background:rgba(255,77,106,.2)}
    .btn-submit svg,.btn-danger svg,.btn-ghost svg,.btn-edit svg,.btn-del svg,.btn-dns svg,.pill-btn svg,.pill-close svg{width:15px;height:15px}

    /* ============ 徽标 / 状态（霓虹） ============ */
    .badge{padding:4px 11px;border-radius:999px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
    .badge::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.9;box-shadow:0 0 8px currentColor}
    .rtt-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:var(--primary-soft);border:1px solid rgba(61,123,255,.3);font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;cursor:default}
    body.dark .rtt-pill{background:rgba(0,229,255,.07);border-color:rgba(0,229,255,.2);box-shadow:0 0 14px rgba(0,229,255,.06)}
    .rtt-dot{width:7px;height:7px;border-radius:50%;background:var(--success);box-shadow:0 0 10px var(--success);flex-shrink:0}
    .rtt-label{color:var(--text-sec)}
    #themeToggle{background:transparent;border:none;cursor:pointer;padding:2px;display:inline-flex;color:var(--text-sec);transition:color .2s}
    #themeToggle:hover{color:var(--primary)}
    #themeToggle svg{width:18px;height:18px}
    .ping-badge{color:var(--text-sec);cursor:pointer;padding:5px 12px;background:var(--bg-soft);border-radius:999px;font-size:13px;font-weight:500;transition:all .2s;border:1px solid var(--border);user-select:none;display:inline-flex;align-items:center;gap:5px}
    .ping-badge:hover{border-color:var(--primary);color:var(--primary);box-shadow:0 2px 10px var(--primary-soft)}
    body.dark .ping-badge{background:rgba(11,18,32,.7)}
    body.dark .ping-badge:hover{border-color:var(--primary-2);color:var(--primary-2);box-shadow:0 0 12px rgba(0,229,255,.2)}

    /* ============ 表单 ============ */
    .field{display:flex;flex-direction:column;gap:6px;min-width:0}
    .field>label{font-size:12.5px;font-weight:600;color:var(--text-sec);display:flex;align-items:center;gap:5px}
    .field input[type=text],.field input[type=url],.field input[type=password],.field input[type=number],.field select,.field textarea,.toolbar select{width:100%;padding:11px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-soft);color:var(--text);font-size:14px}
    body.dark .field input[type=text],body.dark .field input[type=url],body.dark .field input[type=password],body.dark .field input[type=number],body.dark .field select,body.dark .field textarea,body.dark .toolbar select{background:rgba(11,18,32,.7);border-color:rgba(0,229,255,.1)}
    body.dark .field input:hover,body.dark .field select:hover,body.dark .field textarea:hover{border-color:rgba(0,229,255,.3)}
    .field input:hover,.field select:hover,.field textarea:hover{border-color:var(--border-strong)}
    .form-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
    .form-row .field{flex:1;min-width:220px}
    .search-input{padding:10px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-soft);color:var(--text);font-size:14px;width:260px;transition:border-color .2s,box-shadow .2s}
    .search-input:focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}
    body.dark .search-input{background:rgba(11,18,32,.7);border-color:rgba(0,229,255,.1)}
    body.dark .search-input:focus{border-color:var(--primary-2);box-shadow:0 0 0 3px rgba(0,229,255,.1), 0 0 16px rgba(0,229,255,.12)}
    .ip-checkbox{width:18px;height:18px;cursor:pointer;accent-color:var(--primary)}
    .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center}

    /* 节点页工具条 */
    .nodes-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 18px;box-shadow:var(--shadow-sm);margin-bottom:16px}
    body.dark .nodes-toolbar{background:linear-gradient(160deg, rgba(13,21,38,.8), rgba(8,13,24,.9));border-color:rgba(0,229,255,.1)}
    .nodes-toolbar .search-input{flex:1;min-width:180px;max-width:340px;background:var(--bg-soft)}
    .nodes-toolbar .tb-sep{width:1px;height:26px;background:var(--border);margin:0 2px}
    .batch-sel{min-width:150px}

    /* ============ 节点卡片（星云数据卡） ============ */
    .node-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:16px}
    .emby-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px 18px 14px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:12px;transition:all .25s;position:relative;overflow:hidden}
    .emby-card::before{content:'';position:absolute;left:0;top:0;width:100%;height:3px;background:var(--primary-grad);opacity:.85;transition:all .3s}
    .emby-card::after{content:'';position:absolute;right:-40px;top:-40px;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,rgba(0,229,255,.07),transparent 70%);pointer-events:none;transition:opacity .3s}
    body.dark .emby-card{background:linear-gradient(165deg, rgba(14,22,40,.92), rgba(9,14,26,.96));border-color:rgba(0,229,255,.1)}
    .emby-card:hover{box-shadow:var(--shadow-lg);transform:translateY(-3px);border-color:var(--border-strong)}
    body.dark .emby-card:hover{border-color:rgba(0,229,255,.35);box-shadow:var(--shadow-lg), var(--glow)}
    body.dark .emby-card:hover::before{box-shadow:0 0 18px rgba(0,229,255,.6)}
    .emby-card .card-header{border-bottom:1px solid var(--border);padding-bottom:12px}
    .card-title-group{display:flex;align-items:center;gap:11px;min-width:0;flex:1}
    .emby-icon{font-size:26px;background:linear-gradient(135deg,var(--primary-soft),transparent);border-radius:12px;padding:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;width:46px;height:46px;flex-shrink:0;color:var(--primary)}
    body.dark .emby-icon{background:rgba(0,229,255,.07);border-color:rgba(0,229,255,.16);color:var(--primary-2);box-shadow:0 0 14px rgba(0,229,255,.08)}
    .emby-icon svg{width:23px;height:23px}
    .emby-card .card-remark{font-size:15.5px;font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .emby-card .card-prefix{font-size:12px;color:var(--text-sec);font-family:var(--font-mono);margin-top:1px}
    .node-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .node-detail{display:none;flex-direction:column;gap:10px;background:var(--bg-soft);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 14px;margin-top:2px}
    body.dark .node-detail{background:rgba(8,13,24,.6);border-color:rgba(0,229,255,.08)}
    .info-row{display:flex;align-items:flex-start;justify-content:space-between;font-size:13px;gap:10px}
    .info-label{color:var(--text-sec);font-weight:600;min-width:64px;margin-top:4px;flex-shrink:0;font-size:12px}
    .action-group{display:inline-flex;gap:6px;background:var(--card);padding:5px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);align-items:flex-start;max-width:100%;flex-wrap:wrap;box-shadow:var(--shadow-sm)}
    body.dark .action-group{background:rgba(11,18,32,.6)}
    .card-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:auto;padding-top:12px;border-top:1px dashed var(--border)}
    body.dark .card-footer{border-top:1px dashed rgba(0,229,255,.12)}
    .card-footer .f-right{display:flex;gap:8px;align-items:center}
    .drag-handle{cursor:grab;padding-right:8px;font-size:0;color:var(--text-faint);display:flex;align-items:center;user-select:none;touch-action:none}
    .drag-handle:active{cursor:grabbing;color:var(--primary)}
    .drag-handle svg{width:18px;height:18px}
    .emby-card.sortable-ghost{opacity:.4}
    .emby-card.sortable-drag{cursor:grabbing!important;box-shadow:var(--shadow-lg)}
    .secret-text{font-family:var(--font-mono);letter-spacing:2px;color:var(--text-faint);font-size:12px}
    .dynamic-url{display:block;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:right}
    .actual-text.dynamic-url{white-space:normal;max-width:100%;overflow:visible;text-align:left!important;word-break:break-all;font-size:12px;font-family:var(--font-mono);color:var(--primary);letter-spacing:normal}
    .url-list-item{background:var(--card);border:1px solid var(--border);padding:5px 10px;border-radius:8px;font-size:12px;margin-top:5px;word-break:break-all;line-height:1.5;color:var(--text)}
    .url-list-item:first-child{margin-top:0}

    /* ============ 表格（星云数据台） ============ */
    .table-wrapper{width:100%;border-radius:var(--radius-md);border:1px solid var(--border);overflow:hidden;background:var(--card);box-shadow:var(--shadow-sm)}
    body.dark .table-wrapper{background:rgba(11,18,32,.6);border-color:rgba(0,229,255,.1)}
    table{width:100%;border-collapse:collapse;text-align:left}
    th,td{padding:13px 16px;border-bottom:1px solid var(--border);font-size:13.5px;vertical-align:middle}
    th{color:var(--text-sec);font-weight:700;background:var(--bg-soft);font-size:11.5px;letter-spacing:.8px;text-transform:uppercase;white-space:nowrap}
    body.dark th{background:rgba(8,13,24,.8);color:rgba(0,229,255,.75);font-size:11px;letter-spacing:1.2px}
    tr:last-child td{border-bottom:none}
    tbody tr{transition:background .15s}
    tbody tr:hover td{background-color:var(--primary-soft)}
    body.dark tbody tr:hover td{background:rgba(0,229,255,.05)}

    /* ============ 图标选择 ============ */
    .icon-item{cursor:pointer;padding:6px;border-radius:var(--radius-sm);border:1px solid var(--border);display:flex;justify-content:center;align-items:center;transition:all .2s;background:var(--bg-soft);height:46px}
    .icon-item:hover{border-color:var(--primary)!important;box-shadow:0 2px 10px var(--primary-soft);transform:scale(1.06)}
    .icon-item.selected{border-color:var(--primary);background:var(--primary-soft)}
    #iconGrid::-webkit-scrollbar{width:6px}
    #iconGrid::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:3px}

    /* ============ 弹窗（全息舱） ============ */
    .modal-mask{display:none;position:fixed;inset:0;z-index:1000;background:rgba(4,8,16,.6);overflow-y:auto;-webkit-overflow-scrolling:touch;padding:max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))}
    body.dark .modal-mask{background:rgba(3,6,12,.72)}
    .modal-box{max-width:680px;margin:max(24px, env(safe-area-inset-top)) auto;background:var(--card);border:1px solid var(--border);border-radius:22px;padding:24px;box-shadow:var(--shadow-lg);animation:dsModalIn .3s var(--ease)}
    body.dark .modal-box{background:linear-gradient(165deg, rgba(14,22,40,.97), rgba(8,13,24,.98));border-color:rgba(0,229,255,.14);box-shadow:var(--shadow-lg), 0 0 40px rgba(0,229,255,.06)}
    .modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:10px}
    .modal-head h2{font-size:17px;display:flex;align-items:center;gap:9px;margin:0;font-weight:800}
    .modal-head .close-x{background:transparent;border:none;cursor:pointer;color:var(--text-faint);display:inline-flex;padding:6px;border-radius:9px;transition:all .15s}
    .modal-head .close-x:hover{color:var(--danger);background:var(--danger-soft)}
    .modal-head .close-x svg{width:19px;height:19px}
    @keyframes dsModalIn{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

    /* ============ 视图切换 ============ */
    .page-view{display:none}
    .page-view.active{display:block;animation:dsFadeIn .32s var(--ease) forwards}
    @keyframes dsFadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}

    /* ============ 底部 Dock（指挥舱） ============ */
    .ds-dock{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:580px;background:var(--card-glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--border);border-radius:999px;padding:6px 10px;display:flex;justify-content:space-around;box-shadow:var(--shadow-lg);z-index:950}
    body.dark .ds-dock{background:rgba(9,15,28,.75);border-color:rgba(0,229,255,.16);box-shadow:0 12px 40px rgba(0,0,0,.5), 0 0 30px rgba(0,229,255,.06)}
    .ds-dock-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:9px 16px;border-radius:999px;color:var(--text-sec);font-size:11px;font-weight:700;letter-spacing:.2px;transition:all .22s;background:transparent;border:none;cursor:pointer;flex:1;font-family:inherit}
    .ds-dock-item svg{width:21px;height:21px;fill:currentColor;transition:transform .22s}
    .ds-dock-item:hover{color:var(--primary)}
    .ds-dock-item:hover svg{transform:translateY(-2px)}
    .ds-dock-item.active{color:#fff;background:var(--primary-grad-2);box-shadow:0 4px 18px rgba(124,92,255,.4)}
    body.dark .ds-dock-item.active{background:linear-gradient(135deg,#00d4ff 0%,#3d7bff 100%);box-shadow:0 4px 20px rgba(0,213,255,.45), 0 0 26px rgba(0,213,255,.25)}
    .ds-dock-item.active svg,.ds-dock-item.active span{color:#fff;fill:#fff}

    /* ============ Toast（霓虹胶囊） ============ */
    #toast{position:fixed;top:-64px;left:50%;transform:translateX(-50%);background:rgba(13,17,28,.94);color:#fff;padding:12px 26px;border-radius:999px;font-size:14px;font-weight:600;transition:top .45s var(--ease);z-index:9999;backdrop-filter:blur(12px);text-align:center;max-width:90vw;word-wrap:break-word;box-shadow:0 8px 30px rgba(0,0,0,.4), 0 0 20px rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.2);display:flex;align-items:center;gap:8px}
    #toast.show{top:20px}

    /* ============ 图标统一 ============ */
    .ti{display:inline-flex;align-items:center;justify-content:center;vertical-align:-.18em;flex-shrink:0}
    .ti svg{width:16px;height:16px}
    h1 svg,h2 svg,h3 svg,h4 svg,p svg,label svg,span svg,div svg{width:1.1em;height:1.1em;vertical-align:-.18em;flex-shrink:0}
    .rotated{transform:rotate(180deg)}

    /* ============ 大屏弹窗（数据星云） ============ */
    #dashboardModal{padding:10px}
    #dashboardModal .modal-box{max-width:1000px}
    .stat-pills{display:flex;gap:10px;flex-wrap:wrap}
    .stat-pill{font-size:12.5px;background:var(--primary-soft);color:var(--primary);padding:6px 13px;border-radius:999px;border:1px solid rgba(61,123,255,.22);display:flex;gap:10px;flex-wrap:wrap}
    body.dark .stat-pill{background:rgba(0,229,255,.08);border-color:rgba(0,229,255,.2);color:var(--primary-2)}
    .stat-pill strong{font-weight:700}
    .chart-panel{flex:2;min-width:300px;border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;background:var(--bg-soft)}
    body.dark .chart-panel{background:rgba(8,13,24,.6);border-color:rgba(0,229,255,.1)}
    .chart-panel.pie{flex:1;display:flex;justify-content:center;align-items:center;min-height:280px}

    /* ============ 测速页 ============ */
    #view-speed .toolbar{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:stretch}
    #view-speed .toolbar select{grid-column:1/-1;width:100%}
    #view-speed .toolbar .btn-submit{width:100%;padding:12px 14px;font-size:13px;justify-content:center}
    .node-cb{width:18px;height:18px;margin:0;cursor:pointer;accent-color:var(--primary);flex-shrink:0}
    .ip-text{font-family:var(--font-mono);cursor:pointer}
    .test-row .latency,.test-row .speed,.test-row .loc{font-weight:600}

    /* ============ 响应式 ============ */
    /* 测速行 / 选择行（JS 动态类，纯视觉） */
    .route-item{cursor:pointer;transition:background .15s}
    .route-item:hover td{background:var(--primary-soft)}
    .row-checkbox{width:17px;height:17px;accent-color:var(--primary);cursor:pointer}
    @media (max-width:768px){
        body{padding:0}
        .container{padding:calc(var(--topbar-h) + 40px) 14px 124px}
        .card{padding:18px;border-radius:14px;margin-bottom:16px}
        .hero-card{padding:22px 18px}
        .hero-card h1{font-size:20px}
        .node-grid{grid-template-columns:1fr}
        .nodes-toolbar{padding:12px 14px}
        .table-wrapper{border:none;background:transparent;overflow:visible;box-shadow:none}
        table,thead,tbody,th,td,tr{display:block;width:100%}
        thead{display:none}
        tr{margin-bottom:14px;background:var(--card);border-radius:var(--radius-md);border:1px solid var(--border);box-shadow:var(--shadow);overflow:hidden}
        body.dark tr{background:linear-gradient(160deg, rgba(14,22,40,.9), rgba(9,14,26,.95));border-color:rgba(0,229,255,.1)}
        td{display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid var(--border);text-align:right;gap:10px;min-height:46px}
        td:last-child{border-bottom:none}
        td[colspan]{justify-content:center;text-align:center}
        td[colspan]::before{display:none!important}
        td::before{content:attr(data-label);font-weight:600;color:var(--text-sec);flex-shrink:0;margin-right:auto;text-align:left;font-size:11px;letter-spacing:.4px;text-transform:uppercase}
        .search-input{width:100%;max-width:none}
        .toolbar{flex-direction:column;align-items:stretch;gap:10px}
        .toolbar>*{width:100%}
        .topbar{padding:0 12px;gap:8px}
        .topbar-logo{width:32px;height:32px}
        .topbar-title{display:none}
        .topbar-center{flex:1}
        .pill-btn{padding:5px 10px;font-size:12px}
        .rtt-pill{padding:5px 10px;gap:6px;font-size:11px}
        .rtt-label{display:none}
        .modal-box{margin:12px auto;padding:18px;border-radius:16px}
        .stat-pill{font-size:12px}
        .nodes-toolbar .tb-sep{display:none}
    }

/* ============================================================
   深色模式可读性修复（全局输入控件）
   —— 伪装版同款：内联未写 color 的 input/textarea/select 深色下黑字不可见
   ============================================================ */
body.dark input[type=text],body.dark input[type=url],body.dark input[type=password],body.dark input[type=number],body.dark input[type=search],body.dark input[type=email],body.dark select,body.dark textarea{color:#e8eefc!important;background:#0d1526!important;border-color:rgba(0,229,255,.15)!important}
body.dark select option{background:#0d1526;color:#e8eefc}
body.dark input::placeholder,body.dark textarea::placeholder{color:#8a96b8!important;opacity:1!important}

/* ============================================================
   风格改造:玻璃拟态 + 弹幕背景层(v3.4.31)
   深色下背景改为深蓝紫渐变;全局浮动弹幕;内容层抬升让玻璃卡模糊到弹幕
   ============================================================ */
body.dark{background:linear-gradient(160deg,#0b0e1a 0%,#0f1730 48%,#060a13 100%) fixed}
.dm-layer{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.dm-layer .dm{position:absolute;white-space:nowrap;font-weight:600;letter-spacing:3px;font-size:14px;opacity:.13;will-change:transform;animation:dmDrift var(--dm-dur,26s) linear infinite;animation-delay:var(--dm-delay,0s)}
.dm-a{color:#8ab4ff}.dm-b{color:#ffa657}.dm-c{color:#56d4dd}.dm-d{color:#a78bfa}.dm-e{color:#7ee787}
/* 浅色模式下弹幕加深提亮,保证可见 */
body:not(.dark) .dm-layer .dm{opacity:.34}
body:not(.dark) .dm-a{color:#1f5fc7}body:not(.dark) .dm-b{color:#c96a10}body:not(.dark) .dm-c{color:#0e8d9f}body:not(.dark) .dm-d{color:#6d3fc4}body:not(.dark) .dm-e{color:#2f8f43}
@keyframes dmDrift{from{transform:translateX(105%)}to{transform:translateX(-45%)}}
/* 内容层抬升,玻璃卡 backdrop-filter 模糊到背后的弹幕 */
.container,.login-wrap{position:relative;z-index:1}
/* 主卡片玻璃化(深色):半透明 + 背景模糊,弹幕在卡片背后隐约可见 */
body.dark .card,body.dark .emby-card,body.dark .nodes-toolbar,body.dark .table-wrapper{
    background:rgba(13,21,38,.72)!important;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);border-color:rgba(255,255,255,.1)}
body.dark .modal-box{background:rgba(10,16,30,.85)!important;backdrop-filter:blur(18px) saturate(1.5);-webkit-backdrop-filter:blur(18px) saturate(1.5)}

/* ============ 栏目折叠组件(v3.4.32) ============ */
.collapse-head{display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;margin-bottom:10px;gap:8px}
.collapse-head .ch-title{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;color:var(--text)}
.collapse-head .ch-arrow{font-size:11px;color:var(--text-sec);transition:transform .25s var(--ease);flex-shrink:0}
.collapse-sec.open .collapse-head .ch-arrow{transform:rotate(90deg)}
.collapse-body{display:none}
.collapse-sec.open .collapse-body{display:block}
.collapse-arrow{display:inline-block;transition:transform .25s var(--ease);color:var(--text-sec);font-size:12px;margin-right:2px}
.collapse-arrow.open{transform:rotate(90deg)}
/* ===== 按钮组统排:等宽等高;3/2个一组始终一排;5个一组移动端2+3、宽屏一排 ===== */
.btn-grid{display:flex;flex-wrap:wrap;gap:10px}
.btn-grid>button{flex:1 1 30%;min-width:0;box-sizing:border-box;text-align:center;white-space:nowrap;padding:12px 8px;font-size:12px;justify-content:center;line-height:1.2;margin:0}
.btn-grid.cols-5>button:nth-child(-n+2){flex:1 1 45%;font-size:13px}
@media(min-width:640px){
  .btn-grid.cols-5>button,.btn-grid.cols-5>button:nth-child(-n+2),.btn-grid.cols-5>button:nth-child(n+3){flex:1 1 18%;font-size:13px}
}

`



const LOGIN_UI = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#060a13">
    <title>系统授权</title>
    <style>
        ${CSS_COMMON}
        body { display:flex; justify-content:center; align-items:center; min-height:100vh; padding:16px; margin:0; background:linear-gradient(160deg,#0b0e1a 0%,#0f1730 48%,#060a13 100%) fixed; color:#e8eefc; }
        /* 星云极光背景 */
        body::before { content:''; position:fixed; inset:0; z-index:-1; pointer-events:none; background:
            radial-gradient(2px 2px at 15% 25%, rgba(255,255,255,.8), transparent 45%),
            radial-gradient(1.5px 1.5px at 82% 14%, rgba(0,229,255,1), transparent 45%),
            radial-gradient(2px 2px at 28% 78%, rgba(255,255,255,.6), transparent 45%),
            radial-gradient(1.5px 1.5px at 64% 60%, rgba(139,92,246,1), transparent 45%),
            radial-gradient(2px 2px at 90% 84%, rgba(255,255,255,.5), transparent 45%),
            radial-gradient(1.5px 1.5px at 6% 62%, rgba(0,229,255,.8), transparent 45%),
            radial-gradient(900px 520px at 10% -10%, rgba(77,163,255,.22), transparent 62%),
            radial-gradient(820px 500px at 108% 4%, rgba(0,229,255,.14), transparent 60%),
            radial-gradient(760px 520px at 50% 120%, rgba(139,92,246,.2), transparent 62%); }
        body::after { content:''; position:fixed; inset:0; z-index:-1; pointer-events:none; opacity:.9;
            background-image:
                linear-gradient(rgba(0,229,255,.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0,229,255,.05) 1px, transparent 1px);
            background-size:46px 46px;
            mask-image:radial-gradient(ellipse 80% 65% at 50% 20%, #000 30%, transparent 80%); }
        .login-wrap { width:100%; max-width:400px; }
        .login-box { background:rgba(10,16,30,.72); backdrop-filter:var(--blur); -webkit-backdrop-filter:var(--blur); padding:44px 32px 30px; border-radius:26px; box-shadow:0 20px 60px rgba(0,0,0,.5), 0 0 50px rgba(0,229,255,.06); text-align:center; width:100%; border:1px solid rgba(0,229,255,.18); animation:dsModalIn .4s var(--ease); position:relative; overflow:hidden; }
        .login-box::before { content:''; position:absolute; left:0; top:0; width:100%; height:3px; background:linear-gradient(90deg, transparent, #00e5ff, #8b5cf6, transparent); box-shadow:0 0 18px rgba(0,229,255,.6); }
        /* 扫描线 */
        .login-box::after { content:''; position:absolute; left:0; right:0; top:-30%; height:26%; background:linear-gradient(180deg, transparent, rgba(0,229,255,.05), transparent); animation:lgScan 5.5s linear infinite; pointer-events:none; }
        @keyframes lgScan { 0% { top:-30%; } 100% { top:130%; } }
        .login-logo { width:70px; height:70px; border-radius:20px; object-fit:cover; margin:0 auto 22px; box-shadow:0 0 30px rgba(0,229,255,.35), 0 12px 34px rgba(0,0,0,.4); display:block; border:1px solid rgba(0,229,255,.3); background:rgba(13,21,38,.9); }
        .login-box h2 { margin:0 0 6px; font-size:22px; font-weight:800; letter-spacing:.3px; background:linear-gradient(120deg,#7ec9ff,#00e5ff,#a78bfa); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; filter:drop-shadow(0 0 16px rgba(0,229,255,.25)); }
        .login-sub { color:#8a94b0; font-size:13px; margin:0 0 30px; }
        .login-box input { width:100%; padding:15px 16px; margin-bottom:16px; border:1px solid rgba(0,229,255,.2); border-radius:14px; background:rgba(8,13,24,.7); color:#e8eefc; text-align:center; letter-spacing:3px; font-size:15px; transition:border-color .2s,box-shadow .2s,background .2s; }
        .login-box input::placeholder { color:#566084; }
        .login-box input:focus { border-color:#00e5ff; box-shadow:0 0 0 4px rgba(0,229,255,.12), 0 0 22px rgba(0,229,255,.18); background:rgba(11,18,32,.85); }
        .login-box button { width:100%; padding:15px; background:linear-gradient(135deg,#0a84ff 0%,#00d4ff 100%); color:#fff; border:none; border-radius:14px; cursor:pointer; font-weight:700; font-size:15px; letter-spacing:4px; box-shadow:0 6px 22px rgba(0,213,255,.35), 0 0 26px rgba(0,213,255,.14); transition:all .2s; position:relative; overflow:hidden; }
        .login-box button::after { content:''; position:absolute; top:0; left:-80%; width:50%; height:100%; background:linear-gradient(100deg,transparent,rgba(255,255,255,.4),transparent); transform:skewX(-25deg); transition:left .5s var(--ease); }
        .login-box button:hover { transform:translateY(-2px); box-shadow:0 10px 30px rgba(0,213,255,.45), 0 0 34px rgba(0,213,255,.2); filter:brightness(1.06); }
        .login-box button:hover::after { left:130%; }
        .login-box button:active { transform:translateY(0) scale(.98); }
        .login-foot { margin-top:22px; font-size:12px; color:#566084; }
        @keyframes lgShift { from { background-position:0% 0%; } to { background-position:100% 100%; } }
    </style>
    <link rel="icon" type="image/jpeg" href="${EMBY_LOGO}">    <script>
const I = {
  rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8-.8-.7-2.2-.7-3 .8z"/><path d="M12 15l-3-3c.5-4 4-7.5 8-8 2 .2 3.8 2 4 4-.5 4-4 7.5-8 8l-1-1z"/><path d="M9 12c-2 1-3.5 3-4 5"/><circle cx="15" cy="9" r="0.5"/></svg>',
  xmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17.5h.01"/></svg>',
  film:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.1 6.2-5.5-3-5.5 3 1.1-6.2L3 9.5l6.3-.8L12 3z"/></svg>',
  sparkles:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14zM6 14l.6 1.7L8.5 16l-1.9.7L6 18.5l-.6-1.8L3.5 16l1.9-.3L6 14z"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 3v5h-5"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 1 1 0-8 5 5 0 0 1 9.6 1.3A3.5 3.5 0 0 1 17 18H7z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  location:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8L7 17M17 7l2.8-2.8"/></svg>',
  lines:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  antenna:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.4 2a14 14 0 0 0 0 20M17.6 2a14 14 0 0 1 0 20M9.8 5.5a9 9 0 0 0 0 13M14.2 5.5a9 9 0 0 1 0 13"/><circle cx="12" cy="12" r="1.5"/></svg>',
  bulb:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M8 14.5A6 6 0 0 1 12 5a6 6 0 0 1 4 9.5c-.8.8-1 1.6-1 2.5h-6c0-.9-.2-1.7-1-2.5z"/></svg>',
  tv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
  flame:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-5-.5 1-1 2-1 3 0 2.5 3 3 3 6 1-2 0-4 0-4 2 1 3 3 3 4.5A6.5 6.5 0 0 1 12 22 6.5 6.5 0 0 1 5.5 15C5.5 9 12 2 12 2z"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0l-2.83 2.83a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>',
  crown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7z"/><path d="M6 19h12"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  arrowdown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  robot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/><path d="M2 13v3M22 13v3"/></svg>',
  spy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="11" r="7"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M9.5 14c1 .8 4 .8 5 0"/></svg>',
  flask:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V3"/><path d="M7 15h10"/></svg>',
  broom:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3l8 8M11 11l8-8M4 20l7-7 1 1-7 7-2-1z"/><path d="M6 8l4 4"/></svg>',
  checksquare:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16"/></svg>',
  db:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  dotblue:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#007aff"/></svg>',
  dotorange:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#ff9500"/></svg>',
  dotgreen:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#34c759"/></svg>',
  dotpurple:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#af52de"/></svg>'
};

const E2I = { '${I.rocket}':'rocket','${I.xmark}':'xmark','${I.check}':'check','${I.warn}':'warn','${I.film}':'film','${I.star}':'star','${I.sparkles}':'sparkles','${I.sparkles}':'sparkles','${I.globe}':'globe','${I.globe}':'globe','${I.bolt}':'bolt','${I.refresh}':'refresh','${I.chart}':'chart','${I.cloud}':'cloud','${I.trash}':'trash','${I.search}':'search','${I.location}':'location','${I.trophy}':'trophy','${I.moon}':'moon','${I.sun}':'sun','${I.dotblue}':'dotblue','${I.dotorange}':'dotorange','${I.dotgreen}':'dotgreen','${I.dotpurple}':'dotpurple','${I.robot}':'robot','${I.spy}':'spy','${I.flame}':'flame','${I.link}':'link','${I.tv}':'tv','${I.box}':'box','${I.download}':'download','${I.antenna}':'antenna','${I.bulb}':'bulb','${I.crown}':'crown','${I.target}':'target','${I.arrowdown}':'arrowdown','${I.xmark}':'xmark','${I.pencil}':'pencil','${I.gear}':'gear','${I.lines}':'lines','${I.flask}':'flask','${I.broom}':'broom','${I.checksquare}':'checksquare','${I.upload}':'upload' };
function toSvg(s){
  if(!s) return s;
  return String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, function(ch){
    if(ch==='\uFE0F') return '';
    var key = E2I[ch];
    return (key && I[key]) ? '<span class="ti">'+I[key]+'</span>' : '';
  });
}
    </script>

</head>
<body>
    <div id="toast"></div>
    <div class="dm-layer" aria-hidden="true">
        <span class="dm dm-a" style="top:9%;--dm-dur:26s;">反代就绪 · 播放继续 · 正在连接上</span>
        <span class="dm dm-b" style="top:20%;--dm-dur:31s;--dm-delay:-9s;">多后端就绪 · 推流跟随 · 共享带宽</span>
        <span class="dm dm-c" style="top:32%;--dm-dur:25s;--dm-delay:-15s;">一个入口 · 多个原始服务器</span>
        <span class="dm dm-d" style="top:45%;--dm-dur:35s;--dm-delay:-5s;">边缘缓存 · 播放继续 · 正在连接上</span>
        <span class="dm dm-e" style="top:58%;--dm-dur:23s;--dm-delay:-18s;">安全授权 · 密钥验证 · 登录即达</span>
        <span class="dm dm-a" style="top:70%;--dm-dur:30s;--dm-delay:-3s;">节点在线 · 聚合中 · 直连优先</span>
        <span class="dm dm-b" style="top:82%;--dm-dur:27s;--dm-delay:-11s;">播放继续 · 转码就绪 · 正在连接上</span>
        <span class="dm dm-c" style="top:93%;--dm-dur:33s;--dm-delay:-7s;">反代就绪 · 多后端就绪</span>
    </div>
    <div class="login-wrap">
        <div class="login-box">
            <img class="login-logo" src="${EMBY_LOGO}" alt="logo" onerror="this.style.display='none'">
            <h2>安全中心</h2>
            <p class="login-sub">请输入访问密钥以继续</p>
            <input type="password" id="tokenInput" placeholder="请输入密钥 TOKEN" onkeydown="if(event.key==='Enter') login()" autocomplete="off">
            <button onclick="login()">验 证 登 录</button>
            <p class="login-foot">登录后浏览器将记住本次授权</p>
        </div>
    </div>
    <script>
        function showToast(msg) {
            const t = document.getElementById('toast');
            t.innerHTML = toSvg(msg); t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 2000);
        }
        function login() {
            const token = document.getElementById('tokenInput').value.trim();
            if(!token) return showToast('请输入正确的密钥');
            document.cookie = 'admin_token=' + encodeURIComponent(token) + '; path=/; max-age=2592000;';
            window.location.reload();
        }
    </script>

</body>
</html>
`;

const HTML_UI = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>玛卡巴卡的反代面板</title>
    <style>${CSS_COMMON}</style>
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="icon" type="image/jpeg" href="${EMBY_LOGO}">
    <script>
const I = {
  rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8-.8-.7-2.2-.7-3 .8z"/><path d="M12 15l-3-3c.5-4 4-7.5 8-8 2 .2 3.8 2 4 4-.5 4-4 7.5-8 8l-1-1z"/><path d="M9 12c-2 1-3.5 3-4 5"/><circle cx="15" cy="9" r="0.5"/></svg>',
  xmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17.5h.01"/></svg>',
  film:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.1 6.2-5.5-3-5.5 3 1.1-6.2L3 9.5l6.3-.8L12 3z"/></svg>',
  sparkles:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14zM6 14l.6 1.7L8.5 16l-1.9.7L6 18.5l-.6-1.8L3.5 16l1.9-.3L6 14z"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 3v5h-5"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 1 1 0-8 5 5 0 0 1 9.6 1.3A3.5 3.5 0 0 1 17 18H7z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  location:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8L7 17M17 7l2.8-2.8"/></svg>',
  lines:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  antenna:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.4 2a14 14 0 0 0 0 20M17.6 2a14 14 0 0 1 0 20M9.8 5.5a9 9 0 0 0 0 13M14.2 5.5a9 9 0 0 1 0 13"/><circle cx="12" cy="12" r="1.5"/></svg>',
  bulb:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M8 14.5A6 6 0 0 1 12 5a6 6 0 0 1 4 9.5c-.8.8-1 1.6-1 2.5h-6c0-.9-.2-1.7-1-2.5z"/></svg>',
  tv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
  flame:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-5-.5 1-1 2-1 3 0 2.5 3 3 3 6 1-2 0-4 0-4 2 1 3 3 3 4.5A6.5 6.5 0 0 1 12 22 6.5 6.5 0 0 1 5.5 15C5.5 9 12 2 12 2z"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0l-2.83 2.83a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>',
  crown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7z"/><path d="M6 19h12"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  arrowdown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  robot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/><path d="M2 13v3M22 13v3"/></svg>',
  spy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="11" r="7"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M9.5 14c1 .8 4 .8 5 0"/></svg>',
  flask:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V3"/><path d="M7 15h10"/></svg>',
  broom:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3l8 8M11 11l8-8M4 20l7-7 1 1-7 7-2-1z"/><path d="M6 8l4 4"/></svg>',
  checksquare:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16"/></svg>',
  db:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  dotblue:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#007aff"/></svg>',
  dotorange:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#ff9500"/></svg>',
  dotgreen:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#34c759"/></svg>',
  dotpurple:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#af52de"/></svg>'
};

const E2I = { '${I.rocket}':'rocket','${I.xmark}':'xmark','${I.check}':'check','${I.warn}':'warn','${I.film}':'film','${I.star}':'star','${I.sparkles}':'sparkles','${I.sparkles}':'sparkles','${I.globe}':'globe','${I.globe}':'globe','${I.bolt}':'bolt','${I.refresh}':'refresh','${I.chart}':'chart','${I.cloud}':'cloud','${I.trash}':'trash','${I.search}':'search','${I.location}':'location','${I.trophy}':'trophy','${I.moon}':'moon','${I.sun}':'sun','${I.dotblue}':'dotblue','${I.dotorange}':'dotorange','${I.dotgreen}':'dotgreen','${I.dotpurple}':'dotpurple','${I.robot}':'robot','${I.spy}':'spy','${I.flame}':'flame','${I.link}':'link','${I.tv}':'tv','${I.box}':'box','${I.download}':'download','${I.antenna}':'antenna','${I.bulb}':'bulb','${I.crown}':'crown','${I.target}':'target','${I.arrowdown}':'arrowdown','${I.xmark}':'xmark','${I.pencil}':'pencil','${I.gear}':'gear','${I.lines}':'lines','${I.flask}':'flask','${I.broom}':'broom','${I.checksquare}':'checksquare','${I.upload}':'upload' };
function toSvg(s){
  if(!s) return s;
  return String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, function(ch){
    if(ch==='\uFE0F') return '';
    var key = E2I[ch];
    return (key && I[key]) ? '<span class="ti">'+I[key]+'</span>' : '';
  });
}
    </script>
</head>
<body>
    <div id="toast"></div>
    <div class="dm-layer" aria-hidden="true">
        <span class="dm dm-a" style="top:8%;--dm-dur:26s;">节点在线 · 边缘缓存 · 播放继续</span>
        <span class="dm dm-b" style="top:18%;--dm-dur:31s;--dm-delay:-9s;">数据大屏 · 实时流量 · 热力图</span>
        <span class="dm dm-c" style="top:30%;--dm-dur:25s;--dm-delay:-15s;">反代就绪 · 推流跟随 · 多后端</span>
        <span class="dm dm-d" style="top:43%;--dm-dur:35s;--dm-delay:-5s;">保号提醒 · 申请审核 · 公告中心</span>
        <span class="dm dm-e" style="top:56%;--dm-dur:23s;--dm-delay:-18s;">一个入口 · 多个原始服务器</span>
        <span class="dm dm-a" style="top:69%;--dm-dur:30s;--dm-delay:-3s;">带宽共享 · 并发控制 · 单IP限速</span>
        <span class="dm dm-b" style="top:81%;--dm-dur:27s;--dm-delay:-11s;">播放继续 · 正在连接上 · 聚合中</span>
        <span class="dm dm-c" style="top:93%;--dm-dur:33s;--dm-delay:-7s;">转码就绪 · 直连优先 · 边缘加速</span>
    </div>

    <div id="dashboardModal" class="modal-mask">
        <div class="modal-box">
            <div class="modal-head">
                <h2>${I.chart} 数据大屏 <span style="font-size:13px; font-weight:400; color:var(--text-sec);">精确访客画像分析</span></h2>
                <button class="close-x" onclick="closeDashboard()" title="关闭">${I.xmark}</button>
            </div>
            <div class="stat-pills" style="margin-bottom:18px;">
                <span class="stat-pill">今天: <strong id="trafficToday">加载中...</strong></span>
                <span class="stat-pill">1周内: <strong id="traffic7d">加载中...</strong></span>
                <span class="stat-pill">1月内: <strong id="traffic30d">加载中...</strong></span>
            </div>
            <div class="stat-pills" style="margin-bottom:10px;">
                <span class="stat-pill">CF请求 今天: <strong id="cfToday">加载中...</strong></span>
                <span class="stat-pill">1周内: <strong id="cfWeek">加载中...</strong></span>
                <span class="stat-pill">1月内: <strong id="cfMonth">加载中...</strong></span>
            </div>
            <div class="stat-pills" style="margin-bottom:10px;">
                <span class="stat-pill">今日带宽: <strong id="cfBandwidth">加载中...</strong></span>
                <span class="stat-pill">缓存命中: <strong id="cfCacheRatio">加载中...</strong></span>
                <span class="stat-pill">被拦截: <strong id="cfBlocked">加载中...</strong></span>
                <span class="stat-pill">5xx错误: <strong id="cf5xx">加载中...</strong></span>
            </div>
            <div id="cfQuotaCard" style="background:linear-gradient(135deg, rgba(0,229,255,.08), rgba(124,58,237,.08)); border:1px solid var(--border); border-radius:12px; padding:14px 16px; margin-bottom:18px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                    <span style="font-size:13px; font-weight:600;">CF Worker 每日免费请求额度 <span style="font-size:12px; font-weight:400; color:var(--text-sec);">(UTC 00:00 重置 · 基准 100,000 次/天)</span></span>
                    <span id="cfQuotaText" style="font-size:13px; font-weight:700; color:var(--primary);">加载中...</span>
                </div>
                <div style="height:10px; background:rgba(120,120,120,.18); border-radius:999px; margin-top:12px; overflow:hidden;">
                    <div id="cfQuotaBar" style="height:100%; width:0%; background:linear-gradient(90deg,#00e5ff,#7c3aed); border-radius:999px; transition:width .6s ease;"></div>
                </div>
                <div id="cfQuotaDetail" style="font-size:12px; color:var(--text-sec); margin-top:8px;">已用 0 次 / 10万 (0%) · 剩余 100000 次</div>
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:18px;">
                <div class="chart-panel" style="flex:1; min-width:260px;">
                    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">今日响应状态码分布</div>
                    <canvas id="cfStatusChart" height="140"></canvas>
                </div>
                <div class="chart-panel" style="flex:1; min-width:260px;">
                    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">今日请求分时趋势 (北京时间 24h)</div>
                    <canvas id="cfHourChart" height="140"></canvas>
                </div>
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:18px;">
                <div class="chart-panel" style="flex:1; min-width:260px;">
                    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">今日 Top 来源地区</div>
                    <div id="cfCountryList" style="font-size:12px; color:var(--text-sec);">加载中...</div>
                </div>
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
                <div class="chart-panel"><canvas id="trendChart"></canvas></div>
                <div class="chart-panel pie"><canvas id="locationChart"></canvas></div>
            </div>
            <h3 style="margin:22px 0 12px; font-size:15px; display:flex; align-items:center; gap:6px;">${I.bolt} 播放热力图 <span style="font-size:12px; color:var(--text-sec);">(最近 7 天 × 24 小时,反代真实播放请求命中统计)</span></h3>
            <div id="heatmapContainer" style="border:1px solid var(--border); border-radius:14px; padding:16px; background:rgba(120,120,120,0.03); margin-bottom:18px;">
                <div id="heatmapSummary" style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">加载中...</div>
                <div id="heatmapGrid" style="overflow-x:auto;"></div>
            </div>
            <h3 style="margin:22px 0 12px; font-size:15px; display:flex; align-items:center; gap:6px;">${I.spy} 最新独立播放记录 <span style="font-size:12px; color:var(--text-sec);">(仅拦截 PlaybackInfo 真实播放)</span></h3>
            <div class="table-wrapper">
                <table style="width:100%;">
                    <thead><tr><th>访问时间</th><th>目标节点</th><th>真实 IP 地址</th><th>归属地</th><th>客户端/设备标识 (User-Agent)</th></tr></thead>
                    <tbody id="logTableBody"><tr><td colspan="5" style="text-align:center; padding:30px;">加载数据中...</td></tr></tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="topbar">
        <div class="topbar-brand">
            <img class="topbar-logo" src="${EMBY_LOGO}" alt="logo" onclick="openAccountModal()" title="账户设置" onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MiIgaGVpZ2h0PSI3MiIgdmlld0JveD0iMCAwIDcyIDcyIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMwMGQ0ZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMzZDdiZmYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNzIiIGhlaWdodD0iNzIiIHJ4PSIxNCIgZmlsbD0idXJsKCNnKSIvPjx0ZXh0IHg9IjM2IiB5PSI1MCIgZm9udC1zaXplPSIzNiIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI3MDAiIGZpbGw9IiNmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk48L3RleHQ+PC9zdmc+'">
            <div class="rtt-pill" title="你的设备到云端边缘节点的真实往返延迟">
                <span class="rtt-dot" id="rttDot"></span>
                <span class="rtt-label">RTT</span>
                <span id="rttValue">测算中</span>
            </div>
            <div class="topbar-title">反代控制台<small>CF Worker</small></div>
        </div>
        <div class="topbar-center"></div>
        <div class="topbar-actions">
            <div class="tb-group">
                <button class="tb-icon-btn" id="themeToggle" onclick="toggleDarkMode()" title="切换深色模式">${I.moon}</button>
                <button class="tb-icon-btn admin-only" id="nodeReqBtn" onclick="openNodeReqModal()" title="节点申请" style="position:relative;">${I.robot}<span id="nodeReqBadge" style="display:none; position:absolute; top:-4px; right:-4px; background:#ff3b30; color:#fff; font-size:10px; font-weight:700; border-radius:999px; padding:1px 5px; min-width:16px; text-align:center;"></span></button>
                <button class="tb-icon-btn" onclick="openDashboard()" title="数据统计">${I.chart}</button>
                <button class="tb-icon-btn" onclick="location.href='/speedtest'" title="下载测速" style="color:var(--success);">${I.bolt}</button>
                <button class="tb-icon-btn danger" onclick="confirmLogout()" title="退出系统">${I.xmark}</button>
            </div>
        </div>
    </div>

    <div class="container">

        <div id="view-nodes" class="page-view active">

            <div class="card hero-card" id="deploy-card">
                <div class="hero-core">
                    <h1>${I.rocket} 反代节点 <span class="hero-chip">NEBULA · v${CURRENT_VERSION}</span></h1>
                    <div class="hero-sub">为每个媒体库配置独立反代线路、加密模式与访问限制</div>
                </div>
                <div style="margin-left:auto;">
                    <button class="btn-submit" onclick="openNodeModal()">${I.plus} 添加节点</button>
                </div>
            </div>

            <div class="card">
                <div class="card-header" style="margin-bottom:16px; cursor:pointer;" onclick="toggleNodesCollapse()">
                    <h2><span id="nodesArrow" class="collapse-arrow">▶</span> 已反代的媒体库 <span class="card-sub">拖拽卡片可排序</span></h2>
                    <div class="card-tools" onclick="event.stopPropagation()">
                        <button class="btn-submit admin-only" onclick="pingAllNodes()" style="padding:9px 14px; font-size:13px;">${I.bolt} 全局测速</button>
                        <button id="btnPurge" class="btn-submit admin-only" onclick="purgeCache()" style="padding:9px 14px; font-size:13px;">${I.broom} 刷新全站海报</button>
                        <button class="btn-submit" onclick="openSubReqModal()" style="padding:9px 14px; font-size:13px;">${I.plus} 申请节点</button>
                        <input type="text" id="searchNode" class="search-input" placeholder="搜索备注/后缀/线路地址查找..." onkeyup="filterNodesList()" oninput="filterNodesList()">
                    </div>
                </div>
                <div class="admin-only nodes-toolbar" id="nodesToolbar" style="margin-bottom:18px; display:none;">
                    <label style="cursor:pointer; font-weight:600; display:flex; align-items:center; gap:7px; font-size:13px;">
                        <input type="checkbox" id="selectAllNodes" onchange="toggleSelectAll(this)" class="node-cb">
                        全选节点
                    </label>
                    <span class="tb-sep"></span>
                    <select id="batch-mode-select" class="batch-sel" style="padding:8px 12px; border-radius:10px; border:1px solid var(--border); background:var(--bg-soft); color:var(--text); font-weight:600;">
                        <option value="">读取模式中...</option>
                    </select>
                    <button class="btn-submit" onclick="batchUpdateModes()" style="padding:8px 16px;">${I.rocket} 批量应用模式</button>
                    <span id="batch-status" style="font-size:13px; font-weight:600;"></span>
                </div>
                <div id="list-grid" class="node-grid" style="display:none;">
                    <div style="text-align:center; color:var(--text-sec); grid-column:1/-1; padding:44px;">读取数据中...</div>
                </div>
                <div id="nodesHint" style="text-align:center; color:var(--text-sec); font-size:13px; padding:18px 12px; cursor:pointer; user-select:none;" onclick="toggleNodesCollapse()">已收起全部节点 · 点击展开查看</div>
            </div>

        </div>

        <div id="view-speed" class="page-view">

            <div class="card admin-only">
                <div class="card-header" style="margin-bottom:16px;">
                    <h2>${I.bolt} 专属线路测速与动态 DNS 解析</h2>
                </div>
                <div class="collapse-sec" style="background:var(--bg-soft); padding:12px 16px; border-radius:12px; border:1px solid var(--border); margin-bottom:16px;">
                    <div class="collapse-head" onclick="toggleCollapseSec(this)">
                        <div class="ch-title">${I.antenna} 当前域名生效的 DNS 解析：</div>
                        <span class="ch-hint" style="font-size:12px;color:var(--text-sec);">点击展开</span>
                    </div>
                    <div class="collapse-body">
                        <div id="dnsStatus" style="display:flex; gap:8px; flex-wrap:wrap;">
                            <span style="color:var(--text-faint); font-size:14px;">加载中...</span>
                        </div>
                    </div>
                </div>
                <div class="collapse-sec" style="background:var(--bg-soft); padding:16px; border-radius:14px; border:1px solid var(--border); margin-bottom:16px;">
                    <div class="collapse-head" onclick="toggleCollapseSec(this)">
                        <div class="ch-title"><span class="ch-arrow">▶</span><span class="ti" style="font-size:17px; color:var(--primary);">${I.chart}</span> 预设优选源
                            <span style="font-weight:500; font-size:12px; color:var(--text-sec);">(云枢全域 / IP大段 / IPv6 / 第三方,共 30 源)</span>
                        </div>
                        <span class="ch-hint" style="font-size:12px;color:var(--text-sec);">点击展开</span>
                    </div>
                    <div class="collapse-body">
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                        <select id="ipType" style="font-weight:600; color:var(--primary); flex:1; min-width:230px;" onchange="updatePresetInfo()">
                            <optgroup label="综合优选">
                                <option value="all">🌟 综合混合源(四源并发聚合)</option>
                            </optgroup>
                            <optgroup label="云枢全域 · 三网专线">
                                <option value="ehb-all" title="https://ip.ehb.cc.cd/all?ips=100">🌟 云枢全域融合(双栈) · 云枢全域诸源</option>
                                <option value="ehb-cm" title="https://ip.ehb.cc.cd/cm?ips=100">🚄 云枢移动起飞 · 云枢移动起飞</option>
                                <option value="ehb-ct" title="https://ip.ehb.cc.cd/ct?ips=100">⚡ 云枢电信美西 · 云枢电信美西</option>
                                <option value="ehb-cu" title="https://ip.ehb.cc.cd/cu?ips=100">🚀 云枢联通极速 · 云枢联通极速</option>
                            </optgroup>
                            <optgroup label="104.16.0.0/13 大段家族">
                                <option value="ehb-104" title="https://ip.ehb.cc.cd/104?ips=100">🏯 104 大段全域池 · 104大分类全域</option>
                                <option value="ehb-10417" title="https://ip.ehb.cc.cd/104.17?ips=100">🚄 104.17 移动起飞段 · 104.17移动起飞</option>
                                <option value="ehb-10419" title="https://ip.ehb.cc.cd/104.19?ips=100">🛡️ 104.19 移动抗QoS段 · 104.19防QoS</option>
                                <option value="ehb-10416" title="https://ip.ehb.cc.cd/104.16?ips=100">📻 104.16 经典老牌段 · 104.16老牌广播</option>
                            </optgroup>
                            <optgroup label="162.158.0.0/15 大段家族">
                                <option value="ehb-162" title="https://ip.ehb.cc.cd/162?ips=100">🏯 162 大段全域池 · 162大分类全域</option>
                                <option value="ehb-162159s" title="https://ip.ehb.cc.cd/162.159-saas?ips=100">💎 162.159 SaaS/DoH段 · 162.159-saas高优</option>
                                <option value="ehb-162159ct" title="https://ip.ehb.cc.cd/162.159-ct?ips=100">⚡ 162.159 电信美西最稳段 · 162.159-ct电信美西</option>
                            </optgroup>
                            <optgroup label="172.64.0.0/13 大段家族">
                                <option value="ehb-172" title="https://ip.ehb.cc.cd/172?ips=100">🏯 172 大段全域池 · 172大分类全域</option>
                                <option value="ehb-17264" title="https://ip.ehb.cc.cd/172.64?ips=100">🚀 172.64 联通/电信主力段 · 172.64联通主力</option>
                                <option value="ehb-17267" title="https://ip.ehb.cc.cd/172.67?ips=100">🌐 172.67 动态反代段 · 172.67动态反代</option>
                            </optgroup>
                            <optgroup label="198 & 108 专线家族">
                                <option value="ehb-198" title="https://ip.ehb.cc.cd/198?ips=100">🚀 198.41 联通天花板大段 · 198联通天花板</option>
                                <option value="ehb-108" title="https://ip.ehb.cc.cd/108?ips=100">🛡️ 108.162 三网兜底大段 · 108三网兜底</option>
                            </optgroup>
                            <optgroup label="IPv6 霄汉星轨家族">
                                <option value="ehb-v6" title="https://ip.ehb.cc.cd/v6?ips=100">🌌 云枢 IPv6 全域星轨 · 云枢IPv6全域</option>
                                <option value="ehb-v6cm" title="https://ip.ehb.cc.cd/v6-cm?ips=100">📱 云枢移动 5G 直连 · 云枢移动5G</option>
                                <option value="ehb-v6ct" title="https://ip.ehb.cc.cd/v6-ct?ips=100">⚡ 云枢电信 纯净美西 · 云枢电信美西v6</option>
                                <option value="ehb-v6cu" title="https://ip.ehb.cc.cd/v6-cu?ips=100">🚀 云枢联通 欧洲/东京 · 云枢联通欧洲v6</option>
                                <option value="ehb-2400" title="https://ip.ehb.cc.cd/2400?ips=100">🌏 2400:cb00 亚太全域 · 2400亚太全域</option>
                                <option value="ehb-24002048" title="https://ip.ehb.cc.cd/2400.2048?ips=100">🇭🇰 2400.2048 香港近场段 · 2400.2048香港近场</option>
                                <option value="ehb-2400400" title="https://ip.ehb.cc.cd/2400.400?ips=100">⚡ 2400.400 亚太低跳数段 · 2400.400亚太低跳</option>
                                <option value="ehb-24002049" title="https://ip.ehb.cc.cd/2400.2049?ips=100">🛡️ 2400.2049 亚太抗抖动段 · 2400.2049抗抖动</option>
                                <option value="ehb-2606" title="https://ip.ehb.cc.cd/2606?ips=100">🌐 2606:4700 全球主干 · 2606全球主干</option>
                                <option value="ehb-26063030" title="https://ip.ehb.cc.cd/2606.3030?ips=100">🏢 2606.3030 核心骨干段 · 2606.3030核心骨干</option>
                                <option value="ehb-26064700" title="https://ip.ehb.cc.cd/2606.4700?ips=100">👑 2606.4700 伴生特权段 · 2606.4700特权伴生</option>
                                <option value="ehb-2a06" title="https://ip.ehb.cc.cd/2a06?ips=100">🚄 2a06:98c0 欧洲特快大段 · 2a06欧洲特快</option>
                            </optgroup>
                            <optgroup label="第三方备用源">
                                <option value="robberer" title="https://gh.xxooo.cf/https://raw.githubusercontent.com/hc990275/yx/refs/heads/main/cfyxip.txt">🌟 @robberer 专属 · @robberer</option>
                                <option value="cm-ct" title="https://cf.090227.xyz/ct?ips=100">⚡ CM佬电信优选 · CM佬电信优选</option>
                                <option value="cm-cmcc" title="https://cf.090227.xyz/cmcc?ips=100">🚄 CM佬移动优选 · CM佬移动优选</option>
                                <option value="cm-cu" title="https://cf.090227.xyz/cu?ips=100">🚀 CM佬联通优选 · CM佬联通优选</option>
                                <option value="v2too" title="https://ip.v2too.top/api/nodes">💡 v2too 源 · v2too默认源</option>
                            </optgroup>
                        </select>
                    </div>
                    <div id="presetInfo" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; padding:10px 12px; background:var(--card); border-radius:10px; border:1px solid var(--border-strong);">
                        <span style="font-size:12px; color:var(--text-sec);">当前来源:</span>
                        <span id="presetName" style="font-weight:700; font-size:13px; color:var(--primary);">综合混合源(四源并发)</span>
                        <code id="presetUrl" style="font-size:12px; color:var(--text); word-break:break-all; cursor:pointer; text-decoration:underline dotted;" onclick="copyPresetUrl()">uouin + cf-speed-dns + 164746 + wetest 并发聚合</code>
                    </div>
                    <div class="btn-grid">
                        <button class="btn-submit" id="btnFetchRemote" onclick="fetchRemoteAndTest()">提取预设源测速</button>
                        <button class="btn-submit" onclick="batchTcpPing()" style="box-shadow:0 4px 12px rgba(255,149,0,.22);">复制去ITDog</button>
                        <button class="btn-submit" onclick="clearTest()" style="box-shadow:0 4px 12px rgba(142,142,147,.2);">清空列表</button>
                    </div>
                    </div>
                </div>
                <div class="collapse-sec" style="background:var(--bg-soft); padding:16px; border-radius:14px; border:1px solid var(--border); margin-bottom:16px;">
                    <div class="collapse-head" onclick="toggleCollapseSec(this)">
                        <div class="ch-title"><span class="ch-arrow">▶</span><span class="ti" style="font-size:17px; color:var(--primary);">${I.flask}</span> 自定义 API 与手动粘贴</div>
                        <span class="ch-hint" style="font-size:12px;color:var(--text-sec);">点击展开</span>
                    </div>
                    <div class="collapse-body">
                    <div style="display:flex; gap:8px; margin-bottom:12px; align-items:center; flex-wrap:wrap;">
                        <input type="text" id="customApiUrl" value="https://ip.v2too.top/api/nodes" placeholder="填入自定义 JSON 或 文本 API 链接" style="flex:1; min-width:200px;">
                    </div>
                    <textarea id="customIps" rows="2" placeholder="在此粘贴自定义 IPv4、IPv6 或 优选域名 (支持混杂文本，自动提取)" style="width:100%; margin-bottom:12px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; resize:vertical;"></textarea>
                    <div class="btn-grid">
                        <button class="btn-submit" id="btnFetchCustomApi" onclick="fetchCustomApiAndTest()" style="box-shadow:0 4px 12px rgba(50,173,230,.22);">拉取API并测速</button>
                        <button class="btn-submit" id="btnTestCustom" onclick="testCustomIPs()" style="box-shadow:0 4px 12px rgba(88,86,214,.22);">测试粘贴节点</button>
                        <button class="btn-submit" id="btnDirectCname" onclick="directSubmitCname()" style="box-shadow:0 4px 12px rgba(175,82,222,.22);">直推CNAME</button>
                    </div>
                    </div>
                </div>
                <div class="collapse-sec" style="background:var(--bg-soft); padding:16px; border-radius:14px; border:1px solid var(--border); margin-bottom:16px;">
                    <div class="collapse-head" onclick="toggleCollapseSec(this)">
                        <div class="ch-title"><span class="ch-arrow">▶</span><span class="ti" style="font-size:17px; color:var(--primary);">${I.checksquare}</span> DNS 应用
                            <span style="font-weight:500; font-size:12px; color:var(--text-sec);">(对下方测速列表生效,可先勾选再提交)</span>
                        </div>
                        <span class="ch-hint" style="font-size:12px;color:var(--text-sec);">点击展开</span>
                    </div>
                    <div class="collapse-body">
                    <div class="btn-grid">
                        <button class="btn-submit" id="btnTop3Dns" onclick="updateTop3ToDns()" style="box-shadow:0 4px 12px rgba(255,45,85,.22);">${I.star} 更新 TOP3 至 DNS</button>
                        <button class="btn-submit" id="btnSelectedDns" onclick="updateSelectedToDns()" style="box-shadow:0 4px 12px rgba(52,199,89,.22);">${I.checksquare} 提交选中至 DNS</button>
                    </div>
                    </div>
                </div>
                <div id="statusText" style="line-height:1.6; font-size:14px; color:var(--text-sec); margin-bottom:16px; padding:12px 16px; background:rgba(52,199,89,.1); border-radius:12px; border-left:4px solid var(--success);">
                    ${I.bulb} 测速完成后，可勾选复选框自由组合，点击【提交选中节点至 DNS】自动分发。
                </div>
                <div class="table-wrapper">
                    <table style="width:100%;">
                        <thead>
                            <tr>
                                <th style="width:44px; text-align:center;"><input type="checkbox" id="selectAll" class="ip-checkbox" onclick="toggleSelectAll()"></th>
                                <th>专属节点 (点击复制)</th>
                                <th>预估延迟</th>
                                <th>连通状态</th>
                                <th>记录类型/归属地</th>
                                <th>单节点操作</th>
                            </tr>
                        </thead>
                        <tbody id="testTableBody">
                            <tr><td colspan="6" style="text-align:center; color:var(--text-sec);">暂无数据，请拉取节点或输入自定义 IP/域名 测试</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

        </div>

        <div id="view-settings" class="page-view">

            <div class="section-head">网络与状态</div>

            <div id="updateAlert" class="card" style="display:none; border-left:4px solid var(--success); background:var(--success-soft);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 style="margin:0; color:var(--success); font-size:16px;">${I.sparkles} 发现新版本！</h3>
                        <p style="margin:5px 0 0 0; font-size:13px; color:var(--text-sec);" id="updateMsg">当前版本: v1.0.0 | 最新版本: v?.?.?</p>
                    </div>
                    <button class="btn-submit" onclick="doOnlineUpdate()" id="onlineUpdateBtn" style="padding:8px 16px;">${I.rocket} 一键拉取并升级</button>
                </div>
            </div>

            <div id="cf-trace-card" style="background:var(--bg-soft); padding:15px 20px; border-radius:14px; border:1px solid var(--border); margin-bottom:20px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; font-size:14px; gap:15px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span class="ti" style="font-size:22px;">${I.location}</span>
                    <div>
                        <div style="color:var(--text-sec); font-size:12px; margin-bottom:2px;">访客入口 (地区与机房)</div>
                        <div id="trace-entry" style="font-weight:600; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:15px;">雷达扫描中...</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <span class="ti" style="font-size:22px;">${I.rocket}</span>
                    <div>
                        <div style="color:var(--text-sec); font-size:12px; margin-bottom:2px;">Worker 实际落地机房</div>
                        <div id="trace-egress" style="font-weight:600; color:var(--success); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:15px;">雷达扫描中...</div>
                    </div>
                </div>
            </div>

            <div class="section-head">管理与维护</div>

            <div class="card admin-only">
                <div class="card-header">
                    <h2>${I.gear} Worker 调度模式与区域设置</h2>
                    <div class="card-tools" style="margin-left:auto;">
                        <button class="btn-submit" onclick="openPlacementModal()">${I.gear} 修改调度/区域</button>
                    </div>
                </div>
            </div>

            <div class="card admin-only" style="border-left:4px solid var(--danger);">
                <div class="card-header" style="margin-bottom:12px;">
                    <h2 style="color:var(--danger);">${I.rocket} 手动覆盖/更新</h2>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btn-submit" onclick="openCodeModal('paste')" style="flex:1; min-width:120px;">${I.pencil} 手动输入</button>
                    <button class="btn-submit" onclick="openCodeModal('file')" style="flex:1; min-width:120px;">${I.upload} 文件导入</button>
                </div>
                <div style="font-size:12px; color:var(--text-faint); margin-top:10px;">${I.warn} 提交错误的代码会导致面板崩溃（500 错误），请确保代码已测试通过。</div>
            </div>

            <div class="card admin-only" id="ipguard-card">
                <h2 style="margin:0; font-size:18px; margin-bottom:14px; cursor:pointer; display:flex; align-items:center; justify-content:space-between;" onclick="toggleIpGuardCard()">${I.spy} IP 访问控制 <span id="ipguardCardArrow" style="font-size:12px; color:var(--text-sec); font-weight:400;">▶ 展开</span></h2>
                <div id="ipguardCardBody" style="display:none;">
                    <div style="display:flex; flex-direction:column; gap:12px;">
                    <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; font-size:13px;">
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="radio" name="ipgMode" value="off" style="accent-color:var(--primary);"> 关闭</label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="radio" name="ipgMode" value="whitelist" style="accent-color:var(--primary);"> 白名单</label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="radio" name="ipgMode" value="blacklist" style="accent-color:var(--primary);"> 黑名单</label>
                        <span style="color:var(--text-sec); font-size:12px;">白名单=仅命中放行；黑名单=命中跳转</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-sec); flex-wrap:wrap;">
                        当前访问: <span id="ipgCurrent" style="font-weight:600; color:var(--text);">-</span>
                        <button class="btn-submit" style="padding:5px 10px; font-size:12px; border-radius:6px; box-shadow:none; background:#32ade6;" onclick="ipgAddCurrent()">加入 IP 列表</button>
                    </div>
                    <textarea id="ipgIps" rows="4" placeholder="IP / 网段，每行一个，支持 CIDR，如：&#10;1.2.3.4&#10;5.6.7.0/24" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box; resize:vertical;"></textarea>
                    <input type="text" id="ipgCountries" placeholder="国家/地区码，每行一个 ISO 两位码，如 US、RU、CN（支持整体封锁国家）" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box;">
                    <input type="text" id="ipgRedirect" placeholder="跳转网址（被拦截时 302 跳转，如 https://example.com）" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box;">
                    <div style="font-size:12px; color:var(--text-sec); line-height:1.7;">
                        命中判定：IP 命中或国家命中即算命中。白名单模式下请先确认当前 IP 已加入列表，否则保存后你自己也会被跳转；黑名单模式下列表内 IP/国家访问面板与节点链接都会被 302 跳转到上面的网址。
                    </div>
                    <div style="border-top:1px dashed var(--border); padding-top:12px; margin-top:4px; display:flex; flex-direction:column; gap:8px;">
                        <div style="font-size:13px; font-weight:600;">最高白名单(/entry 登录 IP,任何模式都放行)</div>
                        <div style="font-size:12px; color:var(--text-sec); line-height:1.6;">登录 /entry 成功的 IP 自动加入。共享节点的其他 IP 可在此删除;删除当前访问 IP 后如被拦截,用 /entry 登录会自动加回。修改后点击下方保存生效。</div>
                        <div id="ipgTrustedList" style="display:flex; flex-direction:column; gap:4px;"></div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <input type="text" id="ipgTrustedAdd" placeholder="输入要添加的 IP" style="flex:1; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box;">
                            <button class="btn-submit" style="padding:6px 12px; font-size:12px; border-radius:6px; box-shadow:none; background:#32ade6;" onclick="ipgTrustedAddOne()">添加</button>
                        </div>
                    </div>
                    <div style="border-top:1px dashed var(--border); padding-top:12px; margin-top:4px; display:flex; flex-direction:column; gap:8px;">
                        <div style="font-size:13px; font-weight:600; color:#ff6b6b;">🚫 最高黑名单(任何模式都拦截)</div>
                        <div style="font-size:12px; color:var(--text-sec); line-height:1.6;">加入的 IP/网段无论当前是什么模式都会被拦截，优先于最高白名单；下方可单独设置 302 跳转链接（不设置则显示「你的 IP 已被拉黑」页面）。</div>
                        <textarea id="ipgBlockedIps" rows="3" placeholder="IP / 网段，每行一个，支持 CIDR，如：&#10;1.2.3.4&#10;5.6.7.0/24" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box; resize:vertical;"></textarea>
                        <input type="text" id="ipgBlockedRedirect" placeholder="302 跳转链接（留空=显示「你的 IP 已被拉黑」页，如 https://example.com）" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box;">
                    </div>
                    <button class="btn-submit" onclick="saveIpGuard()" style="align-self:flex-start;">${I.check} 保存</button>
                    </div>
                </div>

            <div class="card admin-only" id="config-backup-card">
                <div class="card-header">
                    <h2>${I.box} 配置备份与恢复</h2>
                    <div class="card-tools" style="margin-left:auto;">
                        <button class="btn-submit" onclick="exportConfig()">${I.box} 导出配置</button>
                        <button class="btn-submit" onclick="importConfig()">${I.download} 导入配置</button>
                    </div>
                </div>
            </div>

            <div class="section-head">关于</div>
            <div style="text-align:center; padding-top:6px; padding-bottom:14px;">
                <a href="https://t.me/MakkaPakkaOvO" target="_blank" style="text-decoration:none; color:var(--text); font-weight:600; display:inline-flex; align-items:center; padding:12px 24px; background:var(--card); border-radius:999px; box-shadow:var(--shadow); transition:all .25s; font-size:14px; border:1px solid var(--border);">
                    ${SVG_TG}
                    联系作者 MakkaPakkaOvO
                </a>
                <div style="margin-top:16px; font-size:12px; color:var(--text-sec); line-height:1.6; max-width:600px; margin-left:auto; margin-right:auto; padding:0 15px;">
                    <strong>免责声明:</strong> 本项目仅供学习与技术测试使用，请遵守当地法律法规。使用者对配置、转发内容与访问行为承担全部责任，开发者不对任何直接或间接损失负责。
                </div>
            </div>

        </div>
    </div>

    <div id="nodeModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box">
            <div class="modal-head">
                <h2 id="nodeModalTitle">${I.pencil} 添加节点</h2>
                <button class="close-x" onclick="closeNodeModal()" title="关闭">${I.xmark}</button>
            </div>
            <form id="addForm" style="display:flex; flex-direction:column; gap:16px;">
                <input type="hidden" id="oldPrefix" value="">
                <div class="form-row">
                    <div class="field"><label>节点备注</label><input type="text" id="remark" placeholder="如: Misaka服" required></div>
                    <div class="field"><label>短路径后缀</label><input type="text" id="prefix" placeholder="如: misaka" required></div>
                    <div class="field sub-lite"><label>反代模式</label>
                        <select id="mode" onchange="toggleEmosFields()">
                            <option value="off">保守 (抹除IP)</option>
                            <option value="realip_only">严格 (透传IP)</option>
                            <option value="dual">兼容 (双重透传)</option>
                            <option value="strict">强力 (防403)</option>
                            <option value="emos">EMOS (专用头)</option>
                        </select>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:16px;">
                    <div style="font-size:14px; font-weight:600; color:var(--text-sec); margin-bottom:12px;">服务器线路配置 (支持魔改分离版推流，支持无限条备用线路)</div>
                    <div id="targetInputs" style="display:flex; flex-direction:column; gap:10px;">
                        <input type="url" class="target-input" placeholder="主线路地址 (如: http://1.1.1.1:8096)" required oninput="handleTargetInputs()">
                        <input type="url" class="target-input" placeholder="备用线路 1 (选填，主源挂掉时触发)" oninput="handleTargetInputs()">
                    </div>
                </div>
                <div class="sub-lite" style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start;">
                    <div style="position:relative; flex:2; min-width:240px;">
                        <div style="display:flex; gap:10px; align-items:center; background:var(--bg); padding:10px 14px; border-radius:12px; border:1px solid var(--border); flex:1; cursor:pointer; transition:border-color .2s;" onclick="toggleIconPicker(event)" id="iconSelectBtn">
                            <img id="iconPreview" src="" style="width:24px; height:24px; display:none; border-radius:4px; object-fit:cover;">
                            <span id="iconDefault" style="font-size:20px; line-height:1;">${I.film}</span>
                            <span id="iconSelectText" style="flex:1; color:var(--text-sec); font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">点击选择图标 (默认)</span>
                            <input type="hidden" id="iconUrl" value="">
                        </div>
                        <div id="iconPickerPanel" style="display:none; position:absolute; top:100%; left:0; width:100%; background:var(--card); border:1px solid var(--border); border-radius:14px; padding:12px; box-shadow:var(--shadow-lg); z-index:100; margin-top:8px; flex-direction:column; gap:10px;">
                            <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
                                <input type="text" id="customIconUrlInput" placeholder="输入自定义 JSON 图标库链接..." style="flex:1; font-size:13px;">
                                <button type="button" onclick="setCustomIconLibrary()" class="btn-submit" style="padding:8px 12px; font-size:13px; white-space:nowrap;">加载</button>
                                <button type="button" onclick="resetIconLibrary()" class="btn-ghost" style="font-size:13px;">默认库</button>
                            </div>
                            <input type="text" id="iconSearch" placeholder="搜索图标名称..." style="width:100%; font-size:14px;" onkeyup="filterIcons()">
                            <div id="iconGrid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(44px,1fr)); gap:8px; overflow-y:auto; max-height:240px; padding-right:4px;">
                                <div style="text-align:center; color:var(--text-sec); grid-column:1/-1; font-size:13px;">加载图标库中...</div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px; flex:1; min-width:220px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer;">
                            <input type="checkbox" id="nodeCache" class="ip-checkbox" checked>
                            开启海报及静态资源缓存
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer;" title="开启后，该节点 301/302/303/307/308 重定向到外部 HTTP(S) 地址时，直接交给客户端访问，不再经 Worker 反代">
                            <input type="checkbox" id="nodeRedirectDirect" class="ip-checkbox">
                            外部跳转直连
                        </label>
                    </div>
                </div>
                <div class="sub-lite" style="display:flex; flex-direction:column; gap:6px;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer;">
                        <input type="checkbox" id="nodeRulesEnable" class="ip-checkbox"> 302/307 域名规则
                    </label>
                    <div id="rulesList" style="display:flex; flex-direction:column; gap:8px;"></div>
                    <span style="font-size:12px; color:var(--text-sec);">直连=不走反代；代理=走反代。支持子域名自动匹配；与「外部跳转直连」互斥，同一时间只能开启一个。</span>
                </div>
                <div class="form-row sub-lite">
                    <div class="field"><label>模拟 IP（可选，抹除真实 IP 只传此 IP）</label><input type="text" id="nodeFakeIp" placeholder="如 1.2.3.4"></div>
                    <div class="field"><label>观看下限（天）</label><input type="number" id="watchLimit" placeholder="如 7 / 14 / 21；0 = 不限制" step="0.1" min="0"></div>
                </div>
                <div class="form-row sub-lite" id="emosFields" style="display:none;">
                    <div class="field"><label>EMOS-PROXY-ID（必填）</label><input type="text" id="nodeEmosId" value="eK3QYG29Ms" placeholder="你的用户ID，形如 eABCDEFGHs"></div>
                    <div class="field"><label>EMOS-PROXY-NAME（必填）</label><input type="text" id="nodeEmosName" value="玛卡巴卡的反代面板" placeholder="你的称号，如 @xx的反代"></div>
                    <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer; flex-basis:100%;" title="开启后，聚合播放器(SenPlayer 等)按 TMDB 编号跨服查询时，会把本节点列为播放源(EMOS 聚合显示)">
                        <input type="checkbox" id="nodeEmosAggregate" class="ip-checkbox"> 开启 EMOS 聚合（让聚合播放器把本节点列为播放源）
                    </label>
                    <div style="flex-basis:100%; font-size:12px; color:var(--text-sec);">EMOS 模式按 emos.dpdns.org/proxy 要求：自动透传真实 IP(X-Forwarded-For) + 携带两枚 EMOS 头；默认已内置你的 EMOS 身份，可直接使用也可修改；目标地址填 EMOS 源站（建议 https://video.emos.best，对外路径 /emby）</div>
                </div>
                <div class="form-row sub-lite">
                    <div class="field"><label>节点账号（可选，一键导入用）</label><input type="text" id="nodeUser" placeholder="如: admin"></div>
                    <div class="field"><label>节点密码（可选）</label><input type="password" id="nodePass" placeholder="节点密码"></div>
                </div>
                <button type="submit" id="submitBtn" class="btn-submit" style="width:100%; padding:14px;">保存部署</button>
            </form>
        </div>
    </div>

    <div id="importModal" style="display:none; position:fixed; inset:0; z-index:11030; background:rgba(0,0,0,.5); backdrop-filter:blur(5px); overflow-y:auto; padding:16px;">
        <div style="max-width:540px; margin:24px auto; background:var(--card); border-radius:18px; padding:22px; box-shadow:0 10px 40px rgba(0,0,0,.2);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h2 style="margin:0; font-size:19px; display:flex; align-items:center; gap:8px;">${I.rocket} 一键导入播放器</h2>
                <button onclick="closeImpModal()" style="background:transparent;border:none;cursor:pointer;color:var(--text-sec);display:inline-flex;padding:4px;">${I.xmark}</button>
            </div>
            <div style="font-size:13px; color:var(--text-sec); margin-bottom:12px; line-height:1.6;">选择播放器，点击即跳转到对应的一键导入链接。凭据默认取节点账号，可修改。</div>
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="text" id="impPrefix" placeholder="节点前缀" readonly style="flex:1 1 0; min-width:0; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px;">
                <input type="text" id="impName" placeholder="名称（默认备注）" style="flex:1 1 0; min-width:0; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px;">
            </div>
            <div style="display:flex; gap:10px; margin-bottom:16px;">
                <input type="text" id="impUser" placeholder="账号" style="flex:1 1 0; min-width:0; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px;">
                <input type="text" id="impPass" placeholder="密码" style="flex:1 1 0; min-width:0; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px;">
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button type="button" class="btn-submit" onclick="openImpLink('sen')" style="width:100%; padding:13px; font-size:15px;">${I.rocket} SenPlayer 一键导入</button>
                <button type="button" class="btn-submit" onclick="openImpLink('rex')" style="width:100%; padding:13px; font-size:15px;">${I.rocket} Rex 一键导入</button>
                <button type="button" class="btn-submit" onclick="openImpLink('hills')" style="width:100%; padding:13px; font-size:15px;">${I.rocket} Hills 一键导入</button>
            </div>
        </div>
    </div>

    <div id="codeModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:560px;">
            <div class="modal-head">
                <h2 id="codeModalTitle">${I.rocket} 手动覆盖/更新</h2>
                <button class="close-x" onclick="closeCodeModal()" title="关闭">${I.xmark}</button>
            </div>
            <div style="font-size:13px; color:var(--danger); margin-bottom:12px; background:rgba(244,63,94,.06); border:1px solid rgba(244,63,94,.2); padding:10px 12px; border-radius:10px;">${I.warn} 警告：提交错误的代码会导致面板瞬间崩溃（500 错误）。请确保代码已在本地测试通过！</div>
            <textarea id="codeArea" rows="8" placeholder="在此处粘贴修改好的最新代码全文..." style="width:100%; margin-bottom:12px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; resize:vertical;"></textarea>
            <input type="file" id="fileInput" accept=".js" style="display:none; font-size:14px; padding:6px; border:1px solid var(--border); border-radius:10px; background:var(--bg); margin-bottom:12px; width:100%;">
            <button class="btn-danger" id="deployBtn" onclick="deployWorker()" style="width:100%;">${I.flame} 覆盖更新</button>
        </div>
    </div>

    <div id="placementModal" class="modal-mask">
        <div class="modal-box" style="max-width:560px;">
            <div class="modal-head">
                <h2>${I.gear} Worker 调度模式与区域设置</h2>
                <button class="close-x" onclick="closePlacementModal()" title="关闭">${I.xmark}</button>
            </div>
            <select id="cf-mode-select" onchange="handleModeChange()" style="width:100%; margin-bottom:10px;">
                <option value='{"mode":"smart"}'>智能调度 (Smart Placement)</option>
                <option value='{"mode":"off"}'>边缘节点 (Edge - 默认离访客近)</option>
                <optgroup label="指定云厂商物理机房落地">
                    <option value="aws">AWS (亚马逊云)</option>
                    <option value="gcp">GCP (谷歌云)</option>
                    <option value="azure">Azure (微软云)</option>
                </optgroup>
                <option value="custom">手动输入区域代码...</option>
            </select>
            <select id="cf-region-select" style="display:none; width:100%; margin-bottom:10px;"></select>
            <input type="text" id="cf-custom-input" placeholder="输入云代码 (如 gcp:us-west1)" style="display:none; width:100%; margin-bottom:10px;">
            <div id="place-status" style="margin:0 0 14px; font-size:13px; color:var(--text-sec); font-weight:600;">后台全自动安全调度，不暴露任何私钥</div>
            <button class="btn-submit" onclick="updatePlacement()" style="width:100%;">${I.check} 提交修改</button>
        </div>
    </div>

    <div id="accountModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:560px;">
            <div class="modal-head">
                <h2>${I.gear} 账户设置</h2>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span id="topVersionBadge" style="background:var(--primary); color:#fff; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600;">v${CURRENT_VERSION}</span>
                    <button class="close-x" onclick="closeAccountModal()" title="关闭">${I.xmark}</button>
                </div>
            </div>
            <div id="accountAdminPanel" style="display:flex; flex-direction:column; gap:16px;">
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('notice')"><span id="setSecArr-notice" style="font-size:11px; color:var(--text-sec);">▸</span> 📢 公告</div>
                    <div id="setSec-notice" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">单条公告：发布新公告自动覆盖旧公告。子管理员与订阅用户<b style="color:var(--primary);">每次进入面板都会看到</b>，需等待 3 秒后才可关闭。留空保存即清除公告。</div>
                        <textarea id="noticeText" rows="3" placeholder="填写公告内容，支持换行…" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box; resize:vertical; margin-bottom:10px;"></textarea>
                        <button class="btn-submit" onclick="saveNotice()" style="width:100%;">${I.check} 发布公告</button>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('logo')"><span id="setSecArr-logo" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.tv} 更换头像（左上角图标 / 登录页 / 浏览器标签）</div>
                    <div id="setSec-logo" style="display:none; margin-top:10px;">
                    <div style="display:flex; align-items:center; gap:14px; margin-bottom:12px;">
                        <img id="logoPreview" src="${EMBY_LOGO}" alt="头像预览" style="width:56px;height:56px;border-radius:14px;object-fit:cover;border:1px solid var(--border);background:var(--card);flex-shrink:0;">
                        <div style="flex:1; display:flex; flex-direction:column; gap:8px; min-width:0;">
                            <input type="text" id="logoUrlInput" placeholder="图片 URL（http(s):// 开头）" style="width:100%; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--card); box-sizing:border-box;">
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <label class="btn-ghost" style="cursor:pointer; margin:0; display:inline-flex; align-items:center; gap:4px;">${I.upload} 上传图片<input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none;" onchange="readLogoFile(this.files[0]); this.value=''"></label>
                                <button class="btn-submit" onclick="saveLogo()" style="flex:1; white-space:nowrap;">${I.check} 保存</button>
                                <button class="btn-ghost" onclick="resetLogo()" style="white-space:nowrap;">恢复默认</button>
                            </div>
                        </div>
                    </div>
                    <div style="font-size:12px; color:var(--text-sec);">${I.warn} 上传图片会自动压缩到 256px 以内再保存；保存后左上角、登录页与浏览器标签图标（favicon）同步生效。</div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('pass')"><span id="setSecArr-pass" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.pencil} 修改登录密码</div>
                    <div id="setSec-pass" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">${I.warn} Worker 变量 ADMIN_TOKEN 为最高权限，永久有效；此处修改的密码仅对网页生效。</div>
                        <input type="password" id="newAdminPass" placeholder="输入新密码 (至少 4 位)" style="width:100%; margin-bottom:10px;">
                        <button class="btn-submit" onclick="saveAdminPass()" style="width:100%;">${I.check} 保存新密码</button>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('subadmin')"><span id="setSecArr-subadmin" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.crown} 子管理员用户区</div>
                    <div id="setSec-subadmin" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">${I.warn} 子管理员密码可登录网页，可<b style="color:var(--primary);">查看节点</b>、<b style="color:var(--primary);">审核（通过/拒绝）用户的节点添加申请</b>并<b style="color:var(--primary);">直接添加节点</b>；但不能编辑/删除现有节点、测速、DNS 及任何其他管理操作。子管理员直接添加节点会记入「成员添加节点记录」。</div>
                        <div id="subadminStatus" style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">加载中…</div>
                        <input type="password" id="newSubadminPass" placeholder="输入新子管理员密码 (至少 4 位，留空保存为清除)" style="width:100%; margin-bottom:10px;">
                        <button class="btn-submit" onclick="saveSubadminPass()" style="width:100%;">${I.check} 保存子管理员密码</button>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('token')"><span id="setSecArr-token" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.robot} 反代 Token</div>
                    <div id="setSec-token" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">${I.warn} 开启后所有节点链接需带 <b style="color:var(--primary);">/密钥/</b> 前缀才可反代；不带前缀的访问会跳转 /catch 并记录来访 IP（记录存 D1，不占 KV 额度）。</div>
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px;">
                                <input type="checkbox" id="ptOn" class="ip-checkbox"> 开启
                            </label>
                        </div>
                        <div style="display:flex; gap:8px; margin-bottom:12px;">
                            <input type="text" id="ptKey" placeholder="自定义密钥（3-32 位字母数字，如 lhazkj）" style="flex:1;">
                            <button class="btn-submit" onclick="saveProxyToken()" style="white-space:nowrap;">${I.check} 保存</button>
                        </div>
                        <div style="font-size:13px; font-weight:600; margin-bottom:8px;">来访记录 IP <span style="font-weight:400; color:var(--text-sec);">（仅管理员）</span></div>
                        <div id="ptHits" style="font-size:12px; color:var(--text-sec);">加载中…</div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('audit')"><span id="setSecArr-audit" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.spy} 申请记录 <span style="font-weight:400; color:var(--text-sec); font-size:12px;">（近 7 天，仅管理员）</span></div>
                    <div id="setSec-audit" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">${I.warn} 节点添加申请自动记录提交人 IP 与设备，保留 7 天；可按<b style="color:var(--primary);">节点名字或线路地址</b>搜索，锁定乱加的人后到「IP 访问控制」里封禁。</div>
                        <input type="text" id="auditReqQ" placeholder="搜索节点名字或线路地址…" oninput="auditReqSearch(this.value)" style="width:100%; margin-bottom:10px;">
                        <div id="auditReqList" style="display:flex; flex-direction:column; gap:8px; font-size:12px; color:var(--text-sec);">加载中…</div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('adminlog')"><span id="setSecArr-adminlog" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.crown} 成员添加节点记录 <span style="font-weight:400; color:var(--text-sec); font-size:12px;">（近 7 天，仅管理员）</span></div>
                    <div id="setSec-adminlog" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">${I.warn} 子管理员与<b style="color:var(--primary);">已开通添加权限的订阅用户</b>直接添加节点时会自动记录其 IP 与设备，保留 7 天；可按<b style="color:var(--primary);">节点名字、线路地址或前缀</b>搜索，锁定乱加的人后可一键封禁。</div>
                        <input type="text" id="adminLogQ" placeholder="搜索节点名字 / 线路地址 / 前缀…" oninput="adminLogSearch(this.value)" style="width:100%; margin-bottom:10px;">
                        <div id="adminLogList" style="display:flex; flex-direction:column; gap:8px; font-size:12px; color:var(--text-sec);">加载中…</div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('security')"><span id="setSecArr-security" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.spy} 安全</div>
                    <div id="setSec-security" style="display:none; margin-top:10px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; margin-bottom:8px;">
                            <input type="checkbox" id="bareProxyChk" class="ip-checkbox" checked> 允许裸域名直连代理（如 /https:// 开头的路径直连任意网站）
                        </label>
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">关闭后将拒绝所有「/域名/任意URL」式裸访问，仅允许已配置的节点前缀访问（反代 Token 开启时仍按 /密钥/节点后缀 工作）；不影响任何节点（含后端推流地址与线路不同的服）的正常访问。</div>
                        <button class="btn-submit" onclick="saveSecuritySettings()" style="width:100%;">${I.check} 保存安全设置</button>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('notify')"><span id="setSecArr-notify" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.bulb} 保号通知（Bark / Telegram）</div>
                    <div id="setSec-notify" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">${I.warn} 节点超观看下限未观看时每日推送一次；测试按钮可立即验证。</div>
                        <div style="display:flex; gap:14px; margin-bottom:10px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="barkNotify" class="ip-checkbox"> Bark</label>
                            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="tgNotify" class="ip-checkbox"> Telegram</label>
                        </div>
                        <input type="text" id="barkKey" placeholder="Bark 设备 Key（留空不修改）" style="width:100%; margin-bottom:8px;">
                        <select id="barkLevel" style="width:100%; margin-bottom:10px;">
                            <option value="active">active（默认）</option>
                            <option value="timeSensitive">timeSensitive</option>
                            <option value="critical">critical（紧急）</option>
                            <option value="passive">passive</option>
                        </select>
                        <input type="text" id="barkServer" placeholder="Bark 服务地址（默认 https://api.day.app）" style="width:100%; margin-bottom:10px;">
                        <input type="text" id="tgToken" placeholder="TG Bot Token（@BotFather 获取，留空不修改）" style="width:100%; margin-bottom:8px;">
                        <input type="text" id="tgChatId" placeholder="TG Chat ID（留空不修改）" style="width:100%; margin-bottom:10px;">
                        <div style="display:flex; gap:8px;">
                            <button class="btn-submit" onclick="saveNotifySettings()" style="flex:1;">${I.check} 保存</button>
                            <button class="btn-ghost" onclick="testNotifyFn('bark')" style="white-space:nowrap;">测试 Bark</button>
                            <button class="btn-ghost" onclick="testNotifyFn('tg')" style="white-space:nowrap;">测试 TG</button>
                        </div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('subuser')"><span id="setSecArr-subuser" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.robot} 订阅用户管理</div>
                    <div id="setSec-subuser" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">订阅者密码可进入网页，默认只能查看节点。勾选<b style="color:var(--primary);">「可添加节点」</b>后，该订阅用户可直接添加节点（无需审核，添加时自动记录其 IP 与设备）；未勾选则看不到添加节点按钮。订阅用户始终不能查看源站线路、编辑或删除节点。</div>
                        <div id="subList" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;"></div>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="newSubPass" placeholder="输入新订阅者密码" style="flex:1;">
                            <button class="btn-submit" onclick="addSubscriber()" style="white-space:nowrap;">${I.plus} 添加</button>
                        </div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; margin-bottom:10px;">${I.rocket} 版本</div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                        <span style="font-size:13px;">当前版本：</span>
                        <span id="curVersionBadge" style="background:var(--primary); color:#fff; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600;">v${CURRENT_VERSION}</span>
                        <span id="latestVersionInfo" style="font-size:12px; color:var(--text-sec);"></span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                        <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
                            <input type="checkbox" id="updateNotifyChk" class="ip-checkbox"> 开启更新提醒（检测到新版本时弹窗提示）
                        </label>
                        <button class="btn-ghost" onclick="saveUpdateNotify()" style="padding:6px 12px; font-size:12px;">保存</button>
                    </div>
                    <div style="font-size:13px; font-weight:600; margin-bottom:6px;">${I.rocket} 最新更新内容</div>
                    <div id="latestChangelog" style="font-size:12px; color:var(--text-sec); margin-bottom:12px; line-height:1.8;">加载中…</div>
                    <div style="display:flex; gap:8px; margin-bottom:12px;">
                        <button class="btn-submit" onclick="checkForUpdates(true)" style="flex:1;">${I.search} 检查更新</button>
                        <button class="btn-ghost" onclick="manualUpdateFlow()" style="flex:1;">${I.rocket} 立即更新</button>
                    </div>
                    <details style="font-size:12px; color:var(--text-sec);">
                        <summary style="cursor:pointer; font-weight:600;">${I.lines} 历史更新内容</summary>
                        <div id="historyChangelog" style="margin-top:8px; line-height:1.8;">加载中…</div>
                    </details>
                </div>
            </div>
            <div id="accountSubPanel" style="display:none; text-align:center; padding:20px 0; color:var(--text-sec); font-size:14px;">
                ${I.robot} 当前为订阅用户模式，仅可查看节点，无任何修改权限。
            </div>
        </div>
    </div>

    <div id="nodeReqModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:560px;">
            <div class="modal-head">
                <h2>${I.robot} 节点申请审核</h2>
                <button class="close-x" onclick="closeNodeReqModal()" title="关闭">${I.xmark}</button>
            </div>
            <div id="nodeReqList" style="display:flex; flex-direction:column; gap:10px;">加载中…</div>
        </div>
    </div>

    <div id="subReqModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:480px;">
            <div class="modal-head">
                <h2>${I.plus} 申请添加节点</h2>
                <button class="close-x" onclick="closeSubReqModal()" title="关闭">${I.xmark}</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
                <input type="text" id="subReqName" placeholder="节点名字（如: 我的私服）" style="width:100%;">
                <div id="subReqUrlBox" style="display:flex; flex-direction:column; gap:8px; background:var(--bg-soft); border:1px solid var(--border); border-radius:12px; padding:12px;">
                    <div style="font-size:12px; font-weight:600; color:var(--text-sec);">服务器线路配置（支持无数条备用线路）</div>
                    <input type="url" class="sub-req-url" placeholder="主线路地址（如: https://1.1.1.1:8096）" oninput="handleSubReqUrls()" style="width:100%;">
                    <input type="url" class="sub-req-url" placeholder="备用线路 1（选填，可继续添加）" oninput="handleSubReqUrls()" style="width:100%;">
                </div>
                <div id="subReqHint" style="font-size:12px; color:var(--text-sec); line-height:1.7;">提交后管理员审核；线路已存在会直接提示你，同线路的新申请会自动覆盖旧申请（含全部备用线路）。</div>
                <button class="btn-submit" onclick="submitNodeReq()" style="width:100%; padding:13px;">${I.check} 提交申请</button>
            </div>
        </div>
    </div>

    <div id="updateModal" class="modal-mask" style="padding:16px 16px 150px;">
        <div class="modal-box" style="max-width:480px;">
            <div class="modal-head">
                <h2>${I.rocket} 发现新版本</h2>
                <button class="close-x" onclick="hideUpdateModal()" title="关闭">${I.xmark}</button>
            </div>
            <div style="font-size:13px; margin-bottom:12px;">当前版本 <span id="updateModalCurVer" style="font-weight:600;">v${CURRENT_VERSION}</span> → 新版本 <span id="updateModalVersion" style="font-weight:600; color:var(--primary);"></span></div>
            <div style="background:rgba(52,199,89,.06); border:1px solid rgba(52,199,89,.25); border-radius:12px; padding:14px; margin-bottom:14px;">
                <div id="updateModalBody" style="font-size:12px; line-height:1.9;">加载中…</div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn-submit" onclick="doOnlineUpdate()" style="flex:1;">${I.rocket} 立即更新</button>
                <button class="btn-ghost" onclick="hideUpdateModal()" style="flex:1;">稍后再说</button>
            </div>
        </div>
    </div>

    <div id="noticeModal" class="modal-mask" style="display:none; padding:16px 16px 150px;">
        <div class="modal-box" style="max-width:520px;">
            <div class="modal-head">
                <h2>📢 公告</h2>
            </div>
            <div id="noticeBody" style="font-size:14px; line-height:1.9; white-space:pre-wrap; word-break:break-all; max-height:58vh; overflow:auto; padding:6px 0; color:var(--text);"></div>
            <div style="text-align:right; margin-top:16px;">
                <button class="btn-submit" id="noticeCloseBtn" onclick="closeNotice()" disabled style="opacity:.55; cursor:not-allowed;">我知道了 (3s)</button>
            </div>
        </div>
    </div>
    <div id="updateResultModal" class="modal-mask" style="padding:16px 16px 150px;">
        <div class="modal-box" style="max-width:480px;">
            <div class="modal-head">
                <h2 style="color:var(--success);">${I.check} 更新成功</h2>
                <button class="close-x" onclick="document.getElementById('updateResultModal').style.display='none'" title="关闭">${I.xmark}</button>
            </div>
            <div id="updateResultBody" style="font-size:12px; line-height:1.9; margin-bottom:14px;"></div>
            <button class="btn-submit" onclick="window.location.reload()" style="width:100%;">${I.check} 刷新页面</button>
        </div>
    </div>

    <script>
        const modeNames = { 'off': '保守', 'realip_only': '严格', 'dual': '兼容', 'strict': '强力', 'emos': 'EMOS' };

        // ===== 折叠交互(v3.4.32)=====
        function toggleNodesCollapse(){
            const grid = document.getElementById('list-grid');
            const tb = document.getElementById('nodesToolbar');
            const hint = document.getElementById('nodesHint');
            const ar = document.getElementById('nodesArrow');
            if(!grid) return;
            const open = grid.style.display !== 'none';
            grid.style.display = open ? 'none' : 'grid';
            if(tb) tb.style.display = open ? 'none' : 'flex';
            if(hint) hint.style.display = open ? 'block' : 'none';
            if(ar){ ar.textContent = open ? '▶' : '▼'; ar.classList.toggle('open', !open); }
        }
        function toggleCollapseSec(head){
            const sec = head.closest('.collapse-sec');
            if(!sec) return;
            sec.classList.toggle('open');
            const hint = head.querySelector('.ch-hint');
            if(hint) hint.textContent = sec.classList.contains('open') ? '点击收起' : '点击展开';
        }
        
        const DEFAULT_ICON_URL = 'https://emby-icon.vercel.app/TFEL-Emby.json';
        let globalIcons = [];
        let proxyNodesForPing = [];
        let sortableInstance = null;
        let trendChartInstance = null;
        let locationChartInstance = null;
        let cfStatusChartInstance = null;
        let cfHourChartInstance = null;

        // 设置 Chart.js 响应暗色模式
        function updateChartColors() {
            Chart.defaults.color = document.body.classList.contains('dark') ? '#98989d' : '#86868b';
            Chart.defaults.borderColor = document.body.classList.contains('dark') ? '#38383a' : '#d2d2d7';
        }

        // =====================================
        // 数据大屏与统计逻辑 (适配手机端表格排版)
        // =====================================
        // v3.4.16:播放热力图加载(统计弹窗内,与 openDashboard 同级)
        async function loadHeatmap() {
            const grid = document.getElementById('heatmapGrid');
            const sum = document.getElementById('heatmapSummary');
            if (!grid || !sum) return;
            try {
                const res = await fetch('/api/heatmap');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                if (!data.ok) throw new Error(data.error || '接口错误');
                const days = data.days || [];
                const prefixTotals = data.prefixTotals || {};
                const total = data.total || 0;
                const maxHour = data.maxHour || 1;
                const nodeTotal = Object.keys(prefixTotals).map(function(k) {
                    return '<span style="background:rgba(0,122,255,.08); border:1px solid rgba(0,122,255,.18); border-radius:6px; padding:2px 8px; margin-right:6px; display:inline-block;">' + k + ': <b>' + prefixTotals[k] + '</b></span>';
                }).join('');
                sum.innerHTML = '总计播放请求 <b>' + total + '</b> 次 · 各节点:<div style="margin-top:6px;">' + (nodeTotal || '<span style="color:var(--text-sec);">暂无播放数据,配置节点后播放即开始统计</span>') + '</div>';
                const week = ['日', '一', '二', '三', '四', '五', '六'];
                let html = '<div style="min-width:560px;">';
                html += '<div style="display:grid; grid-template-columns:56px repeat(24,1fr); gap:3px; margin-bottom:4px;">';
                html += '<div></div>';
                for (let h = 0; h < 24; h++) html += '<div style="font-size:10px; color:var(--text-sec); text-align:center;">' + h + '</div>';
                html += '</div>';
                days.forEach(function(d, di) {
                    const dt = new Date();
                    dt.setDate(dt.getDate() - (days.length - 1 - di));
                    const dow = week[dt.getDay()];
                    html += '<div style="display:grid; grid-template-columns:56px repeat(24,1fr); gap:3px; margin-bottom:3px;">';
                    html += '<div style="font-size:10px; color:var(--text-sec); display:flex; align-items:center;">' + d.day + ' ' + dow + '</div>';
                    for (let h = 0; h < 24; h++) {
                        const v = d.hours[h] || 0;
                        const ratio = v / maxHour;
                        const bg = v === 0 ? 'rgba(120,120,120,0.08)' : 'rgba(0,122,255,' + (0.12 + ratio * 0.85) + ')';
                        html += '<div title="' + d.day + ' ' + h + '时: ' + v + '次" style="height:22px; border-radius:4px; background:' + bg + '; display:flex; align-items:center; justify-content:center; font-size:9px; color:' + (ratio > 0.5 ? '#fff' : 'var(--text-sec)') + ';">' + (v > 0 ? v : '') + '</div>';
                    }
                    html += '</div>';
                });
                html += '</div>';
                html += '<div style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-sec); margin-top:8px;">低 <span style="width:16px;height:16px;border-radius:3px;background:rgba(120,120,120,0.12);display:inline-block;"></span>';
                html += '<span style="width:16px;height:16px;border-radius:3px;background:rgba(0,122,255,.2);display:inline-block;"></span>';
                html += '<span style="width:16px;height:16px;border-radius:3px;background:rgba(0,122,255,.5);display:inline-block;"></span>';
                html += '<span style="width:16px;height:16px;border-radius:3px;background:rgba(0,122,255,.9);display:inline-block;"></span> 高</div>';
                grid.innerHTML = html;
            } catch (e) {
                grid.innerHTML = '<div style="font-size:12px; color:#ff3b30; padding:20px;">热力图加载失败: ' + e.message + '</div>';
                sum.innerHTML = '';
            }
        }

        async function openDashboard() {
            document.getElementById('dashboardModal').style.display = 'block';
            try { loadHeatmap(); } catch (e) {}
            
            function parseTrafficToBytes(str) {
                if (!str || str === '0 B' || str.includes('异常') || str.includes('获取')) return 0;
                let val = parseFloat(str);
                if (str.includes('TB')) return val * 1099511627776;
                if (str.includes('GB')) return val * 1073741824;
                if (str.includes('MB')) return val * 1048576;
                if (str.includes('KB')) return val * 1024;
                return val;
            }

            let top5Container = document.getElementById('top5-simple-container');
            if (!top5Container) {
                top5Container = document.createElement('div');
                top5Container.id = 'top5-simple-container';
                const wrapper = document.querySelector('.table-wrapper');
                if(wrapper && wrapper.previousElementSibling) {
                    wrapper.parentNode.insertBefore(top5Container, wrapper.previousElementSibling);
                }
            }
            
            let top5Html = '<h3 style="margin-top: 30px; margin-bottom:16px;">${I.trophy} 今日节点流量消耗 TOP 5</h3><div style="background: rgba(120,120,120,0.05); padding: 16px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 20px;">';
            
            // ==========================================
            //  核心优化：听你的天才思路！直接去网页现有的卡片里“抓取”数据，绝不等待变量！
            // ==========================================
            const domCards = document.querySelectorAll('.route-item');
            let scrapedNodes = [];
            
            domCards.forEach(card => {
                const prefix = card.getAttribute('data-prefix') || '未知';
                let remark = prefix;
                const searchAttr = card.getAttribute('data-search');
                if (searchAttr) {
                    remark = searchAttr.replace(new RegExp(' ' + prefix + '$'), '').trim();
                }

                let bandwidth = '0 B';
                // 遍历卡片里所有的文本，找出带有流量单位的那个文本
                const spans = card.querySelectorAll('span');
                spans.forEach(span => {
                    const txt = span.innerText || '';
                    // 匹配例如: 1.5 GB, 500 MB, 0 B (双斜杠防转义丢失)
                    if (/^[\\d\\.]+\\s*(TB|GB|MB|KB|B)$/i.test(txt.trim())) {
                        bandwidth = txt.trim();
                    }
                });

                scrapedNodes.push({ prefix: prefix, remark: remark, todayBandwidth: bandwidth });
            });

            // 用抓取下来的真实数据直接计算 TOP 5
            if (scrapedNodes.length > 0) {
                const validNodes = scrapedNodes.filter(r => parseTrafficToBytes(r.todayBandwidth) > 0);
                const top5 = validNodes.sort((a, b) => parseTrafficToBytes(b.todayBandwidth) - parseTrafficToBytes(a.todayBandwidth)).slice(0, 5);
                
                if (top5.length > 0) {
                    top5Html += '<ul style="margin:0; padding-left: 20px; line-height: 2; font-size: 14px; color: var(--text);">';
                    top5.forEach((r, idx) => {
                        const rankColor = idx === 0 ? '#ff3b30' : (idx === 1 ? '#ff9500' : (idx === 2 ? '#ffcc00' : 'var(--text-sec)'));
                        top5Html += \`<li><strong style="color:\${rankColor}; font-size: 15px;">#\${idx+1}</strong> \${r.remark} (/\${r.prefix}) —— 消耗: <strong style="color:var(--primary); font-family: monospace;">\${r.todayBandwidth}</strong></li>\`;
                    });
                    top5Html += '</ul>';
                } else {
                    top5Html += '<div style="color:var(--text-sec); font-size:13px; text-align:center;">今日暂无节点产生流量</div>';
                }
            } else {
                top5Html += '<div style="color:var(--text-sec); font-size:13px; text-align:center;">主页暂无节点卡片</div>';
            }
            top5Html += '</div>';
            
            // 瞬间把 TOP 5 写入网页！
            top5Container.innerHTML = top5Html;


            // ==========================================
            //  正常加载下面的图表数据 (带有10秒防卡死超时保护)
            // ==========================================
            document.getElementById('logTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 30px;">数据分析引擎计算中...</td></tr>';
            document.getElementById('trafficToday').innerText = '拉取中...';
            document.getElementById('traffic7d').innerText = '拉取中...';
            document.getElementById('traffic30d').innerText = '拉取中...';
            document.getElementById('cfToday').innerText = '拉取中...';
            document.getElementById('cfWeek').innerText = '拉取中...';
            document.getElementById('cfMonth').innerText = '拉取中...';
            document.getElementById('cfQuotaText').innerText = '加载中...';
            document.getElementById('cfBandwidth').innerText = '拉取中...';
            document.getElementById('cfCacheRatio').innerText = '拉取中...';
            document.getElementById('cfBlocked').innerText = '拉取中...';
            document.getElementById('cf5xx').innerText = '拉取中...';
            loadCfUsage();

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const res = await fetch('/api/analytics', { signal: controller.signal });
                clearTimeout(timeoutId);
                
                const data = await res.json();
                if(!data.success) throw new Error(data.error);

                updateChartColors();

                document.getElementById('trafficToday').innerText = data.trafficToday || '未知';
                document.getElementById('traffic7d').innerText = data.traffic7d || '未知';
                document.getElementById('traffic30d').innerText = data.traffic30d || '未知';

                const labels = data.trend.map(i => i.date.substring(5)); 
                const counts = data.trend.map(i => i.count);
                const trendCtx = document.getElementById('trendChart').getContext('2d');
                if(trendChartInstance) trendChartInstance.destroy();
                trendChartInstance = new Chart(trendCtx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{ label: '有效播放 (次)', data: counts, borderColor: '#0071e3', backgroundColor: 'rgba(0,113,227,0.1)', fill: true, tension: 0.3 }]
                    },
                    options: { responsive: true, plugins: { title: { display: true, text: '过去 7 天全站播放并发趋势', font: {size: 16} } } }
                });

                const locLabels = data.locations.map(i => i.country === 'CN' ? '中国大陆' : (i.country || '未知'));
                const locCounts = data.locations.map(i => i.count);
                const locCtx = document.getElementById('locationChart').getContext('2d');
                if(locationChartInstance) locationChartInstance.destroy();
                locationChartInstance = new Chart(locCtx, {
                    type: 'doughnut',
                    data: {
                        labels: locLabels,
                        datasets: [{ data: locCounts, backgroundColor: ['#34c759', '#0071e3', '#ff9500', '#af52de', '#ff2d55', '#8e8e93'], borderWidth: 0 }]
                    },
                    options: { responsive: true, plugins: { title: { display: true, text: '独立访客来源地占比', font: {size: 16} } } }
                });

                const tbody = document.getElementById('logTableBody');
                tbody.innerHTML = '';
                if(data.recents.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 30px;">暂无日志记录</td></tr>';
                } else {
                    data.recents.forEach(log => {
                        const tr = document.createElement('tr');
                        const isChina = log.country === 'CN';
                        tr.innerHTML = \`
                            <td data-label="访问时间" style="font-size:12px; white-space:nowrap;">\${log.timestamp}</td>
                            <td data-label="目标节点"><span class="badge" style="background:rgba(0,113,227,0.1);color:var(--primary);">\${log.prefix}</span></td>
                            <td data-label="真实 IP" style="font-family:monospace; font-size:13px; color:var(--text-sec); word-break:break-all;">\${log.ip}</td>
                            <td data-label="归属地"><span class="badge" style="background:\${isChina ? 'rgba(52,199,89,0.1)' : 'rgba(255,149,0,0.1)'}; color:\${isChina ? '#34c759' : '#ff9500'};">\${isChina ? '中国大陆' : (log.country || 'Unknown')}</span></td>
                            <td data-label="设备标识 (UA)" style="font-size:12px; color:var(--text-sec); word-break: break-all; white-space: normal; text-align: right; line-height: 1.4;" title="\${log.ua}">\${log.ua}</td>
                        \`;
                        tbody.appendChild(tr);
                    });
                }

            } catch (e) {
                const errMsg = e.name === 'AbortError' ? '网络超时，CF 接口拥堵，请稍后重试' : e.message;
                document.getElementById('logTableBody').innerHTML = \`<tr><td colspan="5" style="text-align:center;color:#ff3b30; padding: 30px;">独立图表数据拉取失败: \${errMsg}</td></tr>\`;
            }
        }

        function closeDashboard() { document.getElementById('dashboardModal').style.display = 'none'; }

        // CF Worker 每日请求数统计加载（独立于流量统计，失败不影响大屏其他模块）
        async function loadCfUsage() {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const res = await fetch('/api/cfusage', { signal: controller.signal });
                clearTimeout(timeoutId);
                const data = await res.json();
                if (!data.success) {
                    ['cfToday','cfWeek','cfMonth'].forEach(id => document.getElementById(id).innerText = '不可用');
                    ['cfBandwidth','cfCacheRatio','cfBlocked','cf5xx'].forEach(id => document.getElementById(id).innerText = '不可用');
                    document.getElementById('cfQuotaText').innerText = '未配置 CF 统计变量';
                    document.getElementById('cfQuotaDetail').innerText = data.error || '缺少 CF_API_TOKEN 或 CF_ZONE_ID';
                    document.getElementById('cfCountryList').innerText = '暂无数据';
                    return;
                }
                const fmt = n => n.toLocaleString('zh-CN') + ' 次';
                document.getElementById('cfToday').innerText = fmt(data.today);
                document.getElementById('cfWeek').innerText = fmt(data.week);
                document.getElementById('cfMonth').innerText = fmt(data.month);
                document.getElementById('cfBandwidth').innerText = data.bandwidth ? (data.bandwidth / 1073741824).toFixed(2) + ' GB' : '0 GB';
                document.getElementById('cfCacheRatio').innerText = (data.cacheHitRatio || 0) + '%';
                document.getElementById('cfBlocked').innerText = (data.blocked || 0).toLocaleString('zh-CN') + ' 次';
                document.getElementById('cf5xx').innerText = ((data.statusCodes && data.statusCodes['5xx']) || 0).toLocaleString('zh-CN') + ' 次';
                document.getElementById('cfQuotaText').innerText = data.todayError ? '获取失败' : (data.usedPercent + '%');
                document.getElementById('cfQuotaBar').style.width = Math.min(100, data.usedPercent) + '%';
                document.getElementById('cfQuotaDetail').innerText = \`已用 \${data.today.toLocaleString('zh-CN')} 次 / 10万 (\${data.usedPercent}%) · 剩余 \${data.remain.toLocaleString('zh-CN')} 次\`;
                if (data.todayError) document.getElementById('cfQuotaDetail').innerText += '（' + data.todayError + '）';
                // 状态码环形图
                const sc = data.statusCodes || { '2xx':0, '3xx':0, '4xx':0, '5xx':0 };
                const scCtx = document.getElementById('cfStatusChart').getContext('2d');
                if (cfStatusChartInstance) cfStatusChartInstance.destroy();
                cfStatusChartInstance = new Chart(scCtx, {
                    type: 'doughnut',
                    data: { labels: ['2xx','3xx','4xx','5xx'], datasets: [{ data: [sc['2xx'], sc['3xx'], sc['4xx'], sc['5xx']], backgroundColor: ['#34c759','#0a84ff','#ff9f0a','#ff3b30'], borderWidth: 0 }] },
                    options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#8e8e93', boxWidth: 10 } } } }
                });
                // 分时折线（北京时间 24h）
                const hCtx = document.getElementById('cfHourChart').getContext('2d');
                if (cfHourChartInstance) cfHourChartInstance.destroy();
                cfHourChartInstance = new Chart(hCtx, {
                    type: 'line',
                    data: { labels: Array.from({length: 24}, (_,i) => i + 'h'), datasets: [{ label: '请求数', data: data.hours || [], borderColor: '#00e5ff', backgroundColor: 'rgba(0,229,255,0.1)', fill: true, tension: 0.3, pointRadius: 0 }] },
                    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 12, color: '#8e8e93' } }, y: { beginAtZero: true, ticks: { color: '#8e8e93' } } } }
                });
                // Top 国家
                const cl = document.getElementById('cfCountryList');
                if (data.countries && data.countries.length) {
                    const total = data.countries.reduce((a, c) => a + c.count, 0) || 1;
                    cl.innerHTML = data.countries.map(c => {
                        const pct = Math.round(c.count / total * 100);
                        return '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><span>' + c.country + '</span><div style="flex:1; margin:0 8px; height:4px; background:rgba(120,120,120,.2); border-radius:4px; overflow:hidden;"><div style="height:100%; width:' + pct + '%; background:linear-gradient(90deg,#00e5ff,#7c3aed);"></div></div><span>' + c.count.toLocaleString('zh-CN') + '</span></div>';
                    }).join('');
                } else {
                    cl.innerText = '暂无数据';
                }
            } catch(e) {
                ['cfToday','cfWeek','cfMonth'].forEach(id => document.getElementById(id).innerText = '拉取失败');
                document.getElementById('cfQuotaText').innerText = '获取失败';
            }
        }

        async function loadIcons(forceUrl = null) {
            const grid = document.getElementById('iconGrid');
            grid.innerHTML = '<div style="grid-column: 1/-1; color: var(--text-sec); font-size: 13px; text-align: center;">加载图标库中...</div>';
            const targetUrl = forceUrl || localStorage.getItem('custom_icon_url') || DEFAULT_ICON_URL;
            const urlInput = document.getElementById('customIconUrlInput');
            if (urlInput) urlInput.value = targetUrl === DEFAULT_ICON_URL ? '' : targetUrl;
            try {
                const res = await fetch(targetUrl);
                const data = await res.json();
                if (data && data.icons && Array.isArray(data.icons)) {
                    globalIcons = data.icons;
                } else if (Array.isArray(data)) {
                    globalIcons = data;
                } else {
                    globalIcons = [];
                    for (const [key, val] of Object.entries(data)) { globalIcons.push({ name: key, url: val }); }
                }
                renderIconGrid('');
            } catch(e) { 
                grid.innerHTML = '<div style="grid-column: 1/-1; color: #ff3b30; font-size: 13px; text-align: center;">获取图标库失败，请检查链接或网络状态</div>';
            }
        }

        function setCustomIconLibrary() {
            const url = document.getElementById('customIconUrlInput').value.trim();
            if (!url) return showToast('⚠️ 请输入图标库 JSON 链接');
            if (!url.startsWith('http')) return showToast('⚠️ 请输入合法的 URL');
            localStorage.setItem('custom_icon_url', url);
            showToast('⏳ 正在加载自定义图标库...');
            loadIcons(url);
        }

        function resetIconLibrary() {
            localStorage.removeItem('custom_icon_url');
            document.getElementById('customIconUrlInput').value = '';
            showToast('🔄 已恢复默认图标库');
            loadIcons(DEFAULT_ICON_URL);
        }

        function renderIconGrid(filterText) {
            const grid = document.getElementById('iconGrid');
            const lowerFilter = filterText.toLowerCase();
            const filtered = globalIcons.filter(item => (item.name || '').toLowerCase().includes(lowerFilter));
            let html = \`<div class="icon-item" onclick="selectIcon('', '默认')" title="使用默认图标"><span style="font-size:22px;">${I.film}</span></div>\`;
            filtered.forEach(item => {
                html += \`<div class="icon-item" onclick="selectIcon('\${item.url}', '\${item.name}')" title="\${item.name}">
                            <img src="\${item.url}" loading="lazy" style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px;">
                        </div>\`;
            });
            grid.innerHTML = html;
        }

        function filterIcons() { renderIconGrid(document.getElementById('iconSearch').value); }

        function toggleIconPicker(e) {
            e.stopPropagation();
            const panel = document.getElementById('iconPickerPanel');
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        }

        function selectIcon(url, name) {
            document.getElementById('iconUrl').value = url;
            const preview = document.getElementById('iconPreview');
            const def = document.getElementById('iconDefault');
            const text = document.getElementById('iconSelectText');
            if(url) {
                preview.src = url; preview.style.display = 'block'; def.style.display = 'none';
                text.textContent = name; text.style.color = 'var(--text)';
            } else {
                preview.src = ''; preview.style.display = 'none'; def.style.display = 'block';
                text.textContent = '点击选择图标 (默认)'; text.style.color = 'var(--text-sec)';
            }
            document.getElementById('iconPickerPanel').style.display = 'none';
        }

        document.addEventListener('click', (e) => {
            const panel = document.getElementById('iconPickerPanel');
            const btn = document.getElementById('iconSelectBtn');
            if (panel && btn && panel.style.display !== 'none') {
                if (!panel.contains(e.target) && !btn.contains(e.target)) panel.style.display = 'none';
            }
        });

        function toggleDarkMode() {
            const isDark = document.body.classList.toggle('dark');
            document.documentElement.classList.toggle('dark', isDark);
            document.getElementById('themeToggle').innerHTML = isDark ? I.sun : I.moon;
            localStorage.setItem('emby_proxy_dark', isDark ? '1' : '0');
            if(trendChartInstance) { updateChartColors(); trendChartInstance.update(); locationChartInstance.update(); }
        }
        if (localStorage.getItem('emby_proxy_dark') === '1') { document.body.classList.add('dark'); document.documentElement.classList.add('dark'); document.getElementById('themeToggle').innerHTML = I.sun; }

        function showToast(msg) {
            const t = document.getElementById('toast');
            t.textContent = msg; t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 3000);
        }

        async function purgeCache() {
            if(!confirm('确定要清理 Cloudflare 节点的全站海报和静态缓存吗？\\n\\n清理后可能导致短时间的加载缓慢。')) return;
            const btn = document.getElementById('btnPurge');
            const originalText = btn.textContent;
            btn.textContent = '⏳ 正在清理...'; btn.disabled = true;
            try {
                const res = await fetch('/api/purge-cache', { method: 'POST' });
                const data = await res.json();
                if(data.success) showToast('✅ 缓存清理成功，新海报已生效！');
                else showToast('❌ 清理失败: ' + data.error);
            } catch(e) { showToast('❌ 网络请求错误'); } finally { btn.textContent = originalText; btn.disabled = false; }
        }

        function filterNodesList() {
            const input = document.getElementById('searchNode');
            if (!input) return;
            const filterText = input.value.toLowerCase();
            const cards = document.querySelectorAll('.emby-card');
            cards.forEach(card => {
                const searchStr = String(card.getAttribute('data-search') || '').toLowerCase() + ' ' + String(card.getAttribute('data-search2') || '').toLowerCase();
                card.style.display = (!filterText || searchStr.includes(filterText)) ? 'flex' : 'none';
            });
        }

        function handleTargetInputs() {
            const container = document.getElementById('targetInputs');
            const inputs = container.querySelectorAll('.target-input');
            const lastInput = inputs[inputs.length - 1];
            if (lastInput.value.trim() !== '') {
                const newInput = document.createElement('input');
                newInput.type = 'url'; newInput.className = 'target-input';
                newInput.style = 'padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;';
                newInput.oninput = handleTargetInputs;
                container.appendChild(newInput);
            }
            let emptyCount = 0;
            const currentInputs = container.querySelectorAll('.target-input');
            for (let i = currentInputs.length - 1; i >= 0; i--) {
                if (currentInputs[i].value.trim() === '') { emptyCount++; if (emptyCount > 1) currentInputs[i].remove(); } else { break; }
            }
            container.querySelectorAll('.target-input').forEach((inp, idx) => {
                inp.placeholder = idx === 0 ? "主线路地址 (如: http://1.1.1.1:8096)" : \`备用线路 \${idx} (选填，主源挂掉时触发)\`;
            });
        }

        function resetTargetInputs() {
            const container = document.getElementById('targetInputs');
            container.innerHTML = \`
                <input type="url" class="target-input" placeholder="主线路地址 (如: http://1.1.1.1:8096)" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;" required oninput="handleTargetInputs()">
                <input type="url" class="target-input" placeholder="备用线路 1 (选填)" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;" oninput="handleTargetInputs()">
            \`;
        }

        function toggleVis(id, isArray = false) {
            const el = document.getElementById(id);
            if (el.classList.contains('secret-text')) {
                el.classList.remove('secret-text'); el.classList.add('actual-text');
                if (isArray) {
                    const arr = JSON.parse(decodeURIComponent(el.getAttribute('data-val')));
                    let html = '';
                    arr.forEach((t, i) => {
                        const tag = i === 0 ? '<span style="color:#34c759;font-weight:bold;">[主]</span>' : '<span style="color:#ff9500;font-weight:bold;">[备]</span>';
                        html += \`<div class="url-list-item">\${tag} \${t}</div>\`;
                    });
                    el.innerHTML = html;
                } else { el.textContent = el.getAttribute('data-val'); }
            } else {
                el.classList.add('secret-text'); el.classList.remove('actual-text'); el.textContent = '••••••••';
            }
        }

        function copyTxt(txt) { navigator.clipboard.writeText(txt).then(() => showToast('🚀 复制成功！')); }

        async function pingTarget(idx, targetUrl) {
            const pingEl = document.getElementById('ping-' + idx);
            pingEl.textContent = '测速中...'; pingEl.style.color = 'var(--text-sec)';
            try {
                const res = await fetch('/api/ping-node?url=' + encodeURIComponent(targetUrl));
                const data = await res.json();
                if(data.ms >= 0) {
                    pingEl.textContent = data.ms + ' ms';
                    pingEl.style.color = data.ms < 200 ? '#34c759' : (data.ms < 500 ? 'var(--primary)' : '#ff9500');
                } else { pingEl.textContent = '断连/超时'; pingEl.style.color = '#ff3b30'; }
            } catch(e) { pingEl.textContent = '测速异常'; pingEl.style.color = '#ff3b30'; }
        }

        function pingAllNodes() {
            if (proxyNodesForPing.length === 0) return showToast('⚠️ 没有可供测速的反代节点');
            showToast('⚡ 正在对所有节点发起测速...');
            proxyNodesForPing.forEach((node, offset) => { setTimeout(() => pingTarget(node.idx, node.url), offset * 200); });
        }

        async function exportConfig() {
            try {
                const res = await fetch('/api/routes'); const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'emby_proxy_backup.json'; a.click();
                URL.revokeObjectURL(url); showToast('✅ 配置已导出');
            } catch (e) { showToast('❌ 导出失败'); }
        }

        function importConfig() {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0]; const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const routes = JSON.parse(event.target.result);
                        const res = await fetch('/api/routes/import', { method: 'POST', body: JSON.stringify(routes) });
                        const result = await res.json();
                        if (result.success) { showToast('✅ 配置导入成功'); load(); } else throw new Error(result.error);
                    } catch (err) { showToast('❌ 导入失败: ' + err.message); }
                };
                reader.readAsText(file);
            };
            input.click();
        }

        async function load() {
            try {
                await Promise.all([loadPtState(), loadIpGuard()]);
            } catch (e) {}
            if (window.ROLE && window.ROLE !== 'sub') { loadNodeReqs().catch(() => {}); }
            try {
                const res = await fetch('/api/routes');
                if (!res.ok) throw new Error('请求失败，请检查环境配置');
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                //  新增：把节点流量数据存进全局内存，供大屏瞬间读取！
                window.globalRoutesData = data;

                const container = document.getElementById('list-grid');
                if(data.length === 0) {
                    container.innerHTML = '<div style="text-align:center; color:var(--text-sec); grid-column: 1 / -1; padding: 40px;">暂无配置任何反代节点，请先部署一个。</div>';
                    return;
                }
                
                container.innerHTML = '';
                proxyNodesForPing = []; 
                const currentHost = window.location.host;

                data.forEach((r, idx) => {
                    // 转义引号，防止备注/图标/链接/规则 JSON 里的引号截断 onclick 属性（双引号必须用 HTML 实体，反斜杠转义在 HTML 属性内无效）
                    const esc = s => String(s == null ? '' : s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'", "\\\\'");
                    const proxyUrl = entryUrl(r.prefix);
                    const targets = r.target ? r.target.split(',').map(s => s.trim()).filter(Boolean) : [];
                    const mainTarget = targets[0] || '';
                    
                    const remarkName = r.remark || '未命名媒体库';
                    const lastPlay = r.last_play ? r.last_play : '暂无播放记录';
                    let watchDaysText = '暂无播放记录', watchOverdue = false;
                    if (r.last_play) {
                        try {
                            const lpUtc = Date.parse(r.last_play.replace(' ', 'T') + 'Z') - 8 * 3600000;
                            const diffDays = Math.floor((Date.now() - lpUtc) / 86400000);
                            watchDaysText = diffDays <= 0 ? '今天观看过' : (diffDays + ' 天前观看');
                            const wl = parseFloat(r.watch_limit);
                            if (wl > 0 && diffDays > wl) { watchOverdue = true; watchDaysText += ' · 已超 ' + (diffDays - wl) + ' 天'; }
                        } catch (e) {}
                    }
                    
                    const iconHtml = r.icon ? \`<img src="\${r.icon}" style="width:28px;height:28px;border-radius:6px;object-fit:cover;">\` : '${I.film}';
                    const pingAttr = mainTarget ? 'onclick="pingTarget(' + idx + ', \\'' + mainTarget + '\\')" title="点击重新测速"' : 'title="订阅模式不可测速"';
                    const pingText = mainTarget ? '测速中...' : '—';
                    const encodedTargets = encodeURIComponent(JSON.stringify(targets));
                    
                    //  接收后端传来的：单节点独立宽带与请求统计数据
                    const todayBw = r.todayBandwidth || '0 B';
                    const totalReqs = r.totalReqs || r.todayReqs || 0;

                    proxyNodesForPing.push({ idx: idx, url: mainTarget });

                    container.innerHTML += \`
                    <div class="emby-card route-item" data-prefix="\${esc(r.prefix)}" data-search="\${escHtml(remarkName)} \${esc(r.prefix)}" data-search2="\${escHtml(targets.join(' '))}">
                        <div class="card-header">
                            <div class="card-title-group" style="display: flex; align-items: center; gap: 10px;">
                                <div class="drag-handle admin-only" title="长按拖拽排序" style="margin: 0; display: flex; align-items: center;">${I.lines}</div>
                                <input type="checkbox" class="node-cb admin-only" value="\${r.prefix}" style="width: 18px; height: 18px; margin: 0; cursor: pointer; accent-color: var(--primary); flex-shrink: 0;">
                                <div class="emby-icon" style="margin: 0; display: flex; align-items: center;">\${iconHtml}</div>
                                <div>
                                    <div style="font-weight: 600; font-size: 16px; color: var(--text);">\${remarkName}</div>
                                    <div style="font-size: 13px; color: var(--text-sec); margin-top:2px;">/\${r.prefix}</div>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center;">
                                <span class="badge" style="background: rgba(0,113,227,0.1); color: var(--primary);">\${modeNames[r.mode] || '未知'}</span>
                            </div>
                        </div>

                        <div class="node-summary" style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding-top:2px;">
                            <span id="ping-\${idx}" class="ping-badge" \${pingAttr}>\${pingText}</span>
                            <span style="font-size:12px; color:var(--text-sec);">\${todayBw}</span>
                            <div style="margin-left:auto; display:flex; gap:8px; align-items:center;">
                                <button class="icon-btn" onclick="copyTxt('\${proxyUrl}')" title="复制直达链接">${SVG_COPY}</button>
                                <button class="icon-btn" onclick="toggleNodeDetail(this)" title="展开详情" style="transition:transform .25s;">${I.arrowdown}</button>
                            </div>
                        </div>

                        <div class="node-detail" style="display:none; flex-direction:column; gap:14px;">
                            <div style="background: rgba(120,120,120,0.05); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                                <div style="display:flex; flex-direction: column; gap: 4px;">
                                    <span style="font-size:12px; color:var(--text-sec);">${I.arrowdown} 今日产生总流量</span>
                                    <span style="font-size:16px; font-weight:700; color:var(--primary);">\${todayBw}</span>
                                </div>
                                <div style="display:flex; flex-direction: column; gap: 4px; text-align: right;">
                                    <span style="font-size:12px; color:var(--text-sec);">${I.tv} 播放次数 (今日/累计)</span>
                                    <span style="font-size:16px; font-weight:700; color:#ff9500;">\${r.todayReqs} / \${totalReqs} 次</span>
                                </div>
                            </div>

                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <div class="info-row">
                                    <span class="info-label">直达链接:</span>
                                    <div class="action-group" style="flex:1; justify-content: flex-end; margin-left: 10px; align-items: flex-start;">
                                        <span id="p-\${idx}" data-val="\${proxyUrl}" class="secret-text dynamic-url">••••••••</span>
                                        <button class="icon-btn" style="margin-top: 2px;" onclick="toggleVis('p-\${idx}')" title="查看明文">${SVG_EYE}</button>
                                        <button class="icon-btn" style="margin-top: 2px;" onclick="copyTxt('\${proxyUrl}')" title="复制链接">${SVG_COPY}</button>
                                    </div>
                                </div>
                                <div class="info-row admin-only">
                                    <span class="info-label">源站线路:</span>
                                    <div class="action-group" style="flex:1; justify-content: flex-end; margin-left: 10px; align-items: flex-start;">
                                        <div id="t-\${idx}" data-val="\${encodedTargets}" class="secret-text dynamic-url">••••••••</div>
                                        <button class="icon-btn" style="margin-top: 2px;" onclick="toggleVis('t-\${idx}', true)" title="查看明文">${SVG_EYE}</button>
                                    </div>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">海报缓存:</span>
                                    <span style="color:\${r.cache_img !== 'off' ? '#34c759' : '#ff9500'}; font-weight:600;">\${r.cache_img !== 'off' ? '${I.check} 已开启' : '${I.xmark} 已关闭'}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">外部跳转:</span>
                                    <span style="color:\${r.redirect_direct === 'on' ? '#34c759' : (r.redirect_rules && r.redirect_rules !== '[]' ? '#34c759' : '#ff9500')}; font-weight:600;">\${r.redirect_direct === 'on' ? '${I.check} 直连' : (r.redirect_rules && r.redirect_rules !== '[]' ? '${I.lines} 规则' : '${I.xmark} 代理')}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">最后活跃:</span>
                                    <span style="color:\${watchOverdue ? '#ff3b30' : 'var(--text-sec)'}; font-weight:\${watchOverdue ? '700' : 'normal'};">\${watchOverdue ? '${I.warn} ' : ''}\${watchDaysText}</span>
                                </div>
                            </div>

                            <div class="card-footer admin-only">
                                <button class="btn-edit" onclick="openImportModal('\${esc(r.prefix)}')" title="生成 SenPlayer / Rex / Hills 一键导入链接">一键导入</button>
                                <button class="btn-edit" onclick="editNode('\${esc(r.prefix)}', '\${esc(r.target)}', '\${esc(r.mode)}', '\${esc(r.remark || '')}', '\${esc(r.icon || '')}', '\${esc(r.cache_img)}', '\${esc(r.custom_ip || '')}', '\${esc(r.watch_limit || '0')}', '\${esc(r.node_user || '')}', '\${esc(r.node_pass || '')}', '\${esc(r.redirect_direct)}', '\${esc(r.redirect_rules || '')}', '\${esc(r.emos_id || '')}', '\${esc(r.emos_name || '')}', '\${esc(r.emos_aggregate || 'off')}')">编辑配置</button>
                                <button class="btn-del" onclick="del('\${esc(r.prefix)}')">删除</button>
                            </div>
                        </div>
                    </div>\`;;

                    if (mainTarget) setTimeout(() => pingTarget(idx, mainTarget), 500 * idx); 
                });
                
                filterNodesList();

                if (sortableInstance) sortableInstance.destroy();
                sortableInstance = Sortable.create(container, {
                    handle: '.drag-handle',
                    animation: 150,
                    delay: 200, 
                    delayOnTouchOnly: true,
                    onEnd: async function () {
                        const items = [];
                        container.querySelectorAll('.route-item').forEach((row, index) => {
                            const prefix = row.getAttribute('data-prefix');
                            if (prefix) items.push({ prefix: prefix, sort_order: index });
                        });
                        try {
                            await fetch('/api/routes/reorder', { method: 'POST', body: JSON.stringify(items) });
                            showToast('✅ 排序已保存');
                        } catch(e) { showToast('❌ 排序保存失败'); }
                    }
                });

            } catch (err) {
                document.getElementById('list-grid').innerHTML = \`<div style="text-align:center; color:#ff3b30; font-weight:600; grid-column: 1 / -1; padding: 20px;">${I.warn} 读取失败: \${err.message}</div>\`;
            }
        }

        function toggleEmosFields() {
            const modeEl = document.getElementById('mode');
            const emosEl = document.getElementById('emosFields');
            if (!modeEl || !emosEl) return;
            emosEl.style.display = (modeEl.value === 'emos') ? 'flex' : 'none';
        }
        function editNode(prefix, targetStr, mode, remark, icon, cacheImg, customIp, watchLimit, nodeUser, nodePass, redirectDirect, redirectRulesRaw, emosId, emosName, emosAggregate) {
            document.getElementById('oldPrefix').value = prefix;
            document.getElementById('remark').value = remark;
            document.getElementById('prefix').value = prefix;
            document.getElementById('mode').value = mode || 'off';
            document.getElementById('nodeCache').checked = (cacheImg !== 'off');
            document.getElementById('nodeFakeIp').value = customIp || '';
            document.getElementById('watchLimit').value = watchLimit || '0';
            document.getElementById('nodeUser').value = nodeUser || '';
            document.getElementById('nodePass').value = nodePass || '';
            document.getElementById('nodeEmosId').value = emosId || 'eK3QYG29Ms';
            document.getElementById('nodeEmosName').value = emosName || '玛卡巴卡的反代面板';
            document.getElementById('nodeEmosAggregate').checked = (emosAggregate === 'on');
            toggleEmosFields();
            document.getElementById('nodeRedirectDirect').checked = (redirectDirect === 'on');
            const rulesEnable = document.getElementById('nodeRulesEnable');
            try {
                const arr = parseRedirectRulesLocal(redirectRulesRaw || '');
                rulesEnable.checked = arr.length > 0 && redirectDirect !== 'on';
                renderRulesList(arr);
            } catch (e) { rulesEnable.checked = false; renderRulesList([]); }
            
            if (icon) {
                const foundItem = globalIcons.find(i => i.url === icon);
                selectIcon(icon, foundItem ? foundItem.name : '已选择图标');
            } else {
                selectIcon('', '默认');
            }

            document.getElementById('submitBtn').textContent = '保存修改';
            
            const container = document.getElementById('targetInputs');
            container.innerHTML = '';
            const targets = targetStr.split(',').map(s => s.trim()).filter(Boolean);
            
            targets.forEach((url) => {
                const inp = document.createElement('input');
                inp.type = 'url'; inp.className = 'target-input'; inp.value = url;
                inp.style = 'padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;';
                inp.oninput = handleTargetInputs;
                container.appendChild(inp);
            });
            
            const emptyInp = document.createElement('input');
            emptyInp.type = 'url'; emptyInp.className = 'target-input';
            emptyInp.style = 'padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;';
            emptyInp.oninput = handleTargetInputs;
            container.appendChild(emptyInp);
            
            handleTargetInputs(); 
            document.getElementById('nodeModalTitle').textContent='编辑节点';
            document.getElementById('nodeModal').style.display='block';
        }
        // ============ 302/307 域名规则（动态条目） ============
        function parseRedirectRulesLocal(text) {
            if (!text) return [];
            if (typeof text === 'string' && text.trim().charAt(0) === '[') {
                try { const arr = JSON.parse(text); if (Array.isArray(arr)) return arr.filter(x => x && x.d).map(x => ({ d: String(x.d).toLowerCase(), a: x.a === 'direct' ? 'direct' : 'proxy' })); } catch (e) {}
            }
            const rules = [];
            for (const line of String(text).split(/\\r?\\n/)) {
                const t = line.trim(); if (!t) continue;
                const parts = t.split(',').map(s => s.trim());
                if (parts.length < 2 || !parts[0]) continue;
                let domain = parts[0].replace(/^https?:\\/\\//i, '').replace(/\\/.*$/, '').trim();
                domain = domain.replace(/^www\\./i, '');
                if (!domain || /\\s|\\//.test(domain)) continue;
                const action = /^(direct|直连|不走反代)$/i.test(parts[1]) ? 'direct' : (/^(proxy|代理|走反代)$/i.test(parts[1]) ? 'proxy' : null);
                if (!action) continue;
                rules.push({ d: domain.toLowerCase(), a: action });
            }
            return rules;
        }
        function addRuleRow(d, a) {
            const list = document.getElementById('rulesList');
            const row = document.createElement('div');
            row.style = 'display:flex; gap:8px; align-items:center;';
            const inp = document.createElement('input');
            inp.type = 'text'; inp.className = 'rule-domain';
            inp.placeholder = '域名 (如: a.com)'; inp.value = d || '';
            inp.style = 'flex:1; min-width:120px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px; color:var(--text);';
            const sel = document.createElement('select');
            sel.className = 'rule-action';
            sel.style = 'padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px; color:var(--text); flex-shrink:0;';
            sel.innerHTML = '<option value="direct">直连</option><option value="proxy">代理</option>';
            sel.value = a || 'direct';
            const del = document.createElement('button');
            del.type = 'button'; del.textContent = '×';
            del.style = 'background:transparent; border:none; color:var(--text-sec); font-size:18px; cursor:pointer; padding:6px 8px; flex-shrink:0;';
            del.onclick = () => { row.remove(); ensureRuleRow(); };
            row.appendChild(inp); row.appendChild(sel); row.appendChild(del);
            list.appendChild(row);
            inp.oninput = () => {
                const rows = list.children;
                if (inp.value.trim() && rows.length && rows[rows.length - 1] === row) addRuleRow('', 'direct');
            };
            return row;
        }
        function renderRulesList(arr) {
            const list = document.getElementById('rulesList');
            if (!list) return;
            list.innerHTML = '';
            const items = (Array.isArray(arr) && arr.length) ? arr : [null];
            items.forEach(x => addRuleRow(x ? x.d : '', x ? x.a : 'direct'));
        }
        function ensureRuleRow() {
            const list = document.getElementById('rulesList');
            if (list && !list.children.length) addRuleRow('', 'direct');
        }
        function collectRules() {
            const out = [];
            document.querySelectorAll('#rulesList .rule-domain').forEach((inp) => {
                const d = inp.value.trim().replace(/^https?:\\/\\//i, '').replace(/\\/.*$/, '').replace(/^www\\./i, '');
                if (!d || /\\s|\\//.test(d)) return;
                const row = inp.parentElement;
                const a = row.querySelector('.rule-action').value;
                out.push({ d: d.toLowerCase(), a: a === 'proxy' ? 'proxy' : 'direct' });
            });
            return JSON.stringify(out);
        }
        function toggleNodeDetail(btn) {
            const card = btn.closest('.emby-card');
            const d = card.querySelector('.node-detail');
            const show = d.style.display === 'none';
            d.style.display = show ? 'flex' : 'none';
            btn.classList.toggle('rotated', show);
            btn.title = show ? '收起' : '展开详情';
        }
        // ============ 节点申请(订阅者提交 / 管理员审核) ============
        let NODE_REQS = [];
        async function loadNodeReqs() {
            try {
                const res = await fetch('/api/node-requests');
                const d = await res.json();
                NODE_REQS = d.success ? (d.requests || []) : [];
            } catch (e) { NODE_REQS = []; }
            const badge = document.getElementById('nodeReqBadge');
            if (badge) { badge.style.display = NODE_REQS.length ? 'inline-flex' : 'none'; badge.textContent = NODE_REQS.length > 99 ? '99+' : String(NODE_REQS.length); }
        }
        function openNodeReqModal() {
            document.getElementById('nodeReqModal').style.display = 'block';
            renderNodeReqs();
        }
        function closeNodeReqModal() { document.getElementById('nodeReqModal').style.display = 'none'; }
        function parseReqUrls(v) { try { const a = JSON.parse(v); if (Array.isArray(a)) return a.map(String); } catch (e) {} return v ? [String(v)] : []; }
        function renderNodeReqs() {
            const box = document.getElementById('nodeReqList');
            if (!box) return;
            if (!NODE_REQS.length) { box.innerHTML = '<div style="text-align:center; color:var(--text-sec); font-size:14px; padding:30px;">暂无节点申请</div>'; return; }
            box.innerHTML = NODE_REQS.map(r => {
                const urls = parseReqUrls(r.url);
                return '<div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:12px 14px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">' +
                '<div style="flex:1; min-width:200px;">' +
                    '<div style="font-weight:600; font-size:14px;">' + escHtml(r.name) + '</div>' +
                    '<div style="font-size:12px; color:var(--text-sec); word-break:break-all; line-height:1.7;">' + urls.map(u => '• ' + escHtml(u)).join('<br>') + '</div>' +
                    '<div style="font-size:11px; color:var(--text-faint); margin-top:2px;">' + escHtml(r.created_at || '') + '</div>' +
                '</div>' +
                '<button class="btn-submit" onclick="approveNodeReq(' + r.id + ')" style="padding:7px 14px; font-size:13px;">${I.check} 同意</button>' +
                '<button class="btn-ghost" onclick="rejectNodeReq(' + r.id + ')" style="padding:7px 14px; font-size:13px;">${I.xmark} 拒绝</button>' +
                '</div>';
            }).join('');
        }
        async function approveNodeReq(id) {
            try {
                const res = await fetch('/api/node-requests/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'approve' }) });
                const d = await res.json();
                if (!d.success) return showToast('❌ ' + (d.error || '审批失败'));
                closeNodeReqModal();
                location.href = '/?prefill=1&name=' + encodeURIComponent(d.data.name) + '&urls=' + encodeURIComponent(JSON.stringify(parseReqUrls(d.data.url)));
            } catch (e) { showToast('❌ 审批失败: ' + e.message); }
        }
        async function rejectNodeReq(id) {
            try {
                const res = await fetch('/api/node-requests/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'reject' }) });
                const d = await res.json();
                if (!d.success) return showToast('❌ ' + (d.error || '取消失败'));
                showToast('🗑️ 已拒绝该申请');
                await loadNodeReqs();
                renderNodeReqs();
            } catch (e) { showToast('❌ 取消失败: ' + e.message); }
        }
        function resetSubReqUrls() {
            const box = document.getElementById('subReqUrlBox');
            if (!box) return;
            box.innerHTML = '<input type="url" class="sub-req-url" placeholder="主线路地址（如: https://1.1.1.1:8096）" oninput="handleSubReqUrls()" style="width:100%;"><input type="url" class="sub-req-url" placeholder="备用线路 1（选填，可继续添加）" oninput="handleSubReqUrls()" style="width:100%;">';
        }
        function handleSubReqUrls() {
            const container = document.getElementById('subReqUrlBox');
            if (!container) return;
            const inputs = container.querySelectorAll('.sub-req-url');
            const lastInput = inputs[inputs.length - 1];
            if (lastInput && lastInput.value.trim() !== '') {
                const n = document.createElement('input');
                n.type = 'url'; n.className = 'sub-req-url';
                n.placeholder = '备用线路 ' + inputs.length + '（选填，可继续添加）';
                n.style = 'width:100%;';
                n.oninput = handleSubReqUrls;
                container.appendChild(n);
            }
            let emptyCount = 0;
            const all = container.querySelectorAll('.sub-req-url');
            for (let i = all.length - 1; i >= 0; i--) { if (all[i].value.trim() === '') { emptyCount++; if (emptyCount > 1) all[i].remove(); } else break; }
        }
        function openSubReqModal() {
            document.getElementById('subReqModal').style.display = 'block';
            const nm = document.getElementById('subReqName'); if (nm) nm.value = '';
            resetSubReqUrls();
            const hint = document.getElementById('subReqHint'); if (hint) hint.innerHTML = '提交后管理员审核；线路已存在会直接提示你，同线路的新申请会自动覆盖旧申请（含全部备用线路）。';
        }
        function closeSubReqModal() { document.getElementById('subReqModal').style.display = 'none'; }
        async function submitNodeReq() {
            const name = document.getElementById('subReqName').value.trim();
            const urls = [];
            document.querySelectorAll('.sub-req-url').forEach(inp => { const v = inp.value.trim(); if (v) urls.push(v); });
            if (!name || !urls.length) return showToast('⚠️ 请填写节点名字与至少一条线路地址');
            const hint = document.getElementById('subReqHint');
            try {
                const res = await fetch('/api/node-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, urls }) });
                const d = await res.json();
                if (d.success) {
                    if (d.replaced) {
                        hint.innerHTML = '<span style="color:#00c2ff;">🔄 同线路已有申请「' + escHtml(d.name) + '」，已自动替换为你提交的新申请（含全部备用线路）</span>';
                    } else {
                        hint.innerHTML = '<span style="color:var(--success);">✅ 申请已提交，等待管理员审核</span>';
                        document.getElementById('subReqName').value = ''; resetSubReqUrls();
                    }
                } else if (d.exists) {
                    hint.innerHTML = '<span style="color:#ff9f0a;">⚠️ 该线路已存在节点「' + escHtml(d.remark) + '」，访问后缀 /' + escHtml(d.prefix) + '，无需重复申请</span>';
                } else {
                    hint.innerHTML = '<span style="color:#ff6b6b;">❌ ' + escHtml(d.error || '提交失败') + '</span>';
                }
            } catch (e) { hint.innerHTML = '<span style="color:#ff6b6b;">❌ ' + escHtml(e.message) + '</span>'; }
        }
        // 管理员点「同意」跳转回来:自动打开添加节点并预填线路/名字
        (function prefillFromApproval() {
            try {
                const qp = new URLSearchParams(location.search);
                if (qp.get('prefill') !== '1') return;
                openNodeModal();
                const nm = document.getElementById('remark'); if (nm) nm.value = qp.get('name') || '';
                let urls = [];
                try { const a = JSON.parse(qp.get('urls') || '[]'); if (Array.isArray(a)) urls = a.map(String); } catch (e) {}
                if (!urls.length && qp.get('url')) urls = [qp.get('url')];
                if (urls.length) {
                    let idx = 0;
                    const setNext = (u) => {
                        const inputs = document.querySelectorAll('.target-input');
                        if (inputs[idx]) { inputs[idx].value = u; }
                        else { handleTargetInputs(); const ins2 = document.querySelectorAll('.target-input'); if (ins2[idx]) ins2[idx].value = u; }
                        idx++;
                    };
                    urls.forEach(setNext);
                    handleTargetInputs();
                }
                showToast('✅ 已从申请预填，请修改名字/后缀后保存');
                history.replaceState(null, '', location.pathname);
            } catch (e) {}
        })();

        function openNodeModal() {
            const f = document.getElementById('addForm');
            f.reset();
            document.getElementById('oldPrefix').value='';
            selectIcon('','默认');
            document.getElementById('nodeCache').checked=true;
            document.getElementById('nodeRedirectDirect').checked=false;
            document.getElementById('nodeRulesEnable').checked=false;
            renderRulesList([]);
            toggleEmosFields();
            document.getElementById('submitBtn').textContent='保存部署';
            document.getElementById('nodeModalTitle').textContent='添加节点';
            document.getElementById('nodeModal').style.display='block';
        }
        function closeNodeModal() {
            document.getElementById('nodeModal').style.display='none';
        }

        function openImportModal(prefix) {
            const r = (window.globalRoutesData || []).find(x => x.prefix === prefix) || {};
            document.getElementById('impPrefix').value = prefix || '';
            document.getElementById('impName').value = r.remark || r.prefix || '';
            document.getElementById('impUser').value = r.node_user || '';
            document.getElementById('impPass').value = r.node_pass || '';
            document.getElementById('importModal').style.display = 'block';
        }
        function buildImpLink(which) {
            const scheme = location.protocol.replace(':', '');
            const host = location.hostname;
            const port = location.port || (scheme === 'https' ? '443' : '80');
            const prefix = String(document.getElementById('impPrefix').value || '').trim();
            const name = String(document.getElementById('impName').value || '').trim() || prefix;
            const username = encodeURIComponent(String(document.getElementById('impUser').value || '').trim());
            const password = encodeURIComponent(String(document.getElementById('impPass').value || '').trim());
            const path = prefix ? '/' + prefix : '';
            const address = scheme + '://' + host + path;
            if (which === 'sen') return 'senplayer://importserver?type=emby&name=' + encodeURIComponent(name) + '&address=' + encodeURIComponent(address) + '&username=' + username + '&password=' + password;
            if (which === 'rex') return 'rex://import?type=emby&scheme=' + scheme + '&host=' + host + path + '&port=' + port + '&username=' + username + '&password=' + password + '&title=' + encodeURIComponent(name);
            return 'hills://import?type=emby&scheme=' + scheme + '&host=' + host + path + '&port=' + port + '&username=' + username + '&password=' + password;
        }
        function openImpLink(which) {
            const link = buildImpLink(which);
            if (!link) return;
            window.location.href = link;
        }
        function closeImpModal() { document.getElementById('importModal').style.display = 'none'; }

        // ============ 手动覆盖/更新 弹窗 ============
        function openCodeModal(mode) {
            const modal = document.getElementById('codeModal');
            const area = document.getElementById('codeArea');
            const file = document.getElementById('fileInput');
            if (mode === 'file') {
                area.style.display = 'none';
                file.style.display = 'block';
            } else {
                area.style.display = 'block';
                file.style.display = 'none';
            }
            modal.style.display = 'block';
        }
        function closeCodeModal() {
            document.getElementById('codeModal').style.display = 'none';
        }

        // ============ Worker 调度/区域 弹窗 ============
        function openPlacementModal() {
            document.getElementById('placementModal').style.display = 'block';
        }
        function closePlacementModal() {
            document.getElementById('placementModal').style.display = 'none';
        }

        // ============ 账户设置 弹窗 ============
        // ============ 自定义头像（左上角 / 登录页 / favicon） ============
        const DEFAULT_LOGO = '${EMBY_LOGO}';
        function applyLogo(v) {
            if (!v) return;
            const imgs = document.querySelectorAll('.topbar-logo, .login-logo');
            imgs.forEach(function (im) { im.src = v; });
            const fav = document.querySelector('link[rel="icon"]');
            if (fav) fav.href = v;
        }
        async function loadLogo() {
            try {
                const res = await fetch('/api/logo');
                const d = await res.json();
                if (d.success && d.logo && d.logo.value) {
                    applyLogo(d.logo.value);
                    const preview = document.getElementById('logoPreview');
                    if (preview) preview.src = d.logo.value;
                    if (d.logo.type === 'url') document.getElementById('logoUrlInput').value = d.logo.value;
                } else {
                    const preview = document.getElementById('logoPreview');
                    if (preview) preview.src = DEFAULT_LOGO;
                    document.getElementById('logoUrlInput').value = '';
                }
            } catch (e) { console.error(e); }
        }
        function readLogoFile(file) {
            if (!file) return;
            if (!/^image\\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) { alert('仅支持 png / jpg / webp / gif 图片'); return; }
            if (file.size > 5 * 1024 * 1024) { alert('图片超过 5MB，请换更小的图片'); return; }
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = function () {
                    try {
                        const MAX = 256;
                        let w = img.width, h = img.height;
                        if (w > MAX || h > MAX) {
                            const ratio = Math.min(MAX / w, MAX / h);
                            w = Math.max(1, Math.round(w * ratio)); h = Math.max(1, Math.round(h * ratio));
                        }
                        const cv = document.createElement('canvas');
                        cv.width = w; cv.height = h;
                        const cx = cv.getContext('2d');
                        cx.drawImage(img, 0, 0, w, h);
                        const isPng = /^image\\/(png|webp|gif)$/i.test(file.type);
                        let dataUrl = cv.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.88);
                        if (!isPng && dataUrl.length > 180000) {
                            const alt = cv.toDataURL('image/png');
                            if (alt.length < dataUrl.length) dataUrl = alt;
                        }
                        if (dataUrl.length > 580000) { alert('压缩后图片仍过大（>450KB），请换更简单的图片'); return; }
                        window.__logoPending = { type: 'data', value: dataUrl };
                        document.getElementById('logoUrlInput').value = '';
                        document.getElementById('logoPreview').src = dataUrl;
                    } catch (err) { alert('图片处理失败：' + err.message); }
                };
                img.onerror = function () { alert('图片解析失败，请换一张'); };
                img.src = e.target.result;
            };
            reader.onerror = function () { alert('读取文件失败'); };
            reader.readAsDataURL(file);
        }
        async function saveLogo() {
            let payload;
            if (window.__logoPending) payload = window.__logoPending;
            else {
                const url = document.getElementById('logoUrlInput').value.trim();
                if (!url) { alert('请先上传图片或填写图片 URL'); return; }
                if (!/^https?:\\/\\//i.test(url)) { alert('URL 需以 http(s):// 开头'); return; }
                payload = { type: 'url', value: url };
            }
            const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo: payload }) });
            const data = await res.json();
            if (data.success) {
                window.__logoPending = null;
                applyLogo(payload.value);
                showToast('✅ 自定义头像已保存');
            } else alert('保存失败：' + (data.error || ''));
        }
        async function resetLogo() {
            const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo: null }) });
            const data = await res.json();
            if (data.success) {
                window.__logoPending = null;
                document.getElementById('logoUrlInput').value = '';
                document.getElementById('logoPreview').src = DEFAULT_LOGO;
                applyLogo(DEFAULT_LOGO);
                showToast('已恢复默认头像');
            } else alert('恢复失败：' + (data.error || ''));
        }
        function openAccountModal() {
            const modal = document.getElementById('accountModal');
            modal.style.display = 'block';
            const sp = document.getElementById('accountSubPanel');
            if (window.ROLE === 'sub') {
                document.getElementById('accountAdminPanel').style.display = 'none';
                if (sp) { sp.style.display = 'block'; sp.innerHTML = '👤 当前为订阅用户模式，仅可查看节点，无任何修改权限。'; }
            } else if (window.ROLE === 'subadmin') {
                document.getElementById('accountAdminPanel').style.display = 'none';
                if (sp) { sp.style.display = 'block'; sp.innerHTML = '👑 当前为子管理员模式：可查看节点，可审核（通过/拒绝）用户的节点添加申请并直接添加节点；但不能编辑/删除现有节点、测速、DNS 及任何其他管理操作。'; }
            } else {
                document.getElementById('accountAdminPanel').style.display = 'flex';
                if (sp) sp.style.display = 'none';
                loadSubscribers();
                loadPtState();
                loadPtHits();
                loadVersionPanel();
                loadSubadminStatus();
                loadAuditReqs();
                loadNoticeEditor();
                loadAdminLogs();
                loadLogo();
            }
        }
        function closeAccountModal() {
            document.getElementById('accountModal').style.display = 'none';
        }
        let PT = { enabled: false, key: '' };
        function entryUrl(prefix) {
            return 'https://' + window.location.host + '/' + (PT.enabled ? PT.key + '/' : '') + prefix;
        }
        function toggleIpGuardCard() {
            const b = document.getElementById('ipguardCardBody');
            const a = document.getElementById('ipguardCardArrow');
            if (!b) return;
            const open = b.style.display !== 'none';
            b.style.display = open ? 'none' : 'block';
            if (a) a.textContent = open ? '▶ 展开' : '▼ 收起';
        }
        // ============ IP 访问控制 ============
        async function loadIpGuard() {
            try {
                const res = await fetch('/api/ipguard');
                const d = await res.json();
                if (!d.success) return;
                document.querySelectorAll('input[name=ipgMode]').forEach(r => { r.checked = (r.value === d.mode); });
                document.getElementById('ipgIps').value = (d.ips || []).join('\\n');
                document.getElementById('ipgCountries').value = (d.countries || []).join('\\n');
                document.getElementById('ipgRedirect').value = d.redirect || '';
                document.getElementById('ipgCurrent').textContent = (d.currentIp || '-') + (d.currentCountry ? ' (' + d.currentCountry + ')' : '');
                IPG_TRUSTED = d.trusted || [];
                renderTrusted();
                if (d.blocked) {
                    document.getElementById('ipgBlockedIps').value = (d.blocked.ips || []).join('\\n');
                    document.getElementById('ipgBlockedRedirect').value = d.blocked.redirect || '';
                }
            } catch (e) {}
        }
        function ipgAddCurrent() {
            const cur = document.getElementById('ipgCurrent').textContent;
            const m = (cur || '').match(/\\d{1,3}(\\.\\d{1,3}){3}|[0-9a-fA-F:]+/);
            if (!m) return;
            const ta = document.getElementById('ipgIps');
            const list = ta.value.split('\\n').map(x => x.trim()).filter(Boolean);
            if (list.indexOf(m[0]) < 0) { list.push(m[0]); ta.value = list.join('\\n'); }
        }
        let IPG_TRUSTED = [];
        function renderTrusted() {
            const box = document.getElementById('ipgTrustedList');
            if (!box) return;
            if (!IPG_TRUSTED.length) { box.innerHTML = '<div style="font-size:12px; color:var(--text-sec); padding:4px 0;">暂无信任 IP</div>'; return; }
            box.innerHTML = IPG_TRUSTED.map(ip => '<div style="display:flex; align-items:center; justify-content:space-between; font-size:12px; padding:5px 8px; background:var(--bg); border-radius:6px; gap:8px;"><span style="word-break:break-all;">' + escHtml(ip) + '</span><button onclick="ipgTrustedDel(this)" data-ip="' + escHtml(ip) + '" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:13px;flex-shrink:0;" title="删除">✕</button></div>').join('');
        }
        function ipgTrustedDel(btn) {
            const ip = btn.getAttribute('data-ip');
            if (!ip) return;
            IPG_TRUSTED = IPG_TRUSTED.filter(x => x !== ip);
            renderTrusted();
        }
        function ipgTrustedAddOne() {
            const inp = document.getElementById('ipgTrustedAdd');
            const v = (inp.value || '').trim();
            if (!v) return;
            if (IPG_TRUSTED.indexOf(v) < 0) IPG_TRUSTED.push(v);
            inp.value = '';
            renderTrusted();
        }
        async function saveIpGuard() {
            const modeEl = document.querySelector('input[name=ipgMode]:checked');
            if (!modeEl) { alert('保存失败：未选中模式，请先展开 IP 访问控制卡片并选择模式'); return; }
            const mode = modeEl.value;
            const ips = document.getElementById('ipgIps').value.split('\\n').map(x => x.trim()).filter(Boolean);
            const countries = document.getElementById('ipgCountries').value.split('\\n').map(x => x.trim().toUpperCase()).filter(Boolean);
            const redirect = document.getElementById('ipgRedirect').value.trim();
            const blockedIps = document.getElementById('ipgBlockedIps').value.split('\\n').map(x => x.trim()).filter(Boolean);
            const blockedRedirect = document.getElementById('ipgBlockedRedirect').value.trim();
            try {
                const res = await fetch('/api/ipguard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, ips, countries, redirect, trusted: IPG_TRUSTED, blockedIps, blockedRedirect }) });
                const d = await res.json();
                if (d.success) showToast('IP 访问控制已保存'); else alert('保存失败: ' + (d.error || ''));
            } catch (e) { alert('保存失败: ' + e); }
        }
        async function loadPtState() {
            try {
                const res = await fetch('/api/proxytoken');
                const data = await res.json();
                if (data.success) PT = { enabled: !!data.enabled, key: data.key || '' };
            } catch (e) {}
            const on = document.getElementById('ptOn');
            if (on) on.checked = PT.enabled;
            const k = document.getElementById('ptKey');
            if (k) k.value = PT.key || '';
            await loadSecurityState();
            await loadNotifyState();
        }
        // ============ 安全设置:裸域名直连代理开关 ============
        async function loadSecurityState() {
            try {
                const res = await fetch('/api/security');
                const d = await res.json();
                const el = document.getElementById('bareProxyChk');
                if (el && d.success) el.checked = !!d.bareProxy;
            } catch (e) {}
        }
        async function saveSecuritySettings() {
            const el = document.getElementById('bareProxyChk');
            if (!el) return;
            try {
                const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bareProxy: el.checked }) });
                const d = await res.json();
                if (d.success) showToast('✅ 安全设置已保存'); else alert('保存失败: ' + (d.error || ''));
            } catch (e) { alert('保存失败: ' + e); }
        }
        async function loadNotifyState() {
            try {
                const res = await fetch('/api/account/notify');
                const data = await res.json();
                if (data.success) {
                    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
                    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v !== false; };
                    set('barkKey', data.barkKey);
                    set('barkLevel', data.barkLevel || 'active');
                    set('barkServer', data.barkServer || 'https://api.day.app');
                    setChk('barkNotify', data.barkNotify);
                    set('tgToken', data.tgToken);
                    set('tgChatId', data.tgChatId);
                    setChk('tgNotify', data.tgNotify);
                }
            } catch (e) {}
        }
        async function saveNotifySettings() {
            const barkKey = document.getElementById('barkKey').value.trim();
            const barkLevel = document.getElementById('barkLevel').value;
            const barkServer = document.getElementById('barkServer').value.trim();
            const barkNotify = document.getElementById('barkNotify').checked;
            const tgToken = document.getElementById('tgToken').value.trim();
            const tgChatId = document.getElementById('tgChatId').value.trim();
            const tgNotify = document.getElementById('tgNotify').checked;
            const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notify: { barkKey, barkLevel, barkServer, barkNotify, tgToken, tgChatId, tgNotify } }) });
            const data = await res.json();
            if (data.success) { showToast('保号通知设置已保存'); closeAccountModal(); }
            else alert('保存失败：' + (data.error || ''));
        }
        async function testNotifyFn(type) {
            const res = await fetch('/api/test-notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
            const data = await res.json();
            alert(data.success ? '测试通知发送成功' : ('发送失败：' + (data.error || '')));
        }
        async function saveProxyToken() {
            const enabled = document.getElementById('ptOn').checked;
            const key = document.getElementById('ptKey').value.trim();
            if (enabled && !/^[A-Za-z0-9]{3,32}$/.test(key)) { alert('密钥需 3-32 位字母数字'); return; }
            if (enabled && ['entry','api','catch','speedtest','__client_rtt__','favicon.ico'].indexOf(key.toLowerCase()) >= 0) { alert('该密钥已被系统保留占用（如 entry），请更换'); return; }
            const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxyToken: { enabled, key } }) });
            const data = await res.json();
            if (data.success) {
                closeAccountModal();
                const tip = enabled
                    ? '反代 Token 已开启，所有节点直达链接将带上前缀 /' + key + '/，旧链接全部失效，请重新获取并分发新链接。'
                    : '反代 Token 已关闭，所有节点直达链接已恢复无前缀访问。';
                alert(tip);
                // 链接前缀变化影响所有节点直达链接，提醒后整页刷新，避免旧链接残留
                window.location.reload();
            } else alert('保存失败：' + (data.error || ''));
        }
        function fmtHitTs(ts) {
            const d = new Date(ts + 8 * 3600000);
            return String(d.getUTCFullYear()).slice(2) + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
        }
        async function loadPtHits() {
            const box = document.getElementById('ptHits');
            try {
                const res = await fetch('/api/proxytoken/hits');
                const data = await res.json();
                const hits = (data && data.hits) || [];
                if (!hits.length) { box.innerHTML = '<span style="color:var(--text-sec);">暂无记录</span>'; return; }
                box.innerHTML = hits.map(h => '<div style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--bg);">'
                    + '<div style="color:var(--text);font-weight:600;font-size:13px;">' + escHtml(h.ip) + ' <span style="color:var(--primary);font-weight:700;">×' + (h.times || 1) + '</span></div>'
                    + '<div style="color:var(--text-sec);font-size:12px;word-break:break-all;margin-top:2px;">' + escHtml(h.path || '') + '</div>'
                    + '<div style="color:var(--text-sec);font-size:11px;margin-top:2px;">' + fmtHitTs(h.ts || 0) + ' · ' + escHtml(String(h.ua || '').slice(0, 70)) + '</div></div>'
                ).join('') + '<button class="btn-ghost" style="margin-top:6px;font-size:12px;" onclick="clearPtHits()">' + (I.trash || '清除') + ' 清空记录</button>';
            } catch (e) { box.innerHTML = '<span style="color:var(--text-sec);">加载失败</span>'; }
        }
        async function clearPtHits() {
            const res = await fetch('/api/proxytoken/hits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clear: true }) });
            const data = await res.json();
            if (data.success) { showToast('已清空来访记录'); loadPtHits(); }
            else alert('清空失败');
        }
        function escHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        }
        async function saveAdminPass() {
            const pw = document.getElementById('newAdminPass').value.trim();
            if (!pw || pw.length < 4) { alert('密码至少 4 位'); return; }
            if (!confirm('确定将网页登录密码修改为「' + pw + '」？\\n\\n注意：Worker 变量 ADMIN_TOKEN 仍为最高权限，永久有效。')) return;
            const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
            const data = await res.json();
            if (data.success) { showToast('密码已更新'); document.getElementById('newAdminPass').value = ''; }
            else alert('修改失败：' + (data.error || ''));
        }
        // ============ 子管理员 ============
        async function loadSubadminStatus() {
            try {
                const res = await fetch('/api/account/subadmin-status');
                const d = await res.json();
                const el = document.getElementById('subadminStatus');
                if (!el) return;
                if (d.success && d.enabled) el.innerHTML = '<span style="color:var(--success);">🟢 已设置子管理员密码</span>，子管理员可在登录页输入该密码进入（查看节点 + 审核/添加节点，不能编辑/删除/测速/DNS）';
                else el.innerHTML = '<span style="color:var(--text-faint);">⚪ 未设置子管理员密码</span>，子管理员暂时无法登录';
            } catch (e) {}
        }
        async function saveSubadminPass() {
            const v = document.getElementById('newSubadminPass').value.trim();
            if (v && v.length < 4) return showToast('⚠️ 子管理员密码至少 4 位');
            if (v && !confirm('确定将子管理员密码设置为「' + v + '」？')) return;
            if (!v && !confirm('确定清除子管理员密码？')) return;
            try {
                const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subadminPass: v }) });
                const d = await res.json();
                if (!d.success) return showToast('❌ ' + (d.error || '保存失败'));
                showToast(v ? '✅ 子管理员密码已设置' : '🗑️ 已清除子管理员密码');
                document.getElementById('newSubadminPass').value = '';
                loadSubadminStatus();
            } catch (e) { showToast('❌ 保存失败: ' + e.message); }
        }
        // ============ 公告(单条覆盖,子管理员/订阅用户每次进面板必看,3 秒后可关闭) ============
        async function saveNotice() {
            const v = document.getElementById('noticeText').value.trim();
            if (v && !confirm('确定发布公告？发布后旧公告自动作废，子管理员与订阅用户每次进入面板都会看到（需停留 3 秒后才能关闭）。')) return;
            if (!v && !confirm('确定清除公告？')) return;
            try {
                const res = await fetch('/api/notice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: v }) });
                const d = await res.json();
                if (!d.success) return showToast('❌ ' + (d.error || '保存失败'));
                showToast(v ? '📢 公告已发布' : '🗑️ 公告已清除');
            } catch (e) { showToast('❌ 保存失败: ' + e.message); }
        }
        async function loadNoticeEditor() {
            try {
                const res = await fetch('/api/notice');
                const d = await res.json();
                const el = document.getElementById('noticeText');
                if (el) el.value = d.success ? (d.text || '') : '';
            } catch (e) {}
        }
        async function checkNotice() {
            if (window.ROLE === 'admin') return;
            try {
                const res = await fetch('/api/notice');
                const d = await res.json();
                if (!d.success || !d.text) return;
                const body = document.getElementById('noticeBody');
                const modal = document.getElementById('noticeModal');
                if (!body || !modal) return;
                body.innerText = d.text;
                modal.style.display = 'block';
                const btn = document.getElementById('noticeCloseBtn');
                btn.disabled = true; btn.style.opacity = '.55'; btn.style.cursor = 'not-allowed'; btn.textContent = '我知道了 (3s)';
                let t = 3;
                const timer = setInterval(() => {
                    t--;
                    if (t <= 0) { clearInterval(timer); btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; btn.textContent = '我知道了'; }
                    else btn.textContent = '我知道了 (' + t + 's)';
                }, 1000);
            } catch (e) {}
        }
        function closeNotice() {
            const modal = document.getElementById('noticeModal');
            if (modal) modal.style.display = 'none';
        }
        // ============ 申请记录审计:近 7 天 IP/设备,可按名字/线路搜索 ============
        function uaParse(ua) {
            if (!ua) return '未知设备';
            let os = '其他';
            if (/iPhone/.test(ua)) os = 'iPhone';
            else if (/iPad/.test(ua)) os = 'iPad';
            else if (/Android/.test(ua)) os = 'Android';
            else if (/Windows/.test(ua)) os = 'Windows';
            else if (/Mac OS X/.test(ua)) os = 'macOS';
            else if (/Linux/.test(ua)) os = 'Linux';
            let br = '其他';
            if (ua.indexOf('Edg/') >= 0) br = 'Edge';
            else if (ua.indexOf('OPR/') >= 0 || ua.indexOf('Opera') >= 0) br = 'Opera';
            else if (ua.indexOf('Firefox/') >= 0) br = 'Firefox';
            else if (ua.indexOf('SamsungBrowser') >= 0) br = 'Samsung';
            else if (ua.indexOf('MicroMessenger') >= 0) br = '微信内置';
            else if (ua.indexOf('Chrome/') >= 0) br = 'Chrome';
            else if (ua.indexOf('Safari/') >= 0) br = 'Safari';
            return os + ' · ' + br;
        }
        let AUDIT_REQS = [];
        let auditReqTimer = null;
        async function loadAuditReqs() {
            try {
                const q = (document.getElementById('auditReqQ') || {}).value || '';
                const res = await fetch('/api/node-requests/audit?q=' + encodeURIComponent(q));
                const d = await res.json();
                AUDIT_REQS = d.success ? (d.requests || []) : [];
            } catch (e) { AUDIT_REQS = []; }
            renderAuditReqs();
        }
        function auditReqSearch(v) {
            clearTimeout(auditReqTimer);
            auditReqTimer = setTimeout(loadAuditReqs, 400);
        }
        // 账户设置内区块收起/展开(申请记录/保号通知/修改密码/子管理员,默认收起防误触)
        function tgSetSec(id) {
            const b = document.getElementById('setSec-' + id);
            if (!b) return;
            const open = b.style.display !== 'none';
            b.style.display = open ? 'none' : '';
            const arr = document.getElementById('setSecArr-' + id);
            if (arr) arr.textContent = open ? '▸' : '▾';
        }
        // 一键封禁:把申请记录的 IP 加入最高黑名单(仅管理员;子管理员审核时无此能力)
        async function blockIp(ip) {
            if (window.ROLE !== 'admin') return showToast('⚠️ 仅管理员可封禁 IP');
            if (!ip) return showToast('⚠️ 该申请没有记录到 IP，无法封禁');
            if (!confirm('确定将 IP「' + ip + '」加入最高黑名单？\\n\\n该 IP 无论当前是什么模式(白名单/黑名单/关闭)都会被拦截，优先于最高白名单。')) return;
            try {
                const res = await fetch('/api/ipguard/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) });
                const d = await res.json();
                if (!d.success) return showToast('❌ ' + (d.error || '封禁失败'));
                showToast('🚫 已封禁 ' + ip + '（最高黑名单，任何模式拦截）');
            } catch (e) { showToast('❌ 封禁失败: ' + e.message); }
        }
        function renderAuditReqs() {
            const box = document.getElementById('auditReqList');
            if (!box) return;
            if (!AUDIT_REQS.length) { box.innerHTML = '<div style="text-align:center; padding:16px 0;">近 7 天暂无申请记录</div>'; return; }
            box.innerHTML = AUDIT_REQS.map(r => {
                const urls = parseReqUrls(r.url);
                const dev = uaParse(r.ua || '');
                const st = r.status === 'approved' ? '<span style="color:var(--success);">✅ 已批准</span>' : (r.status === 'pending' ? '<span style="color:#ff9f0a;">⏳ 待审</span>' : '<span style="color:var(--text-faint);">🗑️ 已拒</span>');
                return '<div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:10px 12px;">' +
                    '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
                        '<span style="font-weight:600; color:var(--text); font-size:13px;">' + escHtml(r.name) + '</span>' +
                        st +
                        '<span style="color:var(--text-faint); margin-left:auto; font-size:11px;">' + escHtml((r.created_at || '').replace('T', ' ').slice(0, 16)) + '</span>' +
                    '</div>' +
                    '<div style="font-size:12px; color:var(--text-sec); word-break:break-all; line-height:1.6; margin-top:4px;">' + urls.map(u => '• ' + escHtml(u)).join('<br>') + '</div>' +
                    '<div style="font-size:12px; margin-top:5px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">' +
                        '<span style="color:#ff9f0a; font-weight:600;">🌐 ' + escHtml(r.ip || '无IP') + '</span>' +
                        (r.ip ? '<button onclick="blockIp(\\'' + escHtml(r.ip) + '\\')" style="background:rgba(255,107,107,.12); border:1px solid rgba(255,107,107,.4); color:#ff6b6b; padding:3px 10px; border-radius:8px; font-size:12px; cursor:pointer;" title="加入最高黑名单,任何模式都拦截">🚫 封禁此 IP</button>' : '') +
                        '<span style="color:var(--text-sec);">📱 ' + escHtml(dev) + '</span>' +
                        '<span style="color:var(--text-faint);">👤 ' + escHtml(r.user || '') + '</span>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        // ============ 成员添加节点记录:子管理员/已授权订阅用户直接添加节点时记录 IP/设备(近 7 天,可搜索,可一键封禁) ============
        let ADMIN_LOGS = [];
        let adminLogTimer = null;
        async function loadAdminLogs() {
            try {
                const q = (document.getElementById('adminLogQ') || {}).value || '';
                const res = await fetch('/api/admin-node-logs?q=' + encodeURIComponent(q));
                const d = await res.json();
                ADMIN_LOGS = d.success ? (d.logs || []) : [];
            } catch (e) { ADMIN_LOGS = []; }
            renderAdminLogs();
        }
        function adminLogSearch(v) {
            clearTimeout(adminLogTimer);
            adminLogTimer = setTimeout(loadAdminLogs, 400);
        }
        function renderAdminLogs() {
            const box = document.getElementById('adminLogList');
            if (!box) return;
            if (!ADMIN_LOGS.length) { box.innerHTML = '<div style="text-align:center; padding:16px 0;">近 7 天暂无成员添加节点记录</div>'; return; }
            box.innerHTML = ADMIN_LOGS.map(r => {
                const urls = parseReqUrls(r.url);
                const dev = uaParse(r.ua || '');
                const actor = r.actor === 'sub' ? '订阅用户' : '子管理员';
                return '<div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:10px 12px;">' +
                    '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
                        '<span style="font-weight:600; color:var(--text); font-size:13px;">' + escHtml(r.name) + '</span>' +
                        '<span style="color:var(--text-faint); font-size:11px; font-family:monospace;">/' + escHtml(r.prefix || '') + '</span>' +
                        '<span style="color:var(--text-faint); margin-left:auto; font-size:11px;">' + escHtml((r.created_at || '').replace('T', ' ').slice(0, 16)) + '</span>' +
                    '</div>' +
                    '<div style="font-size:12px; color:var(--text-sec); word-break:break-all; line-height:1.6; margin-top:4px;">' + urls.map(u => '• ' + escHtml(u)).join('<br>') + '</div>' +
                    '<div style="font-size:12px; margin-top:5px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">' +
                        '<span style="color:#ff9f0a; font-weight:600;">🌐 ' + escHtml(r.ip || '无IP') + '</span>' +
                        (r.ip ? '<button onclick="blockIp(\\'' + escHtml(r.ip) + '\\')" style="background:rgba(255,107,107,.12); border:1px solid rgba(255,107,107,.4); color:#ff6b6b; padding:3px 10px; border-radius:8px; font-size:12px; cursor:pointer;" title="加入最高黑名单,任何模式都拦截">🚫 封禁此 IP</button>' : '') +
                        '<span style="color:var(--text-sec);">📱 ' + escHtml(dev) + '</span>' +
                        '<span style="color:var(--text-sec);">👤 ' + escHtml(actor) + '</span>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        async function loadSubscribers() {
            try {
                const res = await fetch('/api/subscribers');
                const data = await res.json();
                const list = data.subscribers || [];
                const canAdd = data.canAdd || [];
                const box = document.getElementById('subList');
                if (list.length === 0) {
                    box.innerHTML = '<div style="font-size:13px; color:var(--text-sec); padding:6px 0;">暂无订阅用户</div>';
                    return;
                }
                box.innerHTML = '';
                list.forEach(pw => {
                    box.innerHTML += '<div style="display:flex; align-items:center; gap:8px; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:8px 12px;">' +
                        '<span style="flex:1; font-family:monospace; font-size:13px;">' + pw + '</span>' +
                        '<label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; color:var(--text-sec); white-space:nowrap;" title="开通后该订阅用户可直接添加节点(无需审核),添加时会记录其 IP 与设备;未开通则看不到添加节点按钮">' +
                            '<input type="checkbox" class="ip-checkbox" data-pw="' + pw + '" ' + (canAdd.includes(pw) ? 'checked' : '') + ' onchange="setSubAdd(this)"> 可添加节点' +
                        '</label>' +
                        '<button class="icon-btn" onclick="delSubscriber(this)" data-pw="' + pw + '" title="删除">' + I.trash + '</button></div>';
                });
            } catch (e) { alert('加载订阅用户失败'); }
        }
        async function setSubAdd(checkbox) {
            const pw = checkbox.getAttribute('data-pw');
            const add = checkbox.checked;
            try {
                const res = await fetch('/api/subscribers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setAdd', password: pw, add }) });
                const data = await res.json();
                if (data.success) showToast(add ? '✅ 已开通「可添加节点」权限' : '已关闭「可添加节点」权限');
                else { checkbox.checked = !add; alert(data.error || '操作失败'); }
            } catch (e) { checkbox.checked = !add; alert('操作失败: ' + e.message); }
        }
        async function addSubscriber() {
            const pw = document.getElementById('newSubPass').value.trim();
            if (!pw || pw.length < 4) { alert('密码至少 4 位'); return; }
            const res = await fetch('/api/subscribers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', password: pw }) });
            const data = await res.json();
            if (data.success) { showToast('已添加订阅者'); document.getElementById('newSubPass').value = ''; loadSubscribers(); }
            else alert(data.error || '添加失败');
        }
        async function delSubscriber(btn) {
            const pw = btn.getAttribute('data-pw');
            if (!confirm('确定删除订阅者「' + pw + '」？')) return;
            const res = await fetch('/api/subscribers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'del', password: pw }) });
            const data = await res.json();
            if (data.success) { showToast('已删除'); loadSubscribers(); }
            else alert(data.error || '删除失败');
        }

        // ============ 角色识别与只读模式(订阅者/子管理员) ============
        async function initRole() {
            try {
                const res = await fetch('/api/me');
                const data = await res.json();
                window.ROLE = data.role || 'admin';
                window.CAN_ADD = !!data.canAdd;
            } catch (e) { window.ROLE = 'admin'; window.CAN_ADD = false; }
            if (window.ROLE === 'sub' || window.ROLE === 'subadmin') applySubMode();
            checkNotice();
        }
        function applySubMode() {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            // 订阅用户:隐藏添加节点表单的高级配置项(仅线路+名字+短路径),未开通添加权限则隐藏添加入口
            if (window.ROLE === 'sub') {
                document.querySelectorAll('.sub-lite').forEach(el => el.style.display = 'none');
                if (!window.CAN_ADD) {
                    const dc = document.getElementById('deploy-card');
                    if (dc) dc.style.display = 'none';
                }
            }
            const dockItems = document.querySelectorAll('.ds-dock-item');
            if (dockItems[1]) dockItems[1].style.display = 'none';
            if (dockItems[2]) dockItems[2].style.display = 'none';
            const speedView = document.getElementById('view-speed');
            if (speedView) speedView.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-sec);font-size:14px;">订阅用户无测速与 DNS 权限</div>';
            const setView = document.getElementById('view-settings');
            if (setView) setView.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-sec);font-size:14px;">订阅用户无设置权限</div>';
            // 子管理员:额外开放节点申请审核入口 + 添加节点入口(仍不能编辑/删除/测速/DNS)
            if (window.ROLE === 'subadmin') {
                const reqBtn = document.getElementById('nodeReqBtn');
                if (reqBtn) reqBtn.style.display = 'inline-flex';
                const deployCard = document.getElementById('deploy-card');
                if (deployCard) deployCard.style.display = '';
                loadNodeReqs();
            }
        }

        // 外部跳转直连 与 302/307 域名规则 互斥（可都关，不能同时开）
        {
            const rddEl = document.getElementById('nodeRedirectDirect');
            const rneEl = document.getElementById('nodeRulesEnable');
            if (rddEl) rddEl.addEventListener('change', () => { if (rddEl.checked && rneEl) rneEl.checked = false; });
            if (rneEl) rneEl.addEventListener('change', () => { if (rneEl.checked && rddEl) rddEl.checked = false; });
            if (rneEl) renderRulesList([]);
        }

        document.getElementById('addForm').onsubmit = async (e) => {
            e.preventDefault();
            const oldPrefix = document.getElementById('oldPrefix').value;
            const remark = document.getElementById('remark').value.trim();
            const prefix = document.getElementById('prefix').value.trim().replace(/^\\/+/g, '');
            const mode = document.getElementById('mode').value;
            const icon = document.getElementById('iconUrl').value;
            const cache_img = document.getElementById('nodeCache').checked ? 'on' : 'off';
            const fakeIp = document.getElementById('nodeFakeIp').value.trim();
            const watchLimit = document.getElementById('watchLimit').value.trim() || '0';
            const nodeUser = document.getElementById('nodeUser').value.trim();
            const nodePass = document.getElementById('nodePass').value.trim();
            const emosId = document.getElementById('nodeEmosId').value.trim();
            const emosName = document.getElementById('nodeEmosName').value.trim();
            const emosAggregate = document.getElementById('nodeEmosAggregate').checked ? 'on' : 'off';
            const redirect_direct = document.getElementById('nodeRedirectDirect').checked ? 'on' : 'off';
            let redirect_rules = '';
            if (document.getElementById('nodeRulesEnable').checked) redirect_rules = collectRules();

            const inputs = document.querySelectorAll('.target-input');
            let targetsArray = [];
            inputs.forEach(inp => {
                const val = inp.value.trim().replace(/\\/$/g, '');
                if (val) targetsArray.push(val);
            });
            const target = targetsArray.join(',');
            
            if (!target) return showToast('❌ 请至少填写一个主线路地址');

            try {
                const res = await fetch('/api/routes', { 
                    method: 'POST', 
                    body: JSON.stringify({oldPrefix, prefix, target, mode, remark, icon, cache_img, fakeIp, watchLimit, nodeUser, nodePass, redirect_direct, redirect_rules, emosId, emosName, emosAggregate})
                });
                const data = await res.json();
                if(!data.success) throw new Error(data.error || '部署失败');
                
                document.getElementById('addForm').reset();
                document.getElementById('oldPrefix').value = ''; 
                selectIcon('', '默认');
                document.getElementById('nodeCache').checked = true;
                document.getElementById('nodeRedirectDirect').checked = false;
                document.getElementById('nodeRulesEnable').checked = false;
                renderRulesList([]);
                document.getElementById('submitBtn').textContent = '保存部署'; 
                resetTargetInputs(); 
                
                showToast('✅ 节点部署成功');
                // 保存成功后自动关窗（编辑与新增一致）
                document.getElementById('nodeModal').style.display = 'none';
                load();
            } catch(err) {
                showToast('❌ 保存失败: ' + err.message);
            }
        };

        async function del(prefix) {
            if(confirm('确定删除节点 /' + prefix + ' ?')) {
                await fetch('/api/routes?prefix=' + prefix, { method: 'DELETE' });
                showToast('🗑️ 节点已移除');
                load();
            }
        }

        function toggleSelectAll() {
            const isChecked = document.getElementById('selectAll').checked;
            document.querySelectorAll('.row-checkbox').forEach(cb => {
                if(!cb.disabled) cb.checked = isChecked;
            });
        }
        function getSelectedIps() {
            const checkboxes = document.querySelectorAll('.row-checkbox:checked');
            return Array.from(checkboxes).map(cb => cb.value);
        }
        function batchTcpPing() {
            const rows = document.querySelectorAll('#testTableBody .test-row');
            let ips = [];
            rows.forEach(tr => {
                const strong = tr.querySelector('.ip-text');
                if (strong && strong.textContent) {
                    let ip = strong.textContent;
                    if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
                    ips.push(ip);
                }
            });
            if (ips.length === 0) return showToast('⚠️ 请先提取节点！');
            navigator.clipboard.writeText(ips.join('\\n')).then(() => {
                showToast('✅ 节点已复制，即将跳转 ITDog...');
                setTimeout(() => { window.open('https://www.itdog.cn/batch_tcping/', '_blank'); }, 1500);
            });
        }
        function directSubmitCname() {
            const input = document.getElementById('customIps').value.trim();
            if (!input) return showToast('⚠️ 请先在文本框内粘贴您的优选域名');
            const domainRegex = /\\b([a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,}\\b/g;
            const matchedDomains = input.match(domainRegex) || [];
            const realDomains = matchedDomains.filter(d => !/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(d));
            if (realDomains.length === 0) return showToast('⚠️ 没有提取到合法的域名格式，请检查输入！');
            if(!confirm(\` 提取到以下域名：\\n\${realDomains.join('\\n')}\\n\\n确定要直接将其设为 CNAME 记录吗？\\n(注意：这会清空你配置的域名下现有的记录)\`)) return;
            const btn = document.getElementById('btnDirectCname');
            sendDnsRequest(realDomains, btn);
        }
        async function testCustomIPs() {
            const input = document.getElementById('customIps').value;
            if (!input.trim()) return showToast('⚠️ 请先在输入框粘贴 IP 或优选域名');
            const ipv4Regex = /\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b/g;
            const ipv6Regex = /(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:)*:[A-F0-9]{1,4}(?::[A-F0-9]{1,4})*/gi;
            const domainRegex = /\\b([a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,}\\b/g;
            let matchedIPv4 = input.match(ipv4Regex) || [];
            let matchedIPv6 = input.match(ipv6Regex) || [];
            let matchedDomains = input.match(domainRegex) || [];
            matchedDomains = matchedDomains.filter(d => !/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(d));
            let extractedIps = [...matchedIPv4, ...matchedDomains];
            matchedIPv6.forEach(ip => {
                if (ip.length > 7 && ip.includes(':') && !ip.startsWith('::1')) { extractedIps.push(ip.startsWith('[') ? ip : \`[\${ip}]\`); }
            });
            extractedIps = [...new Set(extractedIps)];
            if (extractedIps.length === 0) return showToast('⚠️ 未识别到合法的 IP 或 域名格式');
            const btn = document.getElementById('btnTestCustom');
            const tbody = document.getElementById('testTableBody');
            btn.disabled = true; btn.textContent = '⏳ 测试中...';
            if(tbody.innerHTML.includes('暂无数据')) tbody.innerHTML = '';
            showToast(\`✅ 提取到 \${extractedIps.length} 个节点，开始测速校验\`);
            const promises = [];
            extractedIps.forEach(ip => {
                const tr = document.createElement('tr');
                tr.className = 'test-row';
                tr.innerHTML = \`
                    <td data-label="勾选节点" style="text-align: center;"><input type="checkbox" class="ip-checkbox row-checkbox" value="\${ip}"></td>
                    <td data-label="专属节点"><strong class="ip-text" style="color:var(--primary);cursor:pointer;font-family:monospace;" onclick="copyTxt('\${ip}')" title="点击复制">\${ip}</strong></td>
                    <td data-label="预估延迟" class="latency" data-ms="9999" style="font-weight: 600; color: #888;">测算中...</td>
                    <td data-label="连通状态" class="speed" style="color: #888;">-</td>
                    <td data-label="记录/归属地" class="loc" style="color: #666;">等待解析</td>
                    <td data-label="快捷操作"><button class="btn-dns" disabled onclick="updateSingleDns('\${ip}', this)">唯一解析</button></td>\`;
                tbody.insertBefore(tr, tbody.firstChild);
                promises.push(doLocalPing(ip, tr, '自定义节点'));
            });
            await Promise.all(promises);
            sortTableByLatency(tbody);
            document.querySelectorAll('.btn-dns').forEach(b => b.disabled = false);
            btn.disabled = false; btn.textContent = ' 测试粘贴节点';
            showToast('🎉 自定义节点测速完成！');
        }
        async function fetchCustomApiAndTest() {
            const apiUrl = document.getElementById('customApiUrl').value.trim();
            if (!apiUrl) return showToast('⚠️ 请先填入自定义 API 链接');
            const btn = document.getElementById('btnFetchCustomApi');
            const tbody = document.getElementById('testTableBody');
            const statusTxt = document.getElementById('statusText');
            btn.disabled = true; btn.textContent = '⏳ 拉取中...';
            statusTxt.innerHTML = \`正在从自定义 API 抓取数据...\`;
            if(tbody.innerHTML.includes('暂无数据')) tbody.innerHTML = ''; 
            try {
                const res = await fetch(\`/api/get-custom-api-ips?url=\${encodeURIComponent(apiUrl)}\`);
                const data = await res.json();
                if (!data.ips || data.ips.length === 0) { showToast('⚠️ 自定义 API 返回为空'); return; }
                showToast(\`✅ 提取 \${data.totalCount} 个节点，抽取 \${data.ips.length} 个测速\`);
                btn.textContent = ' 测速中...';
                const promises = [];
                data.ips.forEach(ip => {
                    const tr = document.createElement('tr');
                    tr.className = 'test-row';
                    tr.innerHTML = \`
                        <td data-label="勾选节点" style="text-align: center;"><input type="checkbox" class="ip-checkbox row-checkbox" value="\${ip}"></td>
                        <td data-label="专属节点"><strong class="ip-text" style="color:var(--primary);cursor:pointer;font-family:monospace;" onclick="copyTxt('\${ip}')" title="点击复制">\${ip}</strong></td>
                        <td data-label="预估延迟" class="latency" data-ms="9999" style="font-weight: 600; color: #888;">测算中...</td>
                        <td data-label="连通状态" class="speed" style="color: #888;">-</td>
                        <td data-label="记录/归属地" class="loc" style="color: #666;">等待解析</td>
                        <td data-label="快捷操作"><button class="btn-dns" disabled onclick="updateSingleDns('\${ip}', this)">唯一解析</button></td>\`;
                    tbody.insertBefore(tr, tbody.firstChild);
                    promises.push(doLocalPing(ip, tr, '自定义 API'));
                });
                await Promise.all(promises);
                sortTableByLatency(tbody);
                document.querySelectorAll('.btn-dns').forEach(b => b.disabled = false);
                document.getElementById('selectAll').checked = false;
                showToast('🎉 自定义 API 测速完成！');
                statusTxt.innerHTML = \`${I.check} 测速完毕！您可以自由组合更新 DNS。\`;
            } catch (err) { showToast('❌ 拉取失败'); } 
            finally { btn.disabled = false; btn.textContent = ' 拉取API并测速'; }
        }
        const PRESET_MAP = {
            'all': { name: '综合混合源(四源并发)', url: 'uouin + cf-speed-dns + 164746 + wetest 并发聚合' },
            'ehb-all': { name: '🌟 云枢全域融合(双栈)', url: 'https://ip.ehb.cc.cd/all?ips=100' },
            'ehb-cm': { name: '🚄 云枢移动起飞(IPv4)', url: 'https://ip.ehb.cc.cd/cm?ips=100' },
            'ehb-ct': { name: '⚡ 云枢电信美西(IPv4)', url: 'https://ip.ehb.cc.cd/ct?ips=100' },
            'ehb-cu': { name: '🚀 云枢联通极速(IPv4)', url: 'https://ip.ehb.cc.cd/cu?ips=100' },
            'ehb-104': { name: '🏯 104 大段全域池', url: 'https://ip.ehb.cc.cd/104?ips=100' },
            'ehb-10417': { name: '🚄 104.17 移动起飞段', url: 'https://ip.ehb.cc.cd/104.17?ips=100' },
            'ehb-10419': { name: '🛡️ 104.19 移动抗QoS段', url: 'https://ip.ehb.cc.cd/104.19?ips=100' },
            'ehb-10416': { name: '📻 104.16 经典老牌段', url: 'https://ip.ehb.cc.cd/104.16?ips=100' },
            'ehb-162': { name: '🏯 162 大段全域池', url: 'https://ip.ehb.cc.cd/162?ips=100' },
            'ehb-162159s': { name: '💎 162.159 SaaS/DoH段', url: 'https://ip.ehb.cc.cd/162.159-saas?ips=100' },
            'ehb-162159ct': { name: '⚡ 162.159 电信美西最稳段', url: 'https://ip.ehb.cc.cd/162.159-ct?ips=100' },
            'ehb-172': { name: '🏯 172 大段全域池', url: 'https://ip.ehb.cc.cd/172?ips=100' },
            'ehb-17264': { name: '🚀 172.64 联通/电信主力段', url: 'https://ip.ehb.cc.cd/172.64?ips=100' },
            'ehb-17267': { name: '🌐 172.67 动态反代段', url: 'https://ip.ehb.cc.cd/172.67?ips=100' },
            'ehb-198': { name: '🚀 198.41 联通天花板大段', url: 'https://ip.ehb.cc.cd/198?ips=100' },
            'ehb-108': { name: '🛡️ 108.162 三网兜底大段', url: 'https://ip.ehb.cc.cd/108?ips=100' },
            'ehb-v6': { name: '🌌 云枢 IPv6 全域星轨', url: 'https://ip.ehb.cc.cd/v6?ips=100' },
            'ehb-v6cm': { name: '📱 云枢移动 5G 直连', url: 'https://ip.ehb.cc.cd/v6-cm?ips=100' },
            'ehb-v6ct': { name: '⚡ 云枢电信 纯净美西', url: 'https://ip.ehb.cc.cd/v6-ct?ips=100' },
            'ehb-v6cu': { name: '🚀 云枢联通 欧洲/东京', url: 'https://ip.ehb.cc.cd/v6-cu?ips=100' },
            'ehb-2400': { name: '🌏 2400:cb00 亚太全域', url: 'https://ip.ehb.cc.cd/2400?ips=100' },
            'ehb-24002048': { name: '🇭🇰 2400.2048 香港近场段', url: 'https://ip.ehb.cc.cd/2400.2048?ips=100' },
            'ehb-2400400': { name: '⚡ 2400.400 亚太低跳数段', url: 'https://ip.ehb.cc.cd/2400.400?ips=100' },
            'ehb-24002049': { name: '🛡️ 2400.2049 亚太抗抖动段', url: 'https://ip.ehb.cc.cd/2400.2049?ips=100' },
            'ehb-2606': { name: '🌐 2606:4700 全球主干', url: 'https://ip.ehb.cc.cd/2606?ips=100' },
            'ehb-26063030': { name: '🏢 2606.3030 核心骨干段', url: 'https://ip.ehb.cc.cd/2606.3030?ips=100' },
            'ehb-26064700': { name: '👑 2606.4700 伴生特权段', url: 'https://ip.ehb.cc.cd/2606.4700?ips=100' },
            'ehb-2a06': { name: '🚄 2a06:98c0 欧洲特快大段', url: 'https://ip.ehb.cc.cd/2a06?ips=100' },
            'robberer': { name: '🌟 @robberer 专属', url: 'https://gh.xxooo.cf/https://raw.githubusercontent.com/hc990275/yx/refs/heads/main/cfyxip.txt' },
            'cm-ct': { name: '⚡ CM佬电信优选', url: 'https://cf.090227.xyz/ct?ips=100' },
            'cm-cmcc': { name: '🚄 CM佬移动优选', url: 'https://cf.090227.xyz/cmcc?ips=100' },
            'cm-cu': { name: '🚀 CM佬联通优选', url: 'https://cf.090227.xyz/cu?ips=100' },
            'v2too': { name: '💡 v2too 源', url: 'https://ip.v2too.top/api/nodes' }
        };
        function updatePresetInfo() {
            const v = document.getElementById('ipType').value;
            const p = PRESET_MAP[v];
            if (!p) return;
            document.getElementById('presetName').textContent = p.name;
            const u = document.getElementById('presetUrl');
            u.textContent = p.url;
            u.title = '点击复制 API 地址';
        }
        function copyPresetUrl() {
            const u = document.getElementById('presetUrl').textContent;
            if (!u || u.startsWith('uouin')) return showToast('综合混合源为多源聚合,无单一地址');
            if (navigator.clipboard) { navigator.clipboard.writeText(u).then(() => showToast('✅ API 地址已复制')).catch(() => { fallbackCopy(u); }); }
            else fallbackCopy(u);
        }
        function fallbackCopy(txt) {
            const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showToast('✅ API 地址已复制');
        }
        async function fetchRemoteAndTest() {
            const btn = document.getElementById('btnFetchRemote');
            const tbody = document.getElementById('testTableBody');
            const statusTxt = document.getElementById('statusText');
            const type = document.getElementById('ipType').value;
            const typeText = document.getElementById('ipType').options[document.getElementById('ipType').selectedIndex].text;
            btn.disabled = true; btn.textContent = '⏳ 正在提取节点...';
            statusTxt.innerHTML = \`正在拉取 <strong>\${typeText}</strong> 数据...\`;
            if(tbody.innerHTML.includes('暂无数据')) tbody.innerHTML = ''; 
            try {
                const res = await fetch(\`/api/get-remote-ips?type=\${encodeURIComponent(type)}\`);
                const data = await res.json();
                if (!data.ips || data.ips.length === 0) { showToast('⚠️ 未获取到该类型 IP'); return; }
                showToast(\`✅ 从「\${data.name || typeText}」提取 \${data.totalCount} 个可用 IP，抽取 \${data.ips.length} 个测速\`);
                statusTxt.innerHTML = \`正在测速 <strong>\${typeText}</strong> 提取的 \${data.ips.length} 个节点...\`;
                btn.textContent = ' 本地测速中...';
                const promises = [];
                data.ips.forEach(ip => {
                    const tr = document.createElement('tr');
                    tr.className = 'test-row';
                    tr.innerHTML = \`
                        <td data-label="勾选节点" style="text-align: center;"><input type="checkbox" class="ip-checkbox row-checkbox" value="\${ip}"></td>
                        <td data-label="专属节点"><strong class="ip-text" style="color:var(--primary);cursor:pointer;font-family:monospace;" onclick="copyTxt('\${ip}')" title="点击复制">\${ip}</strong></td>
                        <td data-label="预估延迟" class="latency" data-ms="9999" style="font-weight: 600; color: #888;">测算中...</td>
                        <td data-label="连通状态" class="speed" style="color: #888;">-</td>
                        <td data-label="记录/归属地" class="loc" style="color: #666;">等待解析</td>
                        <td data-label="快捷操作"><button class="btn-dns" disabled onclick="updateSingleDns('\${ip}', this)">唯一解析</button></td>\`;
                    tbody.insertBefore(tr, tbody.firstChild);
                    promises.push(doLocalPing(ip, tr, typeText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')));
                });
                await Promise.all(promises);
                sortTableByLatency(tbody);
                document.querySelectorAll('.btn-dns').forEach(b => b.disabled = false);
                document.getElementById('selectAll').checked = false;
                showToast('🎉 测速完成！');
                statusTxt.innerHTML = \`${I.check} 测速完毕！\`;
            } catch (err) { showToast('❌ 拉取或测速失败'); } 
            finally { btn.disabled = false; btn.textContent = ' 提取预设源测速'; }
        }
        function clearTest() {
            document.getElementById('testTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-sec);">暂无数据，请拉取节点或输入自定义 IP/域名 测试</td></tr>';
            document.getElementById('statusText').textContent = '列表已清空。';
            document.getElementById('selectAll').checked = false;
        }
        function markTimeout(latTd, spdTd, tr) {
            latTd.textContent = '超时抛弃'; latTd.setAttribute('data-ms', 9999); latTd.style.color = '#ff3b30';
            spdTd.textContent = ' 超时 (>2000ms)'; spdTd.style.color = '#ff3b30';
            const cb = tr.querySelector('.row-checkbox');
            if(cb) { cb.disabled = true; cb.title = '不可用的节点无法被勾选'; }
        }
        async function doLocalPing(ip, tr, sourceLabel) {
            const latTd = tr.querySelector('.latency');
            const spdTd = tr.querySelector('.speed');
            const locTd = tr.querySelector('.loc');
            const queryIp = ip.replace(/[\\[\\]]/g, '');
            const isIPv6 = ip.includes(':'); 
            const isDomain = /[a-zA-Z]/.test(queryIp) && !isIPv6;
            if (isDomain) { locTd.innerHTML = \`<span class="badge" style="background:rgba(175,82,222,0.1);color:#af52de;margin-right:4px;">CNAME</span> \${sourceLabel} | 优选域名\`;
            } else {
                const recordLabel = isIPv6 ? '<span class="badge" style="background:rgba(50,173,230,0.1);color:#32ade6;margin-right:4px;">AAAA</span>' : '<span class="badge" style="background:rgba(0,113,227,0.1);color:#0071e3;margin-right:4px;">A记录</span>';
                fetch(\`https://api.vore.top/api/IPdata?ip=\${queryIp}\`).then(res => res.json()).then(data => {
                    const info = (data && data.data && data.data.info) || {};
                    const loc = [info.country, info.province, info.city].filter(Boolean).join(' ') || '未知';
                    locTd.innerHTML = \`\${recordLabel} \${sourceLabel} | \${loc}\`;
                }).catch(() => fetch(\`https://api.ip.sb/geoip/\${queryIp}\`).then(res => res.json()).then(data => locTd.innerHTML = \`\${recordLabel} \${sourceLabel} | \${data.country || '未知'}\`).catch(() => locTd.innerHTML = \`\${recordLabel} \${sourceLabel} | 解析失败\`));
            }
            const start = performance.now();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); 
            const processResult = () => {
                const rawLatency = Math.round(performance.now() - start);
                if (rawLatency > 2000) return markTimeout(latTd, spdTd, tr);
                let displayLatency = rawLatency;
                if (!isIPv6 && !isDomain) {
                    if (rawLatency >= 500) { displayLatency = rawLatency - 400; } 
                    else { const base = 40 + (rawLatency / 500) * 60; displayLatency = Math.floor(base) + Math.floor(Math.random() * 10); }
                }
                updateRowState(latTd, spdTd, displayLatency);
            };
            try { await fetch(\`https://\${ip}/cdn-cgi/trace\`, { mode: 'no-cors', signal: controller.signal }); clearTimeout(timeoutId); processResult();
            } catch (err) { clearTimeout(timeoutId); if (err.name === 'AbortError') markTimeout(latTd, spdTd, tr); else processResult(); }
        }
        function updateRowState(latTd, spdTd, latency) {
            latTd.textContent = latency + ' ms'; latTd.setAttribute('data-ms', latency);
            if (latency < 300) { latTd.style.color = '#34c759'; spdTd.textContent = ' 极佳'; spdTd.style.color = '#34c759'; } 
            else if (latency <= 500) { latTd.style.color = 'var(--primary)'; spdTd.textContent = ' 正常'; spdTd.style.color = 'var(--primary)'; } 
            else { latTd.style.color = '#ff9500'; spdTd.textContent = ' 较高'; spdTd.style.color = '#ff9500'; }
        }
        function sortTableByLatency(tbody) {
            const rows = Array.from(tbody.querySelectorAll('.test-row'));
            rows.sort((a, b) => {
                const msA = parseInt(a.querySelector('.latency').getAttribute('data-ms') || 9999);
                const msB = parseInt(b.querySelector('.latency').getAttribute('data-ms') || 9999);
                return msA - msB;
            });
            rows.forEach(row => tbody.appendChild(row));
        }
        async function sendDnsRequest(ips, btnElement) {
            const originalText = btnElement.textContent;
            btnElement.textContent = ' 更新 DNS 中...'; btnElement.disabled = true;
            try {
                const res = await fetch('/api/update-dns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips }) });
                const data = await res.json();
                if(data.success) { showToast(data.message); btnElement.textContent = '✅ 更新成功'; loadDNS(); } 
                else { showToast('❌ 错误: ' + (data.error || '')); btnElement.textContent = originalText; }
            } catch(e) { showToast('❌ 网络异常，请重试'); btnElement.textContent = originalText; } 
            finally { setTimeout(() => { if(btnElement.textContent === ' 更新成功') btnElement.textContent = originalText; btnElement.disabled = false; }, 3000); }
        }
        function updateSingleDns(ip, btnElement) {
            if(!confirm(\`确定要将域名解析到：\\n\${ip} \\n警告：这会覆盖域名下的所有解析记录！\`)) return;
            sendDnsRequest([ip], btnElement);
        }
        function updateSelectedToDns() {
            const btn = document.getElementById('btnSelectedDns');
            const ips = getSelectedIps();
            if (ips.length === 0) return showToast('⚠️ 请先勾选您想使用的节点');
            if(!confirm(\`将应用勾选的 \${ips.length} 个节点：\\n\${ips.join('\\n')}\\n确定更新 DNS 记录吗？\`)) return;
            sendDnsRequest(ips, btn);
        }
        function updateTop3ToDns() {
            const btn = document.getElementById('btnTop3Dns');
            const rows = document.querySelectorAll('#testTableBody .test-row');
            let topIps = [];
            for(let i = 0; i < rows.length; i++) {
                const ms = parseInt(rows[i].querySelector('.latency').getAttribute('data-ms'));
                if(ms < 2000) topIps.push(rows[i].querySelector('.ip-text').textContent);
                if(topIps.length === 3) break;
            }
            if(topIps.length === 0) return showToast('⚠️ 没找到可用节点，请先测速');
            if(!confirm(\`将为您分发当前最快的 \${topIps.length} 个节点：\\n\${topIps.join('\\n')}\\n确定更新 DNS 记录吗？\`)) return;
            sendDnsRequest(topIps, btn);
        }
        async function loadDNS() {
            try {
                const res = await fetch('/api/get-dns'); const data = await res.json(); const container = document.getElementById('dnsStatus');
                if (data.success && data.result) {
                    const records = data.result.filter(r => r.type === 'A' || r.type === 'AAAA' || r.type === 'CNAME');
                    if (records.length === 0) container.innerHTML = '<span class="badge" style="background:rgba(255,149,0,0.1);color:#ff9500;">暂无解析记录</span>';
                    else container.innerHTML = records.map(r => \`<span class="badge" style="background:rgba(0,113,227,0.1);color:var(--primary);border:1px solid rgba(0,113,227,0.2);">\${r.type} | \${r.content}</span>\`).join('');
                } else container.innerHTML = \`<span class="badge" style="background:rgba(255,59,48,0.1);color:#ff3b30;">\${data.error || '获取失败'}</span>\`;
            } catch (e) { document.getElementById('dnsStatus').innerHTML = '<span class="badge" style="background:rgba(255,59,48,0.1);color:#ff3b30;">网络异常</span>'; }
        }
        
        function logout() {
            document.cookie = "admin_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.reload();
        }
        function confirmLogout() {
            if (window.confirm('确定要退出系统吗？')) { logout(); }
        }

        // 初始化加载
        loadIcons().then(() => {
            load();
            loadDNS();
        });

        // ==========================================
        //  新增：RTT 实时监测引擎 (每隔 3 秒探测一次)
        // ==========================================
        async function measureRTT() {
            const start = performance.now();
            try {
                // 加上时间戳强制绕过浏览器本地缓存
                await fetch('/__client_rtt__?t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' });
                const rtt = Math.round(performance.now() - start);
                const rttEl = document.getElementById('rttValue');
                const dotEl = document.getElementById('rttDot');
                
                rttEl.textContent = rtt + ' ms';
                
                // 根据延迟改变呼吸灯颜色
                if (rtt < 80) {
                    dotEl.style.background = '#34c759'; dotEl.style.boxShadow = '0 0 8px #34c759';
                    rttEl.style.color = '#34c759';
                } else if (rtt < 200) {
                    dotEl.style.background = '#ff9500'; dotEl.style.boxShadow = '0 0 8px #ff9500';
                    rttEl.style.color = '#ff9500';
                } else {
                    dotEl.style.background = '#ff3b30'; dotEl.style.boxShadow = '0 0 8px #ff3b30';
                    rttEl.style.color = '#ff3b30';
                }
            } catch (e) {
                document.getElementById('rttValue').textContent = '断连';
                document.getElementById('rttDot').style.background = '#ff3b30';
            }
        }
        
        // 先立即执行一次，然后每 3 秒循环探测
        measureRTT();
        setInterval(measureRTT, 3000);

    //  新增：前端探针自动检测脚本
        async function fetchCfTrace() {
            try {
                const res = await fetch('/api/trace');
                const data = await res.json();
                if (data.success) {
                    // 拼接访客入口信息：国家 城市 (机房代码)
                    let entryText = data.entryCountry;
                    if (data.entryCity && data.entryCity !== '未知') entryText += ' ' + data.entryCity;
                    entryText += ' (' + data.entryColo + ')';
                    
                    document.getElementById('trace-entry').innerText = entryText;
                    
                    // 落地机房处理
                    const egressText = data.egressColo;
                    const egressElem = document.getElementById('trace-egress');
                    egressElem.innerText = egressText;
                    
                    // 核心逻辑：如果入口和落地机房不一致，显示高亮提示（智能调度触发）
                    if (data.entryColo !== egressText && egressText !== '探测中...' && egressText !== '获取失败') {
                        egressElem.style.color = '#ff9500'; // 变成橘黄色警示
                        egressElem.innerText += ' (智能放置/回源)';
                    }
                }
            } catch(e) {
                document.getElementById('trace-entry').innerText = '获取超时';
                document.getElementById('trace-egress').innerText = '获取超时';
            }
        }
        
        // 当网页加载完成时，延迟0.5秒执行探针扫描（避免卡顿主页渲染）
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(fetchCfTrace, 500);
            loadLogo();
        });
    //  新增：全云厂商节点数据库 (包含 Cloudflare 支持的所有主要区域)
        var cfRegions = {
            aws: [
                { label: " 中国香港", value: "aws:ap-east-1" },
                { label: " 日本 (东京)", value: "aws:ap-northeast-1" },
                { label: " 日本 (大阪)", value: "aws:ap-northeast-3" },
                { label: " 新加坡", value: "aws:ap-southeast-1" },
                { label: " 韩国 (首尔)", value: "aws:ap-northeast-2" },
                { label: " 美国西部 (加州)", value: "aws:us-west-1" },
                { label: " 美国西部 (俄勒冈)", value: "aws:us-west-2" },
                { label: " 美国东部 (弗吉尼亚)", value: "aws:us-east-1" },
                { label: " 澳大利亚 (悉尼)", value: "aws:ap-southeast-2" },
                { label: " 印度 (孟买)", value: "aws:ap-south-1" },
                { label: " 英国 (伦敦)", value: "aws:eu-west-2" },
                { label: " 德国 (法兰克福)", value: "aws:eu-central-1" }
            ],
            gcp: [
                { label: " 中国台湾 (彰化)", value: "gcp:asia-east1" },
                { label: " 中国香港", value: "gcp:asia-east2" },
                { label: " 日本 (东京)", value: "gcp:asia-northeast1" },
                { label: " 日本 (大阪)", value: "gcp:asia-northeast2" },
                { label: " 韩国 (首尔)", value: "gcp:asia-northeast3" },
                { label: " 新加坡", value: "gcp:asia-southeast1" },
                { label: " 美国西部 (洛杉矶)", value: "gcp:us-west2" },
                { label: " 美国西部 (俄勒冈)", value: "gcp:us-west1" },
                { label: " 美国东部 (弗吉尼亚)", value: "gcp:us-east4" },
                { label: " 澳大利亚 (悉尼)", value: "gcp:australia-southeast1" },
                { label: " 英国 (伦敦)", value: "gcp:europe-west2" },
                { label: " 德国 (法兰克福)", value: "gcp:europe-west3" }
            ],
            azure: [
                { label: " 中国香港 (East Asia)", value: "azure:eastasia" },
                { label: " 新加坡 (Southeast Asia)", value: "azure:southeastasia" },
                { label: " 日本东部 (东京)", value: "azure:japaneast" },
                { label: " 日本西部 (大阪)", value: "azure:japanwest" },
                { label: " 韩国中部 (首尔)", value: "azure:koreacentral" },
                { label: " 美国西部 (West US)", value: "azure:westus" },
                { label: " 美国东部 (East US)", value: "azure:eastus" },
                { label: " 英国南部 (伦敦)", value: "azure:uksouth" },
                { label: " 西欧 (荷兰)", value: "azure:westeurope" }
            ]
        };

        //  新增：联动菜单处理逻辑
        function handleModeChange() {
            var mode = document.getElementById('cf-mode-select').value;
            var regionSelect = document.getElementById('cf-region-select');
            var customInput = document.getElementById('cf-custom-input');
            
            regionSelect.style.display = 'none';
            customInput.style.display = 'none';
            
            if (mode === 'aws' || mode === 'gcp' || mode === 'azure') {
                regionSelect.style.display = 'block';
                regionSelect.innerHTML = ''; 
                var regions = cfRegions[mode];
                regions.forEach(function(r) {
                    var opt = document.createElement('option');
                    opt.value = r.value;
                    opt.innerText = r.label;
                    regionSelect.appendChild(opt);
                });
            } else if (mode === 'custom') {
                customInput.style.display = 'block';
            }
        }

        //  新增：调用部署修改接口
        async function updatePlacement() {
            var statusElem = document.getElementById('place-status');
            var modeVal = document.getElementById('cf-mode-select').value;
            var placementPayload = {};
            
            if (modeVal === 'aws' || modeVal === 'gcp' || modeVal === 'azure') {
                var regionVal = document.getElementById('cf-region-select').value;
                placementPayload = { region: regionVal };
            } else if (modeVal === 'custom') {
                var customVal = document.getElementById('cf-custom-input').value;
                if (!customVal || customVal.trim() === '') {
                    statusElem.innerText = " 请填写自定义区域代码（如 gcp:asia-east2）";
                    statusElem.style.color = "#ff3b30";
                    return;
                }
                placementPayload = { region: customVal.trim() };
            } else {
                placementPayload = JSON.parse(modeVal);
            }

            statusElem.innerText = "⏳ 正在提交请求，请稍候...";
            statusElem.style.color = "#ff9500";
            
            try {
                var res = await fetch('/api/placement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ placement: placementPayload })
                });
                if (!res.ok) {
                    statusElem.innerText = ' 请求被拒绝(' + res.status + ')，请重新登录后重试';
                    statusElem.style.color = "#ff3b30";
                    return;
                }
                var data = await res.json();
                if (data.success) {
                    statusElem.innerText = " " + data.msg;
                    statusElem.style.color = "#34c759";
                } else {
                    statusElem.innerText = " " + data.msg;
                    statusElem.style.color = "#ff3b30";
                }
            } catch(e) {
                statusElem.innerText = " 网络错误: " + e.message;
                statusElem.style.color = "#ff3b30";
            }
        }
    //  魔法功能：自动继承现有的模式选项 (增强稳定版)
        setTimeout(() => {
            const sourceSelect = document.getElementById('mode');
            const batchSelect = document.getElementById('batch-mode-select');
            if (sourceSelect && batchSelect) {
                batchSelect.innerHTML = sourceSelect.innerHTML;
            }
        }, 100); 

        //  全选 / 取消全选逻辑
        function toggleSelectAll(checkbox) {
            const checkboxes = document.querySelectorAll('.node-cb');
            checkboxes.forEach(cb => cb.checked = checkbox.checked);
        }

        //  并发批量修改模式逻辑 (终极多线程逐个击破版)
        async function batchUpdateModes() {
            const statusElem = document.getElementById('batch-status');
            const newMode = document.getElementById('batch-mode-select').value;
            
            const selectedPrefixes = Array.from(document.querySelectorAll('.node-cb:checked')).map(cb => cb.value);

            if (selectedPrefixes.length === 0) {
                statusElem.innerText = " 请先打勾需要修改的节点！";
                statusElem.style.color = "#ff9500";
                return;
            }

            if (!confirm("确定要将勾选的 " + selectedPrefixes.length + " 个节点切换为该模式吗？")) return;

            statusElem.innerText = "⏳ 正在多线程并发修改节点...";
            statusElem.style.color = "var(--primary)";

            try {
                // 1. 先获取当前所有的节点详细数据
                const getRes = await fetch('/api/routes');
                const allRoutes = await getRes.json();
                
                // 2. 筛选出你要修改的那些节点
                const nodesToUpdate = allRoutes.filter(r => selectedPrefixes.includes(r.prefix));

                // 3. 核心魔法：Promise.all 并发！瞬间发出多个独立的保存请求
                await Promise.all(nodesToUpdate.map(async (r) => {
                    const payload = Object.assign({}, r);
                    payload.oldPrefix = r.prefix; 
                    payload.mode = newMode; 
                    
                    const postRes = await fetch('/api/routes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if (!postRes.ok) {
                        throw new Error("节点 " + r.prefix + " 保存失败");
                    }
                }));
                
                statusElem.innerText = " 批量修改成功！";
                statusElem.style.color = "#34c759";
                setTimeout(() => location.reload(), 1000); 

            } catch (e) {
                statusElem.innerText = " 失败: " + e.message;
                statusElem.style.color = "#ff3b30";
            }
        }
    async function deployWorker() {
            const codeArea = document.getElementById('codeArea');
            const fileInput = document.getElementById('fileInput');
            let codeContent = codeArea.value;
            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                codeContent = await file.text();
            }
            if (!codeContent.trim()) {
                alert(' 失败：请先粘贴代码，或者选择一个 .js 文件！');
                return;
            }
            if (!confirm(' 危险操作确认 \\n\\n你即将强行覆盖当前 Worker 的代码。\\n如果新代码有错误，此面板将会瘫痪，只能去网页后台抢修！\\n\\n确定代码 100% 正确并覆盖吗？')) return;
            const btn = document.getElementById('deployBtn');
            const originalText = btn.innerText;
            btn.innerText = '⏳ 正在与 Cloudflare 通信并部署...';
            btn.disabled = true;
            btn.style.opacity = '0.7';
            try {
                const res = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newCode: codeContent })
                });
                const data = await res.json();
                if (data.success) {
                    alert(' 成功！' + data.msg + '\\n\\n点击确定后页面将自动刷新。');
                    window.location.reload(); 
                } else {
                    alert(' 部署失败：\\n' + JSON.stringify(data.error));
                }
            } catch (e) {
                alert(' 异常：\\n' + e.message);
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }
        // ==========================================
        //  在线更新模块
        // ==========================================
        // 这里的变量会自动从代码最顶端的配置区读取注入
        const CURRENT_VERSION = "${CURRENT_VERSION}"; 
        const GITHUB_RAW_URL = "${GITHUB_RAW_URL}"; 
        const CHANGELOG_URL = "${CHANGELOG_URL}"; 
        
        let latestCode = ""; 
        let latestVersion = "";
        let changelogCache = null;

        async function loadChangelog() {
            try {
                const res = await fetch(CHANGELOG_URL + '?t=' + new Date().getTime());
                if (!res.ok) return null;
                changelogCache = await res.json();
                return changelogCache;
            } catch (e) { console.log("拉取更新内容失败:", e); return null; }
        }

        async function loadVersionPanel() {
            try {
                const res = await fetch('/api/version');
                const data = await res.json();
                if (data.success) {
                    const badge = document.getElementById('curVersionBadge');
                    if (badge) badge.textContent = 'v' + data.version;
                    const chk = document.getElementById('updateNotifyChk');
                    if (chk) chk.checked = !!data.updateNotify;
                }
            } catch (e) {}
            const cl = await loadChangelog();
            if (cl && cl.versions && cl.versions.length) {
                const latest = cl.versions[0];
                const lc = document.getElementById('latestChangelog');
                if (lc) lc.innerHTML = '<div style="font-weight:600; color:var(--text);">v' + latest.version + ' · ' + (latest.date || '') + (latest.title ? ' · ' + latest.title : '') + '</div>' + (latest.items || []).map(i => '· ' + i).join('<br>');
                const hc = document.getElementById('historyChangelog');
                if (hc) hc.innerHTML = cl.versions.slice(1).map(v => '<div style="margin-bottom:10px;"><span style="font-weight:600;">v' + v.version + '</span> <span style="color:var(--text-sec);">(' + (v.date || '') + ')</span>' + (v.title ? ' ' + v.title : '') + '<br>' + (v.items || []).map(i => '&nbsp;&nbsp;· ' + i).join('<br>') + '</div>').join('') || '暂无更多历史记录';
            } else {
                const lc = document.getElementById('latestChangelog');
                if (lc) lc.textContent = '暂无更新内容';
            }
        }

        async function saveUpdateNotify() {
            const chk = document.getElementById('updateNotifyChk');
            const on = chk ? chk.checked : true;
            try {
                const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updateNotify: on }) });
                const data = await res.json();
                if (data.success) showToast(on ? '更新提醒已开启' : '更新提醒已关闭');
                else alert('保存失败：' + (data.error || ''));
            } catch (e) { alert('保存失败：' + e.message); }
        }

        function verCmp(a, b) {
            const pa = String(a).replace(/[^0-9.]/g, '').split('.').map(Number);
            const pb = String(b).replace(/[^0-9.]/g, '').split('.').map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const x = pa[i] || 0, y = pb[i] || 0;
                if (x > y) return 1; if (x < y) return -1;
            }
            return 0;
        }

        async function checkForUpdates(manual) {
            try {
                const res = await fetch(GITHUB_RAW_URL + '?t=' + new Date().getTime());
                if (!res.ok) { if (manual) alert('检查更新失败：无法访问更新源'); return; }
                latestCode = await res.text();
                
                const versionMatch = latestCode.match(/\\/\\/\\s*VERSION:\\s*"?v?([^"\\n]+)"?/i);
                if (!versionMatch || !versionMatch[1]) { if (manual) alert('未获取到版本信息'); return; }
                latestVersion = versionMatch[1];
                if (latestVersion === CURRENT_VERSION) {
                    if (manual) alert('当前已是最新版本 v' + CURRENT_VERSION);
                    return;
                }
                // 本地版本高于公开版时静默(测试仓预览版不弹反向更新提示)
                if (verCmp(CURRENT_VERSION, latestVersion) > 0) {
                    if (manual) alert('当前已领先公开版:本地 v' + CURRENT_VERSION + ' ≥ 公开版 v' + latestVersion);
                    return;
                }
                const cl = changelogCache || await loadChangelog();
                let items = []; let title = '';
                if (cl && cl.versions && cl.versions.length) {
                    const v = cl.versions.find(x => x.version === latestVersion) || cl.versions[0];
                    items = v.items || []; title = v.title || '';
                }
                if (!manual) {
                    try {
                        const vres = await fetch('/api/version');
                        const vdata = await vres.json();
                        if (vdata.success && !vdata.updateNotify) return;   // 关闭了更新提醒则静默
                    } catch (e) {}
                }
                showUpdateModal(latestVersion, title, items);
            } catch (e) {
                console.log("检测更新失败:", e);
                if (manual) alert('检查更新失败：' + e.message);
            }
        }

        function showUpdateModal(version, title, items) {
            document.getElementById('updateModalVersion').textContent = 'v' + version;
            document.getElementById('updateModalCurVer').textContent = 'v' + CURRENT_VERSION;
            document.getElementById('updateModalBody').innerHTML = '<div style="font-size:13px; font-weight:600; margin-bottom:8px;">' + (title ? title : '本次更新内容') + '</div>' + (items && items.length ? items.map(i => '· ' + i).join('<br>') : '<span style="color:var(--text-sec);">暂无详细更新内容</span>');
            document.getElementById('updateModal').style.display = 'block';
        }
        function hideUpdateModal() { document.getElementById('updateModal').style.display = 'none'; }

        async function manualUpdateFlow() {
            if (!latestCode) { checkForUpdates(true); return; }
            if (latestVersion === CURRENT_VERSION) { alert('当前已是最新版本 v' + CURRENT_VERSION); return; }
            const cl = changelogCache || await loadChangelog();
            let items = []; let title = '';
            if (cl && cl.versions && cl.versions.length) {
                const v = cl.versions.find(x => x.version === latestVersion) || cl.versions[0];
                items = v.items || []; title = v.title || '';
            }
            showUpdateModal(latestVersion, title, items);
        }

        async function doOnlineUpdate() {
            hideUpdateModal();
            if (!latestCode) { checkForUpdates(true); return; }
            
            const btn = document.getElementById('onlineUpdateBtn');
            if (btn) { btn.innerText = '⏳ 正在拉取并部署...'; btn.disabled = true; btn.style.opacity = '0.7'; }
            try {
                const res = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newCode: latestCode })
                });
                const data = await res.json();
                if (data.success) {
                    const cl = changelogCache || await loadChangelog();
                    let items = [];
                    if (cl && cl.versions && cl.versions.length) {
                        const v = cl.versions.find(x => x.version === latestVersion) || cl.versions[0];
                        items = v.items || [];
                    }
                    document.getElementById('updateResultBody').innerHTML = '<div style="font-size:13px; margin-bottom:8px;">已成功更新到 <b style="color:var(--primary);">v' + latestVersion + '</b>，本次更新内容：</div>' + (items.length ? items.map(i => '· ' + i).join('<br>') : '暂无详细更新内容');
                    document.getElementById('updateResultModal').style.display = 'block';
                } else {
                    alert(' 更新失败：\\n' + JSON.stringify(data.error));
                }
            } catch (e) {
                alert(' 异常：\\n' + e.message);
            } finally {
                if (btn) { btn.innerText = ' 一键拉取并升级'; btn.disabled = false; btn.style.opacity = '1'; }
            }
        }

        // 页面加载完成后自动在后台静默检测更新
        document.addEventListener('DOMContentLoaded', () => checkForUpdates(false));
    </script>
    <style>
    /* 修正页面底部留白，防止被 Dock 挡住 */
    body { padding-bottom: 100px !important; }

    /* 底部dock栏UI（现代化毛玻璃胶囊） */
    .ds-dock {
        position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
        width: calc(100% - 28px); max-width: 540px;
        background: var(--card-glass); backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
        border: 1px solid var(--border); border-radius: 999px; padding: 6px 10px;
        display: flex; justify-content: space-around;
        box-shadow: var(--shadow-lg); z-index: 950;
    }
    .ds-dock-item {
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
        padding: 8px 14px; border-radius: 999px; color: var(--text-sec); font-size: 11px;
        font-weight: 600; transition: all .2s; background: transparent; border: none; cursor: pointer; flex: 1; font-family: inherit;
    }
    .ds-dock-item.active { color: var(--primary); background: rgba(0,160,255,.12); box-shadow: inset 0 0 0 1px rgba(0,160,255,.15); }
    .ds-dock-item:hover { color: var(--primary); }
    .ds-dock-item svg { width: 22px; height: 22px; fill: currentColor; }

    /* 页脚:内容后留空一截,显示"玛卡巴卡反代面板",点击跳公开仓库 */
    /* 页脚:margin-top auto 贴页面底部;渐变分隔线 + 渐变品牌字(点击跳公开仓库) */
    .page-footer{margin-top:auto;padding:44px 24px 44px;text-align:center;cursor:pointer;position:relative;-webkit-tap-highlight-color:transparent}
    .pf-line{position:absolute;top:0;left:50%;transform:translateX(-50%);width:min(320px,62%);height:1px;background:linear-gradient(90deg,transparent,#00d4ff,#7c5cff,transparent);opacity:.7}
    .pf-brand{display:flex;align-items:center;justify-content:center;gap:9px}
    .pf-brand svg{width:17px;height:17px;fill:#00d4ff;opacity:.9}
    .pf-brand span{font-size:14.5px;font-weight:800;letter-spacing:2.5px;background:linear-gradient(90deg,#00d4ff,#7c5cff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .pf-arrow{margin-top:12px;font-size:11px;letter-spacing:1px;color:var(--text-sec);opacity:.75;transition:all .2s}
    .page-footer:hover .pf-arrow,.page-footer:active .pf-arrow{opacity:1;color:var(--primary)}
</style>

<div class="page-footer" onclick="window.open('https://github.com/MakkaPakka518/ProxyHub_Emby','_blank')" title="前往公开仓库">
    <div class="pf-line"></div>
    <div class="pf-brand">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8-.8-.7-2.2-.7-3 .8z"/><path d="M12 15l-3-3c.5-4 4-7.5 8-8 2 .2 3.8 2 4 4-.5 4-4 7.5-8 8l-1-1z"/></svg>
        <span>玛卡巴卡反代面板</span>
    </div>
    <div class="pf-arrow">查看公开仓库 ↗</div>
</div>

<nav class="ds-dock">
    <button class="ds-dock-item active" onclick="switchDsView('nodes', this)">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        <span>节点</span>
    </button>
    <button class="ds-dock-item" onclick="switchDsView('speed', this)">
        <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
        <span>测速与DNS</span>
    </button>
    <button class="ds-dock-item" onclick="switchDsView('settings', this)">
        <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.33-.02-.64-.06-.94l2.02-1.58c.18-.14.23-.38.12-.56l-1.89-3.28c-.12-.19-.36-.26-.56-.18l-2.38.96c-.5-.38-1.06-.68-1.66-.88L14.45 3.5c-.04-.2-.2-.34-.4-.34h-3.78c-.2 0-.36.14-.4.34l-.3 2.52c-.6.2-1.16.5-1.66.88l-2.38-.96c-.2-.08-.44-.01-.56.18l-1.89 3.28c-.12.19-.07.42.12.56l2.02 1.58c-.04.3-.06.61-.06.94 0 .33.02.64.06.94l-2.02 1.58c-.18.14-.23.38-.12.56l1.89 3.28c.12.19.36.26.56.18l2.38-.96c.5.38 1.06.68 1.66.88l.3 2.52c.04.2.2.34.4.34h3.78c.2 0 .36-.14.4-.34l.3-2.52c.6-.2 1.16-.5 1.66-.88l2.38.96c.2.08.44.01.56-.18l1.89-3.28c.12-.19.07-.42-.12-.56l-2.02-1.58zM12 15c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>
        <span>控制面板</span>
    </button>
</nav>

<script>
// 切换页面的核心逻辑
function switchDsView(viewId, btn) {
    document.querySelectorAll('.ds-dock-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 页面结构已按 3 个视图静态分好，只需在加载完成后识别角色（订阅者自动进入只读模式）
// 首次访问默认进入星云深色模式（无本地记录时），已有偏好则跟随
window.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('emby_proxy_dark')) { document.body.classList.add('dark'); document.documentElement.classList.add('dark'); }
    initRole();
});
</script>
`;

// ==========================================
// 2. 后端 Worker 主逻辑处理区 (核心故障转移 + TG Bot播报 + 智能流量拉取)
// ==========================================

// 用于向 Cloudflare 获取对应时间段的总流量 (支持北京时间今日、近7天、近30天)
async function getCFTraffic(env, type) {
    if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return "缺少变量";
    try {
        const end = new Date();
        let graphqlQuery = {};

        if (type === 'today') {
            // 【今日流量】查询：从北京时间今日 00:00 算起，使用 AdaptiveGroups
            // 1. 获取北京时间并清零时分秒
            const beijingTime = new Date(end.getTime() + 8 * 3600000);
            beijingTime.setUTCHours(0, 0, 0, 0);
            // 2. 转回 UTC 供 API 查询
            const start = new Date(beijingTime.getTime() - 8 * 3600000);
            
            graphqlQuery = {
                query: `
                query {
                  viewer {
                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                      httpRequestsAdaptiveGroups(
                        limit: 1,
                        filter: {
                          datetime_geq: "${start.toISOString()}",
                          datetime_leq: "${end.toISOString()}"
                        }
                      ) {
                        sum {
                          edgeResponseBytes
                        }
                      }
                    }
                  }
                }`
            };
        } else {
            // 【7天、30天】查询：传入数字代表天数，使用 1dGroups（按北京时间日期范围）
            const bjNow = new Date(end.getTime() + 8 * 3600000);
            const start = new Date(bjNow.getTime() - type * 24 * 3600000);
            const dateGeq = start.toISOString().split('T')[0];
            const dateLeq = bjNow.toISOString().split('T')[0];
            graphqlQuery = {
                query: `
                query {
                  viewer {
                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                      httpRequests1dGroups(
                        limit: 10000,
                        filter: {
                          date_geq: "${dateGeq}",
                          date_leq: "${dateLeq}"
                        }
                      ) {
                        sum {
                          bytes
                        }
                      }
                    }
                  }
                }`
            };
        }

        const cfRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.CF_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(graphqlQuery)
        });
        
        const cfData = await cfRes.json();
        
        if (cfData.errors && cfData.errors.length > 0) {
            return `API报错: ${cfData.errors[0].message}`;
        }
        
        const zones = cfData?.data?.viewer?.zones;
        let totalBytes = 0;

        if (zones && zones.length > 0) {
            if (type === 'today' && zones[0].httpRequestsAdaptiveGroups) {
                totalBytes = zones[0].httpRequestsAdaptiveGroups[0]?.sum?.edgeResponseBytes || 0;
            } else if (type !== 'today' && zones[0].httpRequests1dGroups) {
                // 将多天的 bytes 聚合累加
                zones[0].httpRequests1dGroups.forEach(g => { totalBytes += (g.sum.bytes || 0); });
            }
        }

        if (totalBytes === 0) return "0 B";
        if (totalBytes >= 1099511627776) return (totalBytes / 1099511627776).toFixed(2) + " TB";
        if (totalBytes >= 1073741824) return (totalBytes / 1073741824).toFixed(2) + " GB";
        if (totalBytes >= 1048576) return (totalBytes / 1048576).toFixed(2) + " MB";
        if (totalBytes >= 1024) return (totalBytes / 1024).toFixed(2) + " KB";
        return totalBytes + " B";

    } catch(e) {
        return "请求异常";
    }
}

// CF Worker 每日请求数统计（GraphQL httpRequests，额度按 UTC 00:00 重置）
async function getCFRequests(env, type) {
    if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return { ok: false, error: '缺少变量' };
    try {
        const end = new Date();
        let graphqlQuery = {};
        if (type === 'today') {
            // CF 免费额度按 UTC 00:00 重置，取今天 UTC 00:00 作为起点
            const startUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
            graphqlQuery = {
                query: `
                query {
                  viewer {
                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                      httpRequestsAdaptiveGroups(
                        limit: 1,
                        filter: {
                          datetime_geq: "${startUtc.toISOString()}",
                          datetime_leq: "${end.toISOString()}"
                        }
                      ) {
                        count
                      }
                    }
                  }
                }`
            };
        } else {
            // 7天 / 30天：按天聚合 sum.requests 累加（按北京时间日期范围）
            const bjNow = new Date(end.getTime() + 8 * 3600000);
            const start = new Date(bjNow.getTime() - type * 24 * 3600000);
            const dateGeq = start.toISOString().split('T')[0];
            const dateLeq = bjNow.toISOString().split('T')[0];
            graphqlQuery = {
                query: `
                query {
                  viewer {
                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                      httpRequests1dGroups(
                        limit: 10000,
                        filter: {
                          date_geq: "${dateGeq}",
                          date_leq: "${dateLeq}"
                        }
                      ) {
                        sum {
                          requests
                        }
                      }
                    }
                  }
                }`
            };
        }

        const cfRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.CF_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(graphqlQuery)
        });
        
        const cfData = await cfRes.json();
        if (cfData.errors && cfData.errors.length > 0) {
            return { ok: false, error: cfData.errors[0].message };
        }
        
        const zones = cfData?.data?.viewer?.zones;
        let total = 0;
        if (zones && zones.length > 0) {
            if (type === 'today' && zones[0].httpRequestsAdaptiveGroups) {
                total = zones[0].httpRequestsAdaptiveGroups[0]?.count || 0;
            } else if (type !== 'today' && zones[0].httpRequests1dGroups) {
                zones[0].httpRequests1dGroups.forEach(g => { total += (g.sum.requests || 0); });
            }
        }
        return { ok: true, count: total };
    } catch(e) {
        return { ok: false, error: e.message };
    }
}

// 今日 CF 全维度统计（一次 GraphQL 批量查询：请求数/带宽/缓存/状态码/国家/分时/防火墙）
async function getCFTodayStats(env) {
    if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return { ok: false, error: '缺少变量' };
    const endD = new Date();
    // 北京时间今日 00:00（UTC+8）作为起点,与面板其余统计口径一致
    const bjStart = new Date(endD.getTime() + 8 * 3600000);
    bjStart.setUTCHours(0, 0, 0, 0);
    const startUtc = new Date(bjStart.getTime() - 8 * 3600000);
    const geq = startUtc.toISOString();
    const leq = endD.toISOString();
    const zoneTag = env.CF_ZONE_ID;
    const baseFilter = `{datetime_geq: "${geq}", datetime_leq: "${leq}"}`;
    const headers = { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' };
    async function gql(query) {
        try {
            const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers, body: JSON.stringify({ query }) });
            const j = await r.json();
            if (j.errors && j.errors.length) return { errors: j.errors };
            return j.data?.viewer?.zones?.[0] || {};
        } catch (e) { return { errors: [{ message: e.message }] }; }
    }
    // ① 主查询：今日请求数 + 带宽（核心字段，官方确认）
    let requests = 0, bytes = 0, mainError = null;
    const main = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { o: httpRequestsAdaptiveGroups(limit: 1, filter: ${baseFilter}) { count sum { edgeResponseBytes } } } } }`);
    if (main.errors) { mainError = main.errors[0].message; }
    else { const o = main.o?.[0] || {}; requests = o.count || 0; bytes = o.sum?.edgeResponseBytes || 0; }
    // ② 状态码分布（独立容错）
    const codes = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    const st = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { s: httpRequestsAdaptiveGroups(limit: 20, filter: ${baseFilter}) { count dimensions { edgeResponseStatus } } } } }`);
    if (!st.errors) (st.s || []).forEach(g => {
        const c = Number(g.dimensions?.edgeResponseStatus) || 0;
        if (c >= 500) codes['5xx'] += g.count;
        else if (c >= 400) codes['4xx'] += g.count;
        else if (c >= 300) codes['3xx'] += g.count;
        else if (c >= 200) codes['2xx'] += g.count;
    });
    // ③ 来源国家（独立容错）
    let countries = [];
    const ct = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { c2: httpRequestsAdaptiveGroups(limit: 6, filter: ${baseFilter}) { count dimensions { clientCountryName } } } } }`);
    if (!ct.errors) countries = (ct.c2 || []).slice(0, 5).map(g => ({ country: g.dimensions?.clientCountryName || '未知', count: g.count }));
    // ④ 分时趋势（独立容错;GraphQL 按 UTC 小时聚合,归桶到北京时间 +8）
    const hours = new Array(24).fill(0);
    const hr = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { h: httpRequestsAdaptiveGroups(limit: 1440, filter: ${baseFilter}) { count dimensions { datetimeMinute } } } } }`);
    if (!hr.errors) (hr.h || []).forEach(g => {
        const d = new Date(g.dimensions?.datetimeMinute);
        if (!isNaN(d.getTime())) hours[(d.getUTCHours() + 8) % 24] += g.count;
    });
    // ⑤ 防火墙拦截（独立容错）
    let blocked = 0;
    const bl = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { b: firewallEventsAdaptiveGroups(limit: 1, filter: ${baseFilter}) { count } } } }`);
    if (!bl.errors) blocked = bl.b?.[0]?.count || 0;
    // ⑥ 缓存字节（独立容错）
    let cachedBytes = 0;
    const cb = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { c3: httpRequestsAdaptiveGroups(limit: 1, filter: ${baseFilter}) { sum { cachedBytes } } } } }`);
    if (!cb.errors) { const v = cb.c3?.[0]?.sum?.cachedBytes; if (typeof v === 'number') cachedBytes = v; }
    if (mainError) return { ok: false, error: mainError };
    return { ok: true, requests, bytes, cachedBytes, statusCodes: codes, countries, hours, blocked };
}

// 用于生成 TG 播报消息的核心工具函数 (单面板 + 流量之王统计版)
async function sendTgStats(env, chatId) {
    try {
        const totalQuery = await env.DB.prepare(`SELECT COUNT(*) as count FROM visitor_logs WHERE date(timestamp, '+8 hours') = date('now', '+8 hours')`).first();
        const topRegionQuery = await env.DB.prepare(`SELECT country, COUNT(*) as c FROM visitor_logs WHERE date(timestamp, '+8 hours') = date('now', '+8 hours') GROUP BY country ORDER BY c DESC LIMIT 1`).first();
        const topNodeQuery = await env.DB.prepare(`
            SELECT r.remark, COUNT(v.id) as c 
            FROM visitor_logs v 
            LEFT JOIN routes r ON v.prefix = r.prefix 
            WHERE date(v.timestamp, '+8 hours') = date('now', '+8 hours') 
            GROUP BY v.prefix 
            ORDER BY c DESC LIMIT 1
        `).first();

        // 获取多时间维度流量
        const [trafficToday, traffic7d, traffic30d] = await Promise.all([
            getCFTraffic(env, 'today'),
            getCFTraffic(env, 7),
            getCFTraffic(env, 30)
        ]);

        // ================= 新增：获取今日流量消耗 TOP 1 节点 =================
        let topNodeMsg = "暂无数据";
        if (env.CF_API_TOKEN && env.CF_ZONE_ID && env.DB) {
            try {
                // 1. 获取所有节点
                const { results: routes } = await env.DB.prepare(`SELECT prefix, remark FROM routes`).all();
                if (routes && routes.length > 0) {
                    const end = new Date();
                    const beijingTime = new Date(end.getTime() + 8 * 3600000);
                    beijingTime.setUTCHours(0, 0, 0, 0);
                    const start = new Date(beijingTime.getTime() - 8 * 3600000);

                    let maxBytes = 0;
                    let topNodeName = "无";

                    // 2. 并发向 CF 查询每个节点今天的精准流量
                    await Promise.all(routes.map(async (r) => {
                        try {
                            const graphqlQuery = {
                                query: `query {
                                  viewer {
                                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                                      httpRequestsAdaptiveGroups(
                                        limit: 1,
                                        filter: {
                                          clientRequestPath_like: "/${r.prefix}%",
                                          datetime_geq: "${start.toISOString()}",
                                          datetime_leq: "${end.toISOString()}"
                                        }
                                      ) {
                                        sum { edgeResponseBytes }
                                      }
                                    }
                                  }
                                }`
                            };

                            const cfRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify(graphqlQuery)
                            });
                            
                            const cfData = await cfRes.json();
                            const bytes = cfData?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0]?.sum?.edgeResponseBytes || 0;
                            
                            // 3. 找出最大值
                            if (bytes > maxBytes) {
                                maxBytes = bytes;
                                topNodeName = r.remark || r.prefix;
                            }
                        } catch(e) {}
                    }));

                    // 4. 转换字节并组装文本
                    if (maxBytes > 0) {
                        let formatted = "0 B";
                        if (maxBytes >= 1099511627776) formatted = (maxBytes / 1099511627776).toFixed(2) + " TB";
                        else if (maxBytes >= 1073741824) formatted = (maxBytes / 1073741824).toFixed(2) + " GB";
                        else if (maxBytes >= 1048576) formatted = (maxBytes / 1048576).toFixed(2) + " MB";
                        else if (maxBytes >= 1024) formatted = (maxBytes / 1024).toFixed(2) + " KB";
                        else formatted = maxBytes + " B";
                        
                        topNodeMsg = `${topNodeName} 跑了 ${formatted}`;
                    } else {
                        topNodeMsg = "今日全站零消耗";
                    }
                }
            } catch (e) {
                topNodeMsg = "获取失败";
            }
        }
        // ====================================================================

        const totalStr = totalQuery ? totalQuery.count : 0;
        const regionStr = topRegionQuery ? `${topRegionQuery.country === 'CN' ? ' 中国大陆' : topRegionQuery.country} (${topRegionQuery.c} 次)` : '暂无记录';
        const nodeStr = topNodeQuery ? `${topNodeQuery.remark || '未命名节点'} (${topNodeQuery.c} 次)` : '暂无记录';

        const msg = 
            `*今日反代播放数据*\n\n` +
            `今日总播放次数: ${totalStr} 次\n` +
            `最多访问地区: ${regionStr}\n` +
            `最喜欢的EMBY: ${nodeStr}\n\n` +
            `实际流量消耗:\n` +
            `当天内: ${trafficToday}\n` +
            `七天内: ${traffic7d}\n` +
            `30天内: ${traffic30d}\n\n` +
            `今日流量之王:\n` +
            `${topNodeMsg}`;

        await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
        });
    } catch (e) {
        console.error("TG Send Error:", e);
    }
}

// ============ 播放热力图 v3.4.16（反代真实播放请求命中统计,存 D1 play_hits）============

// 播放命中计数：反代路径命中真实播放(PlaybackInfo)时按 节点×日期×小时 累加
// 设置自定义请求头(EMOS 等)。WHATWG Headers 值要求 Latin-1，中文等字符会抛 TypeError，
// 此时退化为 encodeURIComponent 编码值，保证反代不因头值中断
function setHeaderSafe(headers, key, value) {
    try { headers.set(key, value); }
    catch (e) { try { headers.set(key, encodeURIComponent(value)); } catch (e2) {} }
}
// EMOS 默认身份：节点未单独配置 EMOS ID/称号时使用（可在面板节点设置中更改，不强制）
const DEFAULT_EMOS_ID = 'eK3QYG29Ms';
const DEFAULT_EMOS_NAME = '玛卡巴卡的反代面板';
async function recordPlayHit(env, prefix) {
    if (!env.DB || !prefix) return;
    try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS play_hits (prefix TEXT, day TEXT, hour INTEGER, cnt INTEGER DEFAULT 1, PRIMARY KEY(prefix, day, hour))`);
        const now = new Date(Date.now() + 8 * 3600000); // UTC+8
        const day = now.toISOString().split('T')[0];
        const hour = now.getUTCHours();
        await env.DB.prepare(
            `INSERT INTO play_hits (prefix, day, hour, cnt) VALUES (?, ?, ?, 1)
             ON CONFLICT(prefix, day, hour) DO UPDATE SET cnt = cnt + 1`
        ).bind(prefix, day, hour).run();
    } catch (e) { console.error('recordPlayHit:', e.message); }
}

// 读取最近 N 天播放热力图：返回 天×24小时 计数矩阵 + 节点总计
async function getHeatmap(env, days = 7) {
    if (!env.DB) return { ok: false, error: '未绑定 D1' };
    try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS play_hits (prefix TEXT, day TEXT, hour INTEGER, cnt INTEGER DEFAULT 1, PRIMARY KEY(prefix, day, hour))`);
        const end = new Date(Date.now() + 8 * 3600000);
        end.setUTCHours(23, 59, 59, 0);
        const start = new Date(end.getTime() - (days - 1) * 86400000);
        start.setUTCHours(0, 0, 0, 0);
        const { results } = await env.DB.prepare(
            `SELECT prefix, day, hour, cnt FROM play_hits WHERE day >= ? AND day <= ?`
        ).bind(start.toISOString().split('T')[0], end.toISOString().split('T')[0]).all();
        const dayList = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(end.getTime() - i * 86400000);
            dayList.push(d.toISOString().split('T')[0]);
        }
        const grid = dayList.map(day => ({ day, hours: new Array(24).fill(0) }));
        const prefixTotals = {};
        let total = 0;
        for (const r of results || []) {
            const idx = dayList.indexOf(r.day);
            if (idx >= 0 && r.hour >= 0 && r.hour < 24) {
                grid[idx].hours[r.hour] = (grid[idx].hours[r.hour] || 0) + (r.cnt || 0);
                prefixTotals[r.prefix] = (prefixTotals[r.prefix] || 0) + (r.cnt || 0);
                total += (r.cnt || 0);
            }
        }
        const maxHour = Math.max(1, ...grid.flatMap(g => g.hours));
        return { ok: true, days: grid.map(g => ({ day: g.day.slice(5), hours: g.hours })), prefixTotals, total, maxHour };
    } catch (e) { return { ok: false, error: e.message }; }
}

// ============ 保号通知（Bark / Telegram）============
async function getNotifyCfg(env) {
    let cfg = { barkKey: '', barkLevel: 'active', barkServer: 'https://api.day.app', barkNotify: true, tgToken: '', tgChatId: '', tgNotify: true };
    try {
        if (env && env.DB) {
            const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'notify_settings'").first();
            if (row && row.value) Object.assign(cfg, JSON.parse(row.value));
        }
    } catch (e) {}
    return cfg;
}
// 自定义头像（左上角 / 登录页 / favicon）：D1 app_config['logo'] 存 {type:'url'|'data', value}
async function getLogo(env) {
  try {
    if (!env || !env.DB) return null;
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'logo'").first();
    if (row && row.value) {
      const c = JSON.parse(row.value);
      if (c && c.value) return c;
    }
  } catch (e) {}
  return null;
}
async function sendBarkN(cfg, title, body) {
    try {
        if (!cfg.barkKey) return false;
        const r = await fetch((cfg.barkServer || 'https://api.day.app').replace(/\/+$/, '') + '/' + String(cfg.barkKey).trim(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ title: title, body: body, level: cfg.barkLevel || 'active' })
        });
        return r.ok;
    } catch (e) { return false; }
}
async function sendTgN(cfg, text) {
    try {
        if (!cfg.tgToken || !cfg.tgChatId) return false;
        const r = await fetch('https://api.telegram.org/bot' + String(cfg.tgToken).trim() + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: String(cfg.tgChatId).trim(), text: text })
        });
        return r.ok;
    } catch (e) { return false; }
}
// v3.4.17:提前预警——到期前 3/2/1 天 + 当天各提醒一次;节点在提醒后已播放(last_play 更新)
// 则 diffDays 归零、remain > 3 自然退出提醒窗口,重新进入 wl 天倒计时,不再重复提醒
function kaTodaySent(last, t) {
    const ns = {};
    try { for (const p in (last.sent || {})) if (last.sent[p] === t) ns[p] = t; } catch (e) {}
    return ns;
}
async function scanOverdueNotify(env, ctx) {
    try {
        if (!env.DB) return;
        const cfg = await getNotifyCfg(env);
        if (!cfg.barkNotify && !cfg.tgNotify) return;
        if (!cfg.barkKey && !(cfg.tgToken && cfg.tgChatId)) return;
        const todayStr = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
        const lastRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'overdue_notify'").first();
        let last = {};
        try { if (lastRow && lastRow.value) last = JSON.parse(lastRow.value); } catch (e) {}
        if (last.date === todayStr) return;
        // 老库可能还没有 watch_limit 列：先补列再查询，防止 SQL 报错导致超限提醒静默失效
        try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN watch_limit TEXT DEFAULT '0'`); } catch (e) {}
        const { results } = await env.DB.prepare('SELECT prefix, remark, target, last_play, watch_limit FROM routes').all();
        const remind = {};   // prefix → {remark, days, wl, remain}
        for (const r of (results || [])) {
            const wl = parseFloat(r.watch_limit);
            if (!wl || wl <= 0 || !r.last_play) continue;
            const lpUtc = Date.parse(String(r.last_play).replace(' ', 'T') + 'Z') - 8 * 3600000;
            if (isNaN(lpUtc)) continue;
            const diffDays = Math.floor((Date.now() - lpUtc) / 86400000);
            const remain = wl - diffDays;   // 剩余天数:0=到期当天,负=已超限,>3=安全期
            if (remain > 3) continue;        // 安全期(含刚播放进入新倒计时),不提醒
            if (last.sent && last.sent[r.prefix] === todayStr) continue;   // 该节点今日已提醒
            remind[r.prefix] = { remark: r.remark || r.prefix, days: diffDays, wl: wl, remain: remain };
        }
        const prefixes = Object.keys(remind);
        if (!prefixes.length) {
            // 无需要提醒的节点:记录今日已检查(避免每天重复扫描),保留今日已提醒节点记录
            await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('overdue_notify', JSON.stringify({ date: todayStr, sent: kaTodaySent(last, todayStr) })).run();
            return;
        }
        const lines = prefixes.map(p => {
            const n = remind[p];
            const st = n.remain >= 1 ? ('剩余 ' + Math.ceil(n.remain) + ' 天到期') : (n.remain === 0 ? '今天到期，请立即观看' : '已超限 ' + Math.max(1, Math.round(-n.remain)) + ' 天');
            return '· ' + n.remark + '（/' + p + '）' + st + '（已 ' + n.days + ' 天未观看，下限 ' + n.wl + ' 天）';
        });
        const text = '⚠️ 保号提醒：' + prefixes.length + ' 个节点临近/超过观看下限\n' + lines.join('\n');
        // 推送成功才记录今日已提醒;推送失败不记录,6 小时后自动重试
        let sent = false;
        if (cfg.barkNotify && cfg.barkKey) sent = await sendBarkN(cfg, 'Emby 反代面板 · 保号预警', text) || sent;
        if (cfg.tgNotify && cfg.tgToken && cfg.tgChatId) sent = await sendTgN(cfg, text) || sent;
        if (sent) {
            const ns = kaTodaySent(last, todayStr);
            for (const p of prefixes) ns[p] = todayStr;
            await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('overdue_notify', JSON.stringify({ date: todayStr, sent: ns })).run();
        }
    } catch (e) { console.error('scanOverdueNotify:', e); }
}

async function maybeScanOverdue(env) {
    try {
        if (!env.DB) return;
        const now = Date.now();
        const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'overdue_last_check'").first();
        let lastCheck = 0;
        if (row && row.value) lastCheck = parseInt(row.value, 10) || 0;
        if (now - lastCheck < 6 * 3600000) return;
        await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('overdue_last_check', String(now)).run();
        await scanOverdueNotify(env, {});
    } catch (e) {}
}

// ============ 新版本推送通知（Bark / Telegram）============
function verNum(v) {
    return String(v || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
}
function isNewerVer(a, b) {
    const A = verNum(a), B = verNum(b);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
        const x = A[i] || 0, y = B[i] || 0;
        if (x !== y) return x > y;
    }
    return false;
}
async function checkUpdateNotify(env) {
    try {
        if (!env.DB) return;
        // 更新提醒开关（与面板弹窗提醒一致）
        let notifyOn = true;
        try {
            const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'update_notify'").first();
            if (row && row.value !== null && row.value !== undefined) notifyOn = String(row.value) !== '0';
        } catch (e) {}
        if (!notifyOn) return;
        // 拉取 changelog 最新版本
        const res = await fetch(CHANGELOG_URL, { headers: { 'User-Agent': 'cloudflare-worker' } });
        if (!res.ok) return;
        const cl = await res.json();
        const latest = (cl && cl.versions && cl.versions[0]) || null;
        if (!latest || !latest.version) return;
        if (!isNewerVer(latest.version, CURRENT_VERSION)) return;
        // 防重复：每个新版本只推送一次
        const sentRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'update_notify_sent'").first();
        let sent = {};
        try { if (sentRow && sentRow.value) sent = JSON.parse(sentRow.value); } catch (e) {}
        if (sent.version === latest.version) return;
        const cfg = await getNotifyCfg(env);
        if (!cfg.barkNotify && !cfg.tgNotify) return;
        if (!cfg.barkKey && !(cfg.tgToken && cfg.tgChatId)) return;
        const items = (latest.items || []).slice(0, 6).map(i => '· ' + i).join('\n');
        const text = '🚀 检测到新版本：v' + latest.version + '（' + (latest.title || '') + '）\n当前版本：v' + CURRENT_VERSION + '\n\n更新内容：\n' + items + '\n\n可在面板「设置 → 版本」中查看更新内容并手动更新。';
        let ok = false;
        if (cfg.barkNotify && cfg.barkKey) ok = await sendBarkN(cfg, 'Emby 反代面板 · 新版本可用', text) || ok;
        if (cfg.tgNotify && cfg.tgToken && cfg.tgChatId) ok = await sendTgN(cfg, text) || ok;
        if (ok) await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('update_notify_sent', JSON.stringify({ version: latest.version })).run();
    } catch (e) { console.error('checkUpdateNotify:', e); }
}
async function maybeCheckUpdate(env) {
    try {
        if (!env.DB) return;
        const now = Date.now();
        const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'update_notify_last_check'").first();
        let lastCheck = 0;
        if (row && row.value) lastCheck = parseInt(row.value, 10) || 0;
        if (now - lastCheck < 6 * 3600000) return;
        await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('update_notify_last_check', String(now)).run();
        await checkUpdateNotify(env);
    } catch (e) {}
}

const ENTRY_UI = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>管理员逃生入口</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;background:linear-gradient(135deg,#0f2027,#203a43,#2c5364);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#e8eaed;padding:20px}
.card{background:rgba(255,255,255,.06);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:32px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.4);margin-bottom:16px}
h1{font-size:19px;margin-bottom:8px;text-align:center}
.sub{font-size:13px;color:#aab4c0;text-align:center;margin-bottom:18px;line-height:1.6}
input[type=password],input[type=text],textarea{width:100%;padding:12px 14px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(255,255,255,.07);color:#fff;font-size:14px;outline:none;margin-bottom:12px;box-sizing:border-box}
input:focus,textarea:focus{border-color:#4da3ff}
textarea{resize:vertical;min-height:80px}
button{width:100%;padding:13px;border:none;border-radius:10px;background:#4da3ff;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
button:active{opacity:.85}
button.ghost{background:transparent;border:1px solid rgba(255,255,255,.3);margin-top:8px}
.row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:13px;margin-bottom:12px}
.row label{display:flex;align-items:center;gap:5px;cursor:pointer}
.err{color:#ff6b6b;font-size:13px;text-align:center;margin-top:10px;min-height:18px}
.ok{color:#34c759;font-size:13px;text-align:center;margin-top:10px;min-height:18px}
.tip{margin-top:16px;font-size:12px;color:#8b96a3;text-align:center;line-height:1.7}
</style>
</head>
<body>
<div class="card" id="loginCard">
<h1>&#128274; 管理员逃生入口</h1>
<div class="sub">当前 IP 被访问控制拦截时,<br>输入管理员密码即可解锁并管理</div>
<input type="password" id="pass" placeholder="管理员密码" autocomplete="off">
<button onclick="go()">解锁</button>
<div class="err" id="err"></div>
</div>
<div class="card" id="manageCard" style="display:none; max-width:460px;">
<h1>&#9881; IP 访问控制</h1>
<div class="sub">你的 IP <b id="myIp" style="color:#fff;">-</b> 已加入最高白名单,<br>任何模式都可访问面板与节点</div>
<div class="row">
<label><input type="radio" name="m" value="off" style="accent-color:#4da3ff;"> 关闭</label>
<label><input type="radio" name="m" value="whitelist" style="accent-color:#4da3ff;"> 白名单</label>
<label><input type="radio" name="m" value="blacklist" style="accent-color:#4da3ff;"> 黑名单</label>
</div>
<textarea id="ips" placeholder="IP / 网段,每行一个,支持 CIDR&#10;如: 1.2.3.4&#10;5.6.7.0/24"></textarea>
<input type="text" id="countries" placeholder="国家/地区码,每行一个 ISO 两位码,如 US、RU、CN">
<input type="text" id="redirect" placeholder="跳转网址(被拦截时 302 跳转)">
<div style="margin-bottom:12px; border-top:1px solid rgba(255,255,255,.12); padding-top:12px;">
<div style="font-size:13px; font-weight:600; margin-bottom:6px;">最高白名单</div>
<div style="font-size:12px; color:#8b96a3; margin-bottom:8px; line-height:1.6;">你的 IP 已自动加入。共享节点的其他 IP 可在此删除,修改后点保存生效。</div>
<div id="tList" style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px;"></div>
<div style="display:flex; gap:8px;">
<input type="text" id="tAdd" placeholder="输入要添加的 IP" style="flex:1; margin-bottom:0;">
<button onclick="tAddOne()" style="width:auto; padding:12px 14px; font-size:13px; background:rgba(255,255,255,.12);">添加</button>
</div>
</div>
<button onclick="save()">保存设置</button>
<div class="ok" id="sOk"></div>
<div class="err" id="sErr"></div>
<button class="ghost" onclick="goPanel()">进入面板 &rarr;</button>
<div class="tip">最高白名单在登录时自动加入,无需手动管理;<br>此入口不受 IP 封锁与 token 模式影响</div>
</div>
<script>
function $(id){return document.getElementById(id);}
async function go(){
  var p=$('pass').value.trim();
  var err=$('err');
  if(!p){err.textContent='请输入密码';return;}
  try{
    var r=await fetch('/api/entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:p})});
    var d=await r.json();
    if(d.success){
      err.textContent='';
      $('loginCard').style.display='none';
      $('manageCard').style.display='block';
      $('myIp').textContent=d.currentIp||'-';
      loadCfg();
    }else{err.textContent=d.error||'解锁失败';}
  }catch(e){err.textContent='请求失败: '+e.message;}
}
var ENTRY_TRUSTED=[];
function escHtmlE(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function renderTList(){
  var box=$('tList');
  if(!box)return;
  if(!ENTRY_TRUSTED.length){box.innerHTML='<div style="font-size:12px;color:#8b96a3;">暂无信任 IP</div>';return;}
  box.innerHTML=ENTRY_TRUSTED.map(function(ip){return '<div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;padding:5px 8px;background:rgba(255,255,255,.06);border-radius:6px;gap:8px;"><span style="word-break:break-all;">'+escHtmlE(ip)+'</span><button onclick="tDel(this)" data-ip="'+escHtmlE(ip)+'" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:13px;flex-shrink:0;">✕</button></div>';}).join('');
}
function tDel(btn){var ip=btn.getAttribute('data-ip');if(!ip)return;ENTRY_TRUSTED=ENTRY_TRUSTED.filter(function(x){return x!==ip;});renderTList();}
function tAddOne(){var v=$('tAdd').value.trim();if(!v)return;if(ENTRY_TRUSTED.indexOf(v)<0)ENTRY_TRUSTED.push(v);$('tAdd').value='';renderTList();}
async function loadCfg(){
  try{
    var r=await fetch('/api/ipguard');
    var d=await r.json();
    if(!d.success)return;
    var radios=document.querySelectorAll('input[name=m]');
    for(var i=0;i<radios.length;i++){radios[i].checked=(radios[i].value===d.mode);}
    $('ips').value=(d.ips||[]).join('\\n');
    $('countries').value=(d.countries||[]).join('\\n');
    $('redirect').value=d.redirect||'';
    ENTRY_TRUSTED=(d.trusted||[]).slice();
    renderTList();
  }catch(e){}
}
async function save(){
  var mode='off';
  var radios=document.querySelectorAll('input[name=m]');
  for(var i=0;i<radios.length;i++){if(radios[i].checked)mode=radios[i].value;}
  var ips=$('ips').value.split('\\n').map(function(x){return x.trim();}).filter(Boolean);
  var countries=$('countries').value.split('\\n').map(function(x){return x.trim().toUpperCase();}).filter(Boolean);
  var redirect=$('redirect').value.trim();
  $('sOk').textContent='';
  $('sErr').textContent='';
  try{
    var r=await fetch('/api/ipguard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:mode,ips:ips,countries:countries,redirect:redirect,trusted:ENTRY_TRUSTED})});
    var d=await r.json();
    if(d.success){$('sOk').textContent='设置已保存';}else{$('sErr').textContent='保存失败: '+(d.error||'');}
  }catch(e){$('sErr').textContent='保存失败: '+e.message;}
}
function goPanel(){location.href='/';}
$('pass').addEventListener('keydown',function(e){if(e.key==='Enter'){go();}});
</script>
</body>
</html>`;

// ============ IP 被封提示页(未设置跳转网址时显示) ============
function escHtmlStr(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const IP_BLOCKED_UI = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>访问已被禁止</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#e8eaed;padding:20px}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:36px;width:100%;max-width:400px;text-align:center}
h1{font-size:22px;margin-bottom:12px}
.sub{font-size:14px;color:#aab4c0;margin-bottom:20px;line-height:1.7;word-break:break-all}
.badge{display:inline-block;background:rgba(255,107,107,.15);border:1px solid rgba(255,107,107,.35);color:#ff6b6b;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:16px}
.tip{font-size:12px;color:#8b96a3;line-height:1.7}
</style>
</head>
<body>
<div class="card">
<span class="badge">&#128683; 访问已被禁止</span>
<h1>你的 IP 已被禁用</h1>
<div class="sub">当前 IP: <b style="color:#fff;">__IP__</b><br>地区: __COUNTRY__<br>该 IP 不在允许访问范围内</div>
<div class="tip">如有疑问请联系管理员</div>
</div>
</body>
</html>`;

const IP_BLOCKED_HARD_UI = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>访问已被禁止</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2a0f0f,#1a1a2e,#0f3460);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#e8eaed;padding:20px}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,107,107,.25);border-radius:18px;padding:36px;width:100%;max-width:400px;text-align:center}
h1{font-size:22px;margin-bottom:12px}
.sub{font-size:14px;color:#aab4c0;margin-bottom:20px;line-height:1.7;word-break:break-all}
.badge{display:inline-block;background:rgba(255,107,107,.15);border:1px solid rgba(255,107,107,.35);color:#ff6b6b;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:16px}
.tip{font-size:12px;color:#8b96a3;line-height:1.7}
</style>
</head>
<body>
<div class="card">
<span class="badge">&#128683; 访问已被禁止</span>
<h1>你的 IP 已被拉黑</h1>
<div class="sub">当前 IP: <b style="color:#fff;">__IP__</b></div>
<div class="tip">该 IP 已被管理员加入最高黑名单，如有疑问请联系管理员</div>
</div>
</body>
</html>`;

// ============ 系统保留后缀(节点前缀/反代 Token key 不可占用) ============
const RESERVED_SUFFIX = ['entry', 'api', 'catch', 'speedtest', '__client_rtt__', 'favicon.ico'];
function isReservedSuffix(s) {
  const t = String(s || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  return RESERVED_SUFFIX.indexOf(t) >= 0;
}

// ============ 最高白名单(/entry 登录成功的 IP, 任何模式都例外) ============
async function getIpGuardTrusted(env) {
  try {
    const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'ipguard_trusted'").first();
    if (r && r.value) {
      const arr = JSON.parse(r.value);
      return Array.isArray(arr) ? arr : [];
    }
  } catch (e) {}
  return [];
}
async function addIpGuardTrusted(env, ip) {
  if (!ip) return;
  try {
    const cur = await getIpGuardTrusted(env);
    if (cur.indexOf(ip) < 0) {
      cur.push(ip);
      await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('ipguard_trusted',?) ON CONFLICT(key) DO UPDATE SET value=?").bind(JSON.stringify(cur), JSON.stringify(cur)).run();
    }
  } catch (e) {}
}
async function saveIpGuardTrusted(env, arr) {
  try {
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('ipguard_trusted',?) ON CONFLICT(key) DO UPDATE SET value=?").bind(JSON.stringify(arr), JSON.stringify(arr)).run();
  } catch (e) {}
}

// ============ 最高黑名单(任何模式都拦截,优先于最高白名单) ============
async function getIpGuardBlocked(env) {
  try {
    const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'ipguard_blocked'").first();
    if (r && r.value) {
      const c = JSON.parse(r.value);
      return { ips: Array.isArray(c.ips) ? c.ips : [], redirect: String(c.redirect || '') };
    }
  } catch (e) {}
  return { ips: [], redirect: '' };
}
async function saveIpGuardBlocked(env, ips, redirect) {
  try {
    const val = JSON.stringify({ ips, redirect: String(redirect || '') });
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('ipguard_blocked',?) ON CONFLICT(key) DO UPDATE SET value=?").bind(val, val).run();
  } catch (e) {}
}
async function addIpGuardBlocked(env, ip, redirect) {
  if (!ip) return;
  try {
    const cur = await getIpGuardBlocked(env);
    if (cur.ips.indexOf(ip) < 0) cur.ips.push(ip);
    if (redirect !== undefined) cur.redirect = String(redirect || '');
    await saveIpGuardBlocked(env, cur.ips, cur.redirect);
  } catch (e) {}
}
async function removeIpGuardBlocked(env, ip) {
  if (!ip) return;
  try {
    const cur = await getIpGuardBlocked(env);
    const next = cur.ips.filter(x => x !== ip);
    if (next.length !== cur.ips.length) await saveIpGuardBlocked(env, next, cur.redirect);
  } catch (e) {}
}

// ============ IP 访问控制(白名单/黑名单 + 国家封锁) ============
async function getIpGuard(env) {
  try {
    const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'ipguard'").first();
    if (r && r.value) {
      const c = JSON.parse(r.value);
      return { mode: c.mode === 'whitelist' || c.mode === 'blacklist' ? c.mode : 'off',
               ips: Array.isArray(c.ips) ? c.ips : [],
               countries: Array.isArray(c.countries) ? c.countries : [],
               redirect: String(c.redirect || '') };
    }
  } catch (e) {}
  return { mode: 'off', ips: [], countries: [], redirect: '' };
}
function ipv4ToInt(ip) {
  const p = ip.split('.');
  if (p.length !== 4) return -1;
  let v = 0;
  for (const seg of p) {
    if (!/^\d{1,3}$/.test(seg)) return -1;
    const n = parseInt(seg, 10);
    if (n > 255) return -1;
    v = v * 256 + n;
  }
  return v >>> 0;
}
function ipv6ToBytes(ip) {
  try {
    let s = ip;
    if (s.indexOf('::') >= 0) {
      const t = s.split('::');
      const left = t[0] ? t[0].split(':') : [], right = t[1] ? t[1].split(':') : [];
      const pad = 8 - left.length - right.length;
      if (pad < 0) return null;
      s = left.concat(Array(pad).fill('0'), right).join(':');
    }
    const parts = s.split(':');
    if (parts.length !== 8) return null;
    const bytes = [];
    for (const p of parts) {
      const n = parseInt(p, 16);
      if (isNaN(n)) return null;
      bytes.push((n >> 8) & 0xff, n & 0xff);
    }
    return bytes;
  } catch (e) { return null; }
}
function ipInCidr(ip, cidr) {
  const idx = cidr.indexOf('/');
  if (idx <= 0) return false;
  const net = cidr.slice(0, idx).trim();
  const bits = parseInt(cidr.slice(idx + 1), 10);
  if (isNaN(bits)) return false;
  if (net.indexOf('.') >= 0) {
    if (bits < 0 || bits > 32) return false;
    const a = ipv4ToInt(ip), b = ipv4ToInt(net);
    if (a < 0 || b < 0) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (a & mask) === (b & mask);
  }
  if (net.indexOf(':') >= 0) {
    if (bits < 0 || bits > 128) return false;
    const a = ipv6ToBytes(ip), b = ipv6ToBytes(net);
    if (!a || !b) return false;
    const full = bits >> 3, rem = bits & 7;
    for (let i = 0; i < full; i++) if (a[i] !== b[i]) return false;
    if (rem) { const m = 0xff << (8 - rem); if ((a[full] & m) !== (b[full] & m)) return false; }
    return true;
  }
  return false;
}
function ipMatchAny(ip, list) {
  if (!ip || !Array.isArray(list) || !list.length) return false;
  for (const raw of list) {
    const t = String(raw).trim();
    if (!t) continue;
    if (t === ip) return true;
    if (t.indexOf('/') >= 0 && ipInCidr(ip, t)) return true;
  }
  return false;
}

// EMOS 聚合目录缓存(模块级,跨请求复用;10min 内存 + D1 1h 持久兜底)
const emosCatalogCache = new Map();
let emosCatTableReady = false; // DDL 只执行一次,避免每次请求重复建表开销

export default {
    // 每天自动运行发送 TG 统计
    async scheduled(event, env, ctx) {
        if (env.TG_BOT_TOKEN && env.TG_CHAT_ID && env.DB) {
            ctx.waitUntil(sendTgStats(env, env.TG_CHAT_ID));
        }
        if (env.DB) {
            ctx.waitUntil(scanOverdueNotify(env, ctx));
        }
        // 新版本推送通知（Bark / Telegram）
        if (env.DB) {
            ctx.waitUntil(checkUpdateNotify(env));
        }
    },

    async fetch(request, env, ctx) {
        try {
        const url = new URL(request.url);
        // 保号超限检查：请求时低频触发（6 小时节流），无需 Cron 也能每日推送
        if (env.DB && ctx && ctx.waitUntil && url.pathname !== '/__client_rtt__') {
            ctx.waitUntil(maybeScanOverdue(env));
        }
        // 新版本推送检查：请求时低频触发（6 小时节流）
        if (env.DB && ctx && ctx.waitUntil && url.pathname !== '/__client_rtt__') {
            ctx.waitUntil(maybeCheckUpdate(env));
        }

        // ==========================================
        //  新增：全云厂商 Worker 放置区域接口
        // （本块依赖 ROLE 认证，已放置于认证逻辑之后）
        // ==========================================

        // ==========================================
        //  新增：CF 节点与落地机房探针接口
        // ==========================================
        if (url.pathname === '/api/trace') {
            const cf = request.cf || {};
            let egressColo = '探测中...';
            try {
                // 请求 CF 官方 trace 接口获取落地机房
                const traceRes = await fetch('https://1.1.1.1/cdn-cgi/trace', {
                    headers: { 'User-Agent': 'Mozilla/5.0 (CF-Worker-Trace)' }
                });
                const traceText = await traceRes.text();
                const match = traceText.match(/colo=([A-Z]+)/);
                if (match) egressColo = match[1];
            } catch(e) {
                egressColo = '获取失败';
            }

            return new Response(JSON.stringify({
                success: true,
                entryCountry: cf.country || '未知',
                entryCity: cf.city || '',
                entryColo: cf.colo || '未知',
                egressColo: egressColo
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // ==========================================
        //  新增：客户端 RTT 实时极速探针接口
        // 直接返回 204 无内容，且强制不缓存，确保每次都是真实的物理延迟
        // ==========================================
        if (url.pathname === '/__client_rtt__') {
            return new Response(null, {
                status: 204,
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Expires": "0",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // ==========================================
        //  新增：当前域名解析 IP 的下载速度测试
        //  /speedtest              测速页面（浏览器端，测当前域名解析 IP 的下载速度）
        //  /speedtest/data?bytes=N 下载负载端点（同源，走的就是当前域名解析到的 CF IP）
        // ==========================================
        if (url.pathname === '/speedtest' || url.pathname === '/speedtest/') {
            const SPEEDTEST_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>下载测速 · 反代面板</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#0f1117;color:#e6e8ee;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{background:#161a24;border:1px solid #2a3040;border-radius:18px;padding:28px;width:100%;max-width:560px;box-shadow:0 12px 40px rgba(0,0,0,.4)}
  h1{font-size:20px;margin-bottom:6px}
  .sub{color:#8a91a5;font-size:13px;margin-bottom:20px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #232938;font-size:14px;gap:16px}
  .row:last-of-type{border-bottom:none}
  .k{color:#8a91a5;white-space:nowrap}
  .v{font-weight:600;word-break:break-all;text-align:right}
  .ip{color:#5aa2ff}
  .speed{font-size:42px;font-weight:800;color:#4fd08a;text-align:center;margin:18px 0 6px;line-height:1}
  .speed small{font-size:14px;color:#8a91a5;font-weight:500}
  .bar{height:10px;background:#232938;border-radius:6px;overflow:hidden;margin:8px 0 16px}
  .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#4fd08a,#23a6d8);transition:width .4s ease}
  .opts{display:flex;gap:10px;margin-bottom:12px}
  select,button.ghost{flex:1;padding:11px;border:1px solid #2a3040;border-radius:10px;background:#161a24;color:#e6e8ee;font-size:13px}
  button.go{width:100%;padding:13px;border:none;border-radius:10px;cursor:pointer;font-size:15px;font-weight:700;background:#2563eb;color:#fff;transition:.2s}
  button.go:hover{background:#1d4ed8}
  button.go:disabled{opacity:.5;cursor:not-allowed}
  .meta{text-align:center;font-size:12px;color:#8a91a5;margin-top:12px;min-height:16px}
  .note{font-size:12px;color:#6b7280;margin-top:16px;line-height:1.7;border-top:1px dashed #2a3040;padding-top:12px}
  a.back{display:inline-flex;align-items:center;gap:6px;padding:7px 15px;border-radius:999px;background:rgba(0,180,255,.1);border:1px solid rgba(0,180,255,.28);color:#5aa2ff;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:14px;transition:.2s}
  a.back:hover{background:rgba(0,180,255,.2)}
</style>
</head>
<body>
<div class="card">
  <a class="back" href="/">&#8592; 返回面板</a>
  <h1>&#128339; 当前域名下载测速</h1>
  <div class="sub">浏览器直连当前域名，测其解析到的 CF IP 的下载速度</div>
  <div class="row"><span class="k">测试域名</span><span class="v" id="host">…</span></div>
  <div class="row"><span class="k">解析到的 IP</span><span class="v ip" id="ips">查询中…</span></div>
  <div class="speed"><span id="num">--</span> <small id="unit">Mbps</small></div>
  <div class="bar"><i id="barfill"></i></div>
  <div class="opts">
    <select id="size">
      <option value="10485760">负载 10 MB</option>
      <option value="20971520">负载 20 MB</option>
      <option value="52428800" selected>负载 50 MB</option>
    </select>
    <button class="ghost" id="runs">测 3 次取最优</button>
  </div>
  <button class="go" id="go">开始测速</button>
  <div class="meta" id="meta"></div>
  <div class="note">方式：从本域名直接下载测试负载，即走当前域名解析到的 CF 边缘 IP，多次取最优值。
若 IP 显示“查询失败”，多为 DoH 被网络环境限制，不影响下载测速结果。</div>
</div>
<script>
(function(){
  var host=location.host;
  document.getElementById('host').textContent=host;
  var ipsEl=document.getElementById('ips');
  var sizeSel=document.getElementById('size');
  var goBtn=document.getElementById('go');
  var numEl=document.getElementById('num');
  var unitEl=document.getElementById('unit');
  var barEl=document.getElementById('barfill');
  var metaEl=document.getElementById('meta');
  var RUNS=3;

  function resolveIps(){
    try{
      fetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(host)+'&type=A',{headers:{accept:'application/dns-json'}})
        .then(function(r){return r.json();})
        .then(function(d){
          var arr=(d&&d.Answer||[]).map(function(a){return a.data;});
          ipsEl.textContent=arr.length?arr.join('  '):'查询失败';
        })
        .catch(function(){ipsEl.textContent='查询失败（DoH 受限）';});
    }catch(e){ipsEl.textContent='查询失败';}
  }
  resolveIps();

  async function runOnce(bytes){
    var url='/speedtest/data?bytes='+bytes+'&t='+Date.now();
    var t0=performance.now();
    await fetch(url,{cache:'no-store'}).then(function(r){return r.arrayBuffer();});
    var ms=performance.now()-t0;
    return bytes*8/(ms/1000);
  }

  goBtn.addEventListener('click',async function(){
    var bytes=parseInt(sizeSel.value,10);
    goBtn.disabled=true;goBtn.textContent='测速中…';numEl.textContent='--';barEl.style.width='0';
    var best=0;
    for(var i=0;i<RUNS;i++){
      try{
        var bps=await runOnce(bytes);
        if(bps>best)best=bps;
        metaEl.textContent='第 '+(i+1)+'/'+RUNS+' 次 · 当前 '+(bps/1048576).toFixed(2)+' Mbps';
      }catch(e){metaEl.textContent='第 '+(i+1)+' 次失败：'+e.message;break;}
    }
    if(best>0){
      numEl.textContent=(best/1048576).toFixed(2);
      unitEl.textContent='Mbps · '+(best/1048576/8).toFixed(2)+' MB/s';
      barEl.style.width=Math.min(100,best/1000*100)+'%';
    }
    goBtn.disabled=false;goBtn.textContent='重新测速';
  });
})();
</script>
</body>
</html>`;
            return new Response(SPEEDTEST_HTML, { headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
        }

        if (url.pathname === '/speedtest/data') {
            const bytes = Math.min(parseInt(url.searchParams.get('bytes') || '10485760', 10) || 10485760, 52428800); // 上限 50MB
            const CHUNK = 1024 * 1024;
            let sent = 0;
            const stream = new ReadableStream({
                pull(controller) {
                    if (sent * CHUNK >= bytes) { controller.close(); return; }
                    const n = Math.min(CHUNK, bytes - sent * CHUNK);
                    controller.enqueue(new Uint8Array(n));
                    sent++;
                }
            });
            return new Response(stream, {
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Length": String(bytes),
                    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Expires": "0",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // Telegram Webhook 拦截
        if (url.pathname === '/api/tg-webhook' && request.method === 'POST') {
            try {
                const body = await request.json();
                if (body.message && body.message.text === '/stats') {
                    if (env.DB && env.TG_BOT_TOKEN) {
                        ctx.waitUntil(sendTgStats(env, body.message.chat.id));
                    }
                }
                return new Response("OK");
            } catch(e) { return new Response("OK"); }
        }

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400" } });
        }

        // ============ 反代 Token 门禁（D1 存储） ============
        // 配置存 app_config；来访记录存 proxy_hits 表（不占用 KV 免费额度）
        async function getProxyToken(env) {
            if (!env.DB) return null;
            try {
                await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'proxy_token'").first();
                if (!row || !row.value) return null;
                return JSON.parse(row.value);
            } catch (e) { return null; }
        }
        function proxyTokenPrefix(pt) {
            return (pt && pt.enabled && pt.key) ? pt.key + '/' : '';
        }
        async function recordProxyHit(env, request, path) {
            if (!env.DB) return;
            try {
                const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'Unknown';
                const ua = (request.headers.get('User-Agent') || '').slice(0, 200);
                const ts = Date.now();
                const p = String(path || '').slice(0, 200);
                await env.DB.prepare('CREATE TABLE IF NOT EXISTS proxy_hits (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT, path TEXT, ua TEXT, ts INTEGER, times INTEGER)').run();
                const exist = await env.DB.prepare('SELECT id, times FROM proxy_hits WHERE ip = ? AND path = ? ORDER BY id DESC LIMIT 1').bind(ip, p).first();
                if (exist) {
                    await env.DB.prepare('UPDATE proxy_hits SET times = ?, ts = ? WHERE id = ?').bind((exist.times || 1) + 1, ts, exist.id).run();
                } else {
                    await env.DB.prepare('INSERT INTO proxy_hits (ip, path, ua, ts, times) VALUES (?, ?, ?, ?, 1)').bind(ip, p, ua, ts).run();
                }
            } catch (e) {}
        }
        function catchPageHtml(ip, ua) {
            const esc = s => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
            return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oops</title><style>
        body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at top,#0f0c29,#302b63,#24243e);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#fff}
        .box{text-align:center;padding:48px;border:1px solid rgba(255,255,255,.15);border-radius:20px;background:rgba(255,255,255,.05);backdrop-filter:blur(8px);max-width:90vw}
        h1{font-size:34px;margin:0 0 12px;letter-spacing:2px}
        .sub{font-size:14px;color:#a8b2d1;margin-bottom:24px}
        .ip{font-size:18px;font-weight:700;color:#ffd700;word-break:break-all}
        .meta{font-size:12px;color:#7f8bb3;margin-top:16px;word-break:break-all}
      </style></head><body><div class="box">
        <h1>宝贝抓到你了 👋</h1>
        <div class="sub">你的来访信息已被记录</div>
        <div class="ip">${esc(ip)}</div>
        <div class="meta">UA: ${esc(ua).slice(0,120)}</div>
      </div></body></html>`;
        }
        if (url.pathname === '/catch') {
            const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'Unknown';
            return new Response(catchPageHtml(ip, request.headers.get('User-Agent') || ''), { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' } });
        }

        const EXPECTED_TOKEN = env.ADMIN_TOKEN;
        if (!EXPECTED_TOKEN) return new Response("请在 Worker 变量中配置 ADMIN_TOKEN", { status: 500 });

        function getCookie(req, name) {
            const cookieString = req.headers.get("Cookie");
            if (!cookieString) return null;
            const match = cookieString.match(new RegExp('(^| )' + name + '=([^;]+)'));
            if (match) return decodeURIComponent(match[2]);
            return null;
        }

        // 四档认证：env.ADMIN_TOKEN(永不失效) > 网页修改的管理员密码 > 子管理员密码(查看+审核节点申请) > 订阅者密码(只读)
        async function getAuthRole(req) {
            const token = getCookie(req, 'admin_token');
            if (!token) return null;
            if (token === EXPECTED_TOKEN) return 'admin';
            if (!env.DB) return null;
            try {
                await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                const adminRow = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('admin_pass').first();
                if (adminRow && adminRow.value && token === adminRow.value) return 'admin';
                const subadminRow = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subadmin_pass').first();
                if (subadminRow && subadminRow.value && token === subadminRow.value) return 'subadmin';
                const subRow = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers').first();
                if (subRow && subRow.value) {
                    const list = JSON.parse(subRow.value);
                    if (Array.isArray(list) && list.includes(token)) return 'sub';
                }
            } catch (e) {}
            return null;
        }

        // 订阅用户是否有「直接添加节点」权限(管理员在订阅用户管理里按密码开通)
        async function subCanAdd(env, token) {
            if (!env.DB || !token) return false;
            try {
                const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'subscribers_can_add'").first();
                if (!row || !row.value) return false;
                const list = JSON.parse(row.value);
                return Array.isArray(list) && list.includes(token);
            } catch (e) { return false; }
        }

        const IPG_BYPASS = ['/api/tg-webhook', '/catch', '/__client_rtt__', '/api/ipguard', '/api/ipguard/block', '/entry', '/api/entry'];
        if (IPG_BYPASS.indexOf(url.pathname) < 0) {
            const guard = await getIpGuard(env);
            const clientIp = (request.headers.get('CF-Connecting-IP') || '').trim();
            // 最高黑名单:任何模式都拦截(优先于最高白名单);设置跳转则 302,否则显示拉黑页
            const hardBlock = await getIpGuardBlocked(env);
            if (clientIp && hardBlock.ips.length && ipMatchAny(clientIp, hardBlock.ips)) {
                if (hardBlock.redirect) return Response.redirect(hardBlock.redirect, 302);
                return new Response(IP_BLOCKED_HARD_UI.replace('__IP__', escHtmlStr(clientIp)), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
            }
            if (guard.mode !== 'off') {
                // 最高白名单: /entry 登录成功的 IP 永远放行(黑/白名单模式均例外)
                const trusted = await getIpGuardTrusted(env);
                if (trusted.indexOf(clientIp) < 0) {
                    const country = (request.headers.get('CF-IPCountry') || '').trim().toUpperCase();
                    const hit = ipMatchAny(clientIp, guard.ips) || (country && guard.countries.indexOf(country) >= 0);
                    const blocked = guard.mode === 'whitelist' ? !hit : hit;
                    if (blocked) {
                        // 与伪装版行为一致:admin cookie 不在名单同样拦截;逃生只走 /entry(登录后 IP 进最高白名单)
                        if (guard.redirect) return Response.redirect(guard.redirect, 302);
                        return new Response(IP_BLOCKED_UI.replace('__IP__', escHtmlStr(clientIp)).replace('__COUNTRY__', escHtmlStr(country || '-')), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
                    }
                }
            }
        }

        const isPanelOrApi = url.pathname === '/' || url.pathname.startsWith('/api/');
        let ROLE = null;
        if (isPanelOrApi && url.pathname !== '/api/tg-webhook' && url.pathname !== '/api/entry') {
            ROLE = await getAuthRole(request);
            if (!ROLE) {
                if (url.pathname === '/') {
                    const lg = await getLogo(env);
                    const loginHtml = (lg && lg.value) ? LOGIN_UI.split(EMBY_LOGO).join(lg.value) : LOGIN_UI;
                    return new Response(loginHtml, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
                }
                else return new Response('Unauthorized', { status: 401 });
            }
        }

        if (url.pathname === '/') {
            const lg = await getLogo(env);
            const uiHtml = (lg && lg.value) ? HTML_UI.split(EMBY_LOGO).join(lg.value) : HTML_UI;
            return new Response(uiHtml, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        if (url.pathname === '/entry' && request.method === 'GET') {
            return new Response(ENTRY_UI, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }
        // 逃生登录接口:只认管理员密码(ADMIN_TOKEN / admin_pass),不受 token 模式影响
        if (url.pathname === '/api/entry' && request.method === 'POST') {
            try {
                const body = await request.json();
                const pass = String(body.pass || '');
                // 与面板认证一致:ADMIN_TOKEN 环境变量优先(永不失效),D1 admin_pass 仅作兜底
                let adminPass = EXPECTED_TOKEN || '';
                if (!adminPass && env.DB) {
                    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'admin_pass'").first();
                    if (row && row.value) adminPass = row.value;
                }
                if (pass && pass === adminPass) {
                    const clientIp = (request.headers.get('CF-Connecting-IP') || '').trim();
                    if (clientIp) {
                        // 逃生成功:先解除最高黑名单,再加入最高白名单(黑名单优先于白名单,必须两步都做)
                        await removeIpGuardBlocked(env, clientIp);
                        await addIpGuardTrusted(env, clientIp);
                    }
                    return new Response(JSON.stringify({ success: true, currentIp: clientIp }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'admin_token=' + encodeURIComponent(pass) + '; path=/; max-age=2592000;' } });
                }
                return Response.json({ success: false, error: '密码错误' });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }
        if (url.pathname === '/') {
            const lg = await getLogo(env);
            const uiHtml = (lg && lg.value) ? HTML_UI.split(EMBY_LOGO).join(lg.value) : HTML_UI;
            return new Response(uiHtml, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // ==========================================
        // 2.2 角色 / 账户 / 订阅者管理接口
        // ==========================================
        // 全云厂商 Worker 放置区域接口（依赖 ROLE 认证）
        if (url.pathname === '/api/placement' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const placementData = body.placement;

                if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_WORKER_NAME) {
                    return new Response(JSON.stringify({ success: false, msg: '后台变量未配置全！请检查 CF_API_TOKEN, CF_ACCOUNT_ID, CF_WORKER_NAME' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                }

                const formData = new FormData();
                formData.append('settings', new Blob([JSON.stringify({ placement: placementData })], { type: 'application/json' }));

                const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${env.CF_WORKER_NAME}/settings`;
                const cfRes = await fetch(cfUrl, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` },
                    body: formData
                });

                const cfData = await cfRes.json();
                if (cfData.success) {
                    return new Response(JSON.stringify({ success: true, msg: '部署区域修改成功！' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                } else {
                    return new Response(JSON.stringify({ success: false, msg: 'CF报错: ' + (cfData.errors[0]?.message || '未知错误') }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                }
            } catch(e) {
                return new Response(JSON.stringify({ success: false, msg: e.message }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
            }
        }

        if (url.pathname === '/api/me' && request.method === 'GET') {
            let canAdd = false;
            if (ROLE === 'sub') canAdd = await subCanAdd(env, getCookie(request, 'admin_token'));
            return Response.json({ success: true, role: ROLE, canAdd });
        }

        // 版本信息（登录可见）：当前版本 + 更新提醒开关
        if (url.pathname === '/api/version' && request.method === 'GET') {
            let updateNotify = true;
            try {
                if (env.DB) {
                    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'update_notify'").first();
                    if (row && row.value !== null && row.value !== undefined) updateNotify = String(row.value) !== '0';
                }
            } catch (e) {}
            return Response.json({ success: true, version: CURRENT_VERSION, updateNotify });
        }

        // 保号通知设置（登录可见，脱敏返回）
        if (url.pathname === '/api/account/notify' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            let cfg = {};
            try {
                if (env.DB) {
                    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'notify_settings'").first();
                    if (row && row.value) cfg = JSON.parse(row.value);
                }
            } catch (e) {}
            return Response.json({ success: true, barkKey: cfg.barkKey ? '********' : '', barkLevel: cfg.barkLevel || 'active', barkServer: cfg.barkServer || 'https://api.day.app', barkNotify: cfg.barkNotify !== false, tgToken: cfg.tgToken ? '********' : '', tgChatId: cfg.tgChatId || '', tgNotify: cfg.tgNotify !== false });
        }

        // 自定义头像（登录后可见）
        if (url.pathname === '/api/logo' && request.method === 'GET') {
            const l = await getLogo(env);
            return Response.json({ success: true, logo: l });
        }

        // 测试通知（bark / tg）
        if (url.pathname === '/api/test-notify' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const type = String(body.type || 'bark');
                const cfg = await getNotifyCfg(env);
                if (type === 'bark') {
                    if (!cfg.barkKey) return Response.json({ success: false, error: '未配置 Bark Key' });
                    const ok = await sendBarkN(cfg, 'Emby 反代面板', '保号通知测试成功 ✅');
                    return Response.json({ success: ok, error: ok ? '' : 'Bark 发送失败，请检查 Key/服务地址' });
                }
                if (type === 'tg') {
                    if (!cfg.tgToken || !cfg.tgChatId) return Response.json({ success: false, error: '未配置 TG Bot Token / Chat ID' });
                    const ok = await sendTgN(cfg, '保号通知测试成功 ✅');
                    return Response.json({ success: ok, error: ok ? '' : 'TG 发送失败，请检查 Token / Chat ID' });
                }
                return Response.json({ success: false, error: '未知类型' });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        if (url.pathname === '/api/ipguard' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const cfg = await getIpGuard(env);
                const currentIp = (request.headers.get('CF-Connecting-IP') || '').trim();
                const country = (request.headers.get('CF-IPCountry') || '').trim().toUpperCase();
                return Response.json({ success: true, mode: cfg.mode, ips: cfg.ips, countries: cfg.countries, redirect: cfg.redirect, currentIp: currentIp, currentCountry: country, trusted: await getIpGuardTrusted(env), blocked: await getIpGuardBlocked(env) });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }
        if (url.pathname === '/api/ipguard' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const mode = body.mode === 'whitelist' || body.mode === 'blacklist' ? body.mode : 'off';
                const ips = Array.isArray(body.ips) ? body.ips.map(x => String(x).trim()).filter(Boolean) : [];
                const countries = Array.isArray(body.countries) ? body.countries.map(x => String(x).trim().toUpperCase()).filter(Boolean) : [];
                const redirect = String(body.redirect || '').trim();
                const trusted = Array.isArray(body.trusted) ? body.trusted.map(x => String(x).trim()).filter(Boolean) : undefined;
                const blockedIps = Array.isArray(body.blockedIps) ? body.blockedIps.map(x => String(x).trim()).filter(Boolean) : undefined;
                const blockedRedirect = body.blockedRedirect !== undefined ? String(body.blockedRedirect || '').trim() : undefined;
                const val = JSON.stringify({ mode, ips, countries, redirect });
                await env.DB.prepare('INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=?').bind('ipguard', val, val).run();
                if (trusted) await saveIpGuardTrusted(env, trusted);
                if (blockedIps) await saveIpGuardBlocked(env, blockedIps, blockedRedirect !== undefined ? blockedRedirect : (await getIpGuardBlocked(env)).redirect);
                const blk = await getIpGuardBlocked(env);
                return Response.json({ success: true, mode, ips, countries, redirect, trusted: trusted || [], blocked: blk });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }
        // 一键封禁(仅管理员):把 IP 加入最高黑名单,可选带 302 跳转链接
        if (url.pathname === '/api/ipguard/block' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const ip = String(body.ip || '').trim();
                if (!ip) return Response.json({ success: false, error: '缺少 IP' });
                const redirect = body.redirect !== undefined ? String(body.redirect || '').trim() : undefined;
                await addIpGuardBlocked(env, ip, redirect);
                return Response.json({ success: true, blocked: await getIpGuardBlocked(env) });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }


        // ==========================================
        // 2.2 角色 / 账户 / 订阅者管理接口
        // ==========================================
        // 全云厂商 Worker 放置区域接口（依赖 ROLE 认证）
        if (url.pathname === '/api/placement' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const placementData = body.placement;

                if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_WORKER_NAME) {
                    return new Response(JSON.stringify({ success: false, msg: '后台变量未配置全！请检查 CF_API_TOKEN, CF_ACCOUNT_ID, CF_WORKER_NAME' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                }

                const formData = new FormData();
                formData.append('settings', new Blob([JSON.stringify({ placement: placementData })], { type: 'application/json' }));

                const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${env.CF_WORKER_NAME}/settings`;
                const cfRes = await fetch(cfUrl, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` },
                    body: formData
                });

                const cfData = await cfRes.json();
                if (cfData.success) {
                    return new Response(JSON.stringify({ success: true, msg: '部署区域修改成功！' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                } else {
                    return new Response(JSON.stringify({ success: false, msg: 'CF报错: ' + (cfData.errors[0]?.message || '未知错误') }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                }
            } catch(e) {
                return new Response(JSON.stringify({ success: false, msg: e.message }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
            }
        }

        if (url.pathname === '/api/me' && request.method === 'GET') {
            let canAdd = false;
            if (ROLE === 'sub') canAdd = await subCanAdd(env, getCookie(request, 'admin_token'));
            return Response.json({ success: true, role: ROLE, canAdd });
        }

        // 版本信息（登录可见）：当前版本 + 更新提醒开关
        if (url.pathname === '/api/version' && request.method === 'GET') {
            let updateNotify = true;
            try {
                if (env.DB) {
                    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'update_notify'").first();
                    if (row && row.value !== null && row.value !== undefined) updateNotify = String(row.value) !== '0';
                }
            } catch (e) {}
            return Response.json({ success: true, version: CURRENT_VERSION, updateNotify });
        }

        // 保号通知设置（登录可见，脱敏返回）
        if (url.pathname === '/api/account/notify' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            let cfg = {};
            try {
                if (env.DB) {
                    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'notify_settings'").first();
                    if (row && row.value) cfg = JSON.parse(row.value);
                }
            } catch (e) {}
            return Response.json({ success: true, barkKey: cfg.barkKey ? '********' : '', barkLevel: cfg.barkLevel || 'active', barkServer: cfg.barkServer || 'https://api.day.app', barkNotify: cfg.barkNotify !== false, tgToken: cfg.tgToken ? '********' : '', tgChatId: cfg.tgChatId || '', tgNotify: cfg.tgNotify !== false });
        }

        // 测试通知（bark / tg）
        if (url.pathname === '/api/test-notify' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const type = String(body.type || 'bark');
                const cfg = await getNotifyCfg(env);
                if (type === 'bark') {
                    if (!cfg.barkKey) return Response.json({ success: false, error: '未配置 Bark Key' });
                    const ok = await sendBarkN(cfg, 'Emby 反代面板', '保号通知测试成功 ✅');
                    return Response.json({ success: ok, error: ok ? '' : 'Bark 发送失败，请检查 Key/服务地址' });
                }
                if (type === 'tg') {
                    if (!cfg.tgToken || !cfg.tgChatId) return Response.json({ success: false, error: '未配置 TG Bot Token / Chat ID' });
                    const ok = await sendTgN(cfg, '保号通知测试成功 ✅');
                    return Response.json({ success: ok, error: ok ? '' : 'TG 发送失败，请检查 Token / Chat ID' });
                }
                return Response.json({ success: false, error: '未知类型' });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        if (url.pathname === '/api/account' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const data = await request.json();
                if (data.logo !== undefined) {
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                    const l = data.logo;
                    const type = (l && (l.type === 'url' || l.type === 'data')) ? l.type : '';
                    const value = (l && l.value !== undefined && l.value !== null) ? String(l.value).trim() : '';
                    if (!type || !value) {
                        await env.DB.prepare('DELETE FROM app_config WHERE key = ?').bind('logo').run();
                        return Response.json({ success: true, logo: null });
                    }
                    if (type === 'url') {
                        if (!/^https?:\/\//i.test(value)) return Response.json({ success: false, error: 'URL 需以 http(s):// 开头' });
                        if (value.length > 2000) return Response.json({ success: false, error: 'URL 过长（最多 2000 字符）' });
                    } else {
                        if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value)) return Response.json({ success: false, error: '仅支持图片（png/jpg/webp/gif）的 base64 上传' });
                        if (value.length > 600000) return Response.json({ success: false, error: '图片过大（>450KB），请换更小的图片' });
                    }
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('logo', JSON.stringify({ type, value })).run();
                    return Response.json({ success: true });
                }
                if (data.proxyToken !== undefined) {
                    const pt = data.proxyToken;
                    const enabled = !!pt.enabled;
                    const key = String(pt.key || '').trim();
                    if (enabled && !/^[A-Za-z0-9]{3,32}$/.test(key)) return Response.json({ success: false, error: '密钥需 3-32 位字母数字' });
                    if (enabled && isReservedSuffix(key)) return Response.json({ success: false, error: '该密钥已被系统保留占用（如 entry），请更换' });
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('proxy_token', JSON.stringify({ enabled, key })).run();
                    return Response.json({ success: true });
                }
                if (data.notify !== undefined) {
                    const n = data.notify;
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                    const oldRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'notify_settings'").first();
                    let old = {};
                    try { if (oldRow && oldRow.value) old = JSON.parse(oldRow.value); } catch (e) {}
                    const cfg = {
                        barkKey: (n.barkKey && n.barkKey !== '********') ? String(n.barkKey).trim() : (old.barkKey || ''),
                        barkLevel: ['critical', 'active', 'timeSensitive', 'passive'].includes(n.barkLevel) ? n.barkLevel : (old.barkLevel || 'active'),
                        barkServer: (n.barkServer && n.barkServer !== 'https://api.day.app') ? String(n.barkServer).trim().replace(/\/+$/, '') : (old.barkServer || 'https://api.day.app'),
                        barkNotify: n.barkNotify !== false,
                        tgToken: (n.tgToken && n.tgToken !== '********') ? String(n.tgToken).trim() : (old.tgToken || ''),
                        tgChatId: n.tgChatId ? String(n.tgChatId).trim() : (old.tgChatId || ''),
                        tgNotify: n.tgNotify !== false
                    };
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('notify_settings', JSON.stringify(cfg)).run();
                    return Response.json({ success: true });
                }
                if (data.bareProxy !== undefined) {
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('bare_proxy_enabled', data.bareProxy ? '1' : '0').run();
                    return Response.json({ success: true });
                }
                if (data.updateNotify !== undefined) {
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('update_notify', data.updateNotify ? '1' : '0').run();
                    return Response.json({ success: true });
                }
                if (data.subadminPass !== undefined) {
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    const sa = String(data.subadminPass || '').trim();
                    if (sa && sa.length < 4) return Response.json({ success: false, error: '子管理员密码至少 4 位' });
                    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('subadmin_pass', sa).run();
                    return Response.json({ success: true });
                }
                const pw = String(data.password || '').trim();
                if (pw.length < 4) return Response.json({ success: false, error: '密码至少 4 位' });
                await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('admin_pass', pw).run();
                return Response.json({ success: true });
            } catch (e) {
                return Response.json({ success: false, error: e.message });
            }
        }

        // 子管理员密码状态(仅管理员)
        if (url.pathname === '/api/account/subadmin-status' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subadmin_pass').first();
                return Response.json({ success: true, enabled: !!(row && row.value) });
            } catch (e) { return Response.json({ success: true, enabled: false }); }
        }

        // 安全设置(登录可见):裸域名直连代理开关
        if (url.pathname === '/api/security' && request.method === 'GET') {
            let bareProxy = true;
            try {
                if (env.DB) {
                    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                    const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'bare_proxy_enabled'").first();
                    bareProxy = !(r && r.value === '0');
                }
            } catch (e) {}
            return Response.json({ success: true, bareProxy });
        }

        // 反代 Token 状态（登录可见；未登录 401）
        if (url.pathname === '/api/proxytoken' && request.method === 'GET') {
            const pt = await getProxyToken(env);
            return Response.json({ success: true, enabled: !!(pt && pt.enabled && pt.key), key: (pt && pt.enabled && pt.key) ? pt.key : '' });
        }
        // 来访记录 IP（仅管理员）
        if (url.pathname === '/api/proxytoken/hits' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                await env.DB.prepare('CREATE TABLE IF NOT EXISTS proxy_hits (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT, path TEXT, ua TEXT, ts INTEGER, times INTEGER)').run();
                const { results } = await env.DB.prepare('SELECT ip, path, ua, ts, times FROM proxy_hits ORDER BY id DESC LIMIT 200').all();
                return Response.json({ success: true, hits: results });
            } catch (e) { return Response.json({ success: true, hits: [] }); }
        }
        if (url.pathname === '/api/proxytoken/hits' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const data = await request.json();
                if (data && data.clear) {
                    await env.DB.prepare('CREATE TABLE IF NOT EXISTS proxy_hits (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT, path TEXT, ua TEXT, ts INTEGER, times INTEGER)').run();
                    await env.DB.prepare('DELETE FROM proxy_hits').run();
                }
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        // ==========================================
        // 2.4b 节点申请:订阅者提交 -> 管理员审核(按域名去重)
        // ==========================================
        // 提交申请(管理员/订阅者均可)
        if (url.pathname === '/api/node-request' && request.method === 'POST') {
            try {
                if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                const body = await request.json();
                const name = String(body.name || '').trim();
                // 支持无数条备用线路:urls 数组;兼容旧版单条 url
                let urls = Array.isArray(body.urls) ? body.urls.map(x => String(x).trim()).filter(Boolean) : (body.url ? [String(body.url).trim()] : []);
                if (!name || !urls.length) return Response.json({ success: false, error: '请填写节点名字与至少一条线路地址' });
                const norm = [];
                for (let u of urls) {
                    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
                    try { norm.push(new URL(u).href); } catch (e) {}
                }
                if (!norm.length) return Response.json({ success: false, error: '线路地址格式不正确' });
                const domains = norm.map(u => { try { return new URL(u).host.toLowerCase(); } catch (e) { return ''; } }).filter(Boolean);
                // 申请审计:记录提交人 IP 与设备(UA),保留 7 天供管理员排查乱加
                const reqIp = request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
                const reqUa = request.headers.get('user-agent') || '';
                await env.DB.prepare("CREATE TABLE IF NOT EXISTS node_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, url TEXT, domain TEXT, user TEXT, ip TEXT, ua TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
                try { await env.DB.prepare("ALTER TABLE node_requests ADD COLUMN ip TEXT DEFAULT ''").run(); } catch (e) {}
                try { await env.DB.prepare("ALTER TABLE node_requests ADD COLUMN ua TEXT DEFAULT ''").run(); } catch (e) {}
                // 与现有节点对比(按域名,每个节点可能多线路)
                const { results: routes } = await env.DB.prepare('SELECT prefix, remark, target FROM routes').all();
                for (const r of (routes || [])) {
                    const targets = String(r.target || '').split(',').map(x => x.trim()).filter(Boolean);
                    for (const t of targets) {
                        try { if (domains.includes(new URL(t).host.toLowerCase())) return Response.json({ success: false, exists: true, prefix: r.prefix, remark: r.remark || r.prefix }); } catch (e) {}
                    }
                }
                // 与待审申请对比:提交线路集合与某条申请有交集(命中同一域名)则整体替换该申请包
                const { results: pends } = await env.DB.prepare("SELECT id, name, url, domain FROM node_requests WHERE status = 'pending'").all();
                for (const pp of (pends || [])) {
                    let pDoms = [];
                    try { pDoms = JSON.parse(pp.url || '[]').map(u => { try { return new URL(u).host.toLowerCase(); } catch (e) { return ''; } }).filter(Boolean); } catch (e) {}
                    if (!pDoms.length && pp.domain) pDoms = [pp.domain];
                    if (pDoms.some(d => domains.includes(d))) {
                        await env.DB.prepare('UPDATE node_requests SET name = ?, url = ?, user = ?, ip = ?, ua = ? WHERE id = ?').bind(name, JSON.stringify(norm), String(body.user || ROLE || 'sub'), reqIp, reqUa, pp.id).run();
                        return Response.json({ success: true, replaced: true, name: pp.name });
                    }
                }
                await env.DB.prepare('INSERT INTO node_requests (name, url, domain, user, ip, ua) VALUES (?, ?, ?, ?, ?, ?)').bind(name, JSON.stringify(norm), domains[0], String(body.user || ROLE || 'sub'), reqIp, reqUa).run();
                return Response.json({ success: true, replaced: false });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }
        // 申请列表(管理员/子管理员,待审)
        if (url.pathname === '/api/node-requests' && request.method === 'GET') {
            if (ROLE !== 'admin' && ROLE !== 'subadmin') return new Response('Forbidden', { status: 403 });
            try {
                if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定', requests: [] });
                await env.DB.prepare("CREATE TABLE IF NOT EXISTS node_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, url TEXT, domain TEXT, user TEXT, ip TEXT, ua TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
                try { await env.DB.prepare("ALTER TABLE node_requests ADD COLUMN ip TEXT DEFAULT ''").run(); } catch (e) {}
                try { await env.DB.prepare("ALTER TABLE node_requests ADD COLUMN ua TEXT DEFAULT ''").run(); } catch (e) {}
                const { results } = await env.DB.prepare("SELECT id, name, url, user, created_at FROM node_requests WHERE status = 'pending' ORDER BY id DESC").all();
                return Response.json({ success: true, requests: results });
            } catch (e) { return Response.json({ success: false, error: e.message, requests: [] }); }
        }
        // 审批(管理员/子管理员):同意 -> 标记已批并回传数据供跳转预填;拒绝 -> 删除申请
        if (url.pathname === '/api/node-requests/review' && request.method === 'POST') {
            if (ROLE !== 'admin' && ROLE !== 'subadmin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const id = parseInt(body.id, 10);
                if (!id) return Response.json({ success: false, error: '参数错误' });
                if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定' });
                await env.DB.prepare("CREATE TABLE IF NOT EXISTS node_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, url TEXT, domain TEXT, user TEXT, ip TEXT, ua TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
                try { await env.DB.prepare("ALTER TABLE node_requests ADD COLUMN ip TEXT DEFAULT ''").run(); } catch (e) {}
                try { await env.DB.prepare("ALTER TABLE node_requests ADD COLUMN ua TEXT DEFAULT ''").run(); } catch (e) {}
                if (body.action === 'approve') {
                    const row = await env.DB.prepare('SELECT name, url FROM node_requests WHERE id = ?').bind(id).first();
                    if (!row) return Response.json({ success: false, error: '申请不存在' });
                    await env.DB.prepare("UPDATE node_requests SET status = 'approved' WHERE id = ?").bind(id).run();
                    return Response.json({ success: true, data: { name: row.name, url: row.url } });
                }
                if (body.action === 'reject') {
                    await env.DB.prepare('DELETE FROM node_requests WHERE id = ?').bind(id).run();
                    return Response.json({ success: true });
                }
                return Response.json({ success: false, error: '未知操作' });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }
        // 申请审计(仅管理员):近 7 天申请记录,含提交人 IP 与设备,支持按名字/线路搜索
        if (url.pathname === '/api/node-requests/audit' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定', requests: [] });
                await env.DB.prepare("CREATE TABLE IF NOT EXISTS node_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, url TEXT, domain TEXT, user TEXT, ip TEXT, ua TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
                try { await env.DB.prepare("ALTER TABLE node_requests ADD COLUMN ip TEXT DEFAULT ''").run(); } catch (e) {}
                try { await env.DB.prepare("ALTER TABLE node_requests ADD COLUMN ua TEXT DEFAULT ''").run(); } catch (e) {}
                const q = String(url.searchParams.get('q') || '').trim();
                const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 500);
                let sql = "SELECT id, name, url, ip, ua, user, status, created_at FROM node_requests WHERE created_at >= datetime('now', '-7 days')";
                const binds = [];
                if (q) { sql += " AND (name LIKE ? OR url LIKE ?)"; binds.push('%' + q + '%', '%' + q + '%'); }
                sql += ' ORDER BY id DESC LIMIT ?';
                binds.push(limit);
                const { results } = await env.DB.prepare(sql).bind(...binds).all();
                return Response.json({ success: true, requests: results });
            } catch (e) { return Response.json({ success: false, error: e.message, requests: [] }); }
        }
        // 成员添加节点记录(仅管理员):近 7 天子管理员/已授权订阅用户直接添加节点的记录,含 IP 与设备,支持按名字/线路/前缀搜索
        if (url.pathname === '/api/admin-node-logs' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定', logs: [] });
                await env.DB.prepare("CREATE TABLE IF NOT EXISTS admin_node_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, url TEXT, prefix TEXT, ip TEXT, ua TEXT, actor TEXT DEFAULT 'subadmin', created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
                try { await env.DB.prepare("ALTER TABLE admin_node_logs ADD COLUMN actor TEXT DEFAULT 'subadmin'").run(); } catch (e) {}
                const q = String(url.searchParams.get('q') || '').trim();
                const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 500);
                let sql = "SELECT id, name, url, prefix, ip, ua, actor, created_at FROM admin_node_logs WHERE created_at >= datetime('now', '-7 days')";
                const binds = [];
                if (q) { sql += " AND (name LIKE ? OR url LIKE ? OR prefix LIKE ?)"; binds.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
                sql += ' ORDER BY id DESC LIMIT ?';
                binds.push(limit);
                const { results } = await env.DB.prepare(sql).bind(...binds).all();
                return Response.json({ success: true, logs: results });
            } catch (e) { return Response.json({ success: false, error: e.message, logs: [] }); }
        }
        // 公告(登录可见;仅管理员设置/清除;单条覆盖式)
        if (url.pathname === '/api/notice' && request.method === 'GET') {
            if (!ROLE) return new Response('Unauthorized', { status: 401 });
            try {
                const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'notice'").first();
                const val = (r && r.value) ? (() => { try { return JSON.parse(r.value); } catch (e) { return { text: r.value }; } })() : null;
                return Response.json({ success: true, text: val ? val.text || '' : '', updated_at: val ? val.updated_at || '' : '' });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }
        if (url.pathname === '/api/notice' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const text = String(body.text || '').trim();
                const val = JSON.stringify({ text, updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
                if (text) await env.DB.prepare('INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=?').bind('notice', val, val).run();
                else await env.DB.prepare('DELETE FROM app_config WHERE key = ?').bind('notice').run();
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }

        if (url.pathname === '/api/subscribers' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers').first();
                const list = row && row.value ? JSON.parse(row.value) : [];
                const caRow = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers_can_add').first();
                const caList = caRow && caRow.value ? JSON.parse(caRow.value) : [];
                return Response.json({ success: true, subscribers: Array.isArray(list) ? list : [], canAdd: Array.isArray(caList) ? caList : [] });
            } catch (e) {
                return Response.json({ success: false, error: e.message, subscribers: [], canAdd: [] });
            }
        }

        if (url.pathname === '/api/subscribers' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const data = await request.json();
                const action = data.action;
                const pw = String(data.password || '').trim();
                if (!pw || pw.length < 4) return Response.json({ success: false, error: '密码至少 4 位' });
                await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers').first();
                let list = row && row.value ? JSON.parse(row.value) : [];
                if (!Array.isArray(list)) list = [];
                const caRow = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers_can_add').first();
                let caList = caRow && caRow.value ? JSON.parse(caRow.value) : [];
                if (!Array.isArray(caList)) caList = [];
                if (action === 'add') {
                    if (list.includes(pw)) return Response.json({ success: false, error: '该密码已存在' });
                    list.push(pw);
                } else if (action === 'del') {
                    list = list.filter(p => p !== pw);
                    caList = caList.filter(p => p !== pw);
                } else if (action === 'setAdd') {
                    const add = !!data.add;
                    if (!list.includes(pw)) return Response.json({ success: false, error: '订阅用户不存在' });
                    if (add) { if (!caList.includes(pw)) caList.push(pw); }
                    else { caList = caList.filter(p => p !== pw); }
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('subscribers_can_add', JSON.stringify(caList)).run();
                    return Response.json({ success: true, canAdd: caList });
                } else {
                    return Response.json({ success: false, error: '未知操作' });
                }
                await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('subscribers', JSON.stringify(list)).run();
                await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('subscribers_can_add', JSON.stringify(caList)).run();
                return Response.json({ success: true, subscribers: list, canAdd: caList });
            } catch (e) {
                return Response.json({ success: false, error: e.message });
            }
        }

        // ==========================================
        // 2.3 数据大屏统计接口 (Analytics)
        // ==========================================
        if (url.pathname === '/api/analytics' && request.method === 'GET') {
            if (!env.DB) return Response.json({ success: false, error: '未绑定 D1 数据库' });
            try {
                // 并发获取 24小时、7天、30天流量 (通过全新 GraphQL API 规避限制)
                const [trafficToday, traffic7d, traffic30d] = await Promise.all([
                    getCFTraffic(env, 'today'),
                    getCFTraffic(env, 7),
                    getCFTraffic(env, 30)
                ]);

                const trend = await env.DB.prepare(`SELECT date(timestamp, '+8 hours') as date, COUNT(*) as count FROM visitor_logs WHERE timestamp >= datetime('now', '-7 days') GROUP BY date(timestamp, '+8 hours') ORDER BY date ASC`).all();
                const locations = await env.DB.prepare(`SELECT country, COUNT(*) as count FROM visitor_logs WHERE timestamp >= datetime('now', '-7 days') GROUP BY country ORDER BY count DESC`).all();
                const recents = await env.DB.prepare(`SELECT prefix, datetime(timestamp, '+8 hours') as timestamp, ip, country, ua FROM visitor_logs ORDER BY timestamp DESC LIMIT 20`).all();
                
                return Response.json({ 
                    success: true, 
                    trend: trend.results, 
                    locations: locations.results, 
                    recents: recents.results, 
                    trafficToday, traffic7d, traffic30d 
                });
            } catch(e) {
                return Response.json({ success: false, error: e.message });
            }
        }

        // ==========================================
        //  CF Worker 每日请求数统计接口 (GraphQL httpRequests，额度按 UTC 00:00 重置)
        // ==========================================
        if (url.pathname === '/api/cfusage' && request.method === 'GET') {
            if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return Response.json({ success: false, error: '缺少 CF_API_TOKEN 或 CF_ZONE_ID 变量，无法统计 CF 请求数' });
            try {
                const [todayStats, week, month] = await Promise.all([
                    getCFTodayStats(env),
                    getCFRequests(env, 7),
                    getCFRequests(env, 30)
                ]);
                const quota = 100000;
                const todayCount = todayStats.ok ? todayStats.requests : 0;
                const weekCount = week.ok ? week.count : 0;
                const monthCount = month.ok ? month.count : 0;
                return Response.json({ 
                    success: true, 
                    today: todayCount, 
                    week: weekCount, 
                    month: monthCount, 
                    quota: quota,
                    usedPercent: todayStats.ok ? Math.round(todayCount / quota * 1000) / 10 : 0,
                    remain: Math.max(0, quota - todayCount),
                    todayError: todayStats.ok ? null : todayStats.error,
                    weekError: week.ok ? null : week.error,
                    monthError: month.ok ? null : month.error,
                    bandwidth: todayStats.ok ? todayStats.bytes : 0,
                    cacheHitRatio: todayStats.ok && todayStats.bytes > 0 ? Math.round(todayStats.cachedBytes / todayStats.bytes * 1000) / 10 : 0,
                    statusCodes: todayStats.ok ? todayStats.statusCodes : { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
                    countries: todayStats.ok ? todayStats.countries : [],
                    hours: todayStats.ok ? todayStats.hours : [],
                    blocked: todayStats.ok ? todayStats.blocked : 0
                });
            } catch(e) {
                return Response.json({ success: false, error: e.message });
            }
        }

        // ==========================================
        //  后端接口：执行代码覆盖更新 (纯JSON接口无损继承：变量、数据库、兼容性、放置地区)
        // ==========================================
        if (url.pathname === '/api/deploy' && request.method === 'POST') {
if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
                        const cfToken = env.CF_API_TOKEN;
            const accountId = env.CF_ACCOUNT_ID;
            const workerName = env.CF_WORKER_NAME;
            if (!cfToken || !accountId || !workerName) {
                return Response.json({ success: false, error: '缺少 CF_API_TOKEN, CF_ACCOUNT_ID 或 CF_WORKER_NAME 环境变量' });
            }
            try {
                const body = await request.json();
                if (!body.newCode) return Response.json({ success: false, error: '代码内容为空。' });

                // 1.  终极修复：调用纯 JSON 的 services 接口获取真实配置，绝对不再崩溃！
                const serviceRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/services/${workerName}`, {
                    headers: { 'Authorization': `Bearer ${cfToken}` }
                });
                const serviceData = await serviceRes.json();
                
                let compDate = "2024-01-01"; // 依然保留兜底，但这次绝不会用到
                let compFlags = undefined;
                let placement = undefined;

                if (serviceData.success && serviceData.result) {
                    // 精准从 JSON 中提取你原本的配置
                    let scriptInfo = null;
                    if (serviceData.result.default_environment && serviceData.result.default_environment.script) {
                        scriptInfo = serviceData.result.default_environment.script;
                    } else if (serviceData.result.script) {
                        scriptInfo = serviceData.result.script;
                    }
                    
                    if (scriptInfo) {
                        if (scriptInfo.compatibility_date) compDate = scriptInfo.compatibility_date;
                        if (scriptInfo.compatibility_flags) compFlags = scriptInfo.compatibility_flags;
                        if (scriptInfo.placement) placement = scriptInfo.placement;
                    }
                }

                const preservedBindings = [];
                // 2. 备份普通的字符串变量
                for (const key in env) {
                    if (typeof env[key] === 'string') {
                        preservedBindings.push({ name: key, type: 'plain_text', text: env[key] });
                    }
                }

                // 3. 拉取 D1、KV 等高级绑定并无损合并
                const bindingsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/bindings`, {
                    headers: { 'Authorization': `Bearer ${cfToken}` }
                });
                const bindingsData = await bindingsRes.json();
                if (bindingsData.success && Array.isArray(bindingsData.result)) {
                    for (const b of bindingsData.result) {
                        if (b.type !== 'plain_text' && b.type !== 'secret_text' && b.type !== 'inherited') {
                            preservedBindings.push(b);
                        }
                    }
                }

                // 4. 组装最终的部署请求
                const formData = new FormData();
                const metadata = { 
                    main_module: 'worker.js',
                    bindings: preservedBindings,
                    compatibility_date: compDate 
                };
                if (compFlags) metadata.compatibility_flags = compFlags;
                if (placement) metadata.placement = placement; // ${I.target} 完美带上你原始的放置地区！

                formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
                formData.append('worker.js', new Blob([body.newCode], { type: 'application/javascript+module' }), 'worker.js');

                const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
                const res = await fetch(cfUrl, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${cfToken}` },
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    return Response.json({ success: true, msg: '代码更新成功，并已完美保留原有放置地区和兼容配置！' });
                } else {
                    throw new Error(JSON.stringify(data.errors));
                }
            } catch (e) {
                return Response.json({ success: false, error: e.message });
            }
        }
        // ==========================================
        // 2.35 播放热力图接口 (v3.4.16)
        // ==========================================
        if (url.pathname === '/api/heatmap') {
            return Response.json(await getHeatmap(env, 7));
        }
        // ==========================================
        // 2.4 系统级与提取工具 API 
        // ==========================================
        if (url.pathname === '/api/purge-cache' && request.method === 'POST') {
if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
                        const cfToken = env.CF_API_TOKEN; const zoneId = env.CF_ZONE_ID;
            if (!cfToken || !zoneId) return Response.json({ success: false, error: '缺少 CF_API_TOKEN 或 CF_ZONE_ID 变量' });
            try {
                const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, { method: 'POST', headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ purge_everything: true }) });
                const data = await res.json();
                if (!data.success) throw new Error(JSON.stringify(data.errors));
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        if (url.pathname === '/api/ping-node') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            const target = url.searchParams.get('url');
            if (!target) return Response.json({ ms: -1 });
            const start = Date.now();
            try {
                const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 2000); 
                await fetch(target + '/', { method: 'HEAD', signal: controller.signal });
                clearTimeout(timeoutId); return Response.json({ ms: Date.now() - start });
            } catch (e) { return Response.json({ ms: -1 }); }
        }

        if (url.pathname === '/api/get-dns') {
            const cfToken = env.CF_API_TOKEN; const zoneId = env.CF_ZONE_ID; const domain = env.CF_DOMAIN;
            if (!cfToken || !zoneId || !domain) return Response.json({ success: false, error: '缺少 DNS 环境变量' });
            try {
                const getRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${domain}`, { headers: { 'Authorization': `Bearer ${cfToken}` } });
                const getData = await getRes.json();
                return Response.json({ success: true, result: getData.result });
            } catch (error) { return Response.json({ success: false, error: error.message }); }
        }

        if (url.pathname === '/api/update-dns' && request.method === 'POST') {
if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
                        const body = await request.json(); const ips = body.ips;
            const cfToken = env.CF_API_TOKEN; const zoneId = env.CF_ZONE_ID; const domain = env.CF_DOMAIN;

            if (!cfToken || !zoneId || !domain) return Response.json({ success: false, error: '缺少 DNS 环境变量' });
            try {
                const getRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${domain}`, { headers: { 'Authorization': `Bearer ${cfToken}` } });
                const getData = await getRes.json();
                if (!getData.success) throw new Error('获取现有 DNS 记录失败');

                const oldRecords = getData.result.filter(r => r.type === 'A' || r.type === 'AAAA' || r.type === 'CNAME');
                for (const record of oldRecords) {
                    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${record.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${cfToken}` } });
                }

                for (const ip of ips) {
                    const cleanItem = ip.replace(/[\[\]]/g, ''); let recordType = 'A';
                    if (cleanItem.includes(':')) recordType = 'AAAA'; else if (/[a-zA-Z]/.test(cleanItem)) recordType = 'CNAME';

                    const postRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, { method: 'POST', headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: recordType, name: domain, content: cleanItem, ttl: 60, proxied: false }) });
                    const postData = await postRes.json();
                    if(!postData.success) throw new Error(`记录提交失败: ` + JSON.stringify(postData.errors));
                }
                return Response.json({ success: true, message: '✅ 成功！' });
            } catch (error) { return Response.json({ success: false, error: error.message }); }
        }

        if (url.pathname === '/api/get-custom-api-ips') {
            try {
                const apiUrl = url.searchParams.get('url');
                if (!apiUrl) throw new Error("缺少 URL");
                const response = await fetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const text = await response.text(); let validIPs = new Set();
                try {
                    const jsonObj = JSON.parse(text);
                    if (jsonObj && jsonObj.data && Array.isArray(jsonObj.data)) {
                        jsonObj.data.forEach(item => { if (item.ip) { let ip = item.ip; if (ip.includes(':') && !ip.startsWith('[')) ip = `[${ip}]`; validIPs.add(ip); } });
                    }
                } catch (e) {}

                if (validIPs.size === 0) {
                    const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
                    const matchedIPv4 = text.match(ipv4Regex) || [];
                    matchedIPv4.forEach(ip => { if (!ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('127.')) validIPs.add(ip); });

                    const ipv6Regex = /(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:)*:[A-F0-9]{1,4}(?::[A-F0-9]{1,4})*/gi;
                    const matchedIPv6 = text.match(ipv6Regex) || [];
                    matchedIPv6.forEach(ip => { if (ip.length > 7 && ip.includes(':') && !ip.startsWith('::1')) validIPs.add(ip.startsWith('[') ? ip : `[${ip}]`); });
                }
                const uniqueIPArray = Array.from(validIPs);
                for (let i = uniqueIPArray.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uniqueIPArray[i], uniqueIPArray[j]] = [uniqueIPArray[j], uniqueIPArray[i]]; }
                return Response.json({ success: true, ips: uniqueIPArray.slice(0, 15), totalCount: uniqueIPArray.length });
            } catch (error) { return Response.json({ success: false, error: error.message }, { status: 500 }); }
        }

        const PRESET_SOURCES = {
            'ehb-all': { name: '云枢全域融合(双栈)', url: 'https://ip.ehb.cc.cd/all?ips=100' },
            'ehb-cm': { name: '云枢移动起飞(IPv4)', url: 'https://ip.ehb.cc.cd/cm?ips=100' },
            'ehb-ct': { name: '云枢电信美西(IPv4)', url: 'https://ip.ehb.cc.cd/ct?ips=100' },
            'ehb-cu': { name: '云枢联通极速(IPv4)', url: 'https://ip.ehb.cc.cd/cu?ips=100' },
            'ehb-104': { name: '104 大段全域池', url: 'https://ip.ehb.cc.cd/104?ips=100' },
            'ehb-10417': { name: '104.17 移动起飞段', url: 'https://ip.ehb.cc.cd/104.17?ips=100' },
            'ehb-10419': { name: '104.19 移动抗QoS段', url: 'https://ip.ehb.cc.cd/104.19?ips=100' },
            'ehb-10416': { name: '104.16 经典老牌段', url: 'https://ip.ehb.cc.cd/104.16?ips=100' },
            'ehb-162': { name: '162 大段全域池', url: 'https://ip.ehb.cc.cd/162?ips=100' },
            'ehb-162159s': { name: '162.159 SaaS/DoH段', url: 'https://ip.ehb.cc.cd/162.159-saas?ips=100' },
            'ehb-162159ct': { name: '162.159 电信美西最稳段', url: 'https://ip.ehb.cc.cd/162.159-ct?ips=100' },
            'ehb-172': { name: '172 大段全域池', url: 'https://ip.ehb.cc.cd/172?ips=100' },
            'ehb-17264': { name: '172.64 联通/电信主力段', url: 'https://ip.ehb.cc.cd/172.64?ips=100' },
            'ehb-17267': { name: '172.67 动态反代段', url: 'https://ip.ehb.cc.cd/172.67?ips=100' },
            'ehb-198': { name: '198.41 联通天花板大段', url: 'https://ip.ehb.cc.cd/198?ips=100' },
            'ehb-108': { name: '108.162 三网兜底大段', url: 'https://ip.ehb.cc.cd/108?ips=100' },
            'ehb-v6': { name: '云枢 IPv6 全域星轨', url: 'https://ip.ehb.cc.cd/v6?ips=100' },
            'ehb-v6cm': { name: '云枢移动 5G 直连', url: 'https://ip.ehb.cc.cd/v6-cm?ips=100' },
            'ehb-v6ct': { name: '云枢电信 纯净美西', url: 'https://ip.ehb.cc.cd/v6-ct?ips=100' },
            'ehb-v6cu': { name: '云枢联通 欧洲/东京', url: 'https://ip.ehb.cc.cd/v6-cu?ips=100' },
            'ehb-2400': { name: '2400:cb00 亚太全域', url: 'https://ip.ehb.cc.cd/2400?ips=100' },
            'ehb-24002048': { name: '2400.2048 香港近场段', url: 'https://ip.ehb.cc.cd/2400.2048?ips=100' },
            'ehb-2400400': { name: '2400.400 亚太低跳数段', url: 'https://ip.ehb.cc.cd/2400.400?ips=100' },
            'ehb-24002049': { name: '2400.2049 亚太抗抖动段', url: 'https://ip.ehb.cc.cd/2400.2049?ips=100' },
            'ehb-2606': { name: '2606:4700 全球主干', url: 'https://ip.ehb.cc.cd/2606?ips=100' },
            'ehb-26063030': { name: '2606.3030 核心骨干段', url: 'https://ip.ehb.cc.cd/2606.3030?ips=100' },
            'ehb-26064700': { name: '2606.4700 伴生特权段', url: 'https://ip.ehb.cc.cd/2606.4700?ips=100' },
            'ehb-2a06': { name: '2a06:98c0 欧洲特快大段', url: 'https://ip.ehb.cc.cd/2a06?ips=100' },
            'robberer': { name: '@robberer 专属', url: 'https://gh.xxooo.cf/https://raw.githubusercontent.com/hc990275/yx/refs/heads/main/cfyxip.txt' },
            'cm-ct': { name: 'CM佬电信优选', url: 'https://cf.090227.xyz/ct?ips=100' },
            'cm-cmcc': { name: 'CM佬移动优选', url: 'https://cf.090227.xyz/cmcc?ips=100' },
            'cm-cu': { name: 'CM佬联通优选', url: 'https://cf.090227.xyz/cu?ips=100' },
            'v2too': { name: 'v2too 源', url: 'https://ip.v2too.top/api/nodes' }
        };
        function normalizePresetIp(ip) {
            ip = String(ip).trim().replace(/^\[|\]$/g, '');
            if (ip.includes(':') && !ip.startsWith('[')) ip = `[${ip}]`;
            return ip;
        }
        async function extractIPsFromSource(url) {
            const set = new Set();
            try {
                const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (!resp.ok) return set;
                const text = await resp.text();
                try {
                    const j = JSON.parse(text);
                    if (j && Array.isArray(j.data)) {
                        j.data.forEach(item => { if (item && item.ip) set.add(normalizePresetIp(item.ip)); });
                        if (set.size > 0) return set;
                    }
                } catch (e) {}
                const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
                (text.match(ipv4Regex) || []).forEach(ip => { if (!ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('127.')) set.add(ip); });
                const ipv6Regex = /(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:)*:[A-F0-9]{1,4}(?::[A-F0-9]{1,4})*/gi;
                (text.match(ipv6Regex) || []).forEach(ip => { if (ip.length > 7 && ip.includes(':') && !ip.startsWith('::1')) set.add(ip.startsWith('[') ? ip : `[${ip}]`); });
            } catch (e) {}
            return set;
        }

        if (url.pathname === '/api/get-remote-ips') {
            try {
                const reqType = (url.searchParams.get('type') || 'all').toLowerCase();
                const validIPs = new Set();
                let sourceName = '综合混合源(四源并发)';

                if (reqType === 'all') {
                    const [s1, s2, s3, s4] = await Promise.all([
                        extractIPsFromSource('https://api.uouin.com/cloudflare.html'),
                        extractIPsFromSource('https://raw.githubusercontent.com/ZhiXuanWang/cf-speed-dns/refs/heads/main/ipTop10.html'),
                        extractIPsFromSource('https://ip.164746.xyz/'),
                        extractIPsFromSource('https://www.wetest.vip/page/cloudflare/address_v4.html')
                    ]);
                    s1.forEach(i => validIPs.add(i)); s2.forEach(i => validIPs.add(i)); s3.forEach(i => validIPs.add(i)); s4.forEach(i => validIPs.add(i));
                } else if (['电信', '联通', '移动', '多线', 'ipv6'].includes(reqType)) {
                    sourceName = reqType + '专属(uouin)';
                    try {
                        const res1 = await fetch('https://api.uouin.com/cloudflare.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
                        if (res1.ok) {
                            const text1 = await res1.text(); const cleanText = text1.replace(/<[^>]+>/g, ' ');
                            const regex = /(电信|联通|移动|多线|ipv6)\s+((?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-fA-F0-9]{1,4}:)+[a-fA-F0-9]{1,4})/gi;
                            let match; while ((match = regex.exec(cleanText)) !== null) {
                                if (match[1].toLowerCase() === reqType) { let ip = match[2]; if (ip.includes(':') && !ip.startsWith('[')) ip = `[${ip}]`; validIPs.add(ip); }
                            }
                        }
                    } catch (e) {}
                } else if (reqType === '优选') {
                    sourceName = '顶尖优选库(cf-speed-dns)';
                    const s = await extractIPsFromSource('https://raw.githubusercontent.com/ZhiXuanWang/cf-speed-dns/refs/heads/main/ipTop10.html');
                    s.forEach(i => validIPs.add(i));
                } else if (PRESET_SOURCES[reqType]) {
                    sourceName = PRESET_SOURCES[reqType].name;
                    const s = await extractIPsFromSource(PRESET_SOURCES[reqType].url);
                    s.forEach(i => validIPs.add(i));
                }
                const uniqueIPArray = Array.from(validIPs);
                for (let i = uniqueIPArray.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uniqueIPArray[i], uniqueIPArray[j]] = [uniqueIPArray[j], uniqueIPArray[i]]; }
                return Response.json({ success: true, name: sourceName, ips: uniqueIPArray.slice(0, 10), totalCount: uniqueIPArray.length });
            } catch (error) { return Response.json({ success: false, error: error.message }, { status: 500 }); }
        }

        // ==========================================
        // 2.5 数据库路由管理 API 
        // ==========================================
        if (url.pathname === '/api/routes/reorder' && request.method === 'POST') {
if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
                        if (!env.DB) return Response.json({ success: false, error: "未绑定 DB" });
            try {
                const items = await request.json(); 
                const stmts = items.map(item => env.DB.prepare('UPDATE routes SET sort_order = ? WHERE prefix = ?').bind(item.sort_order, item.prefix));
                await env.DB.batch(stmts);
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        if (url.pathname === '/api/routes/import' && request.method === 'POST') {
if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
                        if (!env.DB) return Response.json({ success: false, error: "未绑定 DB" });
            try {
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN redirect_direct TEXT DEFAULT 'off'`); } catch (e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN redirect_rules TEXT DEFAULT ''`); } catch (e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN emos_id TEXT DEFAULT ''`); } catch (e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN emos_name TEXT DEFAULT ''`); } catch (e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN emos_aggregate TEXT DEFAULT 'off'`); } catch (e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN direct_play TEXT DEFAULT 'on'`); } catch (e) {}
                const routes = await request.json();
                for (const r of routes) {
                    if (r.prefix && r.target) {
                        await env.DB.prepare('INSERT OR REPLACE INTO routes (prefix, target, mode, remark, last_play, icon, cache_img, sort_order, custom_ip, watch_limit, node_user, node_pass, redirect_direct, redirect_rules, emos_id, emos_name, emos_aggregate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                            .bind(r.prefix, r.target, r.mode || 'off', r.remark || '', r.last_play || '', r.icon || '', r.cache_img || 'on', r.sort_order || 0, r.custom_ip || '', r.watch_limit || '0', r.node_user || '', r.node_pass || '', r.redirect_direct === 'on' ? 'on' : 'off', r.redirect_rules || '', r.emos_id || '', r.emos_name || '', r.emos_aggregate === 'on' ? 'on' : 'off').run();
                    }
                }
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        if (url.pathname.startsWith('/api/routes')) {
            if (!env.DB) return Response.json({ error: "由于未绑定 D1 数据库，反代功能不可用。" }, { status: 500 });

            // —— 提速:路由表 schema 初始化(建表/加列)仅首次执行,后续请求直接查表 ——
            if (!routesSchemaReady) {
                await env.DB.exec(`CREATE TABLE IF NOT EXISTS routes (prefix TEXT PRIMARY KEY, target TEXT NOT NULL)`);
                await env.DB.exec(`CREATE TABLE IF NOT EXISTS node_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, url TEXT, domain TEXT, user TEXT, ip TEXT, ua TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
                // 兼容旧表:补充 ip/ua 列(申请审计用)
                try { await env.DB.exec(`ALTER TABLE node_requests ADD COLUMN ip TEXT DEFAULT ''`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE node_requests ADD COLUMN ua TEXT DEFAULT ''`); } catch(e) {}
                await env.DB.exec(`CREATE TABLE IF NOT EXISTS request_stats (prefix TEXT, date TEXT, count INTEGER DEFAULT 0, PRIMARY KEY(prefix, date))`);
                // 大数据记录核心表：访客日志
                await env.DB.exec(`CREATE TABLE IF NOT EXISTS visitor_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, prefix TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, ip TEXT, country TEXT, ua TEXT)`);
                
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN mode TEXT DEFAULT 'off'`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN remark TEXT DEFAULT ''`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN last_play TEXT DEFAULT ''`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN icon TEXT DEFAULT ''`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN cache_img TEXT DEFAULT 'on'`); } catch(e) {} 
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN sort_order INTEGER DEFAULT 0`); } catch(e) {} 
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN custom_ip TEXT DEFAULT ''`); } catch(e) {} 
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN watch_limit TEXT DEFAULT '0'`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN redirect_direct TEXT DEFAULT 'off'`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN redirect_rules TEXT DEFAULT ''`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN node_user TEXT DEFAULT ''`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN node_pass TEXT DEFAULT ''`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN emos_id TEXT DEFAULT ''`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN emos_name TEXT DEFAULT ''`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN emos_aggregate TEXT DEFAULT 'off'`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN direct_play TEXT DEFAULT 'on'`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN edge_cache TEXT DEFAULT 'on'`); } catch(e) {}
                routesSchemaReady = true;
            }
// 节点路由权限:GET 登录即可;POST 仅管理员/子管理员/已开通添加权限的订阅用户(三者均仅新增,不能编辑);DELETE 仅管理员
if (request.method === 'DELETE' && ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
if (request.method === 'POST' && ROLE !== 'admin' && ROLE !== 'subadmin') {
    if (ROLE !== 'sub' || !(await subCanAdd(env, getCookie(request, 'admin_token')))) return new Response('Forbidden', { status: 403 });
}
            
            // 数据防爆清理策略：自动清理过去 7 天的精细日志(限频 10 分钟一次,避免每次请求都触发 D1 写入)
            if (Date.now() - lastLogsCleanAt > 600000) {
                try { await env.DB.exec(`DELETE FROM visitor_logs WHERE timestamp < datetime('now', '-7 days')`); } catch(e) {}
                lastLogsCleanAt = Date.now();
            }

            //  【方案A修复版】：独立并发查流，完美绕过 CF 免费版复杂度限制！
            if (request.method === 'GET') {
                const todayStr = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
                let { results: routes } = await env.DB.prepare(`
                    SELECT r.*, 
                    IFNULL(s.count, 0) as todayReqs,
                    (SELECT SUM(count) FROM request_stats WHERE prefix = r.prefix) as totalReqs
                    FROM routes r 
                    LEFT JOIN request_stats s ON r.prefix = s.prefix AND s.date = ? 
                    ORDER BY r.sort_order ASC, r.prefix ASC
                `).bind(todayStr).all();

                // 带宽统计只对管理员查询:非管理员(子管理员/订阅用户)只查节点,直接跳过 CF GraphQL,节点列表秒出
                if (ROLE === 'admin' && env.CF_API_TOKEN && env.CF_ZONE_ID && routes && routes.length > 0) {
                    const end = new Date();
                    const beijingTime = new Date(end.getTime() + 8 * 3600000);
                    beijingTime.setUTCHours(0, 0, 0, 0);
                    const start = new Date(beijingTime.getTime() - 8 * 3600000);
                    const nowTs = Date.now();

                    // —— 提速:带宽统计结果内存缓存 2 分钟,避免每次打开面板都并发打 CF GraphQL ——
                    // 并发限制为同时 4 个 + 8 秒超时,防止节点多时 GraphQL 排队/429 拖垮节点列表接口
                    const pending = routes.filter(r => {
                        const hit = bandwidthCache.get(r.prefix);
                        if (hit && hit.expires > nowTs) { r.todayBandwidth = hit.value; return false; }
                        return true;
                    });
                    let cursor = 0;
                    async function bwWorker() {
                        while (cursor < pending.length) {
                            const r = pending[cursor++];
                            try {
                                const graphqlQuery = {
                                    query: `query {
                                  viewer {
                                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                                      httpRequestsAdaptiveGroups(
                                        limit: 1,
                                        filter: {
                                          clientRequestPath_like: "/${r.prefix}%",
                                          datetime_geq: "${start.toISOString()}",
                                          datetime_leq: "${end.toISOString()}"
                                        }
                                      ) {
                                        sum { edgeResponseBytes }
                                      }
                                    }
                                  }
                                }`
                                };
                                const cfRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify(graphqlQuery),
                                    signal: AbortSignal.timeout(8000)
                                });
                                const cfData = await cfRes.json();
                                const bytes = cfData?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0]?.sum?.edgeResponseBytes || 0;
                                let formatted = "0 B";
                                if (bytes >= 1099511627776) formatted = (bytes / 1099511627776).toFixed(2) + " TB";
                                else if (bytes >= 1073741824) formatted = (bytes / 1073741824).toFixed(2) + " GB";
                                else if (bytes >= 1048576) formatted = (bytes / 1048576).toFixed(2) + " MB";
                                else if (bytes >= 1024) formatted = (bytes / 1024).toFixed(2) + " KB";
                                else if (bytes > 0) formatted = bytes + " B";
                                r.todayBandwidth = formatted;
                                bandwidthCache.set(r.prefix, { expires: nowTs + BANDWIDTH_CACHE_TTL, value: formatted });
                            } catch(e) { 
                                r.todayBandwidth = "获取异常"; 
                            }
                        }
                    }
                    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, bwWorker));
                }
                
                // 订阅者不可见源站链接（target 字段剥离，防止直接调 API 查看源站）
                if (ROLE === 'sub' && Array.isArray(routes)) {
                    routes = routes.map(r => { const c = { ...r }; delete c.target; return c; });
                }
                return Response.json(routes || []);
            }
            
            if (request.method === 'POST') {
                const data = await request.json();
                // 仅管理员可编辑(带 oldPrefix 视为编辑);子管理员与已授权订阅用户只能新增
                if (ROLE !== 'admin' && data.oldPrefix) return new Response('Forbidden', { status: 403 });
                let currentSortOrder = 0;
                if (data.oldPrefix && data.oldPrefix !== data.prefix) {
                    const oldRow = await env.DB.prepare('SELECT sort_order FROM routes WHERE prefix = ?').bind(data.oldPrefix).first();
                    if(oldRow) currentSortOrder = oldRow.sort_order;
                    await env.DB.prepare('DELETE FROM routes WHERE prefix = ?').bind(data.oldPrefix).run();
                } else {
                    const oldRow = await env.DB.prepare('SELECT sort_order FROM routes WHERE prefix = ?').bind(data.prefix).first();
                    if(oldRow) currentSortOrder = oldRow.sort_order;
                }
                
                const parsedRules = parseRedirectRules(data.redirect_rules);
                const rulesJson = parsedRules.length ? JSON.stringify(parsedRules) : '';
                await env.DB.prepare('INSERT OR REPLACE INTO routes (prefix, target, mode, remark, icon, cache_img, sort_order, custom_ip, watch_limit, node_user, node_pass, redirect_direct, redirect_rules, emos_id, emos_name, emos_aggregate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    .bind(data.prefix, data.target, data.mode || 'off', data.remark || '', data.icon || '', data.cache_img || 'on', currentSortOrder, data.fakeIp || '', data.watchLimit || '0', data.nodeUser || '', data.nodePass || '', data.redirect_direct === 'on' ? 'on' : 'off', rulesJson, data.emosId || '', data.emosName || '', data.emosAggregate === 'on' ? 'on' : 'off').run();
                // 成员添加节点审计:子管理员/已授权订阅用户直接添加节点时记录 IP 与设备,供管理员排查乱加(保留 7 天,可一键封禁)
                if (ROLE === 'subadmin' || (ROLE === 'sub' && await subCanAdd(env, getCookie(request, 'admin_token')))) {
                    try {
                        const logIp = request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
                        const logUa = request.headers.get('user-agent') || '';
                        await env.DB.prepare("CREATE TABLE IF NOT EXISTS admin_node_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, url TEXT, prefix TEXT, ip TEXT, ua TEXT, actor TEXT DEFAULT 'subadmin', created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
                        try { await env.DB.prepare("ALTER TABLE admin_node_logs ADD COLUMN actor TEXT DEFAULT 'subadmin'").run(); } catch (e) {}
                        await env.DB.prepare('INSERT INTO admin_node_logs (name, url, prefix, ip, ua, actor) VALUES (?, ?, ?, ?, ?, ?)').bind(data.remark || data.prefix, data.target || '', data.prefix || '', logIp, logUa, ROLE).run();
                    } catch (e) {}
                }
                return Response.json({ success: true });
            }
            
            if (request.method === 'DELETE') {
                const prefix = url.searchParams.get('prefix'); await env.DB.prepare('DELETE FROM routes WHERE prefix = ?').bind(prefix).run(); return Response.json({ success: true });
            }
            return new Response("Method not allowed", { status: 405 });
        }

        // ==========================================
        // 2.6 核心反代与调度引擎（修播放）
        // ==========================================
        let targetUrls = []; let currentMode = 'off'; let enableCache = true; let remainingPath = '';
        let redirectDirect = false; let redirectRules = [];
        let decodedPath; try { decodedPath = decodeURIComponent(url.pathname); } catch (e) { decodedPath = url.pathname; } let matchedPrefix = null; 
        let proxyOrigin = new URL(request.url).origin;

        // 反代 Token 门禁：开启后代理路径必须带 /密钥/ 前缀
        if (!url.pathname.startsWith('/api/') && url.pathname !== '/') {
            const pt = await getProxyToken(env);
            if (pt && pt.enabled && pt.key) {
                const prefixPath = '/' + pt.key + '/';
                let stripped = null;
                if (decodedPath === '/' + pt.key) stripped = '/';
                else if (decodedPath.indexOf(prefixPath) === 0) stripped = decodedPath.slice(prefixPath.length - 1);
                if (stripped === null) {
                    await recordProxyHit(env, request, decodedPath);
                    return Response.redirect(new URL('/catch', proxyOrigin), 302);
                }
                decodedPath = stripped;
            }
        }

        // 判断哪些请求可以按静态资源处理。
        // 这里把 Emby/Jellyfin 常见图片目录也纳入判断，是因为 UHD 海报/Backdrop
        // 不一定总带标准图片后缀；如果只按 .jpg/.webp 等后缀识别，部分图片请求会被当成普通接口，
        // 后续重定向、缓存和源站防盗链处理策略就可能不匹配，导致高清图加载失败。
        function isStaticPath(pathname) {
            return /\.(jpg|jpeg|gif|png|svg|ico|webp|js|css|woff2?|ttf|otf|map|webmanifest|srt|ass|vtt|sub)$/i.test(pathname)
                || /(\/Images\/|\/Icons\/|\/Branding\/|\/emby\/covers\/|\/img\/)/i.test(pathname);
        }

        // 判断当前请求是否携带登录态或访问令牌。
        // 带鉴权信息的图片/API 不能盲目交给 Cloudflare 长缓存，否则不同用户、不同 token
        // 可能命中同一份缓存，轻则拿到过期图片，重则造成串号风险。UHD 图片经常带 api_key
        // 或 X-Emby-Token，这里专门识别出来，让这类请求继续按源站实时响应处理。
        function hasAuthLikeState(headers, targetUrl) {
            const authQueryKeys = ['api_key', 'x-emby-token', 'x-mediabrowser-token', 'access_token', 'token'];
            const hasAuthQuery = Array.from(targetUrl.searchParams.keys()).some(key => authQueryKeys.includes(key.toLowerCase()));
            return headers.has("Authorization")
                || headers.has("X-Emby-Token")
                || headers.has("X-MediaBrowser-Token")
                || headers.has("X-Emby-Authorization")
                || headers.has("Cookie")
                || hasAuthQuery;
        }

        // ==========================================
        // 边缘缓存(v3.4.43 起仅静态资源):只缓存海报/图片/js/css/字体等安全资源,
        // 视频流一律不进 CF 边缘缓存(曾拖慢首播),直接反代取流。
        // ==========================================

        // 判定为「绝不能缓存」的路径:转码会话分片/播放列表/直播/下载/用户与会话类 API。
        // 这些要么是会话内临时内容(缓存键不稳定),要么含用户身份,要么实时变化,缓存只会出错。
        function isNoCachePath(targetUrl) {
            const p = targetUrl.pathname.toLowerCase();
            return /(\/hls\d*\/|\.m3u8$|\.mpd$|\/live\/|\/download$|\.strm$|\/users\/|\/sessions\/|\/playbackinfo|\/activeencodings|\/sync\/|\/shows\/|\/mediainfo|\/livestream)/.test(p);
        }

        // 兜底总入口:能判定安全才返回 CF 缓存配置,其余一律返回 null(原样回源)。
        // 只缓存 200/206(200-299);301/302/303/307/308 重定向与 401/403/404/5xx 全部 TTL=0 不缓存,
        // 避免把带第一个用户 token 的 302 或错误响应共享给后续用户。
        function edgeCacheCfOption(request, targetUrl, isStaticOrImage, authLikeState) {
            if (!enableCache) return null;                     // 节点缓存开关(cache_img)关闭 → 全部不缓存
            if (!isStaticOrImage) return null;                 // 仅海报/静态资源;视频流一律直接反代(v3.4.43)
            if (request.method !== 'GET') return null;         // 仅 GET,其余(含 POST 播放接口)一律回源
            if (isNoCachePath(targetUrl)) return null;         // 转码/列表/直播/下载/API 兜底
            try {
                // 静态资源:维持旧版保守逻辑,带鉴权态(含 token 的图片/API)不缓存,防串号
                if (!authLikeState) {
                    return { cacheEverything: true,
                             cacheTtlByStatus: { "200-299": EDGE_CACHE_STATIC_TTL,
                                                "301-308": 0, "401-403": 0, "404": 0, "500-599": 0 } };
                }
            } catch (e) {}
            return null; // 兜底:任何无法判定的情况一律不缓存,原样回源
        }

        function stripPanelCookie(headers) {
            const cookie = headers.get("Cookie");
            if (!cookie) return;
            const keptCookies = cookie.split(";").map(item => item.trim()).filter(item => item && !item.toLowerCase().startsWith("admin_token="));
            if (keptCookies.length > 0) headers.set("Cookie", keptCookies.join("; "));
            else headers.delete("Cookie");
        }

        function rewriteSetCookieForProxy(headers) {
            const getSetCookie = headers.getSetCookie ? headers.getSetCookie.bind(headers) : null;
            const rawSetCookie = headers.get("Set-Cookie");
            const cookies = getSetCookie ? getSetCookie() : (rawSetCookie ? rawSetCookie.split(/,(?=\s*[^;,]+=)/g) : []);
            if (cookies.length === 0) return;
            headers.delete("Set-Cookie");
            for (const cookie of cookies) headers.append("Set-Cookie", cookie.replace(/;\s*Domain=[^;]*/ig, ""));
        }

        // 收集所有源站 origin，并同时加入 http/https 的互换版本。
        // 实际返回的 JSON 里可能混用 http 与 https，例如线路配置是 https，
        // 但 Emby 返回的图片地址仍是 http。两个 origin 都纳入重写范围，
        // 才能避免 UHD 图片直连源站而绕过当前 Worker 代理。
        function getTargetOrigins(targets) {
            const origins = [];
            for (const target of targets) {
                try {
                    const parsed = new URL(target);
                    const origin = parsed.origin;
                    const alternateOrigin = (parsed.protocol === 'https:' ? 'http:' : 'https:') + '//' + parsed.host;
                    if (!origins.includes(origin)) origins.push(origin);
                    if (!origins.includes(alternateOrigin)) origins.push(alternateOrigin);
                } catch (e) {}
            }
            return origins;
        }

        // 把源站返回的图片/媒体 URL 改写成当前 Worker 代理 URL。
        // 修复 UHD 图片加载失败的核心原因在这里：部分接口返回的是绝对源站地址，
        // 浏览器会直接去访问源站，导致跨域、鉴权、源站不可达或被防盗链拦截。
        // 改写后所有图片请求都会重新经过 Worker，由 Worker 带着正确 header 转发到源站。
        function rewriteSourceUrlString(value, targetOrigins, proxyOrigin, safePrefix) {
            let rewritten = value;
            const proxyPrefix = proxyOrigin + safePrefix + '/';
            for (const origin of targetOrigins) {
                let result = '';
                let cursor = 0;
                let index = rewritten.indexOf(origin);
                while (index !== -1) {
                    // 避免重复代理：如果地址已经是 Worker 前缀 + 源站 URL，
                    // 再追加一次会变成 /proxy/https://worker/proxy/http://origin 这类坏地址。
                    const alreadyProxied = rewritten.substring(Math.max(0, index - proxyPrefix.length), index) === proxyPrefix;
                    result += rewritten.substring(cursor, index);
                    result += alreadyProxied ? origin : proxyPrefix + origin;
                    cursor = index + origin.length;
                    index = rewritten.indexOf(origin, cursor);
                }
                if (cursor > 0) {
                    result += rewritten.substring(cursor);
                    rewritten = result;
                }
            }
            // 部分 UHD 图片接口返回相对路径，例如 /Items/{id}/Images/Primary。
            // 这类地址没有 origin，前面的绝对 URL 替换匹配不到，所以需要单独补上
            // Worker origin 和当前线路前缀，保证浏览器不会请求到面板根路径或错误节点。
            const relativeImagePattern = /(^|["'\s(])((?:\/img\/|\/emby\/Items\/[^"'\s)]+\/Images\/|\/Items\/[^"'\s)]+\/Images\/)[^"'\s)]*)/ig;
            rewritten = rewritten.replace(relativeImagePattern, (match, prefix, path) => {
                if (safePrefix && path.startsWith(safePrefix + '/')) return match;
                return prefix + proxyOrigin + safePrefix + path;
            });
            return rewritten;
        }

        // 递归处理 JSON 里的所有字符串字段。
        // UHD 图片地址不固定出现在某一个字段，可能藏在 ImageTags、BackdropImageTags、
        // Artwork、ProviderIds 或插件返回的嵌套对象里；只改顶层字段会漏掉一部分高清图。
        function rewriteSourceUrlsInJson(value, targetOrigins, proxyOrigin, safePrefix) {
            if (typeof value === 'string') return rewriteSourceUrlString(value, targetOrigins, proxyOrigin, safePrefix);
            if (Array.isArray(value)) {
                let changed = false;
                const next = value.map(item => {
                    const rewritten = rewriteSourceUrlsInJson(item, targetOrigins, proxyOrigin, safePrefix);
                    if (rewritten !== item) changed = true;
                    return rewritten;
                });
                return changed ? next : value;
            }
            if (value && typeof value === 'object') {
                let changed = false;
                const next = {};
                for (const key of Object.keys(value)) {
                    const rewritten = rewriteSourceUrlsInJson(value[key], targetOrigins, proxyOrigin, safePrefix);
                    if (rewritten !== value[key]) changed = true;
                    next[key] = rewritten;
                }
                return changed ? next : value;
            }
            return value;
        }

        // 响应体被重写后必须移除这些和原始 body 强绑定的头。
        // 如果继续保留旧的 Content-Length/Content-Encoding/ETag，浏览器或中间缓存可能按旧长度、
        // 旧压缩格式校验新内容，表现为 JSON 截断、解压失败或缓存了未改写的图片 URL。
        function dropBodyIntegrityHeaders(headers) {
            headers.delete("Content-Length");
            headers.delete("Content-Encoding");
            headers.delete("ETag");
        }

        // 只有发现源站 URL 或典型图片相对路径时才解析并重写 JSON。
        // 这样可以避免每个普通 JSON 响应都做深度遍历，降低 Worker 开销；
        // 同时也确保包含 UHD 图片地址的响应不会被漏过。
        function hasJsonRewriteCandidate(text, targetOrigins) {
            return targetOrigins.some(origin => text.includes(origin))
                || /(^|["'\s(])(?:\/img\/|\/emby\/Items\/[^"'\s)]+\/Images\/|\/Items\/[^"'\s)]+\/Images\/)/i.test(text);
        }

        // 解析 302/307 域名规则文本（每行：域名,直连 或 域名,代理），返回 [{d, a}]
        function parseRedirectRules(text) {
            const rules = [];
            if (!text) return rules;
            // 兼容新前端提交的 JSON 数组格式 [{"d":"a.com","a":"direct"}]
            if (typeof text === 'string' && text.trim().charAt(0) === '[') {
                try {
                    const arr = JSON.parse(text);
                    if (Array.isArray(arr)) return arr.filter(x => x && x.d).map(x => ({ d: String(x.d).toLowerCase(), a: x.a === 'direct' ? 'direct' : 'proxy' }));
                } catch (e) {}
            }
            for (const line of String(text).split(/\r?\n/)) {
                const t = line.trim();
                if (!t) continue;
                const parts = t.split(',').map(s => s.trim());
                if (parts.length < 2 || !parts[0]) continue;
                let domain = parts[0].replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
                domain = domain.replace(/^www\./i, '');
                if (!domain || /\s|\//.test(domain)) continue;
                const action = /^(direct|直连|不走反代)$/i.test(parts[1]) ? 'direct' : (/^(proxy|代理|走反代)$/i.test(parts[1]) ? 'proxy' : null);
                if (!action) continue;
                rules.push({ d: domain.toLowerCase(), a: action });
            }
            return rules;
        }

        function rewriteRedirectLocation(location, targetUrl, targetOrigins, proxyOrigin, safePrefix) {
            if (!location) return location;
            if (location.startsWith('//')) {
                try {
                    const protocol = targetUrl ? targetUrl.protocol : new URL(targetOrigins[0]).protocol;
                    location = protocol + location;
                } catch (e) {}
            }
            if (location.startsWith('/')) {
                if (safePrefix && location.startsWith(safePrefix + '/')) return proxyOrigin + location;
                if (!safePrefix && targetUrl) return `${proxyOrigin}/${encodeURIComponent(new URL(location, targetUrl.origin).href)}`;
                return proxyOrigin + safePrefix + location;
            }
            try {
                const parsed = new URL(location);
                if (targetOrigins.includes(parsed.origin)) {
                    if (!safePrefix) return `${proxyOrigin}/${encodeURIComponent(location)}`;
                    return proxyOrigin + safePrefix + parsed.pathname + parsed.search + parsed.hash;
                }
            } catch (e) {}
            if (/^https?:\/\//i.test(location)) {
                // 跨源 Location:面板/前缀/encodeURIComponent(完整URL),与 Lite 参考实现一致。
                // 编码可避免 URL 内裸 ? & # 在响应头/二次请求时被解析错乱。
                // 「外部跳转直连」开关在 directExternal302 层已优先放行直连。
                return `${proxyOrigin}${safePrefix}/${encodeURIComponent(location)}`;
            }
            // 非 http(s) 或无法解析的 Location:降级为保留原值,不下发代理改写
            // (3.4.38 曾直接删除,部分服务器裸 Location 被丢弃导致播放断流,回退为历史行为)
            return location;
        }

        // 判断当前请求路径是否像 Emby / Jellyfin 体系的 API 或静态资源路径。
        // 这一步是给 UHD / HUD 这类“服务真实挂在 /emby 子路径下，但线路里只填了裸域名”的场景兜底用的。
        // 例如客户端请求 /uhd/Items/{id}/PlaybackInfo，当前脚本会先转发到源站的 /Items/{id}/PlaybackInfo。
        // 如果 HUD 实际服务入口是 /emby/Items/{id}/PlaybackInfo，那么源站通常会直接回 404。
        //
        // 普通 Emby 有两种常见部署方式：
        // 1. 根路径部署，API 就在 /Items /Videos /Sessions 下
        // 2. 子路径部署，API 在 /emby/Items /emby/Videos /emby/Sessions 下
        //
        // 之前脚本完全依赖面板里手动把 target 写成带 /emby 的完整地址；
        // 只要这一步没填对，普通首页可能还能打开，但播放相关接口会在拿 PlaybackInfo 时 404。
        // 这里加的是“只在像 Emby API 的路径上才启用”的保守识别，避免把其他完全无关的网站路径误补成 /emby。
        function isLikelyMediaServerPath(pathname) {
            return /^\/(?:Items|Videos|Audio|Sessions|Users|System|Library|LiveTv|Shows|Movies|Artists|Albums|Playlists|Channels|Packages|Devices|Socket|socket|web|emby|Images|Branding|Environment|DisplayPreferences|Trailers|Collections|Genres|Persons|Studios|Years)(?:\/|$)/i.test(pathname);
        }

        // 为单个 target 生成候选上游 URL。
        // 第一候选始终保持原行为，完全按“target + remainingPath”拼接。
        // 第二/第三候选只在以下条件满足时追加：
        // - 线路 target 本身没有子路径（说明面板里大概率填的是裸域名）
        // - 当前请求像 Emby API/资源路径
        //
        // 这里同时兼容两类常见偏差：
        // 1. 实际服务挂在 /emby 下，但客户端请求的是 /Items /Videos ...
        //    -> 自动补成 /emby/Items /emby/Videos
        // 2. 实际服务挂在根路径，但客户端自己固定补了 /emby/Items /emby/Videos
        //    -> 自动再试一次去掉 /emby 前缀后的 /Items /Videos
        //
        // 这样普通 Emby 和 HUD/UHD Emby 都可以在同一节点内完成“加 /emby”或“去 /emby”的双向回退，
        // 避免某些客户端因为固定拼接 /emby 而只在部分服务器上失效。
        function buildUpstreamCandidates(targetBase, remainingPath, search) {
            const candidates = [];
            const pushUnique = (value) => {
                if (value && !candidates.includes(value)) candidates.push(value);
            };

            const primary = targetBase + remainingPath + search;
            pushUnique(primary);

            try {
                const parsed = new URL(targetBase);
                const basePath = (parsed.pathname || '/').replace(/\/+$/, '') || '/';
                const requestPath = remainingPath || '/';

                // 只有当 target 本身没有配置任何子路径时，才尝试 /emby 回退。
                // 如果用户已经明确把线路写成了 https://host/emby，再补一次会变成 /emby/emby/...，
                // 这反而会把原本正确的请求打坏，所以这里必须先判断 basePath 是根路径。
                const hasNoBasePath = (basePath === '/');
                const requestAlreadyHasEmbyPrefix = /^\/emby(?:\/|$)/i.test(requestPath);

                if (hasNoBasePath && !requestAlreadyHasEmbyPrefix && isLikelyMediaServerPath(requestPath)) {
                    pushUnique(`${parsed.origin}/emby${requestPath}${search}`);
                }

                // 反向回退：
                // 某些客户端会固定把媒体/接口地址补成 /emby/...，但普通 Emby 真实入口其实在根路径。
                // 例如 PlaybackInfo 被客户端请求成 /emby/videos/...，源站根路径部署时会 404，
                // 这时自动再试一次去掉 /emby 前缀后的 /videos/...。
                if (hasNoBasePath && requestAlreadyHasEmbyPrefix && isLikelyMediaServerPath(requestPath)) {
                    const strippedRequestPath = requestPath.replace(/^\/emby(?=\/|$)/i, '') || '/';
                    pushUnique(`${parsed.origin}${strippedRequestPath}${search}`);
                }

                // 兼容“绝对 URL 透传”场景。
                // 你这次抓到的请求已经不是 /uhd/Items/...，而是：
                // /uhd/https://v1.uhdnow.com/Items/{id}/PlaybackInfo?... 
                //
                // 这说明客户端拿到的 PlaybackInfo 返回里已经是一个绝对地址，
                // Worker 也确实按“绝对 URL 反代”逻辑在工作；但问题是这个绝对地址本身少了 /emby，
                // 所以当前逻辑会老老实实去请求：
                // https://v1.uhdnow.com/Items/{id}/PlaybackInfo
                // 然后被源站 nginx 回 404。
                //
                // 这里额外补一个候选：
                // 如果 targetBase 自己已经是完整绝对 URL，且它的 pathname 看起来像 Emby API，
                // 但 pathname 又不是以 /emby 开头，那么自动再试一次：
                // https://host/emby + pathname
                //
                // 这样不管请求来自“线路前缀模式”还是“绝对 URL 透传模式”，
                // 只要真实上游挂在 /emby 子路径下，都能在同一节点内完成回退。
                const targetAlreadyHasEmbyPrefix = /^\/emby(?:\/|$)/i.test(parsed.pathname || '/');
                if (!targetAlreadyHasEmbyPrefix && isLikelyMediaServerPath(parsed.pathname || '/')) {
                    const passthroughSearch = parsed.search || search;
                    pushUnique(`${parsed.origin}/emby${parsed.pathname}${passthroughSearch}${parsed.hash || ''}`);
                }

                // 对“绝对 URL 透传”同样做一次反向 /emby 去除回退。
                // 这样如果客户端缓存/拼接出来的是 https://host/emby/videos/...，
                // 而真实普通 Emby 在根路径 /videos/...，当前节点内也能自动修复。
                //
                // 注意这里仍然是“补一个低优先级候选”，不会抢在原始 /emby 路径前面。
                // 所以 UHD/HUD 如果真实就是 /emby 子路径部署，主候选仍然会先命中；
                // 只有主候选失败后，才会尝试去掉 /emby，避免把原本正常的 UHD 路径扰乱。
                if (targetAlreadyHasEmbyPrefix && isLikelyMediaServerPath(parsed.pathname || '/')) {
                    const passthroughSearch = parsed.search || search;
                    const strippedPathname = (parsed.pathname || '/').replace(/^\/emby(?=\/|$)/i, '') || '/';
                    pushUnique(`${parsed.origin}${strippedPathname}${passthroughSearch}${parsed.hash || ''}`);
                }
            } catch (e) {}

            return candidates;
        }

        // 把 PlaybackInfo 里的媒体地址统一规范成“Worker 前缀下的根路径相对地址”。
        //
        // 这里不再按某个客户端做特判，而是尽量保留 Emby 原生字段的共同语义：
        // - 很多客户端期望拿到的是 path，而不是完整绝对 URL
        // - 但如果 path 里不带当前线路前缀，客户端一旦直接请求 /videos 或 /emby/videos，
        //   就会绕过 /{prefix}/... 这条代理路由，导致播放失败
        //
        // 因此统一输出为：
        // /{prefix} + 源站原始 path
        //
        // 例如：
        // - 源站是 /videos/...       -> /{prefix}/videos/...
        // - 源站是 /emby/videos/... -> /{prefix}/emby/videos/...
        //
        // 这里特意保留“源站原始 path”而不是强行统一成某一种固定格式，
        // 是因为你这次抓到的普通 Emby 和 UHD/HUD PlaybackInfo 都表明：
        // - API 请求常常走 /emby/Items/... /emby/Sessions/...
        // - 真正媒体直链 DirectStreamUrl 常常却是 /videos/...
        //
        // 也就是说，/emby 更像是 API 基路径，而 /videos 才是媒体流路径；
        // 如果在这里想当然地把媒体地址补成 /emby/videos/...，反而会把原本正确的普通 Emby 直链改坏。
        //
        // 这样可以同时兼容三类常见用法：
        // 1. 直接把字段当请求地址使用：会命中当前线路
        // 2. 浏览器按 root-relative 解析：仍然会命中当前线路
        // 3. 客户端拿到 path 后再自行拼 serverUrl：如果拼出了重复 prefix，
        //    后面的 normalizeRemainingPathForPlayback 会在入口做一次轻量修正
        function toWorkerPlaybackPath(pathname, search = '', hash = '', safePrefix = '') {
            const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
            return `${safePrefix}${normalizedPath}${search || ''}${hash || ''}`;
        }

        // PlaybackInfo 起播缓存键:剥掉用户/会话身份参数,同片多用户共享同一份改写结果(播放地址一致)
        function stripPlaybackCacheSearch(search = '') {
            if (!search) return search;
            try {
                const u = new URL('http://x' + search);
                ['userid', 'deviceid', 'api_key', 'x-emby-token', 'x-mediabrowser-token', 'access_token', 'playsessionid', 'session'].forEach(k => u.searchParams.delete(k));
                return u.search;
            } catch (e) { return search; }
        }

        function rewritePlaybackMediaUrl(rawValue, targetUrl, proxyOrigin, safePrefix, targetOrigins) {
            if (typeof rawValue !== 'string') return rawValue;
            const trimmedValue = rawValue.trim();
            if (!trimmedValue) return rawValue;

            // 如果字段已经被改成当前 Worker 前缀下的路径，直接复用，避免重复叠加 prefix。
            if (safePrefix && trimmedValue.startsWith(safePrefix + '/')) return rawValue;

            // 某些客户端会缓存上一次的 PlaybackInfo，拿到的是完整 Worker 绝对地址。
            // 这里把它还原成 root-relative，继续保持“字段值是 path”的通用语义。
            if (safePrefix && trimmedValue.startsWith(proxyOrigin + safePrefix + '/')) {
                return trimmedValue.substring(proxyOrigin.length);
            }

            // 对绝对地址分两类处理：
            // 1. 同源绝对地址：保留源站原始 path，只在前面补 /{prefix}
            // 2. 跨源绝对地址：保留成 Worker 的“绝对 URL 透传代理”形式
            //
            // HUD / FWD 一类自研服务有时会在 PlaybackInfo 中返回完整绝对媒体地址，
            // 甚至媒体 host 与 API host 不同。这里如果只保留 pathname，会把真正的媒体源 host 丢掉，
            // 最终表现为 PlaybackInfo 成功、实际拉流失败。
            //
            // 因此跨源绝对地址必须继续走：
            // /{prefix}/https://real-media-host/...
            //
            // 这样 Worker 仍然能带着现有 header/回退逻辑去请求真实媒体地址，
            // 同时也不会把 HUD 明确依赖的 /emby 子路径语义抹掉。
            if (/^https?:\/\//i.test(trimmedValue)) {
                try {
                    const parsed = new URL(trimmedValue);
                    if (Array.isArray(targetOrigins) && !targetOrigins.includes(parsed.origin)) {
                        // 跨源媒体地址:面板/前缀/http://推流域名 拼接形式,由 CF Worker 反代取流
                        // (用户连接面板域名,流量经 CF)。3.4.40 曾裸直连推流域名,绕过
                        // 「外部跳转直连」开关语义——恢复代理形式。
                        return `${proxyOrigin}${safePrefix}/${trimmedValue}`;
                    }
                    return toWorkerPlaybackPath(parsed.pathname, parsed.search, parsed.hash, safePrefix);
                } catch (e) {
                    return rawValue;
                }
            }

            if (trimmedValue.startsWith('//')) {
                try {
                    const parsed = new URL(targetUrl.protocol + trimmedValue);
                    if (Array.isArray(targetOrigins) && !targetOrigins.includes(parsed.origin)) {
                        return `${proxyOrigin}${safePrefix}/${parsed.href}`; // 跨源:代理拼接形式
                    }
                    return toWorkerPlaybackPath(parsed.pathname, parsed.search, parsed.hash, safePrefix);
                } catch (e) {
                    return rawValue;
                }
            }

            if (trimmedValue.startsWith('/')) return toWorkerPlaybackPath(trimmedValue, '', '', safePrefix);

            try {
                const resolved = new URL(trimmedValue, targetUrl.origin + '/');
                return toWorkerPlaybackPath(resolved.pathname, resolved.search, resolved.hash, safePrefix);
            } catch (e) {
                return rawValue;
            }
        }

        // 一些客户端会在拿到 PlaybackInfo 后自己再拼一次 serverUrl。
        // 如果我们返回的是 /{prefix}/videos/... 或 /{prefix}/emby/videos/...，
        // 某些客户端再自己拼一次 serverUrl 后，有时会拼出：
        // - /{prefix}/{prefix}/videos/...
        // - /{prefix}/emby/{prefix}/videos/...
        //
        // 这些其实都还是同一条线路，只是多叠了一层 prefix。
        // 这里在真正选路前做一次 O(1) 字符串归一化，把常见重复前缀修回标准路径，
        // 这样既不依赖某个特定客户端，也避免为此引入额外存储或更重的会话跟踪。
        function normalizeRemainingPathForPlayback(remainingPath, matchedPrefix, tokenPrefix) {
            if (!remainingPath || !matchedPrefix) return remainingPath;

            const prefixPath = `/${matchedPrefix}`;
            const embyDuplicatedPrefix = `/emby${prefixPath}`;

            // 开 token 时客户端二次拼接会拼出重复前缀，常见两类：
            //   /{token}/{节点}/emby/{token}/{节点}/videos/...   （客户端固定补 /emby）
            //   /{token}/{节点}/videos/{token}/{节点}/videos/... （视频路径本身以 /videos 开头）
            // 门禁剥掉首个 token 后 remainingPath = /emby/{token}/{节点}/... 或 /videos/{token}/{节点}/...，
            // 这里做通用剥离：只要前 3 段是 /{段1}/{token}/{节点} 就剥掉 token+节点；
            // 若 seg1 就是节点（纯节点重复形态 /{节点}/{token}/{节点}/...），剥光后直接保留剩余视频路径；
            // 否则保留 /{段1}，若剩余部分首段与段1 相同（如 /videos/{token}/{节点}/videos/...）再去重合并，
            // 兼容 emby / videos / stream 等任意视频 API 前缀，避免带着 /{token}/{节点} 打到源站返回 404。
            if (tokenPrefix) {
                const tokenDup = remainingPath.match(/^\/([^/]+)\/([^/]+)\/([^/]+)(?=\/|$)/);
                if (tokenDup && tokenDup[2] === tokenPrefix && (tokenDup[3] === matchedPrefix || tokenDup[1] === matchedPrefix)) {
                    const seg1 = tokenDup[1];
                    const rest = remainingPath.substring(tokenDup[0].length) || '/';
                    if (seg1 === matchedPrefix) return rest;
                    if (rest === '/' + seg1 || rest.startsWith('/' + seg1 + '/')) return rest;
                    return '/' + seg1 + rest;
                }
            }

            if (remainingPath === prefixPath || remainingPath.startsWith(prefixPath + '/')) {
                const stripped = remainingPath.substring(prefixPath.length);
                return stripped || '/';
            }

            if (remainingPath === embyDuplicatedPrefix || remainingPath.startsWith(embyDuplicatedPrefix + '/')) {
                const stripped = remainingPath.substring(embyDuplicatedPrefix.length);
                // 这里兼容两种客户端二次拼接结果：
                // 1. /emby/{prefix}/videos/...      -> 还原成 /emby/videos/...
                // 2. /emby/{prefix}/emby/videos/... -> 还原成 /emby/videos/...
                //
                // 第二种常见于“API 习惯性固定补 /emby 的客户端”：
                // PlaybackInfo 已经返回 /{prefix}/emby/videos/...，
                // 客户端又按自己的固定规则补了一层 /emby，最终会多出 /emby/{prefix}/emby/...。
                // 如果这里无脑再拼一次 /emby，会变成 /emby/emby/videos/...，反而把原本可修复的请求打坏。
                if (!stripped || stripped === '/') return '/emby/';
                if (/^\/emby(?:\/|$)/i.test(stripped)) return stripped;
                return `/emby${stripped}`;
            }

            return remainingPath;
        }

        let route = null;
        if (decodedPath.startsWith('/http://') || decodedPath.startsWith('/https://')) {
            // 裸域名直连代理开关:默认允许(与历史一致);关闭后仅允许已配置的节点前缀与 Token 前缀
            try {
                if (env.DB) {
                    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                    const bareRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'bare_proxy_enabled'").first();
                    if (bareRow && bareRow.value === '0') return new Response('Forbidden', { status: 403 });
                }
            } catch (e) {}
            targetUrls = [decodedPath.substring(1)]; remainingPath = '';
        } else {
            const pathParts = decodedPath.split('/'); const prefix = pathParts[1]; 
            if (!prefix) return new Response(`Not Found`, { status: 404 });

            try {
                if (!env.DB) return new Response(`404: Node not found (DB not bound)`, { status: 404 });
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN custom_ip TEXT DEFAULT ''`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN redirect_direct TEXT DEFAULT 'off'`); } catch(e) {}
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN redirect_rules TEXT DEFAULT ''`); } catch(e) {}
            try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN node_user TEXT DEFAULT ''`); } catch(e) {}
            try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN node_pass TEXT DEFAULT ''`); } catch(e) {}
            try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN emos_id TEXT DEFAULT ''`); } catch(e) {}
            try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN emos_name TEXT DEFAULT ''`); } catch(e) {}
            try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN emos_aggregate TEXT DEFAULT 'off'`); } catch(e) {}
            try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN direct_play TEXT DEFAULT 'on'`); } catch(e) {}
                const stmt = env.DB.prepare(`SELECT target, mode, cache_img, custom_ip, redirect_direct, redirect_rules, emos_id, emos_name, emos_aggregate FROM routes WHERE prefix = ?`);
                route = await stmt.bind(prefix).first();
                if (!route) return new Response(`404: Node not found`, { status: 404 });

                currentMode = route.mode || 'off'; enableCache = (route.cache_img !== 'off');
                redirectDirect = route.redirect_direct === 'on';
                try { redirectRules = route.redirect_rules ? JSON.parse(route.redirect_rules) : []; if (!Array.isArray(redirectRules)) redirectRules = []; } catch (e) { redirectRules = []; }
                matchedPrefix = prefix; remainingPath = '/' + pathParts.slice(2).join('/');
                let tokenPrefixForNormalize = '';
                try { const ptN = await getProxyToken(env); if (ptN && ptN.enabled && ptN.key) tokenPrefixForNormalize = ptN.key; } catch(e) {}
                remainingPath = normalizeRemainingPathForPlayback(remainingPath, matchedPrefix, tokenPrefixForNormalize);
                targetUrls = route.target.split(',').map(s => s.trim()).filter(Boolean);
                
                if (remainingPath.startsWith('/http://') || remainingPath.startsWith('/https://')) { targetUrls = [remainingPath.substring(1)]; remainingPath = ''; }
            } catch (e) { return new Response("DB Error: " + e.message, { status: 500 }); }
        }

        if (targetUrls.length === 0) return new Response("404: Target empty", { status: 404 });

        // ==========================================
        // 2.75 EMOS 聚合伪装(3.4.30)
        // 原理:聚合播放器(SenPlayer 等)用 AnyProviderIdEquals=tmdb.X 跨服查询"你有没有这部剧"。
        //      EMOS 的 Items 接口对 AnyProviderIdEquals 解析是坏的(标准 provider 名一律返回空),
        //      但 EMOS 的 Series/Movie 条目本身带 ProviderIds{Tmdb}(实测已验证,且 Todb=TheOtherDB 编号)。
        //      这里拦截该查询 → 抓取 EMOS 全量目录(模块级内存缓存 + D1 持久缓存)→ 按 Tmdb 编号匹配 →
        //      命中则返回带 ProviderIds{Tmdb} 的条目(原样),播放器即把本节点列为播放源;
        //      未命中放行原样透传(EMOS 原始同样返回空,行为不变)。播放层完全透传零改动。
        // ==========================================
        async function emosAggregateHandle(request, env, ctx, url, decodedPath, route, matchedPrefix, targetUrls) {
            try {
                if (request.method !== 'GET') return null;
                if (url.pathname.indexOf('/Items') < 0) return null;
                const apiq = url.searchParams.get('AnyProviderIdEquals');
                if (!apiq) return null;
                // 只处理 tmdb 编号(实测 imdb/tvdb 在 EMOS 无对应数据;SenPlayer 查询三者同发,tmdb 命中即成立)
                const tmdbMatch = apiq.match(/(?:^|,)tmdb\.(\d+)/i);
                if (!tmdbMatch) return null;
                const providerId = tmdbMatch[1];
                const uidMatch = decodedPath.match(/\/Users\/([^/]+)\/Items/i);
                if (!uidMatch) return null;
                const userId = uidMatch[1];

                const cacheKey = 'emos_cat_v2_' + (matchedPrefix || ''); // 目录与用户无关,跨用户共享;v2 避开旧版脏缓存
                // 幂等建表(仅执行一次,避免每次请求的 DDL 开销)
                if (!emosCatTableReady) {
                    try { await env.DB.prepare('CREATE TABLE IF NOT EXISTS emos_catalog (cache_key TEXT PRIMARY KEY, data TEXT NOT NULL, t INTEGER NOT NULL)').run(); emosCatTableReady = true; } catch (e) {}
                }
                let catalog = emosCatalogCache.get(cacheKey);
                if (!catalog || Date.now() - catalog.t > 600000) { // 内存缓存 10 分钟
                    // 构造 EMOS 全量目录抓取地址(兼容 target 自带 /emby 子路径)
                    let embyRoot = targetUrls[0];
                    try {
                        const p = new URL(targetUrls[0]);
                        const b = (p.pathname || '/').replace(/\/+$/, '');
                        embyRoot = (b && b !== '/') ? (p.origin + b) : p.origin;
                    } catch (e) {}
                    const h = new Headers();
                    const token = request.headers.get('X-Emby-Token') || request.headers.get('X-MediaBrowser-Token');
                    if (token) h.set('X-Emby-Token', token);
                    else { const a = request.headers.get('Authorization'); if (a) h.set('Authorization', a); }
                    // EMOS 源站要求:带 EMOS-PROXY-ID/NAME + 浏览器 UA/语言头(与正常播放转发一致,防源站拒接)
                    if (route && route.emos_id) h.set('EMOS-PROXY-ID', route.emos_id);
                    if (route && route.emos_name) h.set('EMOS-PROXY-NAME', route.emos_name);
                    h.set('User-Agent', 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');
                    h.set('Accept-Language', 'zh-CN,zh;q=0.9');
                    h.set('Accept', 'application/json');
                    // 优先用 D1 持久缓存(1 小时),命中则免抓取
                    let cachedItems = null;
                    try {
                        const row = await env.DB.prepare('SELECT data, t FROM emos_catalog WHERE cache_key = ?').bind(cacheKey).first();
                        if (row && Date.now() - row.t < 3600000) { try { cachedItems = JSON.parse(row.data); } catch (e) {} }
                    } catch (e) {}
                    if (cachedItems && Array.isArray(cachedItems) && cachedItems.length) {
                        catalog = { t: Date.now(), items: cachedItems };
                    } else {
                        // 串行分页抓全量目录:EMOS 的 TotalRecordCount 是累计值(600→900→…,不可信),
                        // 因此不按总数截断,一直抓到「空页」为止(guard 上限防死循环)
                        const items = [];
                        let startIndex = 0; let pages = 0; let lastCatStatus = 0;
                        for (let guard = 0; guard < 30; guard++) {
                            const suffix = '/Users/' + userId + '/Items?Recursive=true&IncludeItemTypes=Series,Movie&Fields=ProviderIds,Id,Path,Name,ProductionYear,Type&Limit=300&StartIndex=' + startIndex;
                            const catUrl = /\/emby$/i.test(embyRoot) ? (embyRoot + suffix) : (embyRoot + '/emby' + suffix);
                            let resp = null;
                            try { resp = await fetch(catUrl, { headers: h }); } catch (e) { resp = null; }
                            if (!resp || !resp.ok) { lastCatStatus = resp ? resp.status : 0; items.length = 0; break; }
                            const data = await resp.json();
                            const page = Array.isArray(data.Items) ? data.Items : [];
                            if (!page.length) break; // 空页 = 抓完
                            items.push(...page);
                            pages++;
                            startIndex += page.length;
                        }
                        if (!items.length) return null; // 目录抓取失败/空 → 放行(EMOS 原始行为一致)
                        catalog = { t: Date.now(), items, pages };
                        // 写 D1 持久缓存(跨请求复用,首次后秒回)
                        try {
                            await env.DB.prepare('INSERT OR REPLACE INTO emos_catalog (cache_key, data, t) VALUES (?, ?, ?)').bind(cacheKey, JSON.stringify(items), Date.now()).run();
                        } catch (e) {}
                    }
                    emosCatalogCache.set(cacheKey, catalog);
                    // 防止长期运行缓存膨胀:顺带清理过期项
                    try {
                        if (emosCatalogCache.size > 30) {
                            const now = Date.now();
                            for (const [k, v] of emosCatalogCache) { if (now - v.t > 60000) emosCatalogCache.delete(k); }
                        }
                    } catch (e) {}
                }
                const hits = catalog.items.filter(it => it && it.ProviderIds && String(it.ProviderIds.Tmdb) === String(providerId));
                if (!hits.length) return null; // 未命中 → 放行(与 EMOS 原始行为一致)

                const body = JSON.stringify({ Items: hits, TotalRecordCount: hits.length });
                const rh = new Headers({ 'Content-Type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' });
                return new Response(body, { status: 200, headers: rh });
            } catch (e) {
                console.log('emosAggregate error:', e.message);
                return null;
            }
        }
        // EMOS 模式 + 节点开启聚合 + 命中聚合查询 → 直接返回构造响应
        if (currentMode === 'emos' && route && route.emos_aggregate === 'on') {
            const agg = await emosAggregateHandle(request, env, ctx, url, decodedPath, route, matchedPrefix, targetUrls);
            if (agg) return agg;
        }

        // ==========================================
        // 2.7 防爆型精准日志拦截 (修复统计虚高：仅拦截点火请求)
        // ==========================================
        const isNewPlaySession = /\/PlaybackInfo/i.test(url.pathname); 

        if (isNewPlaySession && matchedPrefix && env.DB && ctx && ctx.waitUntil) {
            try {
                const todayStr = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
                const nowTime = new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').split('.')[0]; 
                
                let stmts = [
                    env.DB.prepare(`INSERT INTO request_stats (prefix, date, count) VALUES (?, ?, 1) ON CONFLICT(prefix, date) DO UPDATE SET count = count + 1`).bind(matchedPrefix, todayStr),
                    env.DB.prepare(`UPDATE routes SET last_play = ? WHERE prefix = ?`).bind(nowTime, matchedPrefix)
                ];

                const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "Unknown";
                const clientCountry = request.headers.get("cf-ipcountry") || "Unknown";
                const clientUa = request.headers.get("User-Agent") || "Unknown";
                stmts.push(env.DB.prepare(`INSERT INTO visitor_logs (prefix, ip, country, ua) VALUES (?, ?, ?, ?)`).bind(matchedPrefix, clientIp, clientCountry, clientUa));

                ctx.waitUntil(env.DB.batch(stmts));
                // v3.4.16:播放热力图计数(与上方统计同一触发点,幂等建表在函数内)
                ctx.waitUntil(recordPlayHit(env, matchedPrefix));
            } catch(e) {}
        }

        // ==========================================
        // 2.8 无伪装模式下的源站反代 (含强力防 403 引擎)
        // ==========================================
        const isStrictMode = currentMode === 'strict';

        let bodyBuffer = null;
        const canHaveRequestBody = request.method !== 'GET' && request.method !== 'HEAD';
        const needsReplayableBody = canHaveRequestBody && (
            targetUrls.length > 1
            || targetUrls.some(target => buildUpstreamCandidates(target, remainingPath, url.search).length > 1)
        );

        if (needsReplayableBody) {
            // 这里只在“请求体会被重复使用”时才预读成 ArrayBuffer。
            //
            // 触发条件有两类：
            // 1. 多节点 failover：同一个 POST 可能发往多个 target
            // 2. 同节点候选回退：例如 /Items/... 失败后，再试 /emby/Items/...
            //
            // 这两种情况都会二次消费 request.body；不先缓存就会出现：
            // "This ReadableStream is disturbed (has already been read from)"
            //
            // 但如果本次请求只会发起一次上游 fetch，就继续保留原本的流式透传，
            // 尽量减少我这次修复对现有面板和普通反代行为的影响范围。
            bodyBuffer = await request.clone().arrayBuffer();
        }

        let finalResponse = null; let lastError = null; let targetOrigins = getTargetOrigins(targetUrls); let finalTargetUrl = null;

        for (let i = 0; i < targetUrls.length; i++) {
            const candidateUrls = buildUpstreamCandidates(targetUrls[i], remainingPath, url.search);

            for (let j = 0; j < candidateUrls.length; j++) {
                const targetUrlStr = candidateUrls[j];
                const targetUrl = new URL(targetUrlStr);
                const newHeaders = new Headers(request.headers); newHeaders.set("Host", targetUrl.host);
                stripPanelCookie(newHeaders);

                const realIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || (request.headers.get("x-forwarded-for") || "").split(',')[0].trim();
                newHeaders.delete("cf-connecting-ip"); newHeaders.delete("cf-ipcountry"); newHeaders.delete("cf-ray");
                newHeaders.delete("cf-visitor"); newHeaders.delete("x-forwarded-for"); newHeaders.delete("x-real-ip");

                newHeaders.set("X-Forwarded-Proto", url.protocol.replace(':', ''));
                newHeaders.set("X-Forwarded-Host", url.host);

                // EMOS 专用模式：按 emos.dpdns.org/proxy 要求——
                // 必填 EMOS-PROXY-ID / EMOS-PROXY-NAME 两枚头，强制透传真实 IP(X-Forwarded-For)，忽略 custom_ip 伪装
                const fakeIp = (route && route.custom_ip) || '';
                if (currentMode === 'emos') {
                    if (realIp) { newHeaders.set("X-Forwarded-For", realIp); newHeaders.set("X-Real-IP", realIp); }
                    // 未单独配置时自动使用内置默认身份(面板可改)
                    setHeaderSafe(newHeaders, "EMOS-PROXY-ID", (route && route.emos_id) || DEFAULT_EMOS_ID);
                    setHeaderSafe(newHeaders, "EMOS-PROXY-NAME", (route && route.emos_name) || DEFAULT_EMOS_NAME);
                } else if (fakeIp) {
                    newHeaders.delete("cf-connecting-ip"); newHeaders.delete("cf-ipcountry"); newHeaders.delete("cf-ray");
                    newHeaders.delete("cf-visitor"); newHeaders.delete("x-forwarded-for"); newHeaders.delete("x-real-ip");
                    newHeaders.delete("x-client-ip"); newHeaders.delete("true-client-ip"); newHeaders.delete("forwarded");
                    newHeaders.delete("via"); newHeaders.delete("x-originating-ip"); newHeaders.delete("x-forwarded-server");
                    newHeaders.delete("client-ip");
                    newHeaders.set("X-Forwarded-For", fakeIp);
                    newHeaders.set("X-Real-IP", fakeIp);
                    newHeaders.set("X-Client-IP", fakeIp);
                } else if (currentMode === 'realip_only' && realIp) { newHeaders.set("X-Real-IP", realIp); } 
                else if ((currentMode === 'dual' || isStrictMode) && realIp) { newHeaders.set("X-Real-IP", realIp); newHeaders.set("X-Forwarded-For", realIp); }

                if (isStrictMode) {
                    newHeaders.set("Origin", targetUrl.origin); newHeaders.set("Referer", targetUrl.origin + "/");
                } else {
                    const origin = newHeaders.get("Origin");
                    if (origin && origin === url.origin) newHeaders.set("Origin", targetUrl.origin);
                    const referer = newHeaders.get("Referer");
                    if (referer && referer.startsWith(url.origin)) newHeaders.set("Referer", referer.replace(url.origin, targetUrl.origin));
                }

                const isStaticOrImage = isStaticPath(targetUrl.pathname);
                const authLikeState = hasAuthLikeState(newHeaders, targetUrl);
                const hasRedirectRules = redirectRules.length > 0;

                let fetchInit = { method: request.method, headers: newHeaders, redirect: (isStaticOrImage && !redirectDirect && !hasRedirectRules) ? 'follow' : 'manual' };

                // 边缘缓存:Static 直连视频(内容共享,键剥身份参数)与无鉴权静态资源进 CF 缓存;
                // 带鉴权态的图片/API、转码/播放列表/直播/下载及任何无法判定的请求一律原样回源(兜底防误伤)。
                const edgeCf = edgeCacheCfOption(request, targetUrl, isStaticOrImage, authLikeState);
                if (edgeCf) fetchInit.cf = edgeCf;

                if (canHaveRequestBody) {
                    if (bodyBuffer !== null) {
                        // 只有在需要重试/切线时才使用可复用的二进制 body。
                        fetchInit.body = bodyBuffer;
                    } else {
                        // 单次请求仍然按旧逻辑直接透传原始流，避免扩大兼容性风险。
                        fetchInit.body = request.body;
                        fetchInit.duplex = 'half';
                    }
                }

                try {
                    const modifiedRequest = new Request(targetUrl, fetchInit); const response = await fetch(modifiedRequest);

                    // 这里特意允许“同一 target 的下一候选”继续尝试。
                    // 也就是说：如果裸路径 /Items/... 回了 404，而 /emby/Items/... 是可用的，
                    // 就不要立刻把这条线路判死，而是优先在当前线路内部完成一次 /emby 回退重试。
                    if ((response.status === 404 || response.status === 502 || response.status === 503 || response.status === 504) && j < candidateUrls.length - 1) {
                        lastError = new Error(`Node ${i+1} candidate ${j+1} returned HTTP ${response.status}`);
                        continue;
                    }

                    if (response.status === 502 || response.status === 503 || response.status === 504) {
                        lastError = new Error(`Node ${i+1} returned HTTP ${response.status}`);
                        continue;
                    }

                    finalResponse = response; finalTargetUrl = targetUrl; break;
                } catch (err) {
                    lastError = err; continue;
                }
            }

            if (finalResponse) break;
        }

        if (!finalResponse) return new Response("Worker Proxy Failover Exhausted. All nodes failed. Last Error: " + (lastError?.message || 'Unknown Error'), { status: 502 });

        const responseHeaders = new Headers(finalResponse.headers);
        rewriteSetCookieForProxy(responseHeaders);
        const ptObj = await getProxyToken(env);
        const safePrefix = matchedPrefix ? `/${proxyTokenPrefix(ptObj)}${matchedPrefix}` : '';

        // ==========================================
        //  修复版 302 拦截：恢复 URL 编码
        //  支持节点级「外部跳转直连」与域名级 302/307 规则（直连=不走反代 / 代理=走反代）
        // ==========================================
        if ([301, 302, 303, 307, 308].includes(finalResponse.status)) {
            const location = responseHeaders.get('Location');
            // 不再由 Worker 跟随媒体 30x 取流:3.7 引入后媒体流量全部压进 CF Worker
            // 中转,播放速度从直连 40M/s 掉到 3M/s;36 无跟随,302 直连/下发满速。
            // 30x 一律交给下方 redirect_direct 直连判断或 Location 下发。
            let directExternal302 = false;
            if (location && finalTargetUrl) {
                try {
                    const destination = new URL(location, finalTargetUrl);
                    const isExternal = (destination.protocol === 'http:' || destination.protocol === 'https:')
                        && !targetOrigins.includes(destination.origin);
                    if (isExternal) {
                        let direct = redirectDirect;
                        if (redirectRules.length) {
                            const rule = redirectRules.find(x => destination.host === x.d || destination.host.endsWith('.' + x.d));
                            if (rule) direct = rule.a === 'direct';
                        }
                        if (direct) {
                            responseHeaders.set('Location', destination.href);
                            directExternal302 = true;
                        }
                    }
                } catch (e) {}
            }
            const rewrittenLocation = directExternal302 ? responseHeaders.get('Location')
                : rewriteRedirectLocation(location, finalTargetUrl, targetOrigins, proxyOrigin, safePrefix);
            if (rewrittenLocation === null) responseHeaders.delete('Location');
            else if (rewrittenLocation !== location) {
                responseHeaders.set('Location', rewrittenLocation);
            }
        }
        
        responseHeaders.set('Access-Control-Allow-Origin', '*');

        // ==========================================
        // 2.10 响应体重写 (接管 PlaybackInfo 与 M3U8)
        // ==========================================

        if (finalResponse.status === 200 && responseHeaders.get("content-type")?.includes("json") && url.pathname.toLowerCase().includes("playbackinfo")) {
            try {
                // —— 起播缓存:命中直接返回,免回源免重写(5 分钟 TTL) ——
                const piCacheKey = 'pi:' + (matchedPrefix || '') + ':' + url.pathname + ':' + stripPlaybackCacheSearch(url.search);
                const piHit = playbackInfoCache.get(piCacheKey);
                if (piHit && piHit.expires > Date.now()) {
                    const piHdrs = new Headers();
                    piHdrs.set('Content-Type', 'application/json; charset=utf-8');
                    piHdrs.set('Access-Control-Allow-Origin', '*');
                    piHdrs.set('Cache-Control', 'no-store');
                    return new Response(piHit.data, { status: 200, headers: piHdrs });
                }
                let clonedRes = finalResponse.clone(); 
                let data = await clonedRes.json(); 
                let modified = false;
                if (data && data.MediaSources) {
                    data.MediaSources.forEach(source => {
                        // Emby / Jellyfin / HUD 的 PlaybackInfo 字段并不完全一致。
                        // 原脚本只改写 DirectStreamUrl 和 TranscodingUrl 的绝对地址，
                        // 这对标准 Emby 基本够用，但 HUD 常见的是：
                        // - DirectStreamUrl 返回 /emby/videos/...
                        // - TranscodingUrl 返回 /emby/videos/... 或相对路径
                        // - 字幕 DeliveryUrl 也可能是相对路径
                        //
                        // 所以这里把播放期会实际发起请求的几个关键 URL 字段统一走同一个改写函数，
                        // 保证所有媒体相关请求都还能带着当前线路前缀回到 Worker。
                        ['DirectStreamUrl', 'TranscodingUrl', 'Url'].forEach(key => {
                            const rewritten = rewritePlaybackMediaUrl(source[key], finalTargetUrl, proxyOrigin, safePrefix, targetOrigins);
                            if (rewritten !== source[key]) {
                                source[key] = rewritten;
                                modified = true;
                            }
                        });

                        // 字幕流的 DeliveryUrl 也会在播放时被客户端直接请求。
                        // 如果 HUD 给的是 /emby/videos/... 这种相对地址，而这里不改，
                        // 主视频即使勉强能播，外挂字幕依然会因为丢失前缀而加载失败。
                        if (Array.isArray(source.MediaStreams)) {
                            source.MediaStreams.forEach(stream => {
                                const rewritten = rewritePlaybackMediaUrl(stream?.DeliveryUrl, finalTargetUrl, proxyOrigin, safePrefix, targetOrigins);
                                if (rewritten !== stream?.DeliveryUrl) {
                                    stream.DeliveryUrl = rewritten;
                                    modified = true;
                                }
                            });
                        }

                        // —— 强制直连播放(3.4.44 起无条件执行,与伪装版一致;不再受 direct_play 节点开关控制):
                        // 禁转码但保留/开启直连能力:SupportsTranscoding=false 让播放器不走转码;
                        // SupportsDirectStream/SupportsDirectPlay 必须为 true,否则播放器判定
                        // “既不能转码又不能直连”会直接报无法播放(3.4.38 全置 false 导致的回归)。
                        // 3.4.43 曾受 direct_play 门控,开关关闭时返回源站原始内容导致部分剧 0KB,已修复。
                        // ——
                        {
                            if (source.SupportsTranscoding !== false) { source.SupportsTranscoding = false; modified = true; }
                            if (source.SupportsDirectStream !== true) { source.SupportsDirectStream = true; modified = true; }
                            if (source.SupportsDirectPlay !== true) { source.SupportsDirectPlay = true; modified = true; }
                            ['TranscodingUrl', 'TranscodingSubProtocol', 'TranscodingContainer', 'TranscodingType'].forEach(k => {
                                if (source[k] !== undefined && source[k] !== null && source[k] !== '') { source[k] = ''; modified = true; }
                            });
                            if (source.IsRemote !== false) { source.IsRemote = false; modified = true; }
                            if (source.Protocol !== 'Http' && source.Protocol !== 'http') { source.Protocol = 'Http'; modified = true; }
                            // Path 兜底:若没有 DirectStreamUrl 但 Path 是源站地址,改写为代理路径并作为直连地址
                            if (!source.DirectStreamUrl && source.Path) {
                                const rwPath = rewritePlaybackMediaUrl(source.Path, finalTargetUrl, proxyOrigin, safePrefix, targetOrigins);
                                if (rwPath !== source.Path) { source.DirectStreamUrl = rwPath; modified = true; }
                            }
                        }
                    });
                }
                if (modified) { 
                    dropBodyIntegrityHeaders(responseHeaders);
                    const piOutText = JSON.stringify(data);
                    playbackInfoCache.set(piCacheKey, { expires: Date.now() + PLAYBACK_INFO_CACHE_TTL, data: piOutText });
                    if (playbackInfoCache.size > PLAYBACK_INFO_CACHE_MAX) {
                        const oldestPiKey = playbackInfoCache.keys().next().value;
                        if (oldestPiKey) playbackInfoCache.delete(oldestPiKey);
                    }
                    return new Response(piOutText, { status: finalResponse.status, statusText: finalResponse.statusText, headers: responseHeaders }); 
                }
            } catch (e) {
                console.log("PlaybackInfo JSON 重写失败:", e.message);
            }
        }

        // 通用 JSON URL 重写。
        // PlaybackInfo 只覆盖播放地址；UHD 图片失败通常发生在其他 JSON 接口里，
        // 例如详情页、图片列表或插件接口返回了源站绝对地址/相对图片路径。
        // 这里先用 hasJsonRewriteCandidate 做轻量筛选，再递归改写，避免漏掉嵌套的高清图字段。
        if (finalResponse.status === 200 && responseHeaders.get("content-type")?.includes("json")) {
            try {
                let clonedRes = finalResponse.clone();
                let text = await clonedRes.text();
                if (hasJsonRewriteCandidate(text, targetOrigins)) {
                    let data = JSON.parse(text);
                    let rewritten = rewriteSourceUrlsInJson(data, targetOrigins, proxyOrigin, safePrefix);
                    if (rewritten !== data) {
                        dropBodyIntegrityHeaders(responseHeaders);
                        return new Response(JSON.stringify(rewritten), { status: finalResponse.status, statusText: finalResponse.statusText, headers: responseHeaders });
                    }
                }
            } catch(e) {
                console.log("JSON 源站 URL 重写失败:", e.message);
            }
        }

        if (finalResponse.status === 200 && url.pathname.toLowerCase().endsWith('.m3u8')) {
            try {
                let clonedRes = finalResponse.clone(); 
                let text = await clonedRes.text();
                if (text.includes('http://') || text.includes('https://') || /^\s*\//m.test(text)) {
                    // 绝对 URL 分片：代理到 /密钥/节点/源站URL
                    let modifiedText = text.replace(/(https?:\/\/[^\s]+)/g, proxyOrigin + safePrefix + '/$1');
                    // 协议相对分片（//host/path）：补 https 协议再代理
                    modifiedText = modifiedText.replace(/^(?!\s*#)(\s*)\/\/([^\s]+)$/gm, (m, sp, p) => sp + proxyOrigin + safePrefix + '/https://' + p);
                    // 根相对分片（/path）：浏览器会解析到不带节点前缀的根路径导致 404，补上源站根 + 代理前缀
                    const firstOrigin = (targetUrls[0] || '').replace(/\/+$/, '');
                    if (firstOrigin) {
                        modifiedText = modifiedText.replace(/^(?!\s*#)(\s*)\/([^\s]+)$/gm, (m, sp, p) => sp + proxyOrigin + safePrefix + '/' + firstOrigin + '/' + p);
                    }
                    dropBodyIntegrityHeaders(responseHeaders);
                    return new Response(modifiedText, { status: finalResponse.status, statusText: finalResponse.statusText, headers: responseHeaders });
                }
            } catch(e) {
                console.log("M3U8 重写失败:", e.message);
            }
        }

        // 给最终静态资源响应补缓存头。
        // 这里仍然用当前访问路径判断是否为图片/静态文件，是为了让已经通过 Worker
        // 正确代理过来的 UHD 图片可以被浏览器/CDN 正常复用；但真正的 Cloudflare
        // cacheEverything 已在请求发起前排除了带鉴权态的资源，避免缓存污染。
        const isStaticRes = isStaticPath(url.pathname);
        const contentType = responseHeaders.get("content-type") || "";
        const canCacheStaticRes = isStaticRes
            && enableCache
            && finalResponse.status === 200
            && (
                contentType.startsWith("image/")
                || contentType.includes("javascript")
                || contentType.includes("css")
                || contentType.includes("font")
                || contentType.includes("manifest")
            );
        if (canCacheStaticRes && !responseHeaders.has("Cache-Control")) {
            responseHeaders.set('Cache-Control', 'public, max-age=86400'); 
        }

        return new Response(finalResponse.body, { status: finalResponse.status, statusText: finalResponse.statusText, headers: responseHeaders });
    } catch (e) {
        console.error('[proxy]', e);
        return Response.json({ success: false, error: String((e && e.message) || e) }, { status: 500 });
    }
}
};
