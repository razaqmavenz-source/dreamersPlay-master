import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBVNj3K6ftDTIzGaEZdvIcI2RT6BBPsysg",
  authDomain: "dreamers-9dd71.firebaseapp.com",
  projectId: "dreamers-9dd71",
  storageBucket: "dreamers-9dd71.firebasestorage.app",
  messagingSenderId: "485472585145",
  appId: "1:485472585145:web:b3e6b172811bf34478e268"
};
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const todayStr = () => new Date().toISOString().slice(0,10);
const fmtMoney = (n) => { const v=Number(n)||0; const s=v<0?'-':''; return s+Math.abs(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); };
const fmtDate = (d) => new Date(d+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function showBanner(msg){ document.getElementById('banner').innerHTML = msg ? `<div class="banner">&gt; ${msg}</div>` : ''; }

let station1Entries = [];
let station2Entries = [];
let capitalEntries = [];
let unsubS1=null, unsubS2=null, unsubCap=null;
let charts = {};

(function(){
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let w,h,particles=[];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize(){ w=canvas.width=window.innerWidth; h=canvas.height=window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  const COUNT = Math.min(60, Math.floor(window.innerWidth/22));
  for(let i=0;i<COUNT;i++){ particles.push({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-0.5)*0.15,vy:(Math.random()-0.5)*0.15}); }
  function draw(){
    ctx.clearRect(0,0,w,h);
    for(const p of particles){ if(!reduceMotion){p.x+=p.vx;p.y+=p.vy;} if(p.x<0||p.x>w)p.vx*=-1; if(p.y<0||p.y>h)p.vy*=-1; }
    for(let i=0;i<particles.length;i++) for(let j=i+1;j<particles.length;j++){
      const a=particles[i],b=particles[j]; const d=Math.hypot(a.x-b.x,a.y-b.y);
      if(d<130){ ctx.strokeStyle=`rgba(100,170,220,${0.12*(1-d/130)})`; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
    }
    for(const p of particles){ ctx.fillStyle='rgba(140,200,255,0.5)'; ctx.beginPath(); ctx.arc(p.x,p.y,1.4,0,Math.PI*2); ctx.fill(); }
    if(!reduceMotion) requestAnimationFrame(draw);
  }
  draw();
})();

let authMode='signin';
document.getElementById('modeSignIn').addEventListener('click', ()=>{ authMode='signin'; document.getElementById('modeSignIn').classList.add('active'); document.getElementById('modeRegister').classList.remove('active'); document.getElementById('authSubmit').textContent='AUTHENTICATE >>'; });
document.getElementById('modeRegister').addEventListener('click', ()=>{ authMode='register'; document.getElementById('modeRegister').classList.add('active'); document.getElementById('modeSignIn').classList.remove('active'); document.getElementById('authSubmit').textContent='REGISTER IDENTITY >>'; });
document.getElementById('authSubmit').addEventListener('click', async ()=>{
  const email=document.getElementById('authEmail').value.trim();
  const password=document.getElementById('authPassword').value;
  const errEl=document.getElementById('authError'); errEl.innerHTML='';
  if(!email||!password){ errEl.innerHTML='<div class="error-text">&gt; access denied: email and password protocol required.</div>'; return; }
  const btn=document.getElementById('authSubmit'); btn.disabled=true; btn.textContent='VERIFYING…';
  const timeout=(ms)=>new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout',message:'no response from firebase'}),ms));
  try{
    const call = authMode==='signin' ? signInWithEmailAndPassword(auth,email,password) : createUserWithEmailAndPassword(auth,email,password);
    await Promise.race([call, timeout(12000)]);
  }catch(e){
    if(e.code==='timeout'){ errEl.innerHTML='<div class="error-text">&gt; connection timeout: request to firebase never returned. check network/devtools.</div>'; }
    else{ errEl.innerHTML=`<div class="error-text">&gt; access denied: ${escapeHtml(e.code||e.message)}</div>`; }
  }
  btn.disabled=false; btn.textContent= authMode==='signin' ? 'AUTHENTICATE >>' : 'REGISTER IDENTITY >>';
});
document.getElementById('logoutBtn').addEventListener('click', async ()=>{ await signOut(auth); });

onAuthStateChanged(auth, (user)=>{
  if(user){
    document.getElementById('authGate').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('logoutBtn').style.display='inline-block';
    document.getElementById('sessionTag').textContent='SESSION::ACTIVE — '+user.email;
    attachListeners();
  } else {
    document.getElementById('authGate').style.display='block';
    document.getElementById('app').style.display='none';
    document.getElementById('logoutBtn').style.display='none';
    document.getElementById('sessionTag').textContent='SESSION::UNAUTHENTICATED';
    if(unsubS1) unsubS1(); if(unsubS2) unsubS2(); if(unsubCap) unsubCap();
    station1Entries=[]; station2Entries=[]; capitalEntries=[];
  }
});

function attachListeners(){
  if(unsubS1) unsubS1(); if(unsubS2) unsubS2(); if(unsubCap) unsubCap();
  const s1Col = collection(db,'stations','station-1','daily');
  const s2Col = collection(db,'stations','station-2','daily');
  const capCol = collection(db,'capital');
  unsubS1 = onSnapshot(query(s1Col, orderBy('date','desc')), (snap)=>{ station1Entries = snap.docs.map(d=>({id:d.id, ...d.data()})); renderAll(); }, (err)=> showBanner('STATION 1 STREAM DESYNCED: '+err.code));
  unsubS2 = onSnapshot(query(s2Col, orderBy('date','desc')), (snap)=>{ station2Entries = snap.docs.map(d=>({id:d.id, ...d.data()})); document.getElementById('s2Pill').textContent = station2Entries.length ? 'LIVE' : 'NO DATA'; renderAll(); }, (err)=> showBanner('STATION 2 STREAM DESYNCED (check Firestore rules include your master UID): '+err.code));
  unsubCap = onSnapshot(query(capCol, orderBy('date','desc')), (snap)=>{ capitalEntries = snap.docs.map(d=>({id:d.id, ...d.data()})); renderAll(); }, (err)=> showBanner('CAPITAL STREAM DESYNCED: '+err.code));
}

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    document.querySelectorAll('.tabview').forEach(v=>{ v.style.display = (v.dataset.view===target) ? 'block' : 'none'; });
    if(target==='overview') requestAnimationFrame(renderCharts);
  });
});

