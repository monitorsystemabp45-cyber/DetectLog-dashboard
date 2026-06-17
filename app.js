/* DetectLog — app.js */

/* ═══════════════════════════════
   CONFIG
═══════════════════════════════ */
const DEFAULT_URL = "https://script.google.com/macros/s/AKfycbw9OF0VE6xTsH2qyKqGbsScNx6vVbJoQ9mWuG69SrEdaTIr4cuzxkQe8d024YqhQkAI/exec";
let webAppURL    = localStorage.getItem('dashURL') || DEFAULT_URL;
let autoInterval = parseInt(localStorage.getItem('dashInt') || '30000');
let timer        = null;

document.getElementById('urlInp').value = webAppURL;
document.getElementById('intSel').value = autoInterval;

function saveConfig(){
  webAppURL    = document.getElementById('urlInp').value.trim();
  autoInterval = parseInt(document.getElementById('intSel').value);
  localStorage.setItem('dashURL', webAppURL);
  localStorage.setItem('dashInt', autoInterval);
  startTimer(); fetchAll();
}

let allHistory = [];
let deviceList = [];

const SW_COLORS = ['#F47B20','#2B7FD4','#2E9B5A','#9B3DD4'];
const ACTIVE_TIMEOUT_MS = 5 * 60 * 1000;

