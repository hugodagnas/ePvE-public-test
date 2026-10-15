
(() => {
'use strict';

const VERSION = '1.2.0';
const RESET_DELAY_MS = 5 * 60 * 1000;
let resetTimer = null;
const NON_LU = '⚠ NON LU - vérifier';
const LOCAL = {
  pdf: '../static/vendor/pdf/pdf.min.js',
  pdfWorker: '../static/vendor/pdf/pdf.worker.min.js',
  tess: '../static/vendor/ocr/tesseract.min.js',
  tessWorker: '../static/vendor/ocr/worker.min.js',
  tessCore: '../static/vendor/ocr/core',
  tessLang: '../static/vendor/ocr/lang'
};

const $ = id => document.getElementById(id);
const ui = {
  dropzone:$('dropzone'), fileInput:$('fileInput'), fileName:$('fileName'), pageCount:$('pageCount'),
  status:$('status'), progress:$('progressBar'), progressPanel:$('progressPanel'),
  progressTrack:$('progressTrack'), progressPercent:$('progressPercent'),
  progressHandle:$('progressHandle'), timeTravel:$('timeTravel'), alerts:$('alertsList'),
  alertBox:$('alertBox'), result:$('resultat'), copy:$('copyBtn'), reset:$('resetBtn')
};
const fields = {
  address:$('f-address'), identity:$('f-identity'), history:$('f-history'), usual:$('f-usual'),
  params:$('f-params'), admin:$('f-admin'), anamnesis:$('f-anamnesis'),
  vehicle:$('f-vehicle'), diagnosis:$('f-diagnosis'), transport:$('f-transport'), destination:$('f-destination')
};

let dependencyMode = {pdf:null, ocr:null};
let ocrWorker = null;
let currentPdf = null;
let alertMessages = [];
let busy = false;
let progressValue = 0;
let visualProgress = 0;
let secretClickCount = 0;
let lastSecretClick = 0;
let rewindArmed = false;
let dragPointerId = null;
let travelFrame = null;
let travelCleanupTimer = null;
let sirenSound = null;
let statusBeforeTravel = '';
let statusClassBeforeTravel = '';
function setBusy(value){busy=value;ui.reset.disabled=value;ui.fileInput.disabled=value;ui.dropzone.setAttribute('aria-disabled',String(value));ui.copy.disabled=value||!Object.values(fields).some(el=>el.value.trim());ui.progressPanel.classList.toggle('is-loading',value);if(!value&&progressValue<100)ui.progressPanel.classList.add('is-idle');}

function paintProgress(value) {
  visualProgress = Math.round(Math.max(0, Math.min(100, value)));
  ui.progressTrack.style.setProperty('--progress', visualProgress + '%');
  ui.progressTrack.setAttribute('aria-valuenow', String(visualProgress));
  ui.progressPercent.textContent = visualProgress + ' %';
}
function resetProgress() {
  progressValue = 0;
  ui.progressTrack.classList.add('is-resetting');
  paintProgress(0);
  void ui.progressTrack.offsetWidth;
  ui.progressTrack.classList.remove('is-resetting');
}
function setStatus(text, pct=null, cls='') {
  if (pct !== null) {
    const progress = Math.round(Math.max(0, Math.min(100, pct)));
    if (progress < progressValue) return;
    progressValue = progress;
    paintProgress(progress);
    if (busy) ui.progressPanel.classList.remove('is-idle');
  }
  ui.status.textContent = text;
  ui.status.className = cls;
}
function stopSiren() {
  const sound = sirenSound;
  if (!sound) return;
  sirenSound = null;
  const now = sound.context.currentTime;
  try {
    sound.volume.gain.cancelScheduledValues(now);
    sound.volume.gain.setTargetAtTime(0, now, .02);
    sound.tone.stop(now + .08);
    sound.sweep.stop(now + .08);
  } catch (_) { /* Le son peut déjà être terminé. */ }
}
function playSiren(durationMs) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  let context;
  try {
    context = new AudioContextClass();
    const tone = context.createOscillator();
    const sweep = context.createOscillator();
    const sweepDepth = context.createGain();
    const volume = context.createGain();
    tone.type = 'sine';
    tone.frequency.value = 760;
    sweep.type = 'triangle';
    sweep.frequency.value = 1.35;
    sweepDepth.gain.value = 190;
    sweep.connect(sweepDepth);
    sweepDepth.connect(tone.frequency);
    tone.connect(volume);
    volume.connect(context.destination);
    const now = context.currentTime;
    const end = now + durationMs / 1000;
    volume.gain.setValueAtTime(.001, now);
    volume.gain.linearRampToValueAtTime(.055, now + .06);
    volume.gain.setValueAtTime(.055, end - .15);
    volume.gain.linearRampToValueAtTime(.001, end);
    const sound = {context, tone, sweep, volume};
    sirenSound = sound;
    tone.onended = () => {
      if (sirenSound === sound) sirenSound = null;
      void context.close().catch(() => {});
    };
    tone.start(now);
    sweep.start(now);
    tone.stop(end);
    sweep.stop(end);
    void context.resume().catch(() => { if (sirenSound === sound) stopSiren(); });
  } catch (_) {
    if (context) void context.close().catch(() => {});
  }
}
function clearEasterEgg(restoreProgress=false) {
  stopSiren();
  if (travelFrame !== null) cancelAnimationFrame(travelFrame);
  if (travelCleanupTimer !== null) clearTimeout(travelCleanupTimer);
  travelFrame = null;
  travelCleanupTimer = null;
  rewindArmed = false;
  dragPointerId = null;
  secretClickCount = 0;
  ui.progressPanel.classList.remove('is-rewind', 'is-traveling');
  ui.timeTravel.classList.remove('is-active');
  ui.progressHandle.removeAttribute('title');
  ui.progressHandle.setAttribute('aria-label', 'Marqueur de progression');
  if (restoreProgress) paintProgress(progressValue);
}
function launchTimeTravel() {
  rewindArmed = false;
  dragPointerId = null;
  ui.progressPanel.classList.remove('is-rewind');
  ui.progressPanel.classList.add('is-traveling');
  paintProgress(0);
  ui.timeTravel.classList.remove('is-active');
  void ui.timeTravel.offsetWidth;
  ui.timeTravel.classList.add('is-active');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 800 : 2400;
  playSiren(duration);
  const started = performance.now();
  function advance(now) {
    const fraction = Math.min(1, (now-started)/duration);
    paintProgress(fraction*100);
    if (fraction < 1) {
      travelFrame = requestAnimationFrame(advance);
    } else {
      travelFrame = null;
      travelCleanupTimer = setTimeout(() => {
        clearEasterEgg(true);
        ui.status.textContent = statusBeforeTravel;
        ui.status.className = statusClassBeforeTravel;
      }, 350);
    }
  }
  travelFrame = requestAnimationFrame(advance);
}
function moveRewindHandle(event) {
  const bounds = ui.progressTrack.getBoundingClientRect();
  paintProgress((event.clientX-bounds.left)/bounds.width*100);
}
ui.progressHandle.addEventListener('click', () => {
  if (busy || progressValue !== 100 || rewindArmed || ui.progressPanel.classList.contains('is-traveling')) return;
  const now = performance.now();
  secretClickCount = now-lastSecretClick < 800 ? secretClickCount+1 : 1;
  lastSecretClick = now;
  if (secretClickCount < 3) return;
  secretClickCount = 0;
  rewindArmed = true;
  statusBeforeTravel = ui.status.textContent;
  statusClassBeforeTravel = ui.status.className;
  ui.status.textContent = 'Mode secret : glissez la flèche vers 0 %.';
  ui.progressHandle.title = 'Glisser vers 0 %';
  ui.progressHandle.setAttribute('aria-label', 'Glisser le marqueur vers zéro');
  ui.progressPanel.classList.add('is-rewind');
});
ui.progressHandle.addEventListener('pointerdown', event => {
  if (!rewindArmed) return;
  dragPointerId = event.pointerId;
  ui.progressHandle.setPointerCapture(event.pointerId);
  event.preventDefault();
});
ui.progressHandle.addEventListener('pointermove', event => {
  if (dragPointerId === event.pointerId && rewindArmed) moveRewindHandle(event);
});
ui.progressHandle.addEventListener('pointerup', event => {
  if (dragPointerId !== event.pointerId || !rewindArmed) return;
  moveRewindHandle(event);
  dragPointerId = null;
  if (visualProgress <= 5) launchTimeTravel();
});
ui.progressHandle.addEventListener('pointercancel', () => { dragPointerId = null; });
function addAlert(message, level='warn') {
  const key = level + '|' + message;
  if (alertMessages.some(x => x.key === key)) return;
  alertMessages.push({key,message,level});
  renderAlerts();
}
function renderAlerts() {
  ui.alerts.innerHTML = '';
  ui.alertBox.classList.toggle('visible', alertMessages.length > 0);
  for (const a of alertMessages) {
    const d = document.createElement('div');
    d.className = 'alert' + (a.level === 'error' ? ' error' : '');
    d.textContent = (a.level === 'error' ? '⛔ ' : '⚠ ') + a.message;
    ui.alerts.appendChild(d);
  }
}
function clearAlerts(){ alertMessages=[]; renderAlerts(); }

function loadScript(src, timeout=8000) {
  return new Promise((resolve,reject) => {
    const s=document.createElement('script');
    const timer=setTimeout(() => { s.remove(); reject(new Error('Délai dépassé : '+src)); }, timeout);
    s.src=src; s.async=true;
    s.onload=()=>{clearTimeout(timer);resolve(src)};
    s.onerror=()=>{clearTimeout(timer);s.remove();reject(new Error('Impossible de charger '+src))};
    document.head.appendChild(s);
  });
}
async function ensureDependencies() {
  if (!window.pdfjsLib) { setStatus('Chargement du lecteur PDF…', 4); await loadScript(LOCAL.pdf, 12000); }
  if (!window.Tesseract) { setStatus('Chargement de l’OCR…', 7); await loadScript(LOCAL.tess, 12000); }
  if (!window.pdfjsLib || !window.Tesseract) throw new Error('Bibliothèques PDF/OCR indisponibles.');
  dependencyMode.pdf = 'local';
  dependencyMode.ocr = 'local';
  pdfjsLib.GlobalWorkerOptions.workerSrc = LOCAL.pdfWorker;
}
function cancelAutoRefresh() {
  if (resetTimer !== null) clearTimeout(resetTimer);
  resetTimer = null;
}
function scheduleAutoRefresh() {
  cancelAutoRefresh();
  resetTimer = setTimeout(async () => {
    await resetAll();
    window.location.reload();
  }, RESET_DELAY_MS);
}

function normalize(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
}
function cleanText(s){ return String(s||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim(); }
function exactHeading(line, text){ return normalize(line.text) === normalize(text); }

function reconstructLines(textContent) {
  const raw = textContent.items
    .filter(it => it.str && it.str.trim())
    .map(it => ({str:it.str, x:it.transform[4], y:it.transform[5], w:it.width||0, h:Math.abs(it.height||it.transform[3]||8)}))
    .sort((a,b) => Math.abs(b.y-a.y)>1 ? b.y-a.y : a.x-b.x);
  const lines=[];
  for (const item of raw) {
    let best=null, bestDy=Infinity;
    for (const l of lines) {
      const dy=Math.abs(l.y-item.y);
      if (dy < bestDy && dy <= Math.max(2.2, Math.min(4, item.h*0.35))) { best=l; bestDy=dy; }
    }
    if (!best) { best={y:item.y,items:[],minX:item.x}; lines.push(best); }
    best.items.push(item); best.minX=Math.min(best.minX,item.x);
  }
  lines.sort((a,b)=>b.y-a.y);
  for (const l of lines) {
    l.items.sort((a,b)=>a.x-b.x);
    let out='', prevEnd=null;
    for (const it of l.items) {
      const gap = prevEnd===null ? 0 : it.x-prevEnd;
      if (out && gap > Math.max(0.8, it.h*0.12) && !/\s$/.test(out) && !/^\s/.test(it.str)) out+=' ';
      out += it.str;
      prevEnd = it.x + it.w;
    }
    l.text=cleanText(out); l.maxX=Math.max(...l.items.map(i=>i.x+i.w));
  }
  return lines.filter(l=>l.text);
}

async function extractNativePages(pdf) {
  const pages=[];
  for (let p=1;p<=pdf.numPages;p++) {
    setStatus(`Lecture du texte PDF - page ${p}/${pdf.numPages}`, 8 + (p/pdf.numPages)*22);
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent({normalizeWhitespace:false, disableCombineTextItems:false});
    const lines=reconstructLines(tc);
    pages.push({number:p,page,lines,text:lines.map(l=>l.text).join('\n')});
  }
  return pages;
}
function findPage(pages, needle){ const n=normalize(needle); return pages.find(p=>normalize(p.text).includes(n)); }
function findLineIndex(lines, heading, start=0){
  const n=normalize(heading);
  for(let i=start;i<lines.length;i++) if(normalize(lines[i].text)===n) return i;
  return -1;
}
function collectBetween(lines, startHeading, endHeadings, occurrence=1) {
  let start=-1, seen=0;
  for(let i=0;i<lines.length;i++) if(exactHeading(lines[i],startHeading)){ seen++; if(seen===occurrence){start=i;break;} }
  if(start<0) return {found:false, value:''};
  let end=lines.length;
  for(let i=start+1;i<lines.length;i++) {
    if(endHeadings.some(h=>normalize(lines[i].text)===normalize(h) || normalize(lines[i].text).startsWith(normalize(h)+' '))){end=i;break;}
  }
  const vals=lines.slice(start+1,end).map(l=>l.text).filter(Boolean);
  return {found:true,value:vals.join('\n').trim()};
}

function extractAddress(pages) {
  const p=findPage(pages,"Lieu d'intervention");
  if(!p){ addAlert("Zone 'Lieu d'intervention' non retrouvée : adresse non lue."); return NON_LU; }
  const iLieu=findLineIndex(p.lines,"Lieu d'intervention");
  const scoped=p.lines.slice(iLieu>=0?iLieu:0);
  const r=collectBetween(scoped,'Adresse',['Événement','Medecin regulateur','Médecin régulateur']);
  if(!r.found){ addAlert("Champ 'Régulation médicale > Lieu d'intervention > Adresse' non reconnu."); return NON_LU; }
  return r.value || 'NR';
}
function extractIdentity(pages) {
  const p=findPage(pages,'Patient');
  if(!p){ addAlert("Identité du patient non retrouvée."); return NON_LU; }
  const text=p.text;
  let nom='', prenom='', sexe='', age='', dob='';
  const header=text.match(/Patient\s*:\s*([^,\n]+),\s*([^\n–—-]+?)\s*[–—-]\s*([^\n–—-]+?)\s*[–—-]\s*(\d+)\s*an/i);
  if(header){ nom=cleanText(header[1]); prenom=cleanText(header[2]); sexe=cleanText(header[3]); age=header[4]; }
  const mdob=text.match(/Date de naissance\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/i); if(mdob) dob=mdob[1];
  if(!sexe){ const m=text.match(/(?:^|\n)Sexe\s+([^\n]+)/i); if(m) sexe=cleanText(m[1].split(/\s{2,}/)[0]); }
  if(!age){ const m=text.match(/Âge\s+(\d+)\s*an/i); if(m) age=m[1]; }
  if((!nom || !prenom)) {
    const m=text.match(/Prénom,\s*Nom\s+([^\n]+)/i);
    if(m){ const parts=cleanText(m[1]).split(/\s+/); if(parts.length>=2){prenom=parts.shift();nom=parts.join(' ');} }
  }
  const missing=[]; if(!prenom)missing.push('prénom'); if(!nom)missing.push('nom'); if(!sexe)missing.push('sexe'); if(!age)missing.push('âge'); if(!dob)missing.push('date de naissance');
  if(missing.length) addAlert('Identité du patient incomplète : '+missing.join(', ')+'.');
  if(!prenom && !nom && !sexe && !age && !dob) return NON_LU;
  const parts=[];
  if(prenom||nom) parts.push([prenom, nom?nom.toUpperCase():''].filter(Boolean).join(' '));
  if(sexe) parts.push(sexe);
  if(age) parts.push(age+' ans');
  if(dob) parts.push('né le '+dob);
  return parts.join(' - ');
}
function extractAnamnesisParts(pages) {
  const p=findPage(pages,'Antécédents') || findPage(pages,'Traitements en cours');
  if(!p){
    addAlert("Page d'anamnèse non reconnue : antécédents, traitement habituel et anamnèse non lus.");
    return {history:NON_LU,usual:NON_LU,anamnesis:NON_LU};
  }
  const h=collectBetween(p.lines,'Antécédents',['Traitements en cours']);
  const u=collectBetween(p.lines,'Traitements en cours',['Anamnèse']);
  let anStart=-1, count=0;
  for(let i=0;i<p.lines.length;i++) if(exactHeading(p.lines[i],'Anamnèse')){count++; if(count===2){anStart=i;break;}}
  if(anStart<0){
    // Sur certains exports, le titre de section et le champ peuvent être le même premier libellé.
    const first=findLineIndex(p.lines,'Anamnèse');
    if(first>=0) {
      const idxTreat=findLineIndex(p.lines,'Traitements en cours');
      if(first>idxTreat) anStart=first;
    }
  }
  let anFound=anStart>=0, anVal='';
  if(anFound){
    let end=p.lines.length;
    const ends=['Date et heure du 1er symptôme','Heure d’arrivée des premiers secours','Heure d\'arrivée des premiers secours','Prise en charge réalisée avant l’arrivée du SMUR','Prise en charge réalisée avant l\'arrivée du SMUR','Mode de vie','Mensurations','Examen clinique'];
    for(let i=anStart+1;i<p.lines.length;i++){
      const n=normalize(p.lines[i].text);
      if(ends.some(e=>n.startsWith(normalize(e)))){end=i;break;}
    }
    anVal=p.lines.slice(anStart+1,end).map(l=>l.text).join('\n').trim();
  }
  if(!h.found) addAlert("Champ 'Antécédents' non reconnu.");
  if(!u.found) addAlert("Champ 'Traitements en cours' non reconnu.");
  if(!anFound) addAlert("Champ 'Anamnèse > Anamnèse' non reconnu.");
  return {
    history:h.found ? (h.value||'NR') : NON_LU,
    usual:u.found ? (u.value||'NR') : NON_LU,
    anamnesis:anFound ? (anVal||'NR') : NON_LU
  };
}

// Read the right-hand field independently from the neighbouring left column.
function readInlineField(pages, label, stops){
  const target=normalize(label);
  for(const page of pages){
    for(let i=0;i<page.lines.length;i++){
      const line=page.lines[i];
      const at=normalize(line.text).indexOf(target);
      if(at<0)continue;
      const match=line.text.match(new RegExp(label.replace(/[éèê]/g,'[éèêe]'),'i'));
      if(!match)continue;
      let value=cleanText(line.text.slice(match.index+match[0].length).replace(/^\s*[:：]\s*/,''));
      // The fields in this export occupy the right half of the page.
      const startItem=(line.items||[]).find(it=>normalize(it.str).includes(target) || normalize(it.str).startsWith(target.split(' ')[0]));
      const left=startItem?startItem.x:null;
      for(let j=i+1;j<page.lines.length;j++){
        const next=page.lines[j];
        if(stops.some(h=>normalize(next.text).includes(normalize(h))))break;
        if(left===null)break;
        const continuation=cleanText((next.items||[]).filter(it=>it.x>=left-3).map(it=>it.str).join(' '));
        if(!continuation)break;
        value=cleanText(value+' '+continuation);
      }
      return value||'NR';
    }
  }
  addAlert('Champ « '+label+' » non retrouvé.');return NON_LU;
}
function extractFinalDetails(pages){
  const vehicle=readInlineField(pages,'Type de vecteur SMUR',["Heure du déclenchement",'Patient','SMUR Connect']);
  const finalPage=findPage(pages,'Diagnostic final')||findPage(pages,'Diagnostique final');
  let diagnosis=NON_LU, transport=NON_LU, destination=NON_LU;
  if(finalPage){
    let start=finalPage.lines.findIndex(l=>/diagnosti(?:c|que) final/.test(normalize(l.text)));
    const scoped={...finalPage,lines:finalPage.lines.slice(start+1)};
    const d=collectBetween(scoped.lines,'Diagnostic',['Transport','Admission']);
    const alt=d.found?d:collectBetween(scoped.lines,'Diagnostique',['Transport','Admission']);
    diagnosis=alt.found?(alt.value||'NR'):NON_LU;
    if(!alt.found)addAlert('Champ « Diagnostic » non retrouvé.');
    const raw=readInlineField([scoped],'Transporté',["Vecteur d'évacuation",'Admission','Arrivée','SMUR Connect']);
    const n=normalize(raw).replace(/[‐‑–—-]/g,' ');
    transport=/^(?:non medicalise|transport non medicalise|tnm)[ .]*$/.test(n)?'TNM':/^(?:medicalise|transport medicalise)[ .]*$/.test(n)?'Médicalisé':raw;
    destination=readInlineField([scoped],'Établissement receveur',['Arrivée au lit','Médecin receveur','SMUR Connect']);
  }else addAlert('Rubrique « Diagnostic final » non retrouvée.');
  return {vehicle,diagnosis,transport,destination};
}

async function renderPageToCanvas(page, scale=2.5) {
  const viewport=page.getViewport({scale});
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  await page.render({canvasContext:ctx,viewport,background:'rgb(255,255,255)'}).promise;
  return canvas;
}
function imageAccessor(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const im=ctx.getImageData(0,0,canvas.width,canvas.height); const d=im.data,w=canvas.width,h=canvas.height;
  const gray=(x,y)=>{const i=(Math.max(0,Math.min(h-1,y|0))*w+Math.max(0,Math.min(w-1,x|0)))*4;return(d[i]+d[i+1]+d[i+2])/3};
  const rgb=(x,y)=>{const i=((y|0)*w+(x|0))*4;return[d[i],d[i+1],d[i+2]]};
  return {ctx,im,d,w,h,gray,rgb};
}
function groupsFromIndices(indices,maxGap=1,minLen=1){
  if(!indices.length)return[]; const out=[]; let s=indices[0],p=s;
  for(let k=1;k<indices.length;k++){const v=indices[k]; if(v<=p+maxGap)p=v;else{if(p-s+1>=minLen)out.push([s,p]);s=p=v;}}
  if(p-s+1>=minLen)out.push([s,p]); return out;
}
function rowDarkFraction(acc,y,x0,x1,thr=180){let n=0,total=Math.max(1,x1-x0);for(let x=x0;x<x1;x++)if(acc.gray(x,y)<thr)n++;return n/total;}
function colDarkAt(acc,x,y1,y2,thr=180){return acc.gray(x,y1)<thr && acc.gray(x,y2)<thr;}
function detectBlackBands(acc){
  const x0=Math.round(acc.w*.02), x1=Math.round(acc.w*.50), ys=[];
  for(let y=Math.round(acc.h*.05);y<Math.round(acc.h*.86);y++) if(rowDarkFraction(acc,y,x0,x1,60)>.60) ys.push(y);
  return groupsFromIndices(ys,1,5);
}
function detectGeometry(canvas){
  const acc=imageAccessor(canvas), bands=detectBlackBands(acc);
  if(bands.length<2) throw new Error('Bandes de structure du tableau non reconnues.');
  const b0=bands[0], b1=bands[1], b2=bands[2]||[Math.round(acc.h*.80),Math.round(acc.h*.82)];
  const bh=b0[1]-b0[0]+1, yA=Math.max(0,b0[0]-Math.round(.80*bh)), yB=Math.max(0,b0[0]-Math.round(.28*bh));
  const xs=[]; for(let x=Math.round(acc.w*.01);x<Math.round(acc.w*.60);x++) if(colDarkAt(acc,x,yA,yB,190)) xs.push(x);
  const xGroups=groupsFromIndices(xs,1,1).filter(g=>g[1]-g[0]<=6);
  let xLines=xGroups.map(g=>Math.round((g[0]+g[1])/2));
  if(xLines.length<4) throw new Error('Colonnes horaires non reconnues.');
  const tableLeft=xLines[0], labelRight=xLines[1];
  // Bord droit : extrémité du bandeau noir côté horaires.
  const mid=Math.round((b0[0]+b0[1])/2); let runStart=null, runs=[];
  for(let x=tableLeft;x<Math.round(acc.w*.60);x++){
    if(acc.gray(x,mid)<100){if(runStart===null)runStart=x;} else if(runStart!==null){runs.push([runStart,x-1]);runStart=null;}
  }
  if(runStart!==null)runs.push([runStart,Math.round(acc.w*.60)-1]);
  const rightRun=runs.filter(r=>r[0]>=labelRight-3).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0];
  const tableRight=rightRun?rightRun[1]:xLines[xLines.length-1]+Math.round((xLines[xLines.length-1]-xLines[xLines.length-2]));
  xLines=xLines.filter(x=>x>=tableLeft-2 && x<=tableRight+2);
  const internal=xLines.slice(1); // commence à la séparation libellé / première heure
  let boundaries=[labelRight,...internal.slice(1),tableRight];
  boundaries=[...new Set(boundaries.map(Math.round))].sort((a,b)=>a-b);
  if(boundaries.length<3) throw new Error('Grille horaire insuffisante.');
  return {acc,bands,b0,b1,b2,tableLeft,tableRight,labelRight,boundaries,headerTop:yA};
}
function findHorizontalLines(g,y0,y1){
  const ys=[]; for(let y=Math.max(0,y0);y<Math.min(g.acc.h,y1);y++) if(rowDarkFraction(g.acc,y,g.tableLeft,g.tableRight,180)>.65)ys.push(y);
  return groupsFromIndices(ys,1,1);
}
function detectTextBands(g,y0,y1){
  const arr=[];
  for(let y=y0;y<y1;y++){
    let c=0; for(let x=g.tableLeft+10;x<g.labelRight-10;x++) if(g.acc.gray(x,y)<120)c++;
    if(c>5)arr.push(y);
  }
  return groupsFromIndices(arr,1,3);
}
function cropCanvas(source,x0,y0,x1,y1,scale=5,threshold=null){
  x0=Math.max(0,Math.floor(x0));y0=Math.max(0,Math.floor(y0));x1=Math.min(source.width,Math.ceil(x1));y1=Math.min(source.height,Math.ceil(y1));
  const w=Math.max(2,x1-x0),h=Math.max(2,y1-y0); const out=document.createElement('canvas'); out.width=w*scale;out.height=h*scale;
  const c=out.getContext('2d',{willReadFrequently:true}); c.imageSmoothingEnabled=true; c.drawImage(source,x0,y0,w,h,0,0,out.width,out.height);
  if(threshold!==null){const im=c.getImageData(0,0,out.width,out.height);for(let i=0;i<im.data.length;i+=4){const v=(im.data[i]+im.data[i+1]+im.data[i+2])/3;const b=v>threshold?255:0;im.data[i]=im.data[i+1]=im.data[i+2]=b;im.data[i+3]=255;}c.putImageData(im,0,0);}
  return out;
}
async function getOCRWorker(){
  if(ocrWorker)return ocrWorker;
  setStatus('Initialisation OCR locale dans le navigateur…',34);
  const opts={logger:m=>{
    if(m && m.status && typeof m.progress==='number') setStatus('OCR : '+m.status,34+Math.round(m.progress*8));
  }};
  if(dependencyMode.ocr==='local') Object.assign(opts,{workerPath:LOCAL.tessWorker,corePath:LOCAL.tessCore,langPath:LOCAL.tessLang});
  ocrWorker=await Tesseract.createWorker('fra',1,opts);
  return ocrWorker;
}
async function ocrCanvas(canvas,psm='7',thresholdInfo=''){
  const worker=await getOCRWorker();
  try{ await worker.setParameters({tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1',tessedit_char_whitelist:''}); }catch(_){ }
  const r=await worker.recognize(canvas);
  return {text:cleanText((r.data&&r.data.text)||'').replace(/\s*\n\s*/g,' '),confidence:Number((r.data&&r.data.confidence)||0)};
}
function parseTime(raw){
  let s=cleanText(raw).replace(/[Il|]/g,'1').replace(/[oO]/g,'0');
  let m=s.match(/(\d{1,2})\s*[hH:]\s*(\d{2})/); if(!m){const d=s.replace(/\D/g,''); if(d.length===4)m=[d,d.slice(0,2),d.slice(2)];}
  if(!m)return null; const hh=Number(m[1]),mm=Number(m[2]); if(hh>23||mm>59)return null; return {text:String(hh).padStart(2,'0')+'h'+String(mm).padStart(2,'0'),minutes:hh*60+mm};
}
function classifyParam(label){
  const n=normalize(label).replace(/0/g,'o');
  if(/glasg|gcs/.test(n))return'g'; if(/\bpas\b/.test(n))return'pas'; if(/\bpad\b/.test(n))return'pad'; if(/pam/.test(n))return'pam';
  if(/lieu.*mesure/.test(n))return'location'; if(/\bfc\b|frequence cardiaque|pouls/.test(n))return'fc'; if(/spo2|saturation/.test(n))return'sat';
  if(/debit.*o2|debit.*02|o2.*l\/min|02.*l\/min/.test(n))return'o2'; if(/peep/.test(n))return'peep'; if(/\bvc\b|\bvt\b|volume courant/.test(n))return'vc';
  if(/\bfr\b|frequence respiratoire/.test(n))return'fr'; if(/douleur|\beva\b|\bdl\b|\ben\b/.test(n))return'dl'; if(/temp/.test(n))return'temp';
  if(/gly|dextro|hgt/.test(n))return'gly'; if(/\bhb\b|hemoglob|hemocue/.test(n))return'hb'; if(/etco2|capno/.test(n))return'capno'; return'other';
}
function inkCount(g,x0,y0,x1,y1,thr=180){let c=0;for(let y=Math.max(0,y0);y<Math.min(g.acc.h,y1);y++)for(let x=Math.max(0,x0);x<Math.min(g.acc.w,x1);x++)if(g.acc.gray(x,y)<thr)c++;return c;}
function greenCount(g,x0,y0,x1,y1){let c=0;for(let y=Math.max(0,y0);y<Math.min(g.acc.h,y1);y++)for(let x=Math.max(0,x0);x<Math.min(g.acc.w,x1);x++){const [r,gg,b]=g.acc.rgb(x,y);if(gg>r+10&&gg>b+10&&gg>80)c++;}return c;}
function cleanNumeric(raw){
  const s=cleanText(raw).replace(/[|Il]/g,'1').replace(/[oO]/g,'0');
  const m=s.match(/\(?\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?\)?/); return m?m[0]:'';
}
function latest(entries){
  const known=entries.filter(e=>e.time&&Number.isFinite(e.time.minutes)); if(!known.length)return entries[entries.length-1]||null;
  known.sort((a,b)=>a.time.minutes-b.time.minutes); return known[known.length-1];
}
function formatHumanParam(key,label,value){
  const v=cleanNumeric(value)||cleanText(value); if(!v)return'';
  const clean=v.replace(/[%()]/g,'');
  const names={g:'G',dl:'EVA',fr:'FV',sat:'SAT',fc:'FC',temp:'T',gly:'GLY'};
  return names[key] ? names[key]+' '+clean : '';
}
function formatBloodPressureSide(raw){
  const n=normalize(raw);
  if(/gauche/.test(n))return'gauche';
  if(/droite|droit/.test(n))return'droite';
  return'';
}

async function readSurveillance(page){
  setStatus('Analyse de la grille de surveillance…',42);
  const canvas=await renderPageToCanvas(page,2.5); let g;
  try{g=detectGeometry(canvas);}catch(e){addAlert('Tableau de surveillance non reconnu : '+e.message);return{params:NON_LU,admin:NON_LU};}
  const colN=g.boundaries.length-1;
  const topLines=findHorizontalLines(g,Math.max(0,g.b0[0]-(g.b0[1]-g.b0[0]+1)*2),g.b0[0]);
  const topY=topLines.length?topLines[0][1]+2:Math.max(0,g.b0[0]-40);
  const times=[];
  for(let i=0;i<colN;i++){
    const crop=cropCanvas(canvas,g.boundaries[i]+2,topY,g.boundaries[i+1]-2,g.b0[0]-2,5,200);
    const o=await ocrCanvas(crop,7); const t=parseTime(o.text); times.push(t);
    if(!t) addAlert(`Heure non identifiée pour la colonne de surveillance ${i+1}.`);
    else if(o.confidence && o.confidence<65) addAlert(`Lecture OCR incertaine pour l'heure ${t.text} (confiance ${Math.round(o.confidence)} %).`);
  }
  if(times.filter(Boolean).length===0){addAlert('Paramètres de surveillance détectés mais horaires non lisibles.');return{params:NON_LU,admin:NON_LU};}

  const bands=detectTextBands(g,g.b0[1]+2,g.b1[0]-1); const measures=[];
  for(let r=0;r<bands.length;r++){
    const [y0,y1]=bands[r];
    const labelCrop=cropCanvas(canvas,g.tableLeft+5,y0-5,g.labelRight-5,y1+5,4,190);
    const lo=await ocrCanvas(labelCrop,7); const label=lo.text; if(!label)continue;
    const key=classifyParam(label);
    if(lo.confidence && lo.confidence<55) addAlert(`Libellé de paramètre OCR incertain : « ${label} ».`);
    for(let c=0;c<colN;c++){
      const x0=g.boundaries[c]+3,x1=g.boundaries[c+1]-3;
      if(inkCount(g,x0,y0-8,x1,y1+8,180)<=3)continue;
      let threshold=(key==='location')?200:null;
      const vcrop=cropCanvas(canvas,x0,y0-10,x1,y1+10,7,threshold);
      const vo=await ocrCanvas(vcrop,7); let value=vo.text;
      if(key!=='location') value=cleanNumeric(value)||cleanText(value);
      if(!value){addAlert(`Valeur OCR non lue pour « ${label} »${times[c]?' à '+times[c].text:''}.`);continue;}
      if(vo.confidence && vo.confidence<55) addAlert(`Valeur OCR incertaine : ${label} = ${value}${times[c]?' à '+times[c].text:''}.`);
      measures.push({row:r,key,label,value,time:times[c],col:c});
    }
  }
  if(bands.length && !measures.length)addAlert('Paramètres de surveillance détectés mais lecture incomplète.');

  const out=[];
  // PA : dernière colonne possédant PAS et PAD. PAM explicitement ignorée.
  const pas=measures.filter(m=>m.key==='pas'), pad=measures.filter(m=>m.key==='pad');
  const paPairs=[];
  for(const a of pas){const b=pad.find(x=>x.col===a.col);if(b)paPairs.push({a,b,time:a.time||b.time,col:a.col,row:a.row});}
  const pa=latest(paPairs.map(x=>({time:x.time,...x})));
  const locations=measures.filter(m=>m.key==='location');
  const handled=new Set(['pas','pad','pam','location']);
  const selected=new Set(['g','dl','fr','sat','fc','temp','gly']);
  const keys=[];
  for(const m of measures){if(!selected.has(m.key)||handled.has(m.key))continue;const k=m.key;if(!keys.some(x=>x.k===k))keys.push({k,key:m.key,label:m.label,row:m.row});}
  for(const k of keys){const arr=measures.filter(m=>m.key===k.k);const m=latest(arr);if(m){const body=formatHumanParam(m.key,m.label,m.value);if(body)out.push({row:k.row,text:body});}}
  if(pa){
    const pv1=cleanNumeric(pa.a.value).replace(/[()]/g,''), pv2=cleanNumeric(pa.b.value).replace(/[()]/g,'');
    if(pv1&&pv2){let line='TA '+pv1+'/'+pv2;const loc=locations.find(x=>x.col===pa.col);const side=loc?formatBloodPressureSide(loc.value):'';if(side)line+=' '+side;out.push({row:pa.row,text:line});}
    else addAlert('PAS/PAD détectées mais lecture insuffisante pour construire la pression artérielle.');
  }
  out.sort((a,b)=>a.row-b.row);

  // Thérapeutiques : lignes séparées par la grille, évènements détectés par cellule colorée/occupée.
  setStatus('Lecture des thérapeutiques…',72);
  const hLines=findHorizontalLines(g,g.b1[1]+1,g.b2[0]+2); const rowBounds=[g.b1[1]+1,...hLines.map(v=>Math.round((v[0]+v[1])/2))];
  const events=[];
  for(let r=0;r<rowBounds.length-1;r++){
    const y0=rowBounds[r]+3,y1=rowBounds[r+1]-3; if(y1-y0<10)continue;
    const lcrop=cropCanvas(canvas,g.tableLeft+5,y0,g.labelRight-5,y1,4,190); const lo=await ocrCanvas(lcrop,6); const label=cleanText(lo.text);
    if(!label)continue;
    if(lo.confidence && lo.confidence<55)addAlert(`Thérapeutique OCR incertaine : « ${label} ».`);
    for(let c=0;c<colN;c++){
      const x0=g.boundaries[c]+3,x1=g.boundaries[c+1]-3;
      const green=greenCount(g,x0,y0,x1,y1); const dark=inkCount(g,x0+1,y0,x1-1,y1,120);
      if(green<=10 && dark<=15)continue;
      let extra='';
      const ccrop=cropCanvas(canvas,x0,y0,x1,y1,7,null); const co=await ocrCanvas(ccrop,7);
      const dose=(co.text.match(/\b\d+(?:[.,]\d+)?\s*(?:mg|g|µg|mcg|ml|mL)\b/i)||[])[0]||'';
      if(dose && !normalize(label).includes(normalize(dose).replace(/\s/g,'')) && !normalize(label).replace(/\s/g,'').includes(normalize(dose).replace(/\s/g,''))) extra=' '+dose;
      const t=times[c]; if(!t)addAlert(`Heure non identifiée pour une thérapeutique : ${label}.`);
      events.push({col:c,row:r,text:label+extra});
    }
  }
  events.sort((a,b)=>a.col-b.col||a.row-b.row);
  const paramsText = out.length ? out.map(x=>x.text).join('\n') : (bands.length ? (measures.length ? 'NR' : NON_LU) : 'NR');
  return {params:paramsText, admin:events.length?events.map(x=>x.text).join('\n'):'NR'};
}

function updateFields(data){
  fields.address.value=data.address; fields.identity.value=data.identity; fields.history.value=data.history; fields.usual.value=data.usual;
  fields.params.value=data.params; fields.admin.value=data.admin; fields.anamnesis.value=data.anamnesis;
  for(const key of ['vehicle','diagnosis','transport','destination'])fields[key].value=data[key];
  regenerate();
}
function valueOrNR(el){const v=el.value.trim();return v||'NR';}
function regenerate(){
  ui.result.value = [
    "INDICATIF DU VÉHICULE\n"+valueOrNR(fields.vehicle),
    "ADRESSE D'INTERVENTION\n"+valueOrNR(fields.address),
    'IDENTITE\n'+valueOrNR(fields.identity),
    'ANTECEDENTS\n'+valueOrNR(fields.history),
    'TRAITEMENT HABITUEL\n'+valueOrNR(fields.usual),
    'PARAMETRES\n'+valueOrNR(fields.params),
    'TRAITEMENTS ADMINISTRES\n'+valueOrNR(fields.admin),
    'ANAMNESE\n'+valueOrNR(fields.anamnesis),
    'DIAGNOSTIC FINAL\nDiagnostic : '+valueOrNR(fields.diagnosis)+'\nTransport : '+valueOrNR(fields.transport)+' | Destination : '+valueOrNR(fields.destination)
  ].join('\n\n');
  ui.copy.disabled=busy||!Object.values(fields).some(el=>el.value.trim());
}

async function analyzeFile(file){
  if(busy)return;
  cancelAutoRefresh();
  clearEasterEgg();
  ui.progressPanel.classList.add('is-idle');
  resetProgress();
  setBusy(true);
  for(const el of Object.values(fields))el.value='';ui.result.value='';
  clearAlerts(); ui.fileName.textContent=file.name; ui.pageCount.textContent='-'; setStatus('Ouverture du PDF…',2);
  if(!/\.pdf$/i.test(file.name) && file.type!=='application/pdf'){addAlert('Le fichier sélectionné n’est pas un PDF.','error');setStatus('Fichier refusé',null,'status-warn');ui.progressPanel.classList.add('is-idle');setBusy(false);return;}
  try{
    await ensureDependencies();
    const bytes=await file.arrayBuffer();
    currentPdf=await pdfjsLib.getDocument({data:new Uint8Array(bytes)}).promise;
    ui.pageCount.textContent=String(currentPdf.numPages);
    const pages=await extractNativePages(currentPdf);
    const base={address:extractAddress(pages),identity:extractIdentity(pages),...extractAnamnesisParts(pages),...extractFinalDetails(pages),params:'NR',admin:'NR'};
    const surv=pages.find(p=>normalize(p.text).includes(normalize("Surveillance du patient pendant l'intervention")));
    if(surv){
      try{const s=await readSurveillance(surv.page);base.params=s.params;base.admin=s.admin;}
      catch(e){console.error(e);addAlert('Tableau de surveillance détecté mais lecture OCR interrompue : '+e.message,'error');base.params=NON_LU;base.admin=NON_LU;}
    }
    updateFields(base);
    setStatus('Données prêtes à vérifier · remise à zéro dans 5 min',100,'status-ok');
    scheduleAutoRefresh();
  }catch(e){
    console.error(e); addAlert('Analyse impossible : '+e.message,'error'); setStatus('Échec de l’analyse',null,'status-warn');ui.progressPanel.classList.add('is-idle');
  }finally{setBusy(false);}
}

async function copyResult(){
  if (rewindArmed || ui.progressPanel.classList.contains('is-traveling')) {
    clearEasterEgg(true);
    ui.status.textContent = statusBeforeTravel;
    ui.status.className = statusClassBeforeTravel;
  }
  regenerate();
  const text=ui.result.value;
  try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);}else throw new Error('fallback');setStatus('Version EXOS copiée dans le presse-papier',100,'status-ok');}
  catch(_){ui.result.focus();ui.result.select();try{if(!document.execCommand('copy'))throw new Error('Copie refusée');setStatus('Version EXOS copiée dans le presse-papier',100,'status-ok');}catch(e){addAlert('Copie automatique impossible : sélectionner le texte et utiliser Ctrl+C.','error');}}
}
async function resetAll(){
  cancelAutoRefresh();
  clearEasterEgg();
  if(ocrWorker){try{await ocrWorker.terminate();}catch(_){}ocrWorker=null;} if(currentPdf){try{await currentPdf.destroy();}catch(_){}} currentPdf=null; clearAlerts(); ui.fileInput.value='';ui.fileName.textContent='Aucun fichier';ui.pageCount.textContent='-';
  resetProgress();
  for(const el of Object.values(fields))el.value='';ui.result.value='';setStatus('En attente',0);setBusy(false);ui.dropzone.focus();
}

ui.dropzone.addEventListener('click',()=>{if(!busy)ui.fileInput.click();});
ui.dropzone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!busy)ui.fileInput.click();}});
ui.fileInput.addEventListener('change',e=>{if(e.target.files&&e.target.files[0])analyzeFile(e.target.files[0]);});
for(const ev of ['dragenter','dragover'])ui.dropzone.addEventListener(ev,e=>{e.preventDefault();ui.dropzone.classList.add('dragover');});
for(const ev of ['dragleave','drop'])ui.dropzone.addEventListener(ev,e=>{e.preventDefault();ui.dropzone.classList.remove('dragover');});
ui.dropzone.addEventListener('drop',e=>{const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)analyzeFile(f);});
for(const el of Object.values(fields))el.addEventListener('input',regenerate); ui.copy.addEventListener('click',copyResult); ui.reset.addEventListener('click',resetAll);

})();