let dailyFormRows=[{date:todayStr(),revenue:'',expense:'',note:''}];
function renderDailyForm(){
  const wrap=document.getElementById('dailyRows'); wrap.innerHTML='';
  dailyFormRows.forEach((row,i)=>{
    const div=document.createElement('div'); div.className='row daily';
    div.innerHTML=`
      <div class="field"><label>Timestamp</label><input type="date" max="${todayStr()}" value="${row.date}" data-i="${i}" data-f="date"></div>
      <div class="field"><label>Revenue</label><input type="number" inputmode="decimal" placeholder="Enter protocol: revenue_" value="${row.revenue}" data-i="${i}" data-f="revenue"></div>
      <div class="field"><label>Expense</label><input type="number" inputmode="decimal" placeholder="Enter protocol: expense_" value="${row.expense}" data-i="${i}" data-f="expense"></div>
      <div class="field"><label>Note</label><input type="text" placeholder="Enter protocol: note_ (optional)" value="${row.note}" data-i="${i}" data-f="note"></div>
      <button class="row-remove" data-i="${i}" ${dailyFormRows.length===1?'disabled':''} aria-label="Remove row">✕</button>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('input').forEach(inp=>inp.addEventListener('input',(e)=>{ dailyFormRows[e.target.dataset.i][e.target.dataset.f]=e.target.value; }));
  wrap.querySelectorAll('.row-remove').forEach(b=>b.addEventListener('click',(e)=>{ dailyFormRows.splice(Number(e.target.dataset.i),1); renderDailyForm(); }));
}
document.getElementById('dailyAddRow').addEventListener('click', ()=>{ dailyFormRows.push({date:todayStr(),revenue:'',expense:'',note:''}); renderDailyForm(); });
document.getElementById('dailySave').addEventListener('click', async ()=>{
  const errEl=document.getElementById('dailyError'); errEl.innerHTML='';
  const valid=dailyFormRows.filter(r=>r.date&&(r.revenue!==''||r.expense!==''));
  if(valid.length===0){ errEl.innerHTML='<div class="error-text">&gt; injection rejected: add at least one row with a timestamp and an amount.</div>'; return; }
  const btn=document.getElementById('dailySave'); btn.disabled=true; btn.textContent='INJECTING…';
  try{
    for(const r of valid){ await addDoc(collection(db,'stations','station-1','daily'), {date:r.date, revenue:Number(r.revenue)||0, expense:Number(r.expense)||0, note:r.note||'', createdAt:Date.now()}); }
    dailyFormRows=[{date:todayStr(),revenue:'',expense:'',note:''}]; renderDailyForm();
  }catch(e){ errEl.innerHTML=`<div class="error-text">&gt; injection failed: ${escapeHtml(e.code||e.message)}</div>`; }
  btn.disabled=false; btn.textContent='EXECUTE INJECTION >>';
});

let capitalFormRows=[{date:todayStr(),description:'',amount:''}];
function renderCapitalForm(){
  const wrap=document.getElementById('capitalRows'); wrap.innerHTML='';
  capitalFormRows.forEach((row,i)=>{
    const div=document.createElement('div'); div.className='row capital';
    div.innerHTML=`
      <div class="field"><label>Timestamp</label><input type="date" max="${todayStr()}" value="${row.date}" data-i="${i}" data-f="date"></div>
      <div class="field"><label>Description</label><input type="text" placeholder="Enter protocol: asset / maintenance_" value="${row.description}" data-i="${i}" data-f="description"></div>
      <div class="field"><label>Amount</label><input type="number" inputmode="decimal" placeholder="Enter protocol: amount_" value="${row.amount}" data-i="${i}" data-f="amount"></div>
      <button class="row-remove" data-i="${i}" ${capitalFormRows.length===1?'disabled':''} aria-label="Remove row">✕</button>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('input').forEach(inp=>inp.addEventListener('input',(e)=>{ capitalFormRows[e.target.dataset.i][e.target.dataset.f]=e.target.value; }));
  wrap.querySelectorAll('.row-remove').forEach(b=>b.addEventListener('click',(e)=>{ capitalFormRows.splice(Number(e.target.dataset.i),1); renderCapitalForm(); }));
}
document.getElementById('capitalAddRow').addEventListener('click', ()=>{ capitalFormRows.push({date:todayStr(),description:'',amount:''}); renderCapitalForm(); });
document.getElementById('capitalSave').addEventListener('click', async ()=>{
  const errEl=document.getElementById('capitalError'); errEl.innerHTML='';
  const valid=capitalFormRows.filter(r=>r.date&&r.amount!=='');
  if(valid.length===0){ errEl.innerHTML='<div class="error-text">&gt; injection rejected: add at least one row with a timestamp and an amount.</div>'; return; }
  const btn=document.getElementById('capitalSave'); btn.disabled=true; btn.textContent='INJECTING…';
  try{
    for(const r of valid){ await addDoc(collection(db,'capital'), {date:r.date, description:r.description||'(no description)', amount:Number(r.amount)||0, createdAt:Date.now()}); }
    capitalFormRows=[{date:todayStr(),description:'',amount:''}]; renderCapitalForm();
  }catch(e){ errEl.innerHTML=`<div class="error-text">&gt; injection failed: ${escapeHtml(e.code||e.message)}</div>`; }
  btn.disabled=false; btn.textContent='EXECUTE INJECTION >>';
});

function renderDailyList(){
  const el=document.getElementById('dailyList');
  if(station1Entries.length===0){ el.innerHTML='<div class="empty-state">no data in stream_</div>'; return; }
  el.innerHTML=station1Entries.map(e=>`
    <div class="stream-item"><span class="s-date">${fmtDate(e.date)}</span>
      <div class="s-mid"><span class="s-rev">+${fmtMoney(e.revenue)}</span><span class="s-exp">-${fmtMoney(e.expense)}</span>${e.note?`<span class="s-note">${escapeHtml(e.note)}</span>`:''}</div>
      <button class="s-purge" data-id="${e.id}" aria-label="Purge entry">✕</button></div>`).join('');
  el.querySelectorAll('.s-purge').forEach(b=>b.addEventListener('click', async (e)=>{ await deleteDoc(doc(db,'stations','station-1','daily', e.target.dataset.id)); }));
}
function renderCapitalList(){
  const el=document.getElementById('capitalList');
  if(capitalEntries.length===0){ el.innerHTML='<div class="empty-state">no data in stream_</div>'; return; }
  el.innerHTML=capitalEntries.map(e=>`
    <div class="stream-item"><span class="s-date">${fmtDate(e.date)}</span>
      <div class="s-mid"><span class="s-desc">${escapeHtml(e.description)}</span><span class="s-amt">${fmtMoney(e.amount)}</span></div>
      <button class="s-purge" data-id="${e.id}" aria-label="Purge entry">✕</button></div>`).join('');
  el.querySelectorAll('.s-purge').forEach(b=>b.addEventListener('click', async (e)=>{ await deleteDoc(doc(db,'capital', e.target.dataset.id)); }));
}
function renderStation2List(){
  const el=document.getElementById('station2List');
  if(station2Entries.length===0){ el.innerHTML='<div class="empty-state">no data in stream_ — station 2 has not injected any entries yet</div>'; return; }
  el.innerHTML=station2Entries.map(e=>`
    <div class="stream-item"><span class="s-date">${fmtDate(e.date)}</span>
      <div class="s-mid"><span class="s-rev">+${fmtMoney(e.revenue)}</span><span class="s-exp">-${fmtMoney(e.expense)}</span>${e.note?`<span class="s-note">${escapeHtml(e.note)}</span>`:''}</div>
    </div>`).join('');
}

function computeTotals(){
  const s1Rev = station1Entries.reduce((s,e)=>s+(Number(e.revenue)||0),0);
  const s1Exp = station1Entries.reduce((s,e)=>s+(Number(e.expense)||0),0);
  const s2Rev = station2Entries.reduce((s,e)=>s+(Number(e.revenue)||0),0);
  const s2Exp = station2Entries.reduce((s,e)=>s+(Number(e.expense)||0),0);
  const totalRevenue = s1Rev+s2Rev, totalExpense = s1Exp+s2Exp;
  const totalCapital = capitalEntries.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const opYield = totalRevenue-totalExpense;
  const netYield = totalRevenue-totalCapital-totalExpense;
  return {s1Rev,s1Exp,s2Rev,s2Exp,totalRevenue,totalExpense,totalCapital,opYield,netYield};
}
function renderTotals(){
  const t=computeTotals();
  document.getElementById('statCapital').textContent=fmtMoney(t.totalCapital);
  document.getElementById('statRevenue').textContent=fmtMoney(t.totalRevenue);
  document.getElementById('statExpense').textContent=fmtMoney(t.totalExpense);
  document.getElementById('statNet').textContent=fmtMoney(t.netYield);
  document.getElementById('statNetSub').textContent = t.netYield>=0 ? 'capital recouped' : 'still recouping capital';
  document.getElementById('opYield').textContent=fmtMoney(t.opYield);
  document.getElementById('netYield').textContent=fmtMoney(t.netYield);
  document.getElementById('netYieldDesc').textContent = t.netYield>=0
    ? '> capital fully recouped. this is surplus yield beyond your initial injection.'
    : '> capital not yet recouped. this is the remaining gap before break-even.';
  document.getElementById('s1Revenue').textContent=fmtMoney(t.s1Rev);
  document.getElementById('s1Expense').textContent=fmtMoney(t.s1Exp);
  document.getElementById('s1Net').textContent=fmtMoney(t.s1Rev-t.s1Exp);
  document.getElementById('s2Revenue').textContent=fmtMoney(t.s2Rev);
  document.getElementById('s2Expense').textContent=fmtMoney(t.s2Exp);
  document.getElementById('s2Net').textContent=fmtMoney(t.s2Rev-t.s2Exp);
}

function baseChartOptions(){
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ labels:{ color:'#8FA4C9', font:{family:'JetBrains Mono', size:10} } }, tooltip:{ titleFont:{family:'JetBrains Mono'}, bodyFont:{family:'JetBrains Mono'} } },
    scales:{ x:{ ticks:{ color:'#6B7A99', font:{family:'JetBrains Mono', size:9} }, grid:{ color:'rgba(120,150,200,0.1)' } }, y:{ ticks:{ color:'#6B7A99', font:{family:'JetBrains Mono', size:9} }, grid:{ color:'rgba(120,150,200,0.1)' } } }
  };
}

