/**
 * Interactive analytics page (ThisDID dark theme), served at /analytics
 * (/dashboard 301-redirects there).
 * The shell is static HTML + inline vanilla JS that fetches /data
 * (with range/country/method filters) and renders KPIs, charts, tabbed
 * leaderboards and a live request feed. No third-party scripts (GDPR-friendly).
 *
 * NOTE: the inline client script deliberately avoids backticks and ${...} so it
 * can live inside this template literal untouched.
 */
export function renderDashboard(): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ThisDID · Analytics</title>
<meta name="description" content="Live, GDPR-friendly analytics for the ThisDID universal DID resolver — requests, latency, providers, methods and geography."/>
<link rel="canonical" href="https://thisdid.com/analytics"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="https://thisdid.com/analytics"/>
<meta property="og:site_name" content="ThisDID"/>
<meta property="og:title" content="ThisDID · Resolver Analytics"/>
<meta property="og:description" content="Live, GDPR-friendly analytics for the ThisDID universal DID resolver — requests, latency, providers, methods and geography."/>
<meta property="og:locale" content="en_US"/>
<meta property="og:image" content="https://thisdid.com/poster.png"/>
<meta property="og:image:secure_url" content="https://thisdid.com/poster.png"/>
<meta property="og:image:type" content="image/png"/>
<meta property="og:image:width" content="1599"/>
<meta property="og:image:height" content="1165"/>
<meta property="og:image:alt" content="ThisDID — the DIF universal resolver that distributes DID resolution"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="ThisDID · Resolver Analytics"/>
<meta name="twitter:description" content="Live, GDPR-friendly analytics for the ThisDID universal DID resolver — requests, latency, providers, methods and geography."/>
<meta name="twitter:image" content="https://thisdid.com/poster.png"/>
<meta name="twitter:image:alt" content="ThisDID — the DIF universal resolver that distributes DID resolution"/>
<link rel="icon" href="/favicon.png" type="image/png"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
  :root{--bg:#16130f;--surface:#201c15;--surface2:#29241b;--border:rgba(255,255,255,.09);--text:#f4efe6;--dim:#a99f8f;--faint:#6f6656;--accent:#d97757;--accent-bright:#ff916a;--twist:#b587f0;--good:#57b96a;--bad:#ff916a}
  *{box-sizing:border-box}body{margin:0;font-family:Manrope,system-ui,sans-serif;background:radial-gradient(1000px 500px at 85% -10%,rgba(217,119,87,.16),transparent 60%),var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}
  a{color:inherit}.wrap{max-width:1200px;margin:0 auto;padding:26px}
  header{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap}
  .logo{height:34px;padding:5px 9px;border-radius:10px;background:#f4efe6;display:grid;place-items:center}
  .logo img{height:22px;width:auto;display:block}
  .brand{font-family:'Space Grotesk';font-weight:700;font-size:19px}.brand b{color:var(--accent)}
  .tag{font-size:13px;color:var(--faint)}
  .live{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dim);font-weight:600}
  .live .dot{width:8px;height:8px;border-radius:50%;background:var(--good);box-shadow:0 0 0 0 rgba(87,185,106,.6);animation:pulse 2s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(87,185,106,.5)}70%{box-shadow:0 0 0 7px rgba(87,185,106,0)}100%{box-shadow:0 0 0 0 rgba(87,185,106,0)}}
  .back{font-size:13px;font-weight:600;color:var(--dim);text-decoration:none;border:1px solid var(--border);padding:8px 14px;border-radius:10px}
  .spacer{flex:1}
  .filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:20px}
  .seg{display:flex;gap:3px;padding:3px;background:var(--surface);border:1px solid var(--border);border-radius:11px}
  .range-btn{border:0;background:transparent;color:var(--dim);font-weight:700;font-size:12.5px;padding:7px 13px;border-radius:8px;cursor:pointer}
  .range-btn.on{background:linear-gradient(135deg,var(--accent),var(--accent-bright));color:#fff}
  select{background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:10px;padding:8px 12px;font-size:13px;font-family:inherit;cursor:pointer}
  .gdpr{margin-left:auto;font-size:11.5px;color:var(--faint);border:1px solid var(--border);border-radius:999px;padding:6px 12px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:8px}
  .stat{padding:16px 18px;border:1px solid var(--border);border-radius:16px;background:var(--surface)}
  .stat-v{font-family:'Space Grotesk';font-weight:700;font-size:27px;letter-spacing:-.02em}
  .stat-l{font-size:11.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-top:6px}
  .stat-s{font-size:12px;color:var(--dim);margin-top:3px}
  h2{font-family:'Space Grotesk';font-size:13px;letter-spacing:.04em;margin:26px 0 12px;color:var(--dim);text-transform:uppercase}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .panel{padding:20px;border:1px solid var(--border);border-radius:16px;background:var(--surface)}
  .panel h3{margin:0 0 14px;font-size:14px;font-weight:700}
  .bar-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .bar-label{width:120px;flex:none;font-family:'IBM Plex Mono';font-size:12px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bar-track{flex:1;height:9px;background:var(--surface2);border-radius:5px;overflow:hidden}
  .bar-fill{display:block;height:100%;border-radius:5px}
  .bar-count{width:70px;text-align:right;font-family:'IBM Plex Mono';font-size:12px;color:var(--dim)}
  .lat-sub{font-size:11px;color:var(--faint);margin:-4px 0 10px 130px;font-family:'IBM Plex Mono'}
  .vbars{display:flex;align-items:flex-end;gap:10px;height:150px}
  .vbar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:7px;min-width:0}
  .vbar span{width:100%;border-radius:5px 5px 0 0;min-height:4px}
  .vbar em{font-size:10.5px;color:var(--faint);font-style:normal;font-family:'IBM Plex Mono';max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ax{fill:var(--faint);font-size:10px;font-family:'IBM Plex Mono';text-anchor:middle}
  .cal-wrap{overflow-x:auto}
  .cal-m{fill:var(--faint);font-size:10px;font-family:'IBM Plex Mono'}
  .cal-d{fill:var(--faint);font-size:9px;font-family:'IBM Plex Mono';dominant-baseline:middle}
  .cal-legend{display:flex;align-items:center;gap:4px;justify-content:flex-end;margin-top:10px;font-size:11px;color:var(--faint)}
  .cal-cell{width:11px;height:11px;border-radius:2px;display:inline-block}
  .pie-wrap{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
  .legend{display:flex;flex-direction:column;gap:7px;font-size:12.5px}
  .legend .lg{display:flex;align-items:center;gap:7px;color:var(--dim)}.legend b{color:var(--text)}
  .dot{width:9px;height:9px;border-radius:3px;display:inline-block}
  .tabs{display:flex;gap:3px;padding:3px;background:var(--surface);border:1px solid var(--border);border-radius:11px;width:fit-content;margin-bottom:12px}
  .tab{border:0;background:transparent;color:var(--dim);font-weight:700;font-size:12.5px;padding:7px 14px;border-radius:8px;cursor:pointer}
  .tab.on{background:var(--surface2);color:var(--text)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--faint);font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:0 10px 10px;border-bottom:1px solid var(--border)}
  td{padding:10px;border-bottom:1px solid var(--border);vertical-align:middle}
  .mono{font-family:'IBM Plex Mono'}.num{text-align:right;white-space:nowrap}.dim{color:var(--dim)}.rank{color:var(--faint);width:36px}
  .did{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--accent-bright)}
  .pill{font-size:11.5px;font-weight:700;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);padding:3px 9px;border-radius:6px}
  .ok{color:var(--good);font-weight:700}.err{color:var(--bad);font-weight:600;font-family:'IBM Plex Mono';font-size:12px}
  .empty{color:var(--faint);font-size:13px;padding:14px 2px}
  .older{border:1px solid var(--border);background:var(--surface2);color:var(--dim);font-weight:700;font-size:12.5px;padding:8px 18px;border-radius:9px;cursor:pointer;display:none}
  .older:hover{color:var(--text);border-color:var(--border2,rgba(217,119,87,.22))}
  .older:disabled{opacity:.55;cursor:default}
  #setup{display:none;margin:0 0 18px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--dim);font-size:13.5px}
  #setup code{color:var(--accent-bright);font-family:'IBM Plex Mono'}
  .foot{margin:28px 0 8px;color:var(--faint);font-size:12.5px}
  #bar{position:fixed;top:0;left:0;right:0;height:2px;z-index:100;overflow:hidden;opacity:0;transition:opacity .2s}
  #bar.on{opacity:1}
  #bar::before{content:'';position:absolute;top:0;height:100%;width:35%;left:-35%;background:linear-gradient(90deg,transparent,var(--accent),var(--accent-bright),transparent);animation:load 1.1s infinite ease-in-out}
  @keyframes load{0%{left:-35%}100%{left:100%}}
  .skel{background:linear-gradient(90deg,var(--surface2) 25%,rgba(255,255,255,.06) 37%,var(--surface2) 63%);background-size:400% 100%;animation:sh 1.3s ease infinite;border-radius:10px}
  @keyframes sh{0%{background-position:100% 0}100%{background-position:0 0}}
  @media(max-width:820px){.grid2{grid-template-columns:1fr}.did{max-width:160px}.bar-label{width:88px}.lat-sub{margin-left:98px}}
