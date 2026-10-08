// VERSION: 3.1.2
//  面板核心配置区 (放在最顶端方便修改)
const CURRENT_VERSION = "3.1.2"; 
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/MakkaPakka518/ProxyHub_Emby/refs/heads/FAKE/worker.js";

// ==========================================
// 1. 网页界面-单播报版本
// ==========================================

const SVG_EYE = `<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
const SVG_COPY = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
const SVG_TG = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;margin-right:8px;fill:#0088cc;"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/></svg>`;

const EMBY_LOGO = 'https://raw.githubusercontent.com/MakkaPakka518/Icon/refs/heads/main/MAKKA_EMBY.JPG';

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
    :root { 
        --primary: #0071e3; 
        --primary-hover: #005cbf;
        --bg: #f5f5f7; 
        --card: #ffffff; 
        --text: #1d1d1f; 
        --text-sec: #86868b;
        --border: #d2d2d7; 
        --radius-card: 16px;
    }
    
    body.dark {
        --primary: #0a84ff; 
        --primary-hover: #0071e3;
        --bg: #000000; 
        --card: #1c1c1e; 
        --text: #f5f5f7; 
        --text-sec: #98989d;
        --border: #38383a;
    }

    * { box-sizing: border-box; touch-action: manipulation; }
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; -webkit-text-size-adjust: 100%; transition: background-color 0.3s, color 0.3s; }
    .container { max-width: 1200px; margin: 0 auto; width: 100%; min-height: 90vh; display: flex; flex-direction: column;}
    .content-wrap { flex: 1; }
    input, select, button, textarea { font-family: inherit; outline: none; font-size: 15px; }
    
    .card { background: var(--card); padding: 24px; border-radius: var(--radius-card); box-shadow: 0 4px 20px rgba(0,0,0,0.03); margin-bottom: 24px; border: 1px solid var(--border); transition: 0.3s; }
    
    #toast { position: fixed; top: -60px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: white; padding: 12px 24px; border-radius: 30px; font-size: 14px; font-weight: 500; transition: top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 9999; backdrop-filter: blur(10px); text-align: center; max-width: 90vw; word-wrap: break-word; }
    #toast.show { top: 20px; }

    .toolbar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
    .btn-submit { padding: 12px 20px; background: var(--primary); color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600; white-space: nowrap; transition: 0.2s; box-shadow: 0 4px 12px rgba(0, 113, 227, 0.2); }
    .btn-submit:hover { background: var(--primary-hover); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0, 113, 227, 0.3); }
    .btn-submit:active { transform: translateY(0); }
    .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
    
    .table-wrapper { width: 100%; border-radius: 12px; border: 1px solid var(--border); overflow: hidden; background: var(--card); }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th, td { padding: 16px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
    th { color: var(--text-sec); font-weight: 600; background: rgba(120,120,120,0.05); }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background-color: rgba(120,120,120,0.03); }
    
    .action-group { display: inline-flex; gap: 8px; background: rgba(120,120,120,0.05); padding: 4px 10px; border-radius: 8px; border: 1px solid var(--border); align-items: flex-start; max-width: 100%; flex-wrap: wrap; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; border: none; background: var(--card); cursor: pointer; color: var(--text); padding: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.05); transition: 0.2s; flex-shrink: 0; font-size:16px; }
    .icon-btn:hover { color: var(--primary); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
    .icon-btn svg { width: 15px; height: 15px; fill: currentColor; }
    
    .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block; }
    
    .btn-edit { padding: 8px 14px; background: var(--card); color: var(--primary); border: 1px solid var(--primary); border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: 0.2s; }
    .btn-del { padding: 8px 14px; background: var(--card); color: #ff3b30; border: 1px solid #ff3b30; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: 0.2s; }
    .btn-dns { padding: 8px 14px; background: var(--card); color: #34c759; border: 1px solid #34c759; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: 0.2s; white-space: nowrap; }
    .btn-dns:disabled { opacity: 0.5; cursor: not-allowed; }

    .ip-checkbox { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary); }
    .secret-text { font-family: monospace; letter-spacing: 2px; color: var(--text-sec); }
    
    .dynamic-url { display: block; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: right; }
    .actual-text.dynamic-url { white-space: normal; max-width: 100%; overflow: visible; text-align: left !important; word-break: break-all; font-size: 13px; font-family: monospace; color: var(--primary); letter-spacing: normal; }
    .url-list-item { background: var(--bg); border: 1px solid var(--border); padding: 4px 8px; border-radius: 6px; font-size: 12px; margin-top: 6px; word-break: break-all; line-height: 1.4; color: var(--text); font-family: -apple-system, sans-serif; letter-spacing: normal; text-align: left; }
    .url-list-item:first-child { margin-top: 0; }

    body.dark input, body.dark select, body.dark textarea { background: #1c1c1e; color: #f5f5f7; border: 1px solid #38383a; }

    .search-input { padding: 10px 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text); font-size: 14px; width: 260px; transition: 0.3s; }
    .search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(0,113,227,0.15); }

    .node-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; margin-top: 20px; }
    .emby-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 14px; transition: 0.3s; position: relative; }
    .emby-card:hover { box-shadow: 0 8px 25px rgba(0,0,0,0.06); transform: translateY(-2px); }
    .card-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
    .card-title-group { display: flex; align-items: center; gap: 12px; }
    .emby-icon { font-size: 28px; background: rgba(120,120,120,0.05); border-radius: 10px; padding: 6px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; flex-shrink: 0; }
    .info-row { display: flex; align-items: flex-start; justify-content: space-between; font-size: 13px; }
    .info-label { color: var(--text-sec); font-weight: 500; min-width: 65px; margin-top: 4px; }
    .card-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: auto; padding-top: 12px; border-top: 1px dashed var(--border); }

    .ping-badge { color: var(--text-sec); cursor: pointer; padding: 4px 10px; background: rgba(120,120,120,0.05); border-radius: 6px; font-size: 13px; font-weight: 500; transition: 0.2s; border: 1px solid transparent; user-select: none; }
    .ping-badge:hover { border-color: var(--border); background: var(--card); box-shadow: 0 2px 6px rgba(0,0,0,0.05); color: var(--primary); }

    .icon-item { cursor: pointer; padding: 6px; border-radius: 8px; border: 1px solid transparent; display: flex; justify-content: center; align-items: center; transition: 0.2s; background: var(--bg); height: 44px; }
    .icon-item:hover { border-color: var(--primary) !important; box-shadow: 0 2px 8px rgba(0,113,227,0.2); transform: scale(1.05); }
    #iconGrid::-webkit-scrollbar { width: 6px; }
    #iconGrid::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    /* 拖拽排序核心适配样式 */
    .emby-card.sortable-ghost { opacity: 0.4; }
    .emby-card.sortable-drag { cursor: grabbing !important; }
    .drag-handle { cursor: grab; padding-right: 10px; font-size: 18px; color: var(--text-sec); display: flex; align-items: center; user-select: none; touch-action: none;}
    .drag-handle:active { cursor: grabbing; color: var(--primary); }

    /* 响应式移动端适配 */
    @media (max-width: 768px) {
        body { padding: 12px; }
        .card { padding: 16px; border-radius: 12px; margin-bottom: 16px; }
        .header h1 { font-size: 22px; }
        .toolbar { flex-direction: column; align-items: stretch; gap: 12px; }
        .toolbar > * { width: 100%; display: flex; justify-content: center; }
        .search-input { width: 100%; }
        .node-grid { grid-template-columns: 1fr; }
        .table-wrapper { border: none; background: transparent; overflow: visible; }
        table, thead, tbody, th, td, tr { display: block; width: 100%; }
        thead { display: none; }
        tr { margin-bottom: 16px; background: var(--card); border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 2px 12px rgba(0,0,0,0.03); overflow: hidden; }
        td { display: flex; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--border); text-align: right; gap: 12px; min-height: 50px; }
        td:last-child { border-bottom: none; }
        td[colspan] { justify-content: center; text-align: center; }
        td[colspan]::before { display: none !important; }
        td::before { content: attr(data-label); font-weight: 600; color: var(--text-sec); flex-shrink: 0; margin-right: auto; text-align: left; }
        
        #dashboardModal { padding: 10px !important; }
        #dashboardModal .card { margin: 10px auto !important; padding: 16px !important; box-sizing: border-box; }
        #dashboardModal h2 { font-size: 18px; flex-direction: column; align-items: flex-start; }
        #dashboardModal h2 span { font-size: 12px; }
    }

    /* ===== 图标统一样式（SF Symbols 内联 SVG）===== */
    .ti{display:inline-flex;align-items:center;justify-content:center;vertical-align:-0.18em;flex-shrink:0}
    .ti svg{width:16px;height:16px}
    h1 svg,h2 svg,h3 svg,h4 svg,p svg,label svg,span svg,div svg{width:1.1em;height:1.1em;vertical-align:-0.18em;flex-shrink:0}
    .emby-icon svg{width:22px;height:22px}
    .drag-handle svg{width:18px;height:18px}
    .icon-btn svg{width:15px;height:15px}
    #themeToggle svg{width:22px;height:22px;color:var(--text-sec);transition:color .2s}
    #themeToggle:hover svg{color:var(--primary)}

    /* ===== 按钮图标对齐 ===== */
    .btn-submit,.btn-dns,.btn-edit,.btn-del{display:inline-flex;align-items:center;gap:6px;justify-content:center}
    .btn-submit svg,.btn-dns svg,.btn-edit svg,.btn-del svg{width:16px;height:16px}

    /* ===== 布局微调 ===== */
    .header h1{display:inline-flex;align-items:center;gap:12px}
    .card h2{display:inline-flex;align-items:center;gap:8px;font-weight:700;color:var(--text)}
    .card h2 svg{color:var(--primary)}
    .card h3{display:inline-flex;align-items:center;gap:8px;color:var(--text)}
    .card h3 svg{color:var(--primary)}
    input:focus,select:focus,textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(0,113,227,.12)}
    input,select,textarea{transition:border-color .2s,box-shadow .2s}
    .card{padding:22px;margin-bottom:20px}
    .card-header h3{margin:0;font-size:16px;display:inline-flex;align-items:center;gap:8px}
    .drag-handle{font-size:0}
        .action-group{gap:6px;padding:5px 8px}
    /* ===== 科技感统一按钮 ===== */
    .btn-submit{background:linear-gradient(135deg,#00c6ff 0%,#0072ff 100%);box-shadow:0 4px 16px rgba(0,180,255,.35);text-shadow:0 1px 2px rgba(0,0,0,.18)}
    .btn-submit:hover{background:linear-gradient(135deg,#00d4ff,#0a5cff);box-shadow:0 6px 22px rgba(0,180,255,.5)}
    .btn-danger{display:inline-flex;align-items:center;gap:6px;justify-content:center;padding:11px 20px;background:linear-gradient(135deg,#ff5f6d,#ff2d55);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;white-space:nowrap;transition:.25s;box-shadow:0 4px 16px rgba(255,45,85,.35)}
    .btn-danger:hover{transform:translateY(-1px);box-shadow:0 6px 22px rgba(255,45,85,.5)}
    .btn-danger svg{width:16px;height:16px}
    .btn-ghost{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;background:transparent;color:var(--primary);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-weight:600;font-size:13px;white-space:nowrap;transition:.2s}
    .btn-ghost:hover{border-color:var(--primary);color:var(--primary);box-shadow:0 0 0 3px rgba(0,113,227,.1)}
    .btn-ghost svg{width:15px;height:15px}
    /* ===== 顶部固定浮动栏 ===== */
    .topbar{position:fixed;top:0;left:0;right:0;z-index:999;display:flex;align-items:center;gap:14px;padding:10px 18px;background:rgba(245,245,247,.78);backdrop-filter:blur(18px) saturate(180%);border-bottom:1px solid var(--border);box-shadow:0 2px 14px rgba(0,0,0,.05)}
    body.dark .topbar{background:rgba(0,0,0,.66)}
    .topbar-logo{width:34px;height:34px;border-radius:9px;object-fit:cover;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .topbar-left{display:flex;align-items:center;gap:12px;min-width:0}
    .topbar-right{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;margin-left:auto}
    .pill-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(0,180,255,.1);border:1px solid rgba(0,180,255,.28);color:var(--primary);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:.2s;font-family:inherit;flex-shrink:0}
    .pill-btn svg{width:15px;height:15px}
    .pill-btn:hover{background:rgba(0,180,255,.2);color:var(--primary)}
    .pill-close{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:rgba(255,59,48,.1);border:1px solid rgba(255,59,48,.3);color:#ff3b30;cursor:pointer;transition:.2s;flex-shrink:0}
    .pill-close svg{width:15px;height:15px}
    .pill-close:hover{background:rgba(255,59,48,.2)}
    .rotated{transform:rotate(180deg)}
    /* ===== 测速页按钮统一 ===== */
    #view-speed .toolbar{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:stretch}
    #view-speed .toolbar select{grid-column:1/-1;width:100%}
    #view-speed .toolbar .btn-submit{width:100%;padding:12px 14px;font-size:13px;justify-content:center}
    #view-speed .btn-submit{width:100%;padding:12px 14px;font-size:13px;justify-content:center}
    .rtt-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:rgba(0,180,255,.1);border:1px solid rgba(0,180,255,.28);font-family:monospace;font-size:12px;font-weight:600;color:var(--text);white-space:nowrap}
    .rtt-dot{width:7px;height:7px;border-radius:50%;background:#34c759;box-shadow:0 0 6px #34c759;flex-shrink:0}
    .rtt-label{color:var(--text-sec)}
    #themeToggle{background:transparent;border:none;cursor:pointer;padding:0;margin-left:2px;display:inline-flex;color:var(--text-sec)}
    #themeToggle svg{width:16px;height:16px}
    #themeToggle:hover{color:var(--primary)}
    .container{padding-top:96px}
    /* ===== 紧凑布局：按钮尽量同行 ===== */
    .card-header{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
    .card-tools{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
    .form-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .form-row .field{flex:1;min-width:220px}
    @media (max-width: 640px){
        .topbar{padding:8px 12px;gap:10px}
        .topbar-logo{width:30px;height:30px}
        .topbar-title{display:none}
        .pill-btn{padding:5px 10px;font-size:12px}
        .rtt-pill{padding:5px 10px;gap:6px;font-size:11px}
        .rtt-label{display:none}
        #themeToggle svg{width:15px;height:15px}
        .container{padding-top:118px}
    }
`



const LOGIN_UI = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>系统授权</title>
    <style>
        ${CSS_COMMON}
        body { display: flex; justify-content: center; align-items: center; height: 100vh; padding: 16px; margin: 0; background: #f0f2f5; }
        .login-box { background: var(--card); padding: 40px 30px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); text-align: center; width: 100%; max-width: 360px; }
        .login-box h2 { margin: 0 0 24px 0; font-size: 22px; font-weight: 600; }
        .login-box input { width: 100%; padding: 16px; margin-bottom: 20px; border: 1px solid var(--border); border-radius: 12px; }
        .login-box input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(0,113,227,0.15); }
        .login-box button { width: 100%; padding: 16px; background: var(--primary); color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: 600; }
    </style>
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
    <div class="login-box">
        <h2>安全中心</h2>
        <input type="password" id="tokenInput" placeholder="请输入密钥 TOKEN" onkeydown="if(event.key==='Enter') login()">
        <button onclick="login()">验 证 登 录</button>
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
    
    <div id="dashboardModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:10000; overflow-y:auto; padding: 20px; backdrop-filter: blur(5px);">
        <div class="card" style="max-width: 1000px; margin: 40px auto; position:relative; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
            <button onclick="closeDashboard()" style="position:absolute; top:20px; right:20px; font-size:24px; background:none; border:none; cursor:pointer; color: var(--text-sec); transition: 0.2s;" onmouseover="this.style.color='#ff3b30'" onmouseout="this.style.color='var(--text-sec)'">${I.xmark}</button>
            
            <h2 style="margin-top:0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    ${I.chart} 数据大屏 <span style="font-size:14px; font-weight: normal; color: var(--text-sec);">精确访客画像分析</span>
                </div>
                <div style="font-size: 13px; background: rgba(0,113,227,0.1); color: var(--primary); padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(0,113,227,0.2); display: flex; gap: 15px; flex-wrap: wrap;">
                    <span> 今天: <strong id="trafficToday">加载中...</strong></span>
                    <span>1周内: <strong id="traffic7d">加载中...</strong></span>
                    <span>1月内: <strong id="traffic30d">加载中...</strong></span>
                </div>
            </h2>
            
            <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top:20px;">
                <div style="flex: 2; min-width: 300px; border: 1px solid var(--border); border-radius: 14px; padding: 16px; background: rgba(120,120,120,0.03);">
                    <canvas id="trendChart"></canvas>
                </div>
                <div style="flex: 1; min-width: 300px; border: 1px solid var(--border); border-radius: 14px; padding: 16px; background: rgba(120,120,120,0.03); display: flex; justify-content: center; align-items: center;">
                    <canvas id="locationChart"></canvas>
                </div>
            </div>
            
            <h3 style="margin-top: 30px; margin-bottom:16px;">${I.spy} 最新独立播放记录 <span style="font-size:12px; color:var(--text-sec);">(仅拦截 PlaybackInfo 真实播放)</span></h3>
            <div class="table-wrapper">
                <table style="width: 100%;">
                    <thead><tr><th>访问时间</th><th>目标节点</th><th>真实 IP 地址</th><th>归属地</th><th>客户端/设备标识 (User-Agent)</th></tr></thead>
                    <tbody id="logTableBody"><tr><td colspan="5" style="text-align:center; padding: 30px;">加载数据中...</td></tr></tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="container">
    <div id="updateAlert" class="card" style="display: none; border-left: 4px solid #34c759; background-color: rgba(52, 199, 89, 0.05); margin-top: 20px;">
            <div style="display:flex; justify-content: space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <h3 style="margin:0; color: #34c759; font-size: 16px;">${I.sparkles} 发现新版本！</h3>
                    <p style="margin: 5px 0 0 0; font-size: 13px; color: var(--text-sec);" id="updateMsg">当前版本: v1.0.0 | 最新版本: v?.?.?</p>
                </div>
                <button class="btn-submit" onclick="doOnlineUpdate()" id="onlineUpdateBtn" style="padding:8px 16px;border-radius:6px;">${I.rocket} 一键拉取并升级</button>
            </div>
        </div>
    <div id="cf-trace-card" style="background: rgba(120,120,120,0.05); padding: 15px 20px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 20px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; font-size: 14px; gap: 15px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); margin-top: 20px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="font-size: 24px;">${I.location}</div>
                <div>
                    <div style="color:var(--text-sec); font-size: 12px; margin-bottom: 2px;">访客入口 (地区与机房)</div>
                    <div id="trace-entry" style="font-weight:600; color:var(--text); font-family: monospace; font-size: 15px;">雷达扫描中...</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="font-size: 24px;">${I.rocket}</div>
                <div>
                    <div style="color:var(--text-sec); font-size: 12px; margin-bottom: 2px;">Worker 实际落地机房</div>
                    <div id="trace-egress" style="font-weight:600; color:#34c759; font-family: monospace; font-size: 15px;">雷达扫描中...</div>
                </div>
            </div>
        </div><div class="card admin-only" style="margin-top:20px;">
            <div style="font-weight: 600; margin-bottom: 12px; font-size: 16px;">${I.gear} Worker 调度模式与区域设置</div>
            <button class="btn-submit" onclick="openPlacementModal()" style="width:100%;">${I.gear} 修改调度/区域</button>
        </div>
        <div class="content-wrap">
            <div class="topbar">
                <div class="topbar-left">
                    <img class="topbar-logo" src="${EMBY_LOGO}" alt="logo" onclick="openAccountModal()" title="账户设置" style="cursor:pointer;">
                    <div class="rtt-pill" title="你的设备到云端边缘节点的真实往返延迟">
                        <span class="rtt-dot" id="rttDot"></span>
                        <span class="rtt-label">RTT</span>
                        <span id="rttValue">测算中</span>
                        <button id="themeToggle" onclick="toggleDarkMode()" title="切换深色模式">${I.moon}</button>
                    </div>
                </div>
                <div class="topbar-right">
                    <button class="pill-btn" onclick="openDashboard()" title="数据统计">${I.chart} 统计</button>
                    <button class="pill-close" onclick="confirmLogout()" title="退出系统">${I.xmark}</button>
                </div>
            </div>

            <div class="card admin-only" style="border-left: 4px solid #ff3b30;">
                <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                    <h2 style="margin:0; font-size:18px; color: #ff3b30;">${I.rocket} 手动覆盖/更新</h2>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btn-submit" onclick="openCodeModal('paste')" style="flex:1; min-width:120px;">${I.pencil} 手动输入</button>
                    <button class="btn-submit" onclick="openCodeModal('file')" style="flex:1; min-width:120px;">${I.upload} 文件导入</button>
                </div>
            </div>
            <div class="card admin-only">
                <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                    <h2 style="margin:0; font-size:18px;">${I.bolt} 专属线路测速与动态 DNS 解析</h2>
                </div>
                
                <div style="background: rgba(120,120,120,0.05); padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 16px;">
                    <div style="font-size: 13px; font-weight: 600; color: var(--text-sec); margin-bottom: 8px;">${I.antenna} 当前域名生效的 DNS 解析：</div>
                    <div id="dnsStatus" style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <span style="color:#888; font-size: 14px;">加载中...</span>
                    </div>
                </div>

                <div class="toolbar">
                    <select id="ipType" style="font-weight: 600; color: var(--primary); padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background:var(--card);">
                        <option value="all"> 综合混合源</option>
                        <option value="电信"> 电信专属</option>
                        <option value="联通"> 联通专属</option>
                        <option value="移动"> 移动专属</option>
                        <option value="多线"> 多线BGP</option>
                        <option value="ipv6"> IPv6节点</option>
                        <option value="优选"> 顶尖优选库</option>
                    </select>

                    <button class="btn-submit" id="btnFetchRemote" onclick="fetchRemoteAndTest()">${I.globe} 提取预设源并测速</button>
                    <button class="btn-submit" onclick="batchTcpPing()" style=" box-shadow: 0 4px 12px rgba(255, 149, 0, 0.2);">${I.globe} 复制去 ITDog</button>
                    <button class="btn-submit" onclick="clearTest()" style=" box-shadow: 0 4px 12px rgba(142, 142, 147, 0.2);">${I.trash} 清空列表</button>
                </div>

                <div style="background: rgba(120,120,120,0.05); padding: 16px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 16px;">
                    <div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap;">
                        <input type="text" id="customApiUrl" value="https://ip.v2too.top/api/nodes" placeholder="填入自定义 JSON 或 文本 API 链接" style="flex: 1; min-width: 200px; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); background:var(--card);">
                        <button class="btn-submit" id="btnFetchCustomApi" onclick="fetchCustomApiAndTest()" style=" box-shadow: 0 4px 12px rgba(50, 173, 230, 0.2);">${I.globe} 拉取 API 并测速</button>
                    </div>

                    <textarea id="customIps" rows="2" placeholder="在此粘贴自定义 IPv4、IPv6 或 优选域名 (支持混杂文本，自动提取)" style="width: 100%; padding: 14px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 12px; font-family: monospace; resize: vertical; background:var(--card);"></textarea>
                    
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button class="btn-submit" id="btnTestCustom" onclick="testCustomIPs()" style=" box-shadow: 0 4px 12px rgba(88, 86, 214, 0.2);">${I.flask} 测试粘贴的节点</button>
                        <button class="btn-submit" id="btnDirectCname" onclick="directSubmitCname()" style=" box-shadow: 0 4px 12px rgba(175, 82, 222, 0.2);">${I.link} 直推 CNAME (免测速)</button>
                        <div style="width: 100%; height: 1px; background: var(--border); margin: 4px 0;"></div>
                        <button class="btn-submit" id="btnTop3Dns" onclick="updateTop3ToDns()" style=" box-shadow: 0 4px 12px rgba(255, 45, 85, 0.2);">${I.star} 更新 TOP3 至 DNS</button>
                        <button class="btn-submit" id="btnSelectedDns" onclick="updateSelectedToDns()" style=" box-shadow: 0 4px 12px rgba(52, 199, 89, 0.2);">${I.checksquare} 提交选中节点至 DNS</button>
                    </div>
                </div>
                
                <div id="statusText" style="line-height: 1.6; font-size: 14px; color: var(--text-sec); margin-bottom: 16px; padding: 12px 16px; background: rgba(52, 199, 89, 0.1); border-radius: 10px; border-left: 4px solid #34c759;">
                    ${I.bulb} 测速完成后，可勾选复选框自由组合，点击【提交选中节点至 DNS】自动分发。
                </div>

                <div class="table-wrapper">
                    <table style="width: 100%;">
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAll" class="ip-checkbox" onclick="toggleSelectAll()"></th>
                                <th>专属节点 (点击复制)</th>
                                <th>预估延迟</th>
                                <th>连通状态</th>
                                <th>记录类型/归属地</th>
                                <th>单节点操作</th>
                            </tr>
                        </thead>
                        <tbody id="testTableBody">
                            <tr><td colspan="6" style="text-align:center;color:var(--text-sec);">暂无数据，请拉取节点或输入自定义 IP/域名 测试</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="card admin-only" id="config-backup-card">
                <h2 style="margin:0; font-size:18px; margin-bottom:14px;">${I.box} 配置备份与恢复</h2>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btn-submit" onclick="exportConfig()">${I.box} 导出配置</button>
                    <button class="btn-submit" onclick="importConfig()">${I.download} 导入配置</button>
                </div>
            </div>

            <div class="card admin-only" id="deploy-card">
                <div style="display:flex; justify-content: space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                    <h2 style="margin:0; font-size:18px;">${I.rocket} 反代节点</h2>
                    <button class="btn-submit" onclick="openNodeModal()">${I.plus} 添加节点</button>
                </div>
            </div>

            <div id="nodeModal" style="display:none; position:fixed; inset:0; z-index:11000; background:rgba(0,0,0,.5); backdrop-filter:blur(5px); overflow-y:auto; padding:16px;">
                <div style="max-width:680px; margin:24px auto; background:var(--card); border-radius:18px; padding:22px; box-shadow:0 10px 40px rgba(0,0,0,.2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <h2 id="nodeModalTitle" style="margin:0; font-size:19px; display:flex; align-items:center; gap:8px;">${I.pencil} 添加节点</h2>
                        <button onclick="closeNodeModal()" style="background:transparent;border:none;cursor:pointer;color:var(--text-sec);display:inline-flex;padding:4px;">${I.xmark}</button>
                    </div>
                    <form id="addForm" style="display: flex; flex-direction: column; gap: 16px;">
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <input type="hidden" id="oldPrefix" value="">
                        <input type="text" id="remark" placeholder="节点备注 (如: Misaka服)" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background:var(--card); flex: 1;" required>
                        <input type="text" id="prefix" placeholder="短路径后缀 (如: misaka)" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background:var(--card); flex: 1;" required>
                        <select id="mode" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background:var(--card); flex: 1;">
                            <option value="off">保守 (抹除IP)</option>
                            <option value="realip_only">严格 (透传IP)</option>
                            <option value="dual">兼容 (双重透传)</option>
                            <option value="strict">强力 (防403)</option>
                        </select>
                    </div>

                    <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                        <div style="position: relative; flex: 2; display: flex;">
                            <div style="display:flex; gap:10px; align-items:center; background:var(--card); padding:10px 16px; border-radius:10px; border:1px solid var(--border); flex: 1; cursor: pointer; transition:0.2s;" onclick="toggleIconPicker(event)" id="iconSelectBtn">
                                <img id="iconPreview" src="" style="width:24px;height:24px;display:none;border-radius:4px;object-fit:cover;">
                                <span id="iconDefault" style="font-size:20px;line-height:1;">${I.film}</span>
                                <span id="iconSelectText" style="flex:1; color: var(--text-sec); font-size:14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">点击选择图标 (默认)</span>
                                <input type="hidden" id="iconUrl" value="">
                            </div>
                            
                            <div id="iconPickerPanel" style="display:none; position: absolute; top: 100%; left: 0; width: 100%; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); z-index: 100; margin-top: 8px; flex-direction: column; gap: 10px;">
                                <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
                                    <input type="text" id="customIconUrlInput" placeholder="输入自定义 JSON 图标库链接..." style="flex: 1; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background:var(--bg); font-size: 13px; color: var(--text);">
                                    <button type="button" onclick="setCustomIconLibrary()" style="padding: 8px 12px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; white-space: nowrap;">加载</button>
                                    <button type="button" onclick="resetIconLibrary()" class="btn-ghost">默认库</button>
                                </div>
                                <input type="text" id="iconSearch" placeholder="搜索图标名称..." style="padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background:var(--bg); width: 100%; font-size: 14px; color: var(--text);" onkeyup="filterIcons()">
                                <div id="iconGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 8px; overflow-y: auto; max-height: 240px; padding-right: 4px;">
                                    <div style="text-align:center; color:var(--text-sec); grid-column: 1 / -1; font-size: 13px;">加载图标库中...</div>
                                </div>
                            </div>
                        </div>
                        <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer;">
                            <input type="checkbox" id="nodeCache" class="ip-checkbox" checked>
                            开启海报及静态资源缓存
                        </label>
                        <div style="display:flex; align-items:center; gap:8px; flex: 2; min-width: 200px;">
                            <span style="font-size:14px; font-weight:500; color:var(--text-sec); white-space:nowrap;">模拟 IP（可选，抹除真实 IP 只传此 IP）</span>
                            <input type="text" id="nodeFakeIp" placeholder="如 1.2.3.4" style="flex:1; min-width:120px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px; color:var(--text);">
                        </div>
                        <button type="submit" id="submitBtn" class="btn-submit" style="flex: 1; padding: 14px 20px;">保存部署</button>
                    </div>

                    <div style="background: rgba(120,120,120,0.05); border: 1px solid var(--border); border-radius: 10px; padding: 16px;">
                        <div style="font-size: 14px; font-weight: 600; color: var(--text-sec); margin-bottom: 12px;">服务器线路配置 (支持魔改分离版推流，支持无限条备用线路)</div>
                        <div id="targetInputs" style="display: flex; flex-direction: column; gap: 10px;">
                            <input type="url" class="target-input" placeholder="主线路地址 (如: http://1.1.1.1:8096)" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;" required oninput="handleTargetInputs()">
                            <input type="url" class="target-input" placeholder="备用线路 1 (选填，主源挂掉时触发)" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;" oninput="handleTargetInputs()">
                        </div>
                    </div>
                </form>
                </div>
            </div>

            <div id="codeModal" style="display:none; position:fixed; inset:0; z-index:11010; background:rgba(0,0,0,.5); backdrop-filter:blur(5px); overflow-y:auto; padding:16px;">
                <div style="max-width:560px; margin:24px auto; background:var(--card); border-radius:18px; padding:22px; box-shadow:0 10px 40px rgba(0,0,0,.2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <h2 id="codeModalTitle" style="margin:0; font-size:19px; display:flex; align-items:center; gap:8px;">${I.rocket} 手动覆盖/更新</h2>
                        <button onclick="closeCodeModal()" style="background:transparent;border:none;cursor:pointer;color:var(--text-sec);display:inline-flex;padding:4px;">${I.xmark}</button>
                    </div>
                    <div style="font-size:13px; color:#ff3b30; margin-bottom:12px;">${I.warn} 警告：提交错误的代码会导致面板瞬间崩溃（500 错误）。请确保代码已在本地测试通过！</div>
                    <textarea id="codeArea" rows="8" placeholder="在此处粘贴修改好的最新代码全文..." style="width:100%; padding:14px; border-radius:10px; border:1px solid var(--border); margin-bottom:12px; font-family:monospace; resize:vertical; background:var(--bg); font-size:12px;"></textarea>
                    <input type="file" id="fileInput" accept=".js" style="display:none; font-size:14px; padding:6px; border:1px solid var(--border); border-radius:6px; background:var(--bg); margin-bottom:12px; width:100%;">
                    <button class="btn-danger" id="deployBtn" onclick="deployWorker()" style="width:100%;">${I.flame} 覆盖更新</button>
                </div>
            </div>

            <div id="placementModal" style="display:none; position:fixed; inset:0; z-index:11010; background:rgba(0,0,0,.5); backdrop-filter:blur(5px); overflow-y:auto; padding:16px;">
                <div style="max-width:560px; margin:24px auto; background:var(--card); border-radius:18px; padding:22px; box-shadow:0 10px 40px rgba(0,0,0,.2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <h2 style="margin:0; font-size:19px; display:flex; align-items:center; gap:8px;">${I.gear} Worker 调度模式与区域设置</h2>
                        <button onclick="closePlacementModal()" style="background:transparent;border:none;cursor:pointer;color:var(--text-sec);display:inline-flex;padding:4px;">${I.xmark}</button>
                    </div>
                    <select id="cf-mode-select" onchange="handleModeChange()" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--text); margin-bottom:10px;">
                        <option value='{"mode":"smart"}'> 智能调度 (Smart Placement)</option>
                        <option value='{"mode":"off"}'> 边缘节点 (Edge - 默认离访客近)</option>
                        <optgroup label="指定云厂商物理机房落地">
                            <option value="aws"> AWS (亚马逊云)</option>
                            <option value="gcp"> GCP (谷歌云)</option>
                            <option value="azure"> Azure (微软云)</option>
                        </optgroup>
                        <option value="custom"> 手动输入区域代码...</option>
                    </select>
                    <select id="cf-region-select" style="display:none; width:100%; padding:10px; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--text); margin-bottom:10px;"></select>
                    <input type="text" id="cf-custom-input" placeholder="输入云代码 (如 gcp:us-west1)" style="display:none; width:100%; padding:10px; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--text); margin-bottom:10px;">
                    <div id="place-status" style="margin:0 0 12px; font-size:13px; color:var(--text-sec); font-weight:600;">后台全自动安全调度，不暴露任何私钥</div>
                    <button class="btn-submit" onclick="updatePlacement()" style="width:100%;">${I.check} 提交修改</button>
                </div>
            </div>

            <div id="accountModal" style="display:none; position:fixed; inset:0; z-index:11010; background:rgba(0,0,0,.5); backdrop-filter:blur(5px); overflow-y:auto; padding:16px;">
                <div style="max-width:560px; margin:24px auto; background:var(--card); border-radius:18px; padding:22px; box-shadow:0 10px 40px rgba(0,0,0,.2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <h2 style="margin:0; font-size:19px; display:flex; align-items:center; gap:8px;">${I.gear} 账户设置</h2>
                        <button onclick="closeAccountModal()" style="background:transparent;border:none;cursor:pointer;color:var(--text-sec);display:inline-flex;padding:4px;">${I.xmark}</button>
                    </div>
                    <div id="accountAdminPanel" style="display:flex; flex-direction:column; gap:16px;">
                        <div style="background:rgba(120,120,120,0.05); border:1px solid var(--border); border-radius:10px; padding:14px;">
                            <div style="font-size:14px; font-weight:600; margin-bottom:10px;">${I.pencil} 修改登录密码</div>
                            <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">${I.warn} Worker 变量 ADMIN_TOKEN 为最高权限，永久有效；此处修改的密码仅对网页生效。</div>
                            <input type="password" id="newAdminPass" placeholder="输入新密码 (至少 4 位)" style="width:100%; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg); margin-bottom:10px;">
                            <button class="btn-submit" onclick="saveAdminPass()" style="width:100%;">${I.check} 保存新密码</button>
                        </div>
                        <div style="background:rgba(120,120,120,0.05); border:1px solid var(--border); border-radius:10px; padding:14px;">
                            <div style="font-size:14px; font-weight:600; margin-bottom:10px;">${I.robot} 订阅用户管理</div>
                            <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">订阅者密码可进入网页，但只能查看节点，不能进行任何修改操作。</div>
                            <div id="subList" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;"></div>
                            <div style="display:flex; gap:8px;">
                                <input type="text" id="newSubPass" placeholder="输入新订阅者密码" style="flex:1; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg);">
                                <button class="btn-submit" onclick="addSubscriber()" style="white-space:nowrap;">${I.plus} 添加</button>
                            </div>
                        </div>
                    </div>
                    <div id="accountSubPanel" style="display:none; text-align:center; padding:20px 0; color:var(--text-sec); font-size:14px;">
                        ${I.robot} 当前为订阅用户模式，仅可查看节点，无任何修改权限。
                    </div>
                </div>
            </div>

            <div class="card">
                <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                    <h2 style="margin:0; font-size:18px;">已反代的媒体库</h2>
                    <div style="display: flex; gap: 10px; align-items:center; flex-wrap: wrap;">
                        <button class="btn-submit admin-only" onclick="pingAllNodes()" style=" padding: 10px 14px; font-size: 13px;">${I.bolt} 全局测速</button>
                        <button id="btnPurge" class="btn-submit admin-only" onclick="purgeCache()" style=" padding: 10px 14px; font-size: 13px;">${I.broom} 刷新全站海报</button>
                        <input type="text" id="searchNode" class="search-input" placeholder="搜索备注或后缀查找..." onkeyup="filterNodesList()">
                    </div>
                </div>
                <div class="admin-only" style="background: rgba(0, 122, 255, 0.05); padding: 12px 20px; border-radius: 12px; border: 1px dashed var(--primary); margin-bottom: 20px; margin-top: 20px; display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
            <label style="cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                <input type="checkbox" id="selectAllNodes" onchange="toggleSelectAll(this)" style="width: 18px; height: 18px; accent-color: var(--primary);"> 
                全选节点
            </label>
            
            <div style="width: 2px; height: 20px; background: var(--border);"></div> <select id="batch-mode-select" style="padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-weight: 600;">
                <option value=""> 读取模式中...</option>
            </select>

            <button onclick="batchUpdateModes()" style="background: var(--primary); color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,113,227,0.2);">
                ${I.rocket} 批量应用模式
            </button>

            <span id="batch-status" style="font-size: 13px; font-weight: 600;"></span>
        </div>
                <div id="list-grid" class="node-grid">
                    <div style="text-align:center; color:var(--text-sec); grid-column: 1 / -1; padding: 40px;">读取数据中...</div>
                </div>
            </div>
            
        </div>
        
        <div style="text-align: center; padding-top: 10px; padding-bottom: 20px;">
            <a href="https://t.me/MakkaPakkaOvO" target="_blank" style="text-decoration: none; color: var(--text); font-weight: 600; display: inline-flex; align-items: center; padding: 12px 24px; background: var(--card); border-radius: 30px; box-shadow: 0 4px 15px rgba(0,0,0,0.06); transition: 0.3s; font-size: 14px; border: 1px solid var(--border);">
                ${SVG_TG}
                联系作者 MakkaPakkaOvO
            </a>
            <div style="margin-top: 20px; font-size: 12px; color: var(--text-sec); line-height: 1.6; max-width: 600px; margin-left: auto; margin-right: auto; padding: 0 15px;">
                <strong>免责声明:</strong> 本项目仅供学习与技术测试使用，请遵守当地法律法规。使用者对配置、转发内容与访问行为承担全部责任，开发者不对任何直接或间接损失负责。
            </div>
        </div>
    </div>

    <script>
        const modeNames = { 'off': '保守', 'realip_only': '严格', 'dual': '兼容', 'strict': '强力' };
        
        const DEFAULT_ICON_URL = 'https://emby-icon.vercel.app/TFEL-Emby.json';
        let globalIcons = [];
        let proxyNodesForPing = [];
        let sortableInstance = null;
        let trendChartInstance = null;
        let locationChartInstance = null;

        // 设置 Chart.js 响应暗色模式
        function updateChartColors() {
            Chart.defaults.color = document.body.classList.contains('dark') ? '#98989d' : '#86868b';
            Chart.defaults.borderColor = document.body.classList.contains('dark') ? '#38383a' : '#d2d2d7';
        }

        // =====================================
        // 数据大屏与统计逻辑 (适配手机端表格排版)
        // =====================================
        async function openDashboard() {
            document.getElementById('dashboardModal').style.display = 'block';
            
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
            document.getElementById('themeToggle').innerHTML = isDark ? I.sun : I.moon;
            localStorage.setItem('emby_proxy_dark', isDark ? '1' : '0');
            if(trendChartInstance) { updateChartColors(); trendChartInstance.update(); locationChartInstance.update(); }
        }
        if (localStorage.getItem('emby_proxy_dark') === '1') { document.body.classList.add('dark'); document.getElementById('themeToggle').innerHTML = I.sun; }

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
            const filterText = document.getElementById('searchNode').value.toLowerCase();
            const cards = document.querySelectorAll('.emby-card');
            cards.forEach(card => {
                const searchStr = card.getAttribute('data-search').toLowerCase();
                card.style.display = searchStr.includes(filterText) ? 'flex' : 'none';
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
                    const proxyUrl = 'https://' + currentHost + '/' + r.prefix;
                    const targets = r.target ? r.target.split(',').map(s => s.trim()).filter(Boolean) : [];
                    const mainTarget = targets[0] || '';
                    
                    const remarkName = r.remark || '未命名媒体库';
                    const lastPlay = r.last_play ? r.last_play : '暂无播放记录';
                    
                    const iconHtml = r.icon ? \`<img src="\${r.icon}" style="width:28px;height:28px;border-radius:6px;object-fit:cover;">\` : '${I.film}';
                    const pingAttr = mainTarget ? 'onclick="pingTarget(' + idx + ', \\'' + mainTarget + '\\')" title="点击重新测速"' : 'title="订阅模式不可测速"';
                    const pingText = mainTarget ? '测速中...' : '—';
                    const encodedTargets = encodeURIComponent(JSON.stringify(targets));
                    
                    //  接收后端传来的：单节点独立宽带与请求统计数据
                    const todayBw = r.todayBandwidth || '0 B';
                    const totalReqs = r.totalReqs || r.todayReqs || 0;

                    proxyNodesForPing.push({ idx: idx, url: mainTarget });

                    container.innerHTML += \`
                    <div class="emby-card route-item" data-prefix="\${r.prefix}" data-search="\${remarkName} \${r.prefix}">
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
                                    <span class="info-label">最后活跃:</span>
                                    <span style="color:var(--text-sec);">\${lastPlay}</span>
                                </div>
                            </div>

                            <div class="card-footer admin-only">
                                <button class="btn-edit" onclick="editNode('\${r.prefix}', '\${r.target}', '\${r.mode}', '\${r.remark || ''}', '\${r.icon || ''}', '\${r.cache_img}', '\${r.custom_ip || ''}')">编辑配置</button>
                                <button class="btn-del" onclick="del('\${r.prefix}')">删除</button>
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

        function editNode(prefix, targetStr, mode, remark, icon, cacheImg, customIp) {
            document.getElementById('oldPrefix').value = prefix;
            document.getElementById('remark').value = remark;
            document.getElementById('prefix').value = prefix;
            document.getElementById('mode').value = mode || 'off';
            document.getElementById('nodeCache').checked = (cacheImg !== 'off');
            document.getElementById('nodeFakeIp').value = customIp || '';
            
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
        function toggleNodeDetail(btn) {
            const card = btn.closest('.emby-card');
            const d = card.querySelector('.node-detail');
            const show = d.style.display === 'none';
            d.style.display = show ? 'flex' : 'none';
            btn.classList.toggle('rotated', show);
            btn.title = show ? '收起' : '展开详情';
        }
        function openNodeModal() {
            const f = document.getElementById('addForm');
            f.reset();
            document.getElementById('oldPrefix').value='';
            selectIcon('','默认');
            document.getElementById('nodeCache').checked=true;
            document.getElementById('submitBtn').textContent='保存部署';
            document.getElementById('nodeModalTitle').textContent='添加节点';
            document.getElementById('nodeModal').style.display='block';
        }
        function closeNodeModal() {
            document.getElementById('nodeModal').style.display='none';
        }

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
        function openAccountModal() {
            const modal = document.getElementById('accountModal');
            modal.style.display = 'block';
            if (window.ROLE === 'sub') {
                document.getElementById('accountAdminPanel').style.display = 'none';
                document.getElementById('accountSubPanel').style.display = 'block';
            } else {
                document.getElementById('accountAdminPanel').style.display = 'flex';
                document.getElementById('accountSubPanel').style.display = 'none';
                loadSubscribers();
            }
        }
        function closeAccountModal() {
            document.getElementById('accountModal').style.display = 'none';
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
        async function loadSubscribers() {
            try {
                const res = await fetch('/api/subscribers');
                const data = await res.json();
                const list = data.subscribers || [];
                const box = document.getElementById('subList');
                if (list.length === 0) {
                    box.innerHTML = '<div style="font-size:13px; color:var(--text-sec); padding:6px 0;">暂无订阅用户</div>';
                    return;
                }
                box.innerHTML = '';
                list.forEach(pw => {
                    box.innerHTML += '<div style="display:flex; align-items:center; gap:8px; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:8px 12px;">' +
                        '<span style="flex:1; font-family:monospace; font-size:13px;">' + pw + '</span>' +
                        '<button class="icon-btn" onclick="delSubscriber(this)" data-pw="' + pw + '" title="删除">' + I.trash + '</button></div>';
                });
            } catch (e) { alert('加载订阅用户失败'); }
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

        // ============ 角色识别与订阅者只读模式 ============
        async function initRole() {
            try {
                const res = await fetch('/api/me');
                const data = await res.json();
                window.ROLE = data.role || 'admin';
            } catch (e) { window.ROLE = 'admin'; }
            if (window.ROLE === 'sub') applySubMode();
        }
        function applySubMode() {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            const dockItems = document.querySelectorAll('.ds-dock-item');
            if (dockItems[1]) dockItems[1].style.display = 'none';
            if (dockItems[2]) dockItems[2].style.display = 'none';
            const speedView = document.getElementById('view-speed');
            if (speedView) speedView.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-sec);font-size:14px;">订阅用户无测速与 DNS 权限</div>';
            const setView = document.getElementById('view-settings');
            if (setView) setView.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-sec);font-size:14px;">订阅用户无设置权限</div>';
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
                    body: JSON.stringify({oldPrefix, prefix, target, mode, remark, icon, cache_img, fakeIp})
                });
                const data = await res.json();
                if(!data.success) throw new Error(data.error || '部署失败');
                
                document.getElementById('addForm').reset();
                document.getElementById('oldPrefix').value = ''; 
                selectIcon('', '默认');
                document.getElementById('nodeCache').checked = true;
                document.getElementById('submitBtn').textContent = '保存部署'; 
                resetTargetInputs(); 
                
                showToast('✅ 节点部署成功');
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
            btn.disabled = false; btn.textContent = ' 测试粘贴的节点';
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
            finally { btn.disabled = false; btn.textContent = ' 拉取 API 并测速'; }
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
                showToast(\`✅ 成功提取 \${data.totalCount} 个可用 IP，抽取 \${data.ips.length} 个测速\`);
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
            finally { btn.disabled = false; btn.textContent = ' 提取预设源并测速'; }
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
                fetch(\`https://api.ip.sb/geoip/\${queryIp}\`).then(res => res.json()).then(data => locTd.innerHTML = \`\${recordLabel} \${sourceLabel} | \${data.country || '未知'}\`).catch(() => locTd.innerHTML = \`\${recordLabel} \${sourceLabel} | 解析失败\`);
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
        
        let latestCode = ""; 

        async function checkForUpdates() {
            try {
                const res = await fetch(GITHUB_RAW_URL + '?t=' + new Date().getTime());
                if (!res.ok) return;
                latestCode = await res.text();
                
                //  核心修复：加入双重反斜杠，防止正则在 Worker 中变成注释 (//) 导致崩溃
                const versionMatch = latestCode.match(/\\/\\/\\s*VERSION:\\s*v?([\\d\\.]+)/i);
                if (versionMatch && versionMatch[1]) {
                    const latestVersion = versionMatch[1];
                    if (latestVersion !== CURRENT_VERSION) {
                        document.getElementById('updateAlert').style.display = 'block';
                        document.getElementById('updateMsg').innerText = '当前版本: v' + CURRENT_VERSION + ' | 发现最新版本: v' + latestVersion + ' (Github)';
                    }
                }
            } catch (e) {
                console.log("检测更新失败:", e);
            }
        }

        async function doOnlineUpdate() {
            if (!confirm(' 确定要从 GitHub 拉取最新版本并覆盖当前节点吗？\\n\\n（这将会保留你的所有环境变量和数据库绑定）')) return;
            
            const btn = document.getElementById('onlineUpdateBtn');
            btn.innerText = '⏳ 正在拉取并部署...';
            btn.disabled = true;
            btn.style.opacity = '0.7';

            try {
                // 直接复用我们之前写好的防丢数据库高级 API
                const res = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newCode: latestCode })
                });
                const data = await res.json();
                if (data.success) {
                    alert(' 在线更新成功！\\n\\n点击确定后页面将自动刷新，畅享新版本！');
                    window.location.reload(); 
                } else {
                    alert(' 更新失败：\\n' + JSON.stringify(data.error));
                }
            } catch (e) {
                alert(' 异常：\\n' + e.message);
            } finally {
                btn.innerText = ' 一键拉取并升级';
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }

        // 页面加载完成后自动在后台静默检测更新
        document.addEventListener('DOMContentLoaded', checkForUpdates);
    </script>
    <style>
    /* 修正页面底部留白，防止被 Dock 挡住 */
    body { padding-bottom: 90px !important; }
    
    /* 页面切换动画 */
    .page-view { display: none; opacity: 0; animation: dsFadeIn 0.3s forwards; }
    .page-view.active { display: block; opacity: 1; }
    @keyframes dsFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    /* 底部dock栏UI */
    .ds-dock { 
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); 
        width: calc(100% - 32px); max-width: 600px; 
        background: var(--card); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); 
        border: 1px solid var(--border); border-radius: 36px; padding: 8px 12px; 
        display: flex; justify-content: space-around; 
        box-shadow: 0 20px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.05); z-index: 9999; 
    }
    .ds-dock-item { 
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; 
        padding: 8px 16px; border-radius: 30px; color: var(--text-sec); font-size: 12px; 
        font-weight: 500; transition: all 0.2s; background: transparent; border: none; cursor: pointer; flex: 1; 
    }
    .ds-dock-item.active { color: var(--primary); background: rgba(0,113,227,0.1); }
    .ds-dock-item svg { width: 24px; height: 24px; fill: currentColor; }
</style>

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
// 1. 切换页面的核心逻辑
function switchDsView(viewId, btn) {
    document.querySelectorAll('.ds-dock-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 2. 将原版超长页面，智能装进 3 个分类盒子中
window.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.container');
    const contentWrap = document.querySelector('.content-wrap');
    if (!container) return; 

    // 把弹窗移到 body 末尾，避免被 contentWrap.remove() 一并删除
    ['nodeModal', 'codeModal', 'placementModal', 'accountModal'].forEach(id => {
        const m = document.getElementById(id);
        if (m) document.body.appendChild(m);
    });

    // 把顶部固定栏移到 body 顶层，避免被 .page-view 的 transform 动画破坏 fixed 定位
    const topbarEl = document.querySelector('.topbar');
    if (topbarEl) document.body.appendChild(topbarEl);

    // 置顶最顶部的 header
    const header = document.querySelector('.header');
    if (header) container.insertBefore(header, container.firstChild);

    // 建立 3 个干净的虚拟房间
    const views = {
        'nodes': document.createElement('div'),
        'speed': document.createElement('div'),
        'settings': document.createElement('div')
    };
    for (let k in views) {
        views[k].id = 'view-' + k;
        views[k].className = 'page-view';
        if (k === 'nodes') views[k].classList.add('active');
    }

    // 用于暂存底部声明信息的数组
    let footers = []; 

    // 智能抓取并分类
    function sortCard(el) {
        if (!el || el === header || el.tagName === 'NAV' || el.id === 'toast' || el.id === 'nodeModal' || el.id === 'codeModal' || el.id === 'placementModal' || el.id === 'accountModal' || el.classList.contains('page-view') || el.classList.contains('content-wrap') || el.classList.contains('topbar')) return;
        const text = el.innerText || el.innerHTML || '';
        
        // 【1】免责声明与联系作者：先扣留，不要马上分配！
        if (text.includes('联系作者') || text.includes('免责声明') || text.includes('交流群')) {
            footers.push(el);
            return;
        }
        
        // 【2】分配到测速页
        if (text.includes('测速与动态 DNS') || text.includes('专属线路测速') || text.includes('提取预设源') || text.includes('ITDog')) {
            views['speed'].appendChild(el);
            return;
        }
        
        // 【3】分配到控制面板页（仅限 Worker 核心与区域调度）
        if (text.includes('手动覆盖') || text.includes('Worker 调度模式') || el.id === 'updateAlert' || el.id === 'cf-trace-card' || el.id === 'config-backup-card') {
            views['settings'].appendChild(el);
            return;
        }
        
        // 【4】剩下的统统丢进【节点管理页】（完美解决表单和列表分家的问题）
        if (text.trim() !== "") {
            views['nodes'].appendChild(el);
        }
    }

    // 执行所有卡片的搬家
    Array.from(container.children).forEach(sortCard);
    if (contentWrap) {
        Array.from(contentWrap.children).forEach(sortCard);
        contentWrap.remove(); // 销毁原本的包装盒
    }

    // 【解决 Bug】：把刚才扣留的免责声明等元素，追加到控制面板的最末尾
    footers.forEach(f => views['settings'].appendChild(f));

    // 将 3 个分好类的房间放回页面
    container.appendChild(views['nodes']);
    container.appendChild(views['speed']);
    container.appendChild(views['settings']);

    // 识别角色（管理员/订阅者），订阅者自动进入只读模式
    initRole();

    // 【体验优化】劫持编辑事件，点击编辑时平滑滚动到顶部的表单处
    const originalEditRoute = window.editRoute;
    if (typeof originalEditRoute === 'function') {
        window.editRoute = function(index) {
            originalEditRoute(index);
            // 因为现在表单和列表都在节点页，所以直接平滑滚动到最上面就能看到填好的表单了！
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
    }
});
</script>
</body>
</html>
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
            // 【7天、30天】查询：传入数字代表天数，使用 1dGroups
            const start = new Date(end.getTime() - type * 24 * 3600000);
            const dateGeq = start.toISOString().split('T')[0];
            const dateLeq = end.toISOString().split('T')[0];
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

export default {
    // 每天自动运行发送 TG 统计
    async scheduled(event, env, ctx) {
        if (env.TG_BOT_TOKEN && env.TG_CHAT_ID && env.DB) {
            ctx.waitUntil(sendTgStats(env, env.TG_CHAT_ID));
        }
    },

    async fetch(request, env, ctx) {
        const url = new URL(request.url);

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

        const EXPECTED_TOKEN = env.ADMIN_TOKEN;
        if (!EXPECTED_TOKEN) return new Response("请在 Worker 变量中配置 ADMIN_TOKEN", { status: 500 });

        function getCookie(req, name) {
            const cookieString = req.headers.get("Cookie");
            if (!cookieString) return null;
            const match = cookieString.match(new RegExp('(^| )' + name + '=([^;]+)'));
            if (match) return decodeURIComponent(match[2]);
            return null;
        }

        // 三档认证：env.ADMIN_TOKEN(永不失效) > 网页修改的管理员密码 > 订阅者密码(只读)
        async function getAuthRole(req) {
            const token = getCookie(req, 'admin_token');
            if (!token) return null;
            if (token === EXPECTED_TOKEN) return 'admin';
            if (!env.DB) return null;
            try {
                await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                const adminRow = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('admin_pass').first();
                if (adminRow && adminRow.value && token === adminRow.value) return 'admin';
                const subRow = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers').first();
                if (subRow && subRow.value) {
                    const list = JSON.parse(subRow.value);
                    if (Array.isArray(list) && list.includes(token)) return 'sub';
                }
            } catch (e) {}
            return null;
        }

        const isPanelOrApi = url.pathname === '/' || url.pathname.startsWith('/api/');
        let ROLE = null;
        if (isPanelOrApi && url.pathname !== '/api/tg-webhook') {
            ROLE = await getAuthRole(request);
            if (!ROLE) {
                if (url.pathname === '/') return new Response(LOGIN_UI, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
                else return new Response('Unauthorized', { status: 401 });
            }
        }

        if (url.pathname === '/') {
            return new Response(HTML_UI, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
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
            return Response.json({ success: true, role: ROLE });
        }

        if (url.pathname === '/api/account' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const data = await request.json();
                const pw = String(data.password || '').trim();
                if (pw.length < 4) return Response.json({ success: false, error: '密码至少 4 位' });
                await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('admin_pass', pw).run();
                return Response.json({ success: true });
            } catch (e) {
                return Response.json({ success: false, error: e.message });
            }
        }

        if (url.pathname === '/api/subscribers' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
                const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers').first();
                const list = row && row.value ? JSON.parse(row.value) : [];
                return Response.json({ success: true, subscribers: Array.isArray(list) ? list : [] });
            } catch (e) {
                return Response.json({ success: false, error: e.message, subscribers: [] });
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
                if (action === 'add') {
                    if (list.includes(pw)) return Response.json({ success: false, error: '该密码已存在' });
                    list.push(pw);
                } else if (action === 'del') {
                    list = list.filter(p => p !== pw);
                } else {
                    return Response.json({ success: false, error: '未知操作' });
                }
                await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('subscribers', JSON.stringify(list)).run();
                return Response.json({ success: true, subscribers: list });
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
                return Response.json({ success: true, message: `${I.check} 成功！` });
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

        if (url.pathname === '/api/get-remote-ips') {
            try {
                const reqType = (url.searchParams.get('type') || 'all').toLowerCase();
                const validIPs = new Set();

                if (['all', '电信', '联通', '移动', '多线', 'ipv6'].includes(reqType)) {
                    try {
                        const res1 = await fetch('https://api.uouin.com/cloudflare.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
                        if(res1.ok) {
                            const text1 = await res1.text(); const cleanText = text1.replace(/<[^>]+>/g, ' ');
                            const regex = /(电信|联通|移动|多线|ipv6)\s+((?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-fA-F0-9]{1,4}:)+[a-fA-F0-9]{1,4})/gi;
                            let match; while ((match = regex.exec(cleanText)) !== null) {
                                const lineType = match[1].toLowerCase(); let ip = match[2];
                                if (ip.includes(':') && !ip.startsWith('[')) ip = `[${ip}]`;
                                if (reqType === 'all' || reqType === lineType) validIPs.add(ip);
                            }
                        }
                    } catch(e) {}
                }

                if (['all', '优选'].includes(reqType)) {
                    try {
                        const res2 = await fetch('https://raw.githubusercontent.com/ZhiXuanWang/cf-speed-dns/refs/heads/main/ipTop10.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
                        if(res2.ok) {
                            const text2 = await res2.text(); const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
                            const matched = text2.match(ipv4Regex) || []; matched.forEach(ip => { if (!ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('127.')) validIPs.add(ip); });
                        }
                    } catch(e) {}
                }
                const uniqueIPArray = Array.from(validIPs);
                for (let i = uniqueIPArray.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uniqueIPArray[i], uniqueIPArray[j]] = [uniqueIPArray[j], uniqueIPArray[i]]; }
                return Response.json({ success: true, ips: uniqueIPArray.slice(0, 10), totalCount: uniqueIPArray.length });
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
                const routes = await request.json();
                for (const r of routes) {
                    if (r.prefix && r.target) {
                        await env.DB.prepare('INSERT OR REPLACE INTO routes (prefix, target, mode, remark, last_play, icon, cache_img, sort_order, custom_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                            .bind(r.prefix, r.target, r.mode || 'off', r.remark || '', r.last_play || '', r.icon || '', r.cache_img || 'on', r.sort_order || 0, r.custom_ip || '').run();
                    }
                }
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        if (url.pathname.startsWith('/api/routes')) {
            if (!env.DB) return Response.json({ error: "由于未绑定 D1 数据库，反代功能不可用。" }, { status: 500 });

            await env.DB.exec(`CREATE TABLE IF NOT EXISTS routes (prefix TEXT PRIMARY KEY, target TEXT NOT NULL)`);
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
if (request.method !== 'GET' && ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            
            // 数据防爆清理策略：自动清理过去 7 天的精细日志
            try { await env.DB.exec(`DELETE FROM visitor_logs WHERE timestamp < datetime('now', '-7 days')`); } catch(e) {}

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

                if (env.CF_API_TOKEN && env.CF_ZONE_ID && routes && routes.length > 0) {
                    const end = new Date();
                    const beijingTime = new Date(end.getTime() + 8 * 3600000);
                    beijingTime.setUTCHours(0, 0, 0, 0);
                    const start = new Date(beijingTime.getTime() - 8 * 3600000);

                    // 核心修复：将“一条复杂查询”拆解为 Promise.all 并发单体查询，并且 limit 设为严格的 1
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
                            
                            // 精准提取该节点跑出的流量字节
                            const bytes = cfData?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0]?.sum?.edgeResponseBytes || 0;
                            
                            // 自动格式化换算单位
                            let formatted = "0 B";
                            if (bytes >= 1099511627776) formatted = (bytes / 1099511627776).toFixed(2) + " TB";
                            else if (bytes >= 1073741824) formatted = (bytes / 1073741824).toFixed(2) + " GB";
                            else if (bytes >= 1048576) formatted = (bytes / 1048576).toFixed(2) + " MB";
                            else if (bytes >= 1024) formatted = (bytes / 1024).toFixed(2) + " KB";
                            else if (bytes > 0) formatted = bytes + " B";
                            
                            r.todayBandwidth = formatted;
                        } catch(e) { 
                            r.todayBandwidth = "获取异常"; 
                        }
                    }));
                }
                
                // 订阅者不可见源站链接（target 字段剥离，防止直接调 API 查看源站）
                if (ROLE === 'sub' && Array.isArray(routes)) {
                    routes = routes.map(r => { const c = { ...r }; delete c.target; return c; });
                }
                return Response.json(routes || []);
            }
            
            if (request.method === 'POST') {
                const data = await request.json(); let currentSortOrder = 0;
                if (data.oldPrefix && data.oldPrefix !== data.prefix) {
                    const oldRow = await env.DB.prepare('SELECT sort_order FROM routes WHERE prefix = ?').bind(data.oldPrefix).first();
                    if(oldRow) currentSortOrder = oldRow.sort_order;
                    await env.DB.prepare('DELETE FROM routes WHERE prefix = ?').bind(data.oldPrefix).run();
                } else {
                    const oldRow = await env.DB.prepare('SELECT sort_order FROM routes WHERE prefix = ?').bind(data.prefix).first();
                    if(oldRow) currentSortOrder = oldRow.sort_order;
                }
                
                await env.DB.prepare('INSERT OR REPLACE INTO routes (prefix, target, mode, remark, icon, cache_img, sort_order, custom_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                    .bind(data.prefix, data.target, data.mode || 'off', data.remark || '', data.icon || '', data.cache_img || 'on', currentSortOrder, data.fakeIp || '').run();
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
        const decodedPath = decodeURIComponent(url.pathname); let matchedPrefix = null; 
        let proxyOrigin = new URL(request.url).origin;

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
            if (/^https?:\/\//i.test(location)) return `${proxyOrigin}${safePrefix}/${encodeURIComponent(location)}`;
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
                        return `${proxyOrigin}${safePrefix}/${parsed.href}`;
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
        function normalizeRemainingPathForPlayback(remainingPath, matchedPrefix) {
            if (!remainingPath || !matchedPrefix) return remainingPath;

            const prefixPath = `/${matchedPrefix}`;
            const embyDuplicatedPrefix = `/emby${prefixPath}`;

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

        if (decodedPath.startsWith('/http://') || decodedPath.startsWith('/https://')) {
            targetUrls = [decodedPath.substring(1)]; remainingPath = '';
        } else {
            const pathParts = decodedPath.split('/'); const prefix = pathParts[1]; 
            if (!prefix) return new Response(`Not Found`, { status: 404 });

            try {
                if (!env.DB) return new Response(`404: Node not found (DB not bound)`, { status: 404 });
                try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN custom_ip TEXT DEFAULT ''`); } catch(e) {}
                const stmt = env.DB.prepare(`SELECT target, mode, cache_img, custom_ip FROM routes WHERE prefix = ?`);
                const route = await stmt.bind(prefix).first();
                if (!route) return new Response(`404: Node not found`, { status: 404 });

                currentMode = route.mode || 'off'; enableCache = (route.cache_img !== 'off');
                matchedPrefix = prefix; remainingPath = '/' + pathParts.slice(2).join('/');
                remainingPath = normalizeRemainingPathForPlayback(remainingPath, matchedPrefix);
                targetUrls = route.target.split(',').map(s => s.trim()).filter(Boolean);
                
                if (remainingPath.startsWith('/http://') || remainingPath.startsWith('/https://')) { targetUrls = [remainingPath.substring(1)]; remainingPath = ''; }
            } catch (e) { return new Response("DB Error: " + e.message, { status: 500 }); }
        }

        if (targetUrls.length === 0) return new Response("404: Target empty", { status: 404 });

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

                // 模拟 IP 伪装：节点配置了 custom_ip 时，抹除全部真实 IP 头，只传伪装 IP
                const fakeIp = (route && route.custom_ip) || '';
                if (fakeIp) {
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

                let fetchInit = { method: request.method, headers: newHeaders, redirect: isStaticOrImage ? 'follow' : 'manual' };

                // 只缓存不带鉴权态的静态资源。
                // 之前 UHD 图片加载异常时，容易把所有图片都当成可缓存资源处理；
                // 但 Emby 的高清图请求常常带 token/api_key，缓存这类响应可能拿到过期或错误权限的内容。
                // 因此这里保留静态资源加速，但显式排除带鉴权态的请求。
                if (isStaticOrImage && enableCache && !authLikeState) { fetchInit.cf = { cacheEverything: true, cacheTtl: 86400 }; }

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
        const safePrefix = matchedPrefix ? `/${matchedPrefix}` : '';

        // ==========================================
        //  修复版 302 拦截：恢复 URL 编码
        // ==========================================
        if ([301, 302, 303, 307, 308].includes(finalResponse.status)) {
            const location = responseHeaders.get('Location');
            const rewrittenLocation = rewriteRedirectLocation(location, finalTargetUrl, targetOrigins, proxyOrigin, safePrefix);
            if (rewrittenLocation !== location) {
                responseHeaders.set('Location', rewrittenLocation);
            }
        }
        
        responseHeaders.set('Access-Control-Allow-Origin', '*');

        // ==========================================
        // 2.10 响应体重写 (接管 PlaybackInfo 与 M3U8)
        // ==========================================

        if (finalResponse.status === 200 && responseHeaders.get("content-type")?.includes("json") && url.pathname.toLowerCase().includes("playbackinfo")) {
            try {
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
                    });
                }
                if (modified) { 
                    dropBodyIntegrityHeaders(responseHeaders);
                    return new Response(JSON.stringify(data), { status: finalResponse.status, statusText: finalResponse.statusText, headers: responseHeaders }); 
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
                if (text.includes('http://') || text.includes('https://')) {
                    let modifiedText = text.replace(/(https?:\/\/[^\s]+)/g, proxyOrigin + safePrefix + '/$1');
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
    }
};