function renderCharts(){
  if(typeof Chart==='undefined'){ showBanner('DATA VISUALIZATION MODULE FAILED TO LOAD — check network access to cdn.jsdelivr.net, or an ad-blocker/firewall may be blocking it.'); return; }

  const allDaily = [...station1Entries, ...station2Entries];
  const byDate = {};
  allDaily.forEach(e=>{ if(!byDate[e.date]) byDate[e.date]={revenue:0,expense:0}; byDate[e.date].revenue+=Number(e.revenue)||0; byDate[e.date].expense+=Number(e.expense)||0; });
  const dates = Object.keys(byDate).sort();
  const recentDates = dates.slice(-30);
  const revSeries = recentDates.map(d=>byDate[d].revenue);
  const expSeries = recentDates.map(d=>byDate[d].expense);
  const labels = recentDates.map(d=>fmtDate(d));

  const trendCtx=document.getElementById('trendChart');
  if(trendCtx){
    if(charts.trend) charts.trend.destroy();
    const g1=trendCtx.getContext('2d').createLinearGradient(0,0,0,220); g1.addColorStop(0,'rgba(255,79,216,0.35)'); g1.addColorStop(1,'rgba(255,79,216,0)');
    const g2=trendCtx.getContext('2d').createLinearGradient(0,0,0,220); g2.addColorStop(0,'rgba(124,92,255,0.35)'); g2.addColorStop(1,'rgba(124,92,255,0)');
    charts.trend=new Chart(trendCtx,{ type:'line', data:{ labels, datasets:[
      {label:'Revenue', data:revSeries, borderColor:'#FF4FD8', backgroundColor:g1, fill:true, tension:0.35, pointRadius:2, borderWidth:2, pointBackgroundColor:'#FF4FD8'},
      {label:'Expense', data:expSeries, borderColor:'#7C5CFF', backgroundColor:g2, fill:true, tension:0.35, pointRadius:2, borderWidth:2, pointBackgroundColor:'#7C5CFF'}
    ]}, options: baseChartOptions() });
  }

  const events=[];
  allDaily.forEach(e=>events.push({date:e.date, delta:(Number(e.revenue)||0)-(Number(e.expense)||0)}));
  capitalEntries.forEach(e=>events.push({date:e.date, delta:-(Number(e.amount)||0)}));
  const cumByDate={}; events.forEach(ev=>{ cumByDate[ev.date]=(cumByDate[ev.date]||0)+ev.delta; });
  let running=0; const cumLabels=[], cumData=[];
  Object.keys(cumByDate).sort().forEach(d=>{ running+=cumByDate[d]; cumLabels.push(fmtDate(d)); cumData.push(running); });
  const cumCtx=document.getElementById('cumulativeChart');
  if(cumCtx){
    if(charts.cumulative) charts.cumulative.destroy();
    const g3=cumCtx.getContext('2d').createLinearGradient(0,0,0,200); g3.addColorStop(0,'rgba(62,232,255,0.4)'); g3.addColorStop(1,'rgba(62,232,255,0)');
    charts.cumulative=new Chart(cumCtx,{ type:'line', data:{ labels:cumLabels, datasets:[{label:'Net Yield', data:cumData, borderColor:'#3EE8FF', backgroundColor:g3, fill:true, tension:0.3, pointRadius:0, borderWidth:2}]}, options:{ ...baseChartOptions(), plugins:{...baseChartOptions().plugins, legend:{display:false}} } });
  }

  const t=computeTotals();
  const compCtx=document.getElementById('compositionChart');
  if(compCtx){
    if(charts.composition) charts.composition.destroy();
    charts.composition=new Chart(compCtx,{ type:'doughnut', data:{ labels:['Capital','Revenue','Expense'], datasets:[{ data:[t.totalCapital,t.totalRevenue,t.totalExpense], backgroundColor:['#3EE8FF','#FF4FD8','#7C5CFF'], borderColor:'#05070E', borderWidth:2 }]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#8FA4C9', font:{family:'JetBrains Mono', size:10}, boxWidth:10 } } } } });
  }

  const stCtx=document.getElementById('stationChart');
  if(stCtx){
    if(charts.station) charts.station.destroy();
    charts.station=new Chart(stCtx,{ type:'bar', data:{ labels:['Station 1','Station 2'], datasets:[
      {label:'Revenue', data:[t.s1Rev,t.s2Rev], backgroundColor:'#FF4FD8'},
      {label:'Expense', data:[t.s1Exp,t.s2Exp], backgroundColor:'#7C5CFF'}
    ]}, options: baseChartOptions() });
  }
}

function renderAll(){
  renderDailyForm(); renderCapitalForm();
  renderDailyList(); renderCapitalList(); renderStation2List();
  renderTotals();

  const overview = document.querySelector('.tabview[data-view="overview"]');
  if(overview && overview.style.display !== 'none') {
    requestAnimationFrame(renderCharts);
  }
}

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch((e)=> console.warn('service worker registration failed', e));
  });
}