</style></head>
<body><div id="bar"></div><div class="wrap">
  <header>
    <span class="logo"><img src="/DIF_logo.png" alt="DIF"/></span>
    <span class="brand">this<b>DID</b></span><span class="tag">Resolver Analytics</span>
    <span class="spacer"></span>
    <span class="live"><span class="dot"></span>live</span>
    <a class="back" href="/">← Resolver</a>
  </header>

  <div id="setup">Analytics storage isn’t bound yet — create D1 (<code>DB</code>) and KV (<code>STATS_KV</code>), paste the ids into <code>wrangler.jsonc</code>, and apply migrations. Resolution keeps working meanwhile. See the README.</div>

  <div class="filters">
    <div class="seg" id="ranges">
      <button class="range-btn" data-r="hourly">Hourly</button>
      <button class="range-btn" data-r="day">Day</button>
      <button class="range-btn" data-r="week">Week</button>
      <button class="range-btn" data-r="month">Month</button>
      <button class="range-btn" data-r="ytd">YTD</button>
      <button class="range-btn" data-r="all">All time</button>
    </div>
    <select id="fcountry" title="Filter by country"><option value="">All countries</option></select>
    <select id="fmethod" title="Filter by method"><option value="">All methods</option></select>
    <span class="gdpr">GDPR-friendly · no IPs · no cookies · coarse geo only</span>
  </div>

  <div class="stats" id="kpis"></div>

  <h2>Requests over time</h2>
  <div class="panel"><div id="timeline"></div></div>

  <div class="grid2">
    <div><h2>Routed to (share)</h2><div class="panel"><div id="pie"></div></div></div>
    <div><h2>By method</h2><div class="panel"><div id="methods"></div></div></div>
  </div>

  <div class="grid2">
    <div><h2>Requests by country</h2><div class="panel"><div id="country"></div></div></div>
    <div><h2>Latency by provider</h2><div class="panel"><div id="latency"></div></div></div>
  </div>

  <h2>Request activity</h2>
  <div class="panel"><div id="calendar" class="cal-wrap"></div></div>

  <h2>Leaderboards</h2>
  <div class="panel">
    <div class="tabs" id="tabs">
      <button class="tab" data-t="method">Method</button>
      <button class="tab" data-t="provider">Routed to</button>
      <button class="tab" data-t="country">Country</button>
      <button class="tab" data-t="resolver">Resolver</button>
    </div>
    <table><thead><tr><th class="rank">#</th><th>Key</th><th class="num">Requests</th></tr></thead><tbody id="lb"></tbody></table>
  </div>

  <h2>Live requests</h2>
  <div class="panel">
    <table><thead><tr><th>DID</th><th>Routed to</th><th>Resolver</th><th>Geo</th><th>Status</th><th class="num">Latency</th><th class="num">When</th></tr></thead>
    <tbody id="recent"></tbody></table>
    <div style="text-align:center;margin-top:14px"><button id="older" class="older">Load older</button></div>
  </div>

  <div class="foot">Auto-refreshes every 10s · D1 event log + KV cache · <a href="/data">JSON API</a> · <a href="/docs">API docs</a></div>