/* ── Theme ── */
const savedTheme = localStorage.getItem('dashTheme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeIcons(savedTheme);

function updateThemeIcons(t){
  const icon = t==='dark' ? 'sun' : 'moon';
  ['themeIcon','themeIconMobile'].forEach(id=>{
    const el = document.getElementById(id);
    if(el){ el.setAttribute('data-lucide', icon); }
  });
  if(window.lucide) lucide.createIcons();
}

function toggleTheme(){
  const next = document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  updateThemeIcons(next);
  localStorage.setItem('dashTheme',next);
  destroyCharts(); renderCharts();
  closeDrawer();
}

/* ── Mobile drawer ── */
function openDrawer(){
  document.getElementById('mobileDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}
function closeDrawer(){
  document.getElementById('mobileDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

/* ═══════════════════════════════════════
   SPA PAGE NAVIGATION
═══════════════════════════════════════ */
const PAGE_CONFIG = {
  dashboard: { title:'ภาพรวมระบบ',     sub:'Security Monitoring Dashboard', showRefresh:true  },
  mode:      { title:'โหมดการทำงาน',   sub:'ตั้งค่าโหมดการทำงานของ Relay',  showRefresh:false },
  wifi:      { title:'WiFi สำรอง',      sub:'ตั้งค่า WiFi สำรองแต่ละบอร์ด', showRefresh:false },
  settings:  { title:'ตั้งค่าขั้นสูง', sub:'General · Schedule · ประวัติ', showRefresh:false },
};

let currentPage = 'dashboard';

function goPage(page, btn) {
  if (currentPage === page) return;

  // ซ่อนทุก page
  document.querySelectorAll('.page-view').forEach(el => {
    el.style.display = 'none';
    el.classList.remove('active','fade-in');
  });

  // แสดง page ใหม่
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) {
    pageEl.style.display = 'block';
    pageEl.classList.add('active');
  }

  currentPage = page;

  // อัป topbar
  const cfg = PAGE_CONFIG[page] || PAGE_CONFIG.dashboard;
  const titleEl = document.getElementById('topbarTitle');
  const subEl   = document.getElementById('topbarSub');
  const refreshBtn = document.getElementById('topbarRefreshBtn');
  if (titleEl) titleEl.textContent = cfg.title;
  if (subEl)   subEl.textContent   = cfg.sub;
  if (refreshBtn) refreshBtn.style.display = cfg.showRefresh ? '' : 'none';

  // อัป sidebar active
  document.querySelectorAll('.sidebar .nav-item').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else {
    const tipMap = { mode:'โหมดการทำงาน', wifi:'WiFi สำรอง', settings:'ตั้งค่าขั้นสูง' };
    const tip = tipMap[page];
    if (tip) {
      const found = document.querySelector('.sidebar .nav-item[data-tip="'+tip+'"]');
      if (found) found.classList.add('active');
    }
  }

  // scroll main กลับบนสุด
  const main = document.querySelector('.main');
  if (main) main.scrollTo({ top:0, behavior:'smooth' });

  // โหลด data เฉพาะหน้า
  if (page === 'wifi')     renderBackupWifiGrid();
  if (page === 'settings') { fetchAdvSettings(); fetchSchedule(); }
  if (page === 'mode')     fetchRelayMode();

  if (window.lucide) lucide.createIcons();
}

function mobileGoPage(page) {
  closeDrawer();
  setTimeout(() => goPage(page), 220);
}

// Navigate to a dashboard section from mobile drawer
function mobileNavTo(sectionId) {
  closeDrawer();
  setTimeout(() => {
    // ถ้าอยู่หน้าอื่นอยู่ ให้ switch กลับ dashboard ก่อน
    if (currentPage !== 'dashboard') {
      document.querySelectorAll('.page-view').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active', 'fade-in');
      });
      const dashEl = document.getElementById('page-dashboard');
      if (dashEl) { dashEl.style.display = 'block'; dashEl.classList.add('active'); }
      currentPage = 'dashboard';
      const cfg = PAGE_CONFIG.dashboard;
      const titleEl = document.getElementById('topbarTitle');
      const subEl   = document.getElementById('topbarSub');
      const refreshBtn = document.getElementById('topbarRefreshBtn');
      if (titleEl) titleEl.textContent = cfg.title;
      if (subEl)   subEl.textContent   = cfg.sub;
      if (refreshBtn) refreshBtn.style.display = '';
    }
    // mark drawer nav active
    document.querySelectorAll('.mobile-drawer .nav-item').forEach(el => el.classList.remove('active'));
    const idx = ['top','sec-floorplan','sec-stats','sec-log'].indexOf(sectionId);
    const items = document.querySelectorAll('.mobile-drawer .nav-item');
    if (idx >= 0 && items[idx]) items[idx].classList.add('active');

    // scroll ไปหา section
    const main = document.querySelector('.main');
    if (!main) return;
    if (sectionId === 'top') { main.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const el = document.getElementById(sectionId);
    if (!el) return;
    const topbar = document.querySelector('.topbar');
    const mobileHeader = document.querySelector('.mobile-header');
    const offset = (topbar ? topbar.offsetHeight : 0) + (mobileHeader ? mobileHeader.offsetHeight : 0) + 8;
    main.scrollTo({ top: el.offsetTop - offset, behavior: 'smooth' });
  }, 250);
}

// override navTo สำหรับ dashboard sections (scroll เหมือนเดิม)
function navTo(sectionId, btn) {
  // ถ้าไม่ได้อยู่หน้า dashboard ให้ไปที่ dashboard ก่อน
  if (currentPage !== 'dashboard') {
    document.querySelectorAll('.page-view').forEach(el => {
      el.style.display = 'none';
      el.classList.remove('active','fade-in');
    });
    const dashEl = document.getElementById('page-dashboard');
    if (dashEl) { dashEl.style.display = 'block'; dashEl.classList.add('active'); }
    currentPage = 'dashboard';
    const cfg = PAGE_CONFIG.dashboard;
    const titleEl = document.getElementById('topbarTitle');
    const subEl   = document.getElementById('topbarSub');
    const refreshBtn = document.getElementById('topbarRefreshBtn');
    if (titleEl) titleEl.textContent = cfg.title;
    if (subEl)   subEl.textContent   = cfg.sub;
    if (refreshBtn) refreshBtn.style.display = '';
  }

  document.querySelectorAll('.sidebar .nav-item').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const main = document.querySelector('.main');
  if (sectionId === 'top') { main.scrollTo({top:0,behavior:'smooth'}); return; }
  const el = document.getElementById(sectionId);
  if (!el) return;
  const topbar = document.querySelector('.topbar');
  const offset = topbar ? topbar.offsetHeight + 8 : 8;
  main.scrollTo({top: el.offsetTop - offset, behavior:'smooth'});
}
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const collapsed = sb.classList.toggle('collapsed');
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem('sidebarCollapsed', collapsed?'1':'0');
  if(window.lucide) lucide.createIcons();
}
(function initSidebar(){
  if(localStorage.getItem('sidebarCollapsed')==='1'){
    document.getElementById('sidebar').classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
  }
})();

/* ── Write boards ── */
function getWriteBoards(){
  const seen=new Set(); const boards=[];
  deviceList.filter(d=>d.mac_write).forEach(d=>{
    if(!seen.has(d.mac_write)){seen.add(d.mac_write);boards.push(d);}
  });
  allHistory.forEach(r=>{
    if(r.mac_write&&!seen.has(r.mac_write)){
      seen.add(r.mac_write);
      boards.push({mac_write:r.mac_write,mac_read:'',label:'',last_seen_write:null});
    }
  });
  return boards;
}

let histMode='all', dailyMode='all', uptimeRange='all';
let histChartObj=null, dailyChartObj=null, uptimeChartObj=null;

function destroyCharts(){
  if(histChartObj){histChartObj.destroy();histChartObj=null;}
  if(dailyChartObj){dailyChartObj.destroy();dailyChartObj=null;}
  if(uptimeChartObj){uptimeChartObj.destroy();uptimeChartObj=null;}
}

function cc(){
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  return{
    grid:dark?'#2E2C28':'#EEECE8',
    text:dark?'#615E59':'#8F8C88',
    tbg:dark?'#1A1917':'#fff',
    tborder:dark?'#2E2C28':'#E4E2DE',
    ttitle:dark?'#F0EDE8':'#19171A',
    tbody:dark?'#615E59':'#8F8C88'
  };
}

function loadLocalMap(){try{return JSON.parse(localStorage.getItem('devMap')||'{}')}catch{return{}}}
function saveLocalMap(m){localStorage.setItem('devMap',JSON.stringify(m));}

function getDeviceInfo(boardIdx){
  const boards=getWriteBoards();
  const board=boards[boardIdx]||{};
  const macWrite=board.mac_write||'';
  const devEntry=deviceList.find(d=>d.mac_write===macWrite)||{};
  const gasReadMac=devEntry.mac_read||'';
  const gasLabel=devEntry.label||'';
  const lm=loadLocalMap()['board'+(boardIdx+1)]||{};
  const macRead=lm.readMac||gasReadMac;
  const label=lm.label||gasLabel;
  return{macWrite,macRead,label};
}

function filterDays(rows,days){
  if(days==='all') return rows;
  const cut=Date.now()-parseInt(days)*86400000;
  return rows.filter(r=>r.t>=cut);
}

function calcBoardStats(macWrite,allRows){
  const detectRows=allRows.filter(r=>r.mac_write===macWrite&&r.trigger==='detect');
  const today=new Date(); today.setHours(0,0,0,0);
  const todayCount=detectRows.filter(r=>{const d=new Date(r.t);d.setHours(0,0,0,0);return d.getTime()===today.getTime();}).length;
  const dayMap={};
  detectRows.forEach(r=>{const dk=new Date(r.t).toLocaleDateString('th-TH');dayMap[dk]=(dayMap[dk]||0)+1;});
  let maxDay='—',maxDayCnt=0;
  Object.entries(dayMap).forEach(([d,c])=>{if(c>maxDayCnt){maxDayCnt=c;maxDay=d;}});
  const pct=maxDayCnt?Math.round(todayCount/maxDayCnt*100):0;
  const lastDet=detectRows.length?new Date(detectRows[detectRows.length-1].t):null;
  return{total:detectRows.length,todayCount,maxDay,maxDayCnt,pct,lastDet};
}

function calcDailyDetect(rows){
  const detectRows=rows.filter(r=>r.trigger==='detect');
  const days={};
  const boards=getWriteBoards();
  detectRows.forEach(r=>{
    const dk=new Date(r.t).toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit'});
    if(!days[dk])days[dk]={};
    boards.forEach((b,i)=>{if(!days[dk]['b'+i])days[dk]['b'+i]=0;if(r.mac_write===b.mac_write)days[dk]['b'+i]++;});
  });
  return days;
}

function formatLastSeen(ts){
  if(!ts) return 'ไม่มีข้อมูล';
  const diff=Date.now()-ts;
  const sec=Math.floor(diff/1000);
  const min=Math.floor(diff/60000);
  if(sec<60) return sec+'s ago';
  if(min<60) return min+'m ago';
  const hr=Math.floor(min/60);
  if(hr<24) return hr+'h ago';
  return Math.floor(hr/24)+'d ago';
}

async function fetchHistory(){
  const r=await fetch(webAppURL+'?sts=history');
  const t=await r.text();
  if(t.startsWith('ERROR')) throw new Error(t);
  return JSON.parse(t);
}
async function fetchDevices(){
  try{const r=await fetch(webAppURL+'?sts=devices');const t=await r.text();return JSON.parse(t);}catch{return[];}
}

function boardName(i){return 'WRITE '+String.fromCharCode(65+i);}

/* ── RENDER CARDS ── */
function renderCards(){
  const boards=getWriteBoards();
  if(!boards.length){document.getElementById('swGrid').innerHTML='<div class="loading-text">ไม่มีข้อมูล Write board</div>';return;}

  document.getElementById('swGrid').innerHTML=boards.slice(0,4).map((b,i)=>{
    const col=SW_COLORS[i];
    const dev=getDeviceInfo(i);
    const s=calcBoardStats(b.mac_write,allHistory);
    const name=boardName(i);
    const devEntry=deviceList.find(d=>d.mac_write===b.mac_write)||{};
    const lastSeen=devEntry.last_seen_write||null;
    const isActive=lastSeen?(Date.now()-lastSeen<ACTIVE_TIMEOUT_MS):false;
    const lastSeenTxt=formatLastSeen(lastSeen);

    const writeMacEl=dev.macWrite?`<span class="mac-val">${dev.macWrite}</span>`:`<span class="mac-empty">ไม่มีข้อมูล</span>`;
    const readMacEl=dev.macRead?`<span class="mac-val">${dev.macRead}</span>`:`<span class="mac-empty">ยังไม่ได้กรอก</span>`;

    return `
    <div class="device-card ${isActive?'active':''}" style="--col:${col};" onclick="openModal(${i})">
      <div class="card-head">
        <div>
          <div class="card-id-row">
            <span class="card-badge" style="background:${col}18;color:${col};">${name}</span>
            ${dev.label?`<span style="font-size:11px;color:var(--muted);">${dev.label}</span>`:''}
          </div>
        </div>
        <div class="card-icon">
          <i data-lucide="zap"></i>
        </div>
      </div>

      <div class="card-status">
        <div class="card-status-dot" style="background:${isActive?col:'var(--off)'};"></div>
        <span class="card-status-text" style="color:${isActive?col:'var(--muted)'};">${isActive?'ACTIVE':'OFFLINE'}</span>
        <span class="card-lastseen">${lastSeenTxt}</span>
      </div>

      <div class="card-bar">
        <div class="card-bar-fill" style="width:${s.pct}%;background:${col};"></div>
      </div>

      <div class="card-stats">
        <div class="stat-item">
          <div class="stat-item-label">Detect รวม</div>
          <div class="stat-item-val">${s.total}<span style="font-size:11px;font-weight:400;color:var(--muted);margin-left:2px;">ครั้ง</span></div>
        </div>
        <div class="stat-item">
          <div class="stat-item-label">วันนี้</div>
          <div class="stat-item-val accent" style="--col:${col};">${s.todayCount}<span style="font-size:11px;font-weight:400;color:var(--muted);margin-left:2px;">ครั้ง</span></div>
        </div>
        <div class="stat-item">
          <div class="stat-item-label">สูงสุด/วัน</div>
          <div class="stat-item-val">${s.maxDayCnt}<span style="font-size:11px;font-weight:400;color:var(--muted);margin-left:2px;">ครั้ง</span></div>
        </div>
        <div class="stat-item">
          <div class="stat-item-label">วันที่สูงสุด</div>
          <div class="stat-item-val" style="font-size:12px;">${s.maxDay}</div>
        </div>
      </div>

      <div class="card-mac">
        <div class="mac-row"><span class="mac-badge mac-badge-w">WRITE</span>${writeMacEl}</div>
        <div class="mac-row"><span class="mac-badge mac-badge-r">READ</span>${readMacEl}</div>
      </div>
    </div>`;
  }).join('');
  if(window.lucide) lucide.createIcons();
}

function renderSummary(){
  const boards=getWriteBoards();
  document.getElementById('sumGrid').innerHTML=boards.slice(0,4).map((b,i)=>{
    const col=SW_COLORS[i];
    const dev=getDeviceInfo(i);
    const s=calcBoardStats(b.mac_write,allHistory);
    const name=boardName(i);
    const label=dev.label?(' · '+dev.label):'';
    return `
    <div class="sum-tile" style="--col:${col};">
      <div class="sum-board">${name}${label}</div>
      <div><span class="sum-num">${s.todayCount}</span><span class="sum-unit">วันนี้</span></div>
      <div class="sum-meta">
        <div class="sum-row">รวม <strong>${s.total} ครั้ง</strong></div>
        <div class="sum-row">สูงสุด/วัน <strong>${s.maxDayCnt}</strong></div>
        <div class="sum-row" style="font-size:9px;">วันสูงสุด <strong style="font-size:9px;">${s.maxDay}</strong></div>
      </div>
    </div>`;
  }).join('');
}

/* ── CHARTS ── */
function setUptimeRange(r,btn){
  uptimeRange=r;
  document.querySelectorAll('#uptimeTabs .tab-btn').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  if(uptimeChartObj){uptimeChartObj.destroy();uptimeChartObj=null;}
  renderUptimeChart();
}

function renderUptimeChart(){
  const c=cc();
  const rows=filterDays(allHistory.filter(r=>r.trigger==='detect'),uptimeRange);
  const boards=getWriteBoards();
  const labels=boards.slice(0,4).map((_,i)=>boardName(i)+(getDeviceInfo(i).label?'\n'+getDeviceInfo(i).label:''));
  const counts=boards.slice(0,4).map(b=>rows.filter(r=>r.mac_write===b.mac_write).length);
  const cfg={
    type:'bar',
    data:{labels,datasets:[{
      label:'จำนวน detect',data:counts,
      backgroundColor:SW_COLORS.slice(0,boards.length).map(x=>x+'cc'),
      borderColor:SW_COLORS.slice(0,boards.length),borderWidth:1,borderRadius:4
    }]},
    options:{responsive:true,animation:false,indexAxis:'y',
      scales:{
        x:{ticks:{color:c.text,font:{family:'IBM Plex Mono',size:10},stepSize:1},grid:{color:c.grid}},
        y:{ticks:{color:c.text,font:{family:'IBM Plex Mono',size:11}},grid:{display:false}}
      },
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:c.tbg,borderColor:c.tborder,borderWidth:1,titleColor:c.ttitle,bodyColor:c.tbody,
          callbacks:{label:ctx=>` ${ctx.raw} ครั้ง`}}}}
  };
  if(uptimeChartObj){uptimeChartObj.destroy();}
  uptimeChartObj=new Chart(document.getElementById('uptimeChart').getContext('2d'),cfg);
}