</div>
<script>
(function(){
  var state = { range:'day', country:'', method:'', tab:'method', cursor:null, paged:false };
  var last = null;
  var PC = { ThisDID:'#d97757', GoPlausible:'#b587f0', godiddy:'#5fd0e0', archon:'#f0b968', NOT_FOUND:'#8b8375' };
  var PAL = ['#d97757','#e0724c','#cf7ea0','#b587f0','#8f8bf0','#5fd0e0','#57b96a','#f0b968','#d38f36','#a78bfa'];
  function pcolor(k){ return PC[k] || '#8b8375'; }
  function mcolor(i){ return PAL[i % PAL.length]; }
  function esc(s){ s=String(s==null?'':s); return s.replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];}); }
  function fmt(n){ return (n||0).toLocaleString('en-US'); }
  function q(id){ return document.getElementById(id); }
  function ago(ts,now){ var s=Math.max(0,Math.round((now-ts)/1000)); if(s<60)return s+'s'; if(s<3600)return Math.round(s/60)+'m'; if(s<86400)return Math.round(s/3600)+'h'; return Math.round(s/86400)+'d'; }
  function shortT(t){
    if(t.indexOf('T')>=0) return t.slice(11);      // hourly  2026-07-01T14:00 -> 14:00
    if(t.indexOf('-W')>=0) return t.slice(5);       // week    2026-W27 -> W27
    if(t.length===7) return t;                       // month   2026-07
    return t.slice(5);                               // day     2026-07-01 -> 07-01
  }

  function filterQS(){ var p='range='+encodeURIComponent(state.range); if(state.country)p+='&country='+encodeURIComponent(state.country); if(state.method)p+='&method='+encodeURIComponent(state.method); return p; }
  function api(){ return '/data?'+filterQS(); }

  function card(l,v,s){ return '<div class="stat"><div class="stat-v">'+v+'</div><div class="stat-l">'+esc(l)+'</div>'+(s?'<div class="stat-s">'+esc(s)+'</div>':'')+'</div>'; }

  function pie(rows){
    var total=rows.reduce(function(a,r){return a+r.count;},0);
    if(!total) return '<div class="empty">No data yet.</div>';
    var cx=70,cy=70,r=60,a=-Math.PI/2,out='';
    rows.forEach(function(row){
      var frac=row.count/total,a2=a+frac*2*Math.PI,col=pcolor(row.key);
      if(frac>0.9999){ out+='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+col+'"/>'; }
      else { var x1=cx+r*Math.cos(a),y1=cy+r*Math.sin(a),x2=cx+r*Math.cos(a2),y2=cy+r*Math.sin(a2),lg=frac>0.5?1:0;
        out+='<path d="M'+cx+','+cy+' L'+x1+','+y1+' A'+r+','+r+' 0 '+lg+' 1 '+x2+','+y2+' Z" fill="'+col+'"/>'; }
      a=a2;
    });
    var pct=function(c){ return Math.round(c/total*100); };
    var legend=rows.map(function(row){ return '<div class="lg"><span class="dot" style="background:'+pcolor(row.key)+'"></span>'+esc(row.key)+' <b>'+fmt(row.count)+'</b> ('+pct(row.count)+'%)</div>'; }).join('');
    return '<div class="pie-wrap"><svg viewBox="0 0 140 140" width="140" height="140">'+out+'<circle cx="70" cy="70" r="33" fill="var(--surface)"/></svg><div class="legend">'+legend+'</div></div>';
  }

  function timeline(tl){
    var pts=tl.points; if(!pts.length) return '<div class="empty">No data yet.</div>';
    var W=800,H=190,pad=26,n=pts.length;
    var max=Math.max.apply(null,pts.map(function(p){return p.count;}).concat([1]));
    function X(i){ return pad+(n<=1?(W-2*pad)/2:(i/(n-1))*(W-2*pad)); }
    function Y(v){ return H-pad-(v/max)*(H-2*pad); }
    var line='',err='',area='M'+X(0)+','+(H-pad)+' ',dots='';
    pts.forEach(function(p,i){ var x=X(i),y=Y(p.count); line+=(i?'L':'M')+x+','+y+' '; err+=(i?'L':'M')+x+','+Y(p.errors)+' '; area+='L'+x+','+y+' ';
      dots+='<circle cx="'+x+'" cy="'+y+'" r="3.5" fill="#d97757"/>';
      if(n<=6) dots+='<text x="'+x+'" y="'+(y-9)+'" class="ax" style="fill:var(--text)">'+fmt(p.count)+'</text>';
    });
    area+='L'+X(n-1)+','+(H-pad)+' Z';
    var idxs=[]; [0,Math.floor((n-1)/2),n-1].forEach(function(i){ if(i>=0&&i<n&&idxs.indexOf(i)<0)idxs.push(i); });
    var labels=idxs.map(function(i){ return '<text x="'+X(i)+'" y="'+(H-7)+'" class="ax">'+esc(shortT(pts[i].t))+'</text>'; }).join('');
    return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'"><path d="'+area+'" fill="rgba(217,119,87,0.14)"/><path d="'+line+'" fill="none" stroke="#d97757" stroke-width="2"/><path d="'+err+'" fill="none" stroke="#ff916a" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.75"/>'+dots+labels+'</svg>';
  }

  function vbars(rows){
    if(!rows.length) return '<div class="empty">No data yet.</div>';
    var top=rows.slice(0,10),max=Math.max.apply(null,top.map(function(r){return r.count;}).concat([1]));
    return '<div class="vbars">'+top.map(function(r,i){ var h=Math.max(4,Math.round(r.count/max*100)); return '<div class="vbar" title="'+esc(r.key)+': '+fmt(r.count)+'"><span style="height:'+h+'%;background:'+mcolor(i)+'"></span><em>'+esc(r.key)+'</em></div>'; }).join('')+'</div>';
  }

  function hbars(rows,colorFn){
    if(!rows.length) return '<div class="empty">No data yet.</div>';
    var max=Math.max.apply(null,rows.map(function(r){return r.count;}).concat([1]));
    return rows.slice(0,12).map(function(r){ var pct=Math.round(r.count/max*100); return '<div class="bar-row"><span class="bar-label" title="'+esc(r.key)+'">'+esc(r.key)+'</span><span class="bar-track"><span class="bar-fill" style="width:'+pct+'%;background:'+(colorFn?colorFn(r.key):'#d97757')+'"></span></span><span class="bar-count">'+fmt(r.count)+'</span></div>'; }).join('');
  }

  function latbars(rows){
    if(!rows.length) return '<div class="empty">No successful resolutions in range.</div>';
    var max=Math.max.apply(null,rows.map(function(r){return r.avgMs;}).concat([1]));
    return rows.map(function(r){ var pct=Math.round(r.avgMs/max*100); return '<div class="bar-row"><span class="bar-label" style="color:'+pcolor(r.key)+'">'+esc(r.key)+'</span><span class="bar-track"><span class="bar-fill" style="width:'+pct+'%;background:'+pcolor(r.key)+'"></span></span><span class="bar-count">'+fmt(r.avgMs)+' ms</span></div><div class="lat-sub">min '+fmt(r.minMs)+' · max '+fmt(r.maxMs)+' · n='+fmt(r.count)+'</div>'; }).join('');
  }

  function calendar(cal){
    if(!cal || !cal.length) return '<div class="empty">No request activity yet.</div>';
    var map={},max=0;
    for(var i=0;i<cal.length;i++){ map[cal[i].day]=cal[i].count; if(cal[i].count>max)max=cal[i].count; }
    var WEEKS=53,cell=11,gap=3,pitch=cell+gap,padL=30,padT=18;
    var today=new Date(); today.setHours(0,0,0,0);
    var start=new Date(today); start.setDate(start.getDate()-(WEEKS*7-1)); start.setDate(start.getDate()-start.getDay());
    var totalDays=Math.round((today-start)/86400000)+1;
    var cols=Math.ceil(totalDays/7);
    var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var COL=['var(--surface2)','rgba(217,119,87,0.30)','rgba(217,119,87,0.55)','rgba(217,119,87,0.82)','#ff916a'];
    function p2(n){ return n<10?'0'+n:''+n; }
    function iso(dt){ return dt.getFullYear()+'-'+p2(dt.getMonth()+1)+'-'+p2(dt.getDate()); }
    function lvl(c){ if(c<=0)return 0; if(max<=1)return 4; var qr=c/max; if(qr>0.75)return 4; if(qr>0.5)return 3; if(qr>0.25)return 2; return 1; }
    var rects='',months='',lastMonth=-1;
    for(var dd=0; dd<totalDays; dd++){
      var dt=new Date(start); dt.setDate(start.getDate()+dd);
      var col=Math.floor(dd/7),row=dt.getDay(),ds=iso(dt),c=map[ds]||0;
      var x=padL+col*pitch,y=padT+row*pitch;
      rects+='<rect x="'+x+'" y="'+y+'" width="'+cell+'" height="'+cell+'" rx="2" fill="'+COL[lvl(c)]+'"><title>'+c+' request'+(c===1?'':'s')+' · '+ds+'</title></rect>';
      if(row===0){ var m=dt.getMonth(); if(m!==lastMonth){ months+='<text x="'+x+'" y="'+(padT-6)+'" class="cal-m">'+MON[m]+'</text>'; lastMonth=m; } }
    }
    var dows='';
    [['Mon',1],['Wed',3],['Fri',5]].forEach(function(p){ dows+='<text x="0" y="'+(padT+p[1]*pitch+cell-1)+'" class="cal-d">'+p[0]+'</text>'; });
    var svgW=padL+cols*pitch, svgH=padT+7*pitch+2;
    var legend='<div class="cal-legend">Less'+COL.map(function(c){ return '<span class="cal-cell" style="background:'+c+'"></span>'; }).join('')+'More</div>';
    return '<svg viewBox="0 0 '+svgW+' '+svgH+'" width="'+svgW+'" height="'+svgH+'">'+months+dows+rects+'</svg>'+legend;
  }

  function leaderboard(d){
    var map={method:d.byMethod,provider:d.byProvider,country:d.byCountry,resolver:d.byResolver};
    var rows=map[state.tab]||[];
    if(!rows.length) return '<tr><td colspan="3" class="empty">No data yet.</td></tr>';
    return rows.map(function(r,i){ return '<tr><td class="rank">'+(i+1)+'</td><td>'+esc(r.key)+'</td><td class="num">'+fmt(r.count)+'</td></tr>'; }).join('');
  }

  function recentRows(rows,now){
    if(!rows.length) return '';
    return rows.map(function(r){ return '<tr><td class="mono did" title="'+esc(r.did)+'">'+esc(r.did)+'</td><td><span class="pill" style="--c:'+pcolor(r.provider)+'">'+esc(r.provider||'—')+'</span></td><td class="mono dim">'+esc(r.resolver||'—')+'</td><td>'+esc(r.country||'—')+'</td><td>'+(r.success?'<span class="ok">ok</span>':'<span class="err">'+esc(r.error||'error')+'</span>')+'</td><td class="mono num">'+fmt(r.durationMs)+' ms</td><td class="dim num">'+ago(r.ts,now)+'</td></tr>'; }).join('');
  }
  function updateOlder(){ var b=q('older'); if(state.cursor){ b.style.display='inline-block'; b.disabled=false; b.textContent='Load older'; } else { b.style.display='none'; } }
  function loadOlder(){
    if(!state.cursor) return;
    var b=q('older'); b.disabled=true; b.textContent='Loading…';
    fetch('/recent?before='+encodeURIComponent(state.cursor)+'&'+filterQS(),{headers:{accept:'application/json'}})
      .then(function(r){return r.json();})
      .then(function(d){ state.paged=true; q('recent').insertAdjacentHTML('beforeend', recentRows(d.recent,Date.now())); state.cursor=d.nextCursor; updateOlder(); })
      .catch(function(){ updateOlder(); });
  }

  function fillSelect(el,values,cur,allLabel){
    var html='<option value="">'+allLabel+'</option>';
    for(var i=0;i<values.length;i++){ var v=values[i]; html+='<option value="'+esc(v)+'"'+(v===cur?' selected':'')+'>'+esc(v)+'</option>'; }
    el.innerHTML=html;
  }

  function setActive(sel,attr,val){ var els=document.querySelectorAll(sel); for(var i=0;i<els.length;i++){ els[i].classList.toggle('on', els[i].getAttribute(attr)===val); } }

  function render(d){
    q('setup').style.display=d.configured?'none':'block';
    q('kpis').innerHTML=card('Total',fmt(d.totals.liveTotal))+card('Success',fmt(d.totals.success),d.totals.successRate+'%')+card('Failure',fmt(d.totals.errors))+card('Total latency',fmt(d.totals.latencyTotalMs)+' ms')+card('Avg latency',fmt(d.totals.latencyAvgMs)+' ms');
    q('timeline').innerHTML=timeline(d.timeline);
    q('pie').innerHTML=pie(d.byProvider);
    q('methods').innerHTML=vbars(d.byMethod);
    q('country').innerHTML=hbars(d.byCountry,function(){return '#b587f0';});
    q('latency').innerHTML=latbars(d.latencyByProvider);
    q('calendar').innerHTML=calendar(d.calendar);
    q('lb').innerHTML=leaderboard(d);
    if(!state.paged){
      q('recent').innerHTML = d.recent.length ? recentRows(d.recent,Date.now()) : '<tr><td colspan="7" class="empty">No resolutions recorded yet.</td></tr>';
      state.cursor = d.recentCursor;
      updateOlder();
    }
    fillSelect(q('fcountry'),d.options.countries,state.country,'All countries');
    fillSelect(q('fmethod'),d.options.methods,state.method,'All methods');
    setActive('.range-btn','data-r',state.range);
    setActive('.tab','data-t',state.tab);
  }

  function sk(h,w,st){ return '<div class="skel" style="height:'+h+'px'+(w?';width:'+w:'')+(st?';'+st:'')+'"></div>'; }
  function skBars(n){
    var out='',ws=[88,64,46,72,34,52];
    for(var i=0;i<n;i++) out+='<div class="bar-row"><span class="skel" style="height:11px;width:'+(i%2?72:96)+'px;flex:none"></span><span class="bar-track"><span class="bar-fill skel" style="width:'+ws[i%ws.length]+'%"></span></span><span class="skel" style="height:11px;width:42px;flex:none"></span></div>';
    return out;
  }
  function skTable(cols,rows){
    var out='',ws=[86,64,78,52,70,58];
    for(var i=0;i<rows;i++) out+='<tr><td colspan="'+cols+'">'+sk(13,ws[i%ws.length]+'%')+'</td></tr>';
    return out;
  }
  function skeletons(){
    var cards=''; for(var i=0;i<5;i++) cards+='<div class="stat">'+sk(24,'68%','margin:4px 0')+sk(10,'52%','margin-top:12px')+'</div>';
    q('kpis').innerHTML=cards;
    q('timeline').innerHTML=sk(190);
    q('pie').innerHTML='<div class="pie-wrap"><div class="skel" style="width:140px;height:140px;border-radius:50%;flex:none"></div><div class="legend" style="flex:1;min-width:120px">'+sk(12,'78%')+sk(12,'60%','margin-top:10px')+sk(12,'68%','margin-top:10px')+'</div></div>';
    var vb='',hs=[55,85,40,70,52,92,34,62,46,76];
    for(var i=0;i<10;i++) vb+='<div class="vbar"><span class="skel" style="height:'+hs[i]+'%"></span><em><span class="skel" style="display:inline-block;height:9px;width:26px"></span></em></div>';
    q('methods').innerHTML='<div class="vbars">'+vb+'</div>';
    q('country').innerHTML=skBars(6);
    q('latency').innerHTML=skBars(4);
    q('calendar').innerHTML=sk(130);
    q('lb').innerHTML=skTable(3,5);
    q('recent').innerHTML=skTable(7,6);
    q('older').style.display='none';
  }
  function load(fresh){
    q('bar').classList.add('on');
    if(fresh) skeletons();
    fetch(api(),{headers:{accept:'application/json'}})
      .then(function(r){return r.json();})
      .then(function(d){ last=d; render(d); })
      .catch(function(){ if(last) render(last); })
      .then(function(){ q('bar').classList.remove('on'); });
  }

  function refilter(){ state.paged=false; state.cursor=null; load(true); }
  q('ranges').addEventListener('click',function(e){ var b=e.target.closest('.range-btn'); if(!b)return; state.range=b.getAttribute('data-r'); refilter(); });
  q('tabs').addEventListener('click',function(e){ var b=e.target.closest('.tab'); if(!b)return; state.tab=b.getAttribute('data-t'); if(last){ q('lb').innerHTML=leaderboard(last); setActive('.tab','data-t',state.tab); } });
  q('fcountry').addEventListener('change',function(e){ state.country=e.target.value; refilter(); });
  q('fmethod').addEventListener('change',function(e){ state.method=e.target.value; refilter(); });
  q('older').addEventListener('click',loadOlder);

  load(true);
  setInterval(function(){ load(false); },10000);
})();
</script>
</body></html>`;
}