function setHistMode(m,btn){
  histMode=m;
  document.querySelectorAll('#histTabs .tab-btn').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  if(histChartObj){histChartObj.destroy();histChartObj=null;}
  renderHistChart();
}
function clearDate(){document.getElementById('filterDate').value='';renderHistChart();}

function renderHistChart(){
  const c=cc();
  const fd=document.getElementById('filterDate').value;
  let rows=allHistory.filter(r=>r.trigger==='detect');
  if(fd){const d=new Date(fd);rows=rows.filter(r=>new Date(r.t).toDateString()===d.toDateString());}
  const boards=getWriteBoards();
  const labels=rows.map(r=>new Date(r.t).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}));
  let datasets;
  if(histMode==='all'){
    datasets=boards.slice(0,4).map((b,i)=>({
      label:boardName(i),data:rows.map(r=>r.mac_write===b.mac_write?1:0),
      borderColor:SW_COLORS[i],backgroundColor:SW_COLORS[i]+'22',
      fill:true,tension:.3,pointRadius:2,borderWidth:1.5
    }));
  }else{
    const i=parseInt(histMode);const b=boards[i]||{};
    datasets=[{label:boardName(i),data:rows.map(r=>r.mac_write===b.mac_write?1:0),
      borderColor:SW_COLORS[i],backgroundColor:SW_COLORS[i]+'33',
      fill:true,tension:.3,pointRadius:2,borderWidth:2}];
  }
  const cfg={type:'line',data:{labels,datasets},options:{responsive:true,animation:false,
    scales:{
      x:{ticks:{color:c.text,font:{family:'IBM Plex Mono',size:10},maxTicksLimit:12},grid:{color:c.grid}},
      y:{min:-.1,max:1.1,ticks:{color:c.text,callback:v=>v===1?'⚡':v===0?'—':'',font:{family:'IBM Plex Mono',size:10}},grid:{color:c.grid}}
    },
    plugins:{legend:{labels:{color:c.text,font:{family:'IBM Plex Mono',size:11},boxWidth:12}},
      tooltip:{backgroundColor:c.tbg,borderColor:c.tborder,borderWidth:1,titleColor:c.ttitle,bodyColor:c.tbody,
        callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.raw===1?'detect':''}`}}}}};
  if(histChartObj){histChartObj.destroy();}
  histChartObj=new Chart(document.getElementById('histChart').getContext('2d'),cfg);
}

function setDailyMode(m,btn){
  dailyMode=m;
  document.querySelectorAll('#dailyTabs .tab-btn').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  if(dailyChartObj){dailyChartObj.destroy();dailyChartObj=null;}
  renderDailyChart();
}

function renderDailyChart(){
  const c=cc();
  const days=calcDailyDetect(allHistory);
  const lbls=Object.keys(days).sort();
  const boards=getWriteBoards();
  let datasets;
  if(dailyMode==='all'){
    datasets=boards.slice(0,4).map((b,i)=>({
      label:boardName(i),data:lbls.map(d=>(days[d]['b'+i]||0)),
      backgroundColor:SW_COLORS[i]+'99',borderColor:SW_COLORS[i],borderWidth:1,borderRadius:4
    }));
  }else{
    const i=parseInt(dailyMode);
    datasets=[{label:boardName(i),data:lbls.map(d=>(days[d]['b'+i]||0)),
      backgroundColor:SW_COLORS[i]+'99',borderColor:SW_COLORS[i],borderWidth:1,borderRadius:4}];
  }
  const cfg={type:'bar',data:{labels:lbls,datasets},options:{responsive:true,animation:false,
    scales:{x:{ticks:{color:c.text,font:{family:'IBM Plex Mono',size:10}},grid:{color:c.grid}},
      y:{ticks:{color:c.text,font:{family:'IBM Plex Mono',size:10},stepSize:1},grid:{color:c.grid}}},
    plugins:{legend:{labels:{color:c.text,font:{family:'IBM Plex Mono',size:11},boxWidth:12}},
      tooltip:{backgroundColor:c.tbg,borderColor:c.tborder,borderWidth:1,titleColor:c.ttitle,bodyColor:c.tbody}}}};
  if(dailyChartObj){dailyChartObj.destroy();}
  dailyChartObj=new Chart(document.getElementById('dailyChart').getContext('2d'),cfg);
}

function clearLogDate(){document.getElementById('logDate').value='';renderLog();}

function renderLog(){
  const wrap=document.getElementById('logWrap');
  const fd=document.getElementById('logDate').value;
  let rows=[...allHistory].reverse();
  if(fd){const d=new Date(fd);rows=rows.filter(r=>new Date(r.t).toDateString()===d.toDateString());}
  else{rows=rows.slice(0,15);}
  if(!rows.length){wrap.innerHTML='<div class="loading-text">ไม่มีข้อมูล</div>';return;}
  const boards=getWriteBoards();
  const boardLabel=mac=>{const i=boards.findIndex(b=>b.mac_write===mac);return i>=0?boardName(i):mac.slice(-8);};
  wrap.innerHTML=`<div class="log-scroll"><table class="log-table">
    <thead><tr>
      <th>วันที่</th><th>เวลา</th>
      <th>Write Board</th><th>MAC Write</th>
      <th>MAC Read</th><th>Trigger</th>
    </tr></thead>
    <tbody>${rows.map(r=>{
      const d=new Date(r.t);
      const isDetect=r.trigger==='detect';
      const trigBadge=isDetect
        ?`<span class="badge badge-detect">⚡ DETECT</span>`
        :`<span class="badge badge-hb">HB</span>`;
      return `<tr>
        <td>${d.toLocaleDateString('th-TH')}</td>
        <td>${d.toLocaleTimeString('th-TH')}</td>
        <td>${boardLabel(r.mac_write)}</td>
        <td>${r.mac_write||'—'}</td>
        <td>${r.mac_read||'—'}</td>
        <td>${trigBadge}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/* ── Modal ── */
let modalIdx=-1;
function openModal(i){
  modalIdx=i;const col=SW_COLORS[i];const dev=getDeviceInfo(i);
  const lm=loadLocalMap()['board'+(i+1)]||{};
  document.getElementById('modalTitle').textContent=lm.label||dev.label||'Device Info';
  const pill=document.getElementById('modalPill');
  pill.textContent=boardName(i);
  pill.style.cssText=`background:${col}18;color:${col};border:1px solid ${col}44;`;
  const wm=document.getElementById('mWriteMacDisp');
  wm.textContent=dev.macWrite||'ยังไม่มีข้อมูลใน Sheets';
  wm.className='info-block-val'+(dev.macWrite?'':' empty');
  document.getElementById('mWriteMacInp').value=dev.macWrite;
  document.getElementById('savedNote').style.display='none';
  const rm=document.getElementById('mReadMac');
  rm.textContent=dev.macRead||'ยังไม่ได้กรอก';
  rm.className='info-block-val'+(dev.macRead?'':' empty');
  document.getElementById('mReadMacInp').value=dev.macRead;
  document.getElementById('savedNoteRead').style.display='none';
  document.getElementById('mLblInp').value=lm.label||dev.label||'';
  document.getElementById('modalOv').classList.add('open');
}
function closeModal(){document.getElementById('modalOv').classList.remove('open');}
function closeModalBg(e){if(e.target===document.getElementById('modalOv'))closeModal();}

function saveWriteMac(){
  const val=document.getElementById('mWriteMacInp').value.trim().toUpperCase();
  const map=loadLocalMap();const key='board'+(modalIdx+1);
  if(!map[key])map[key]={};map[key].writeMac=val;saveLocalMap(map);
  document.getElementById('mWriteMacDisp').textContent=val||'ยังไม่มีข้อมูลใน Sheets';
  document.getElementById('mWriteMacDisp').className='info-block-val'+(val?'':' empty');
  const note=document.getElementById('savedNote');note.style.display='block';
  setTimeout(()=>note.style.display='none',2000);renderCards();
}
function saveReadMac(){
  const val=document.getElementById('mReadMacInp').value.trim().toUpperCase();
  const map=loadLocalMap();const key='board'+(modalIdx+1);
  if(!map[key])map[key]={};map[key].readMac=val;saveLocalMap(map);
  document.getElementById('mReadMac').textContent=val||'ยังไม่ได้กรอก';
  document.getElementById('mReadMac').className='info-block-val'+(val?'':' empty');
  const note=document.getElementById('savedNoteRead');note.style.display='block';
  setTimeout(()=>note.style.display='none',2000);renderCards();
}
function saveLabel(){
  const val=document.getElementById('mLblInp').value.trim();
  const map=loadLocalMap();const key='board'+(modalIdx+1);
  if(!map[key])map[key]={};map[key].label=val;saveLocalMap(map);
  document.getElementById('modalTitle').textContent=val||'Device Info';
  renderCards();renderSummary();
}

/* ── Status / Fetch ── */
function showErr(msg){const e=document.getElementById('errMsg');e.style.display=msg?'block':'none';e.textContent=msg;}
function setStatus(s){
  const col={ok:'var(--accent)',loading:'#F4C020',error:'var(--danger)'}[s];
  ['statusDot','statusDotMobile'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.background=col;});
}

document.getElementById('filterDate').addEventListener('change',renderHistChart);
document.getElementById('logDate').addEventListener('change',renderLog);

function renderCharts(){renderUptimeChart();renderHistChart();renderDailyChart();}



/* ═══════════════════════════════════════
   SCHEDULE
═══════════════════════════════════════ */
const DAY_NAMES = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์'];
const DAY_SHORT = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
let currentSchedule = [
  {day:0,enabled:true, start:'00:00',end:'23:59',relay_timeout:15,poll_interval:35},
  {day:1,enabled:true, start:'17:30',end:'05:30',relay_timeout:15,poll_interval:35},
  {day:2,enabled:true, start:'17:30',end:'05:30',relay_timeout:15,poll_interval:35},
  {day:3,enabled:true, start:'17:30',end:'05:30',relay_timeout:15,poll_interval:35},
  {day:4,enabled:true, start:'17:30',end:'05:30',relay_timeout:15,poll_interval:35},
  {day:5,enabled:true, start:'17:30',end:'05:30',relay_timeout:15,poll_interval:35},
  {day:6,enabled:true, start:'00:00',end:'23:59',relay_timeout:15,poll_interval:35},
];

async function fetchSchedule() {
  if (!webAppURL) return;
  try {
    const r = await fetch(webAppURL + '?sts=getschedule');
    const t = await r.text();
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed) && parsed.length === 7) {
      currentSchedule = parsed.map(d => ({
        ...d,
        start:         toHHMM(d.start),
        end:           toHHMM(d.end),
        relay_timeout: parseInt(d.relay_timeout) || 15,
        poll_interval: parseInt(d.poll_interval) || 35
      }));
    }
  } catch(e) { console.warn('[Schedule] fetch failed', e); }
  renderScheduleTable();
  renderScheduleSummaryTable();
}

function renderScheduleTable() {
  const tbody = document.getElementById('schedBody');
  if (!tbody) return;
  tbody.innerHTML = currentSchedule.map(d => `
    <tr id="sched-row-${d.day}" class="${d.enabled ? '' : 'disabled-row'}">
      <td><input type="checkbox" class="sched-chk" id="sched-chk-${d.day}"
        ${d.enabled ? 'checked' : ''} onchange="onSchedToggle(${d.day})"/></td>
      <td><span class="sched-day-label">${DAY_NAMES[d.day]}</span></td>
      <td><input type="time" class="sched-time" id="sched-st-${d.day}" value="${d.start}"
        onchange="onSchedChange(${d.day})"/></td>
      <td><input type="time" class="sched-time" id="sched-en-${d.day}" value="${d.end}"
        onchange="onSchedChange(${d.day})"/></td>
      <td><input type="number" class="sched-time" id="sched-rt-${d.day}"
        value="${d.relay_timeout||15}" min="5" max="300" style="width:70px"
        onchange="onSchedChange(${d.day})"/></td>
      <td><input type="number" class="sched-time" id="sched-pi-${d.day}"
        value="${d.poll_interval||35}" min="10" max="300" style="width:70px"
        onchange="onSchedChange(${d.day})"/></td>
      <td>
        <button class="sched-allday-btn" onclick="setAllDay(${d.day})">ตลอดวัน</button>
      </td>
    </tr>
  `).join('');
}

function onSchedToggle(day) {
  const checked = document.getElementById('sched-chk-' + day).checked;
  currentSchedule[day].enabled = checked;
  document.getElementById('sched-row-' + day).className = checked ? '' : 'disabled-row';
  renderScheduleSummaryTable();
}

function onSchedChange(day) {
  currentSchedule[day].start         = document.getElementById('sched-st-' + day).value || '17:30';
  currentSchedule[day].end           = document.getElementById('sched-en-' + day).value || '05:30';
  currentSchedule[day].relay_timeout = parseInt(document.getElementById('sched-rt-' + day).value) || 15;
  currentSchedule[day].poll_interval = parseInt(document.getElementById('sched-pi-' + day).value) || 35;
  renderScheduleSummaryTable();
}

function setAllDay(day) {
  document.getElementById('sched-st-' + day).value = '00:00';
  document.getElementById('sched-en-' + day).value = '23:59';
  currentSchedule[day].start = '00:00';
  currentSchedule[day].end   = '23:59';
  renderScheduleSummaryTable();
}

function getNextWeekDates() {
  // คืน array ของ Date object สำหรับ 7 วันถัดไป (อา-ส) ที่ใกล้ที่สุด
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // ถอยไปหาวันอาทิตย์ของอาทิตย์นี้
  return [0,1,2,3,4,5,6].map(d => {
    const dt = new Date(startOfWeek);
    dt.setDate(startOfWeek.getDate() + d);
    return dt;
  });
}

function toHHMM(val) {
  // รับได้ทั้ง "17:30", "17:30:00", หรือ Date object จาก GAS
  if (!val) return '00:00';
  const s = String(val);
  // ถ้าเป็น "HH:MM" หรือ "HH:MM:SS" ตรงๆ
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return String(m[1]).padStart(2,'0') + ':' + m[2];
  // ถ้าเป็น full Date string → parse แล้วดึง HH:MM ตาม timezone ไทย
  try {
    const dt = new Date(s);
    if (!isNaN(dt)) {
      return dt.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Bangkok'});
    }
  } catch(e) {}
  return s.slice(0,5);
}

function renderScheduleSummaryTable() {
  const tbody = document.getElementById('schedSummaryBody');
  if (!tbody) return;
  const weekDates = getNextWeekDates();
  tbody.innerHTML = currentSchedule.map(d => {
    const dt = weekDates[d.day];
    const day = String(dt.getDate()).padStart(2,'0');
    const month = String(dt.getMonth()+1).padStart(2,'0');
    const year = dt.getFullYear()+543; // พ.ศ.
    const ddmmyyyy = `${day}/${month}/${year}`;
    const startStr = toHHMM(d.start);
    const endStr   = toHHMM(d.end);
    const timeRange = (startStr==='00:00' && endStr==='23:59')
      ? 'ตลอดวัน (00:00–23:59)'
      : `${startStr} – ${endStr}`;
    const statusBadge = d.enabled
      ? `<span class="log-type-badge lt-schedule">เปิดใช้</span>`
      : `<span class="log-type-badge" style="background:rgba(150,150,150,.12);color:var(--muted);">ปิด</span>`;
    return `<tr style="${!d.enabled?'opacity:.5':''}">
      <td><b>${DAY_NAMES[d.day]}</b></td>
      <td style="font-family:'IBM Plex Mono',monospace;">${ddmmyyyy}</td>
      <td style="font-family:'IBM Plex Mono',monospace;">${timeRange}</td>
      <td style="font-family:'IBM Plex Mono',monospace;">${d.relay_timeout||15} วิ</td>
      <td style="font-family:'IBM Plex Mono',monospace;">${d.poll_interval||35} วิ</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');
}

function renderScheduleSummary() {
  // ยังคงไว้เพื่อ backward compat แต่ใช้ table แทน
  renderScheduleSummaryTable();
}

async function saveSchedule() {
  const toast = document.getElementById('schedToast');
  // sync ค่าจาก input ก่อน save
  currentSchedule.forEach(d => {
    const stEl = document.getElementById('sched-st-' + d.day);
    const enEl = document.getElementById('sched-en-' + d.day);
    const rtEl = document.getElementById('sched-rt-' + d.day);
    const piEl = document.getElementById('sched-pi-' + d.day);
    const cb   = document.querySelector('#sched-row-' + d.day + ' .sched-chk');
    if (stEl) d.start         = stEl.value || d.start;
    if (enEl) d.end           = enEl.value || d.end;
    if (rtEl) d.relay_timeout = parseInt(rtEl.value) || 15;
    if (piEl) d.poll_interval = parseInt(piEl.value) || 35;
    if (cb)   d.enabled       = cb.checked;
  });
  try {
    const r = await fetch(webAppURL + '?sts=saveschedule&schedule=' + encodeURIComponent(JSON.stringify(currentSchedule)));
    const t = await r.text();
    if (t.startsWith('OK')) {
      toast.textContent = '✓ บันทึกแล้ว'; toast.style.color = 'var(--success)';
      renderScheduleSummaryTable();
    } else {
      toast.textContent = 'Error: ' + t; toast.style.color = 'var(--danger)';
    }
  } catch(e) {
    toast.textContent = 'เชื่อมต่อไม่ได้'; toast.style.color = 'var(--danger)';
  }
  toast.style.display = 'inline';
  setTimeout(() => toast.style.display = 'none', 3000);
}

/* ═══════════════════════════════════════
   SETTINGS LOG
═══════════════════════════════════════ */
async function fetchSettingsLog() {
  const wrap = document.getElementById('settingsLogWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading-text">กำลังโหลด...</div>';
  try {
    const r = await fetch(webAppURL + '?sts=getsettingslog&limit=30');
    const t = await r.text();
    const logs = JSON.parse(t);
    if (!logs.length) { wrap.innerHTML = '<div class="loading-text">ยังไม่มีประวัติ</div>'; return; }
    const typeClass = { settings: 'lt-settings', mode: 'lt-mode', schedule: 'lt-schedule' };
    const typeLabel = { settings: 'Settings', mode: 'Mode', schedule: 'Schedule' };
    const formatValue = (type, val) => {
      if (type === 'mode') {
        const modes = {1:'24H ทุกวัน', 2:'ตารางสัปดาห์', 3:'กลางคืนทุกวัน', 4:'ปิด'};
        return 'Mode ' + val + ': ' + (modes[val] || val);
      }
      if (type === 'schedule') {
        try {
          const arr = JSON.parse(val);
          return arr.map(d => DAY_SHORT[d.day] + (d.enabled
            ? ` ${d.start}-${d.end} [T:${d.relay_timeout||15}s P:${d.poll_interval||35}s]`
            : ' ปิด')).join(' · ');
        } catch { return val; }
      }
      if (type === 'settings') {
        try {
          const obj = JSON.parse(val);
          return `timeout:${obj.relay_timeout}s · poll:${obj.poll_interval}s`;
        } catch { return val; }
      }
      return val;
    };
    wrap.innerHTML = `<table class="log-tbl">
      <thead><tr><th>เวลา</th><th>ประเภท</th><th>รายละเอียด</th></tr></thead>
      <tbody>${logs.map(l => `
        <tr>
          <td>${l.timestamp}</td>
          <td><span class="log-type-badge ${typeClass[l.type]||''}">${typeLabel[l.type]||l.type}</span></td>
          <td style="max-width:340px;word-break:break-word;">${formatValue(l.type, l.value)}</td>
        </tr>`).join('')}
      </tbody></table>`;
  } catch(e) {
    wrap.innerHTML = '<div class="loading-text" style="color:var(--danger)">โหลดไม่ได้: ' + e.message + '</div>';
  }
}


/* ═══════════════════════════════════════
   BACKUP WIFI
═══════════════════════════════════════ */
let backupWifiData = {}; // mac → {ssid, password}

async function fetchBackupWifi() {
  if (!webAppURL) return;
  const grid = document.getElementById('backupWifiGrid');
  if (!grid) return;

  // โหลด backup ที่บันทึกไว้
  try {
    const r = await fetch(webAppURL + '?sts=getallbackupwifi');
    const t = await r.text();
    const arr = JSON.parse(t);
    arr.forEach(item => { backupWifiData[item.mac] = item; });
  } catch(e) { console.warn('[BackupWiFi] fetch failed', e); }

  renderBackupWifiGrid();
}

function renderBackupWifiGrid() {
  const grid = document.getElementById('backupWifiGrid');
  if (!grid) return;

  const boards = getWriteBoards();
  const allDevices = [];

  // Write boards
  boards.slice(0, 4).forEach((b, i) => {
    if (!b.mac_write) return;
    const dev = getDeviceInfo(i);
    const devEntry = deviceList.find(d => d.mac_write === b.mac_write) || {};
    const wifiStatus = devEntry.wifi_status || '';
    allDevices.push({
      mac: b.mac_write, type: 'Write',
      label: boardName(i) + (dev.label ? ' · ' + dev.label : ''),
      wifiStatus
    });
  });

  // Read boards
  deviceList.forEach(d => {
    if (!d.mac_read) return;
    const already = allDevices.find(x => x.mac === d.mac_read);
    if (!already) allDevices.push({
      mac: d.mac_read, type: 'Read',
      label: 'Read Board · ' + d.mac_read.slice(-6),
      wifiStatus: d.wifi_status || ''
    });
  });

  if (!allDevices.length) {
    // ถ้ายังไม่มี device data ให้แสดง placeholder row แทน
    grid.innerHTML = `<div class="wifi-card">
      <div style="text-align:center;padding:1.5rem;color:var(--muted);font-size:13px;">
        <i data-lucide="wifi" style="width:28px;height:28px;stroke-width:1.5;display:block;margin:0 auto .75rem;opacity:.4"></i>
        กำลังรอข้อมูลบอร์ด...<br>
        <button class="btn-ghost-sm" style="margin-top:.75rem" onclick="fetchAll().then(()=>renderBackupWifiGrid())">โหลดข้อมูลบอร์ด</button>
      </div>
    </div>`;
    if(window.lucide) lucide.createIcons();
    return;
  }

  grid.innerHTML = allDevices.map(d => {
    const saved = backupWifiData[d.mac] || {};
    const currentSSID = saved.ssid || '';

    // แสดง WiFi สถานะปัจจุบันของบอร์ด
    let statusHtml = '';
    if (d.wifiStatus) {
      const isBackup  = d.wifiStatus.includes('backup');
      const pillClass = isBackup ? 'wifi-backup-pill' : 'wifi-primary-pill';
      const icon      = isBackup ? 'wifi-off' : 'wifi';
      const label     = isBackup ? 'ใช้ Backup' : 'ใช้ Primary';
      statusHtml = `<span class="wifi-status-pill ${pillClass}">
        <i data-lucide="${icon}" style="width:10px;height:10px;stroke-width:2.5"></i>
        ${label}: ${d.wifiStatus.replace(' (backup)','').replace(' (primary)','')}
      </span>`;
    } else {
      statusHtml = `<span class="wifi-status-pill wifi-unknown-pill">ยังไม่มีข้อมูล</span>`;
    }

    return `<div class="wifi-card">
      <div class="wifi-card-head">
        <div>
          <div class="wifi-board-id">${d.label}</div>
          <div class="wifi-board-sub">${d.mac} · ${d.type} Board</div>
        </div>
        ${statusHtml}
      </div>
      <div class="wifi-current-row" style="flex-wrap:wrap;gap:8px;">
        <span style="display:inline-flex;align-items:center;gap:5px;">
          <i data-lucide="wifi" style="width:11px;height:11px;stroke-width:2.5;color:#2E7D52"></i>
          <span style="color:var(--muted)">WiFi หลัก:</span>
          <span class="wifi-current-val" style="color:#2E7D52">BGRIMM-GUEST</span>
        </span>
        <span style="color:var(--border);font-size:10px;">|</span>
        <span style="display:inline-flex;align-items:center;gap:5px;">
          <i data-lucide="wifi-off" style="width:11px;height:11px;stroke-width:2.5;color:var(--accent)"></i>
          <span style="color:var(--muted)">WiFi สำรอง:</span>
          <span class="wifi-current-val" style="${currentSSID ? 'color:var(--accent)' : 'color:var(--muted);font-weight:400'}">${currentSSID || '—'}</span>
        </span>
      </div>
      <div class="wifi-fields">
        <div>
          <label style="display:block;font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.375rem">SSID (ชื่อ WiFi สำรอง)</label>
          <input class="field-inp" id="bw-ssid-${d.mac}" placeholder="ชื่อ WiFi สำรอง" value="${currentSSID}"/>
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.375rem">Password (ว่าง = ไม่มีรหัส)</label>
          <input class="field-inp" id="bw-pw-${d.mac}" type="password" placeholder="รหัส WiFi สำรอง"/>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;">
        <button class="btn-primary" onclick="saveBackupWifi('${d.mac}')" style="padding:7px 16px;font-size:12px;">
          <i data-lucide="save" style="width:12px;height:12px;vertical-align:-1px;margin-right:4px;stroke-width:2.5"></i>บันทึก
        </button>
        <button class="btn-ghost-sm" onclick="clearBackupWifi('${d.mac}')">ลบ WiFi สำรอง</button>
        <span id="bw-toast-${d.mac}" style="font-size:11px;display:none;font-family:'IBM Plex Mono',monospace;"></span>
      </div>
    </div>`;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function saveBackupWifi(mac) {
  const ssid  = document.getElementById('bw-ssid-' + mac).value.trim();
  const pw    = document.getElementById('bw-pw-'   + mac).value;
  const toast = document.getElementById('bw-toast-' + mac);
  if (!ssid) { showBwToast(toast, 'กรุณากรอก SSID', true); return; }
  try {
    const r = await fetch(webAppURL + '?sts=setbackupwifi&mac=' + mac
      + '&ssid=' + encodeURIComponent(ssid)
      + '&password=' + encodeURIComponent(pw));
    const t = await r.text();
    if (t.startsWith('OK')) {
      backupWifiData[mac] = { mac, ssid, password: pw };
      showBwToast(toast, '✓ บันทึกแล้ว — ' + ssid, false);
      renderBackupWifiGrid();
    } else {
      showBwToast(toast, 'Error: ' + t, true);
    }
  } catch(e) { showBwToast(toast, 'เชื่อมต่อไม่ได้', true); }
}

async function clearBackupWifi(mac) {
  const toast = document.getElementById('bw-toast-' + mac);
  try {
    const r = await fetch(webAppURL + '?sts=setbackupwifi&mac=' + mac + '&ssid=&password=');
    const t = await r.text();
    if (t.startsWith('OK')) {
      delete backupWifiData[mac];
      showBwToast(toast, '✓ ลบแล้ว', false);
      renderBackupWifiGrid();
    } else { showBwToast(toast, 'Error: ' + t, true); }
  } catch(e) { showBwToast(toast, 'เชื่อมต่อไม่ได้', true); }
}

function showBwToast(el, msg, isErr) {
  el.textContent = msg;
  el.style.color = isErr ? 'var(--danger)' : 'var(--success)';
  el.style.display = 'inline';
  setTimeout(() => el.style.display = 'none', 4000);
}

async function fetchAll(){
  try{
    showErr('');setStatus('loading');
    const[history,devices]=await Promise.all([fetchHistory(),fetchDevices()]);
    allHistory=history;deviceList=devices;
    renderCards();renderSummary();destroyCharts();renderCharts();renderLog();renderFloorplan();
    renderBackupWifiGrid();
    const t=new Date().toLocaleTimeString('th-TH');
    ['lastUpdate','lastUpdateMobile'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=t;});
    setStatus('ok');
  }catch(e){showErr('⚠ เชื่อมต่อไม่ได้: '+e.message);setStatus('error');}
}

function startTimer(){
  if(timer)clearInterval(timer);
  if(autoInterval>0)timer=setInterval(fetchAll,autoInterval);
}

/* ── Floorplan ── */
const ACTIVE_FP_MS=15*1000;
const FP_Z_EL={1:'fpZ1',2:'fpZ2',3:'fpZ3'};
const FP_Z_DOTS={1:['fds1_1','fds1_2','fds1_3'],2:['fds2_1','fds2_2','fds2_3'],3:['fds3_1','fds3_2','fds3_3','fds3_4']};
const FP_Z_COL={1:'#F47B20',2:'#22D3EE',3:'#84CC16'};

(function initFpTooltip(){
  const tip=document.getElementById('fpTip');
  const map=document.getElementById('fpMap');
  if(!tip||!map)return;
  document.querySelectorAll('.fp-dot').forEach(el=>{
    el.addEventListener('mouseenter',()=>{tip.textContent=el.dataset.lbl||'';tip.classList.add('show');});
    el.addEventListener('mousemove',e=>{
      const r=map.getBoundingClientRect();
      tip.style.left=(e.clientX-r.left+14)+'px';
      tip.style.top=(e.clientY-r.top-10)+'px';
    });
    el.addEventListener('mouseleave',()=>tip.classList.remove('show'));
  });
})();

function renderFloorplan(){
  const boards=getWriteBoards();const now=Date.now();
  [1,2,3].forEach(zn=>{
    const mac=(boards[zn-1]||{}).mac_write||'';
    const lastRow=[...allHistory].filter(r=>r.mac_write===mac&&r.trigger==='detect').sort((a,b)=>b.t-a.t)[0];
    const lastTs=lastRow?lastRow.t:0;
    const active=mac&&(now-lastTs<ACTIVE_FP_MS);
    const tStr=lastTs?new Date(lastTs).toLocaleTimeString('th-TH'):'ไม่มีข้อมูล';
    const zEl=document.getElementById(FP_Z_EL[zn]);
    if(zEl)zEl.classList.toggle('fp-on',active);
    (FP_Z_DOTS[zn]||[]).forEach(id=>{
      const d=document.getElementById(id);if(!d)return;
      d.classList.toggle('fp-fire',active);d.classList.toggle('fp-idle',!active);
    });
    const dot=document.getElementById('fpDot'+zn);
    const txt=document.getElementById('fpTxt'+zn);
    if(dot)dot.style.background=active?FP_Z_COL[zn]:'#6b7280';
    if(txt){txt.style.color=active?'var(--text)':'var(--muted)';txt.textContent=active?('ACTIVE  '+tStr):'IDLE';}
  });
}

/* ── Relay Mode ── */
const MODE_LABELS={1:'24H ทุกวัน',2:'ตารางสัปดาห์',3:'กลางคืนทุกวัน',4:'ปิดทั้งหมด'};
let currentRelayMode=null,selectedRelayMode=null;

async function fetchRelayMode(){
  if(!webAppURL)return;
  try{
    const r=await fetch(webAppURL+'?sts=getmode');const t=await r.text();
    if(t.startsWith('OK,')){
      const m=parseInt(t.split(',')[1]);
      currentRelayMode=m;selectedRelayMode=m;
      highlightRelayMode(m);updateModeBadge(m);
    }
  }catch(e){console.warn('[Mode]',e);}
}

function selectRelayMode(m){
  selectedRelayMode=m;highlightRelayMode(m);
  const btn=document.getElementById('modeSaveBtn');
  btn.disabled=(m===currentRelayMode);
  btn.textContent=(m===currentRelayMode)?'โหมดนี้ใช้งานอยู่แล้ว':'บันทึกโหมด';
}

function highlightRelayMode(m){
  document.querySelectorAll('.mode-opt').forEach(b=>b.classList.remove('active'));
  const btn=document.querySelector('.mode-opt[data-mode="'+m+'"]');
  if(btn)btn.classList.add('active');
}

function updateModeBadge(m){
  const badge=document.getElementById('modeCurBadge');
  if(badge)badge.textContent='MODE '+m+': '+(MODE_LABELS[m]||'ไม่ทราบ');
}

async function saveRelayMode(){
  if(!selectedRelayMode||selectedRelayMode===currentRelayMode)return;
  const btn=document.getElementById('modeSaveBtn');
  btn.disabled=true;btn.textContent='กำลังบันทึก...';
  try{
    const r=await fetch(webAppURL+'?sts=setmode&mode='+selectedRelayMode);const t=await r.text();
    if(t.startsWith('OK,')){
      currentRelayMode=selectedRelayMode;updateModeBadge(currentRelayMode);
      btn.textContent='โหมดนี้ใช้งานอยู่แล้ว';
      showModeToast('✓ บันทึกสำเร็จ — '+MODE_LABELS[currentRelayMode],false);
    }else{showModeToast('เกิดข้อผิดพลาด: '+t,true);btn.disabled=false;btn.textContent='บันทึกโหมด';}
  }catch(e){showModeToast('เชื่อมต่อ GAS ไม่ได้',true);btn.disabled=false;btn.textContent='บันทึกโหมด';}
}

function showModeToast(msg,isErr){
  const t=document.getElementById('modeToast');t.textContent=msg;
  t.className='toast-msg'+(isErr?' err':'');t.style.display='block';
  setTimeout(()=>t.style.display='none',3000);
}

/* ── Advanced Settings ── */
async function fetchAdvSettings(){
  if(!webAppURL)return;
  try{
    const r=await fetch(webAppURL+'?sts=getsettings');const t=await r.text();
    if(!t.startsWith('OK,'))return;
    const p=t.split(',');
    if(p[2])document.getElementById('sNightStart').value=p[2];
    if(p[3])document.getElementById('sNightEnd').value=p[3];
    if(p[4])document.getElementById('sRelayTimeout').value=p[4];
    if(p[5])document.getElementById('sPollInterval').value=p[5];
    const force=parseInt(p[6]||'0');updateForceUI(force);
  }catch(e){console.warn('[Settings]',e);}
}

async function saveAdvSettings(){
  const mode=selectedRelayMode||currentRelayMode||1;
  const nStart=document.getElementById('sNightStart').value||'17:30';
  const nEnd=document.getElementById('sNightEnd').value||'05:30';
  const rTout=document.getElementById('sRelayTimeout').value||'15';
  const pInt=document.getElementById('sPollInterval').value||'35';
  const toast=document.getElementById('settingsToast');
  try{
    const url=webAppURL+'?sts=savesettings&mode='+mode+'&night_start='+encodeURIComponent(nStart)+'&night_end='+encodeURIComponent(nEnd)+'&relay_timeout='+rTout+'&poll_interval='+pInt;
    const r=await fetch(url);const t=await r.text();
    if(t.startsWith('OK')){toast.textContent='✓ บันทึกสำเร็จ';toast.className='toast-msg';}
    else{toast.textContent='Error: '+t;toast.className='toast-msg err';}
  }catch(e){toast.textContent='เชื่อมต่อไม่ได้';toast.className='toast-msg err';}
  toast.style.display='inline';setTimeout(()=>toast.style.display='none',3000);
}

async function setForceRelay(state){
  try{
    const r=await fetch(webAppURL+'?sts=forcerelay&state='+state);
    const t=await r.text();if(t.startsWith('OK'))updateForceUI(state);
  }catch(e){console.warn('[Force]',e);}
}

function updateForceUI(state){
  const onBtn=document.getElementById('forceOnBtn');
  const offBtn=document.getElementById('forceOffBtn');
  const status=document.getElementById('forceStatus');
  if(!onBtn)return;
  onBtn.classList.toggle('active',state===1);
  offBtn.classList.toggle('active',state===0);
  status.textContent=state===1?'สถานะ: ⚡ Force ON (Relay เปิดตลอด)':'สถานะ: ปกติ (ควบคุมโดย mode)';
  status.style.color=state===1?'var(--accent)':'';
}

/* ── Login ── */
function doLogout(){
  sessionStorage.removeItem('dashAuth');sessionStorage.removeItem('dashUser');
  location.reload();
}

function togglePw(){
  const inp=document.getElementById('loginPw');
  const icon=document.getElementById('pwEyeIcon');
  if(inp.type==='password'){
    inp.type='text';
    icon.innerHTML='<i data-lucide="eye-off"></i>';
  }else{
    inp.type='password';
    icon.innerHTML='<i data-lucide="eye"></i>';
  }
  if(window.lucide)lucide.createIcons();
}

function checkStoredLogin(){
  webAppURL=DEFAULT_URL;
  document.getElementById('urlInp').value=DEFAULT_URL;
  if(sessionStorage.getItem('dashAuth')==='ok'){
    const savedRole = sessionStorage.getItem('dashRole') || 'admin';
    applyRole(savedRole);
    document.getElementById('loginOverlay').style.display='none';
  }
}


/* ═══════════════════════════════════════
   ROLE SYSTEM
═══════════════════════════════════════ */
function applyRole(role) {
  const body  = document.body;
  const badge = document.getElementById('roleBadge');

  // Reset
  body.classList.remove('role-admin', 'role-viewer');
  body.classList.add('role-' + role);

  if (badge) {
    badge.textContent = role === 'admin' ? '⚙ Admin' : '👁 Viewer';
    badge.className   = 'role-badge role-' + role;
  }

  // ถ้า viewer และกำลังอยู่หน้า System → กลับหน้าแรก
  if (role === 'viewer') {
    const systemPages = ['mode', 'wifi', 'settings'];
    const currentPage = sessionStorage.getItem('currentPage') || '';
    if (systemPages.includes(currentPage)) {
      const firstBtn = document.querySelector('.nav-item[data-tip="ภาพรวมระบบ"]');
      if (firstBtn) firstBtn.click();
    }
  }
}

async function doLogin(){
  const url=DEFAULT_URL;
  const user=document.getElementById('loginUser').value.trim();
  const pw=document.getElementById('loginPw').value.trim();
  const err=document.getElementById('loginErr');
  err.style.display='none';
  if(!user){err.textContent='กรุณากรอก Username';err.style.display='block';return;}
  if(!pw){err.textContent='กรุณากรอก Password';err.style.display='block';return;}
  const btn=document.querySelector('.login-btn');
  btn.textContent='กำลังเข้าสู่ระบบ...';btn.disabled=true;
  try{
    const r=await fetch(url+'?sts=login&username='+encodeURIComponent(user)+'&password='+encodeURIComponent(pw));
    const t=await r.text();
    if(t.trim().startsWith('OK')){
      webAppURL=DEFAULT_URL;
      document.getElementById('urlInp').value=DEFAULT_URL;
      const parts = t.trim().split(',');
      const role  = parts[1] || 'admin';
      sessionStorage.setItem('dashAuth','ok');
      sessionStorage.setItem('dashUser',user);
      sessionStorage.setItem('dashRole', role);
      applyRole(role);
      document.getElementById('loginOverlay').style.display='none';
      fetchAll();fetchRelayMode();fetchAdvSettings();
    }else{
      const msg=t.includes('wrong_password')?'Username หรือ Password ไม่ถูกต้อง'
        :t.includes('no_users')?'ยังไม่มี User ใน Sheets'
        :t.includes('missing_fields')?'กรุณากรอกข้อมูลให้ครบ'
        :'เกิดข้อผิดพลาด: '+t;
      err.textContent=msg;err.style.display='block';
    }
  }catch(e){err.textContent='เชื่อมต่อไม่ได้: '+e.message;err.style.display='block';}
  btn.textContent='เข้าสู่ระบบ';btn.disabled=false;
}

/* ── Scroll spy ── */
(function initScrollSpy(){
  const main = document.querySelector('.main');
  if(!main) return;
  const sections = [
    {id:'top', btn: document.querySelector('.sidebar .nav-item[data-tip="ภาพรวมระบบ"]')},
    {id:'sec-floorplan', btn: document.querySelector('.sidebar .nav-item[data-tip="Floorplan"]')},
    {id:'sec-stats', btn: document.querySelector('.sidebar .nav-item[data-tip="สถิติ Detect"]')},
    {id:'sec-log', btn: document.querySelector('.sidebar .nav-item[data-tip="Log ย้อนหลัง"]')},
  ];
  main.addEventListener('scroll', ()=>{
    if (currentPage !== 'dashboard') return; // ไม่ทำงานบน system pages
    const scrollTop = main.scrollTop + 80;
    let current = sections[0];
    sections.forEach(s=>{
      if(s.id==='top') return;
      const el=document.getElementById(s.id);
      if(el && el.offsetTop <= scrollTop) current = s;
    });
    document.querySelectorAll('.sidebar .nav-item').forEach(el=>el.classList.remove('active'));
    if(current && current.btn) current.btn.classList.add('active');
  });
})();

/* ── Init ── */
if(window.lucide)lucide.createIcons();
checkStoredLogin();
// แสดง dashboard page เริ่มต้น
(function initPages(){
  document.querySelectorAll('.page-view').forEach(el => { el.style.display='none'; el.classList.remove('active','fade-in'); });
  const dash = document.getElementById('page-dashboard');
  if(dash){ dash.style.display='block'; dash.classList.add('active'); }
})();
fetchAll();
fetchRelayMode();
fetchAdvSettings();
fetchSchedule();
startTimer();
