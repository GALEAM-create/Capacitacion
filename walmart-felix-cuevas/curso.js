'use strict';
const $=s=>document.querySelector(s),lessons=[...document.querySelectorAll('.lesson')];
let person=null,state=null,storageKey='',current=0,questions=[],busy=false,timer=null;
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
const allowed=p=>['WALMART FELIX CUEVAS','FELIX CUEVAS'].includes(normalize(p?.servicio));
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(text){$('#status').textContent=text}
function persist(){try{sessionStorage.setItem(storageKey,JSON.stringify(state))}catch{status('El navegador no permite conservar el avance. Mantén esta pestaña abierta hasta terminar.')}}
function showAuth(text){$('#auth').hidden=false;$('#auth-message').textContent=text||'Tu sesión terminó. Tus respuestas se conservan en esta pestaña. Ingresa al portal y vuelve aquí para continuar.'}
async function request(url,options={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch(url,{...options,credentials:'same-origin',cache:'no-store',signal:controller.signal});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.mensaje||'No fue posible conectar. Intenta nuevamente.');e.status=r.status;throw e}
  return d;
 }catch(e){if(e.name==='AbortError')throw new Error('La conexión tardó demasiado. Reintenta cuando tengas conexión.');throw e}
 finally{clearTimeout(timeout)}
}
async function session(){
 const d=await request('/api/portal/session');
 if(!d.autenticado||!d.participante){const e=new Error('Ingresa al portal para continuar.');e.status=401;throw e}
 if(!allowed(d.participante))throw new Error('Este curso está disponible únicamente para el servicio Walmart Félix Cuevas.');
 if(person&&String(person.numero_empleado)!==String(d.participante.numero_empleado)){const e=new Error('Cambió la cuenta. Ingresa al portal con la cuenta que inició esta evaluación para recuperar sus respuestas.');e.status=409;throw e}
 person=d.participante;$('#auth').hidden=true;
 $('#participant').textContent=person.nombre+' · '+person.numero_empleado;
 return person;
}
function fail(e){status(e.message);if([401,409].includes(e.status))showAuth(e.message+' Tus respuestas se conservan en esta pestaña.')}
function renderProgress(){
 $('#progress').value=state.seen.length;$('#progress-label').textContent=state.seen.length+' de 12 páginas revisadas';
 $('#exam-nav').disabled=state.seen.length<12;
}
function page(n,focus=true){
 if(!state)return;
 if(n===12&&state.seen.length<12){status('Revisa todas las páginas antes de iniciar la evaluación.');return}
 current=Math.max(0,Math.min(12,n));lessons.forEach((p,i)=>p.hidden=i!==current);$('#exam').hidden=current!==12;
 $('#navigation').hidden=current===12;$('#prev').disabled=current===0;$('#page-label').textContent='Página '+(current+1)+' de 12';
 $('#next').textContent=current===11?'Ir a evaluación →':'Siguiente →';
 document.querySelectorAll('[data-page]').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.page)===current?'page':'false'));
 if(current<12&&!state.seen.includes(current)){state.seen.push(current);persist()}
 renderProgress();history.replaceState(null,'',current===0?'#portada':current===12?'#evaluacion':'#pagina-'+(current+1));
 if(innerWidth<=900)$('#contents').open=false;
 if(focus){(current===12?$('#exam h1'):lessons[current].querySelector('h1')).focus();$('#main').scrollIntoView({block:'start'})}
}
function renderExam(){
 const attempt=state.attempt;
 $('#begin').hidden=!!attempt;$('#exam-form').hidden=!attempt||!!attempt.result;
 $('#timer').hidden=!attempt||attempt.graded;
 $('#result').hidden=!attempt?.result;$('#new-attempt').hidden=!attempt?.result;
 $('#retry').hidden=!attempt?.graded||!!attempt.result;
 if(!attempt)return;
 $('#questions').innerHTML=questions.map((q,i)=>`<fieldset><legend>${i+1}. ${escapeHTML(q.q)}</legend>${q.options.map((o,j)=>`<label><input type="radio" name="q${i}" value="${j}" ${attempt.answers[i]===j?'checked':''} ${attempt.graded?'disabled':''}><span>${'ABC'[j]}) ${escapeHTML(o)}</span></label>`).join('')}</fieldset>`).join('');
 $('#submit').disabled=attempt.graded;
 if(attempt.result){const r=attempt.result;$('#result').innerHTML=`<strong>${r.calificacion} / 100 · ${r.aprobado?'Aprobado':'No aprobado'}</strong><p>Calificación guardada. Intento ${r.intento}. Modalidad: E‑LEARNING.</p><a href="/portal">Consultar mi historial</a>`}
 clearInterval(timer);if(!attempt.graded){tick();timer=setInterval(tick,1000)}
}
function tick(){
 const a=state?.attempt;if(!a||a.graded)return;
 const seconds=Math.max(0,Math.ceil((a.deadline-Date.now())/1000));
 $('#timer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 if(seconds===0)finish(true);
}
async function save(){
 const a=state?.attempt;if(busy||!a?.graded||a.result)return;
 busy=true;$('#retry').disabled=true;status('Guardando calificación…');
 try{
  const r=await request('/api/portal/felix-cuevas/resultados',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({respuestas:a.answers,numero_empleado_sesion:person.numero_empleado,envio_id:a.id})});
  if(!Number.isFinite(r.calificacion)||!r.id||r.modalidad!=='E-LEARNING')throw new Error('No recibimos la confirmación completa. Reintenta el guardado.');
  a.result=r;persist();renderExam();status('Tu resultado quedó guardado correctamente.');$('#result').focus();
 }catch(e){fail(e);$('#retry').hidden=false}
 finally{busy=false;$('#retry').disabled=false}
}
function finish(timedOut=false){
 const a=state?.attempt;if(!a||a.graded)return;
 if(!timedOut&&a.answers.includes(null)){status('Responde las diez preguntas antes de finalizar.');return}
 a.graded=true;clearInterval(timer);persist();renderExam();page(12);save();
}
async function initialize(){
 try{
  await session();questions=await request('preguntas.json?v=1');
  if(!Array.isArray(questions)||questions.length!==10)throw new Error('No fue posible cargar las preguntas. Recarga la página.');
  storageKey='hoplon:felix:v1:'+person.numero_empleado;
  try{state=JSON.parse(sessionStorage.getItem(storageKey))}catch{}
  if(!state||state.owner!==String(person.numero_empleado))state={owner:String(person.numero_empleado),seen:[],attempt:null};
  state.seen=[...new Set((state.seen||[]).filter(n=>Number.isInteger(n)&&n>=0&&n<12))];
  $('#contents').open=innerWidth>900;status('');page(state.attempt&&!state.attempt.result?12:0,false);renderExam();
  if(state.attempt?.graded&&!state.attempt.result)save();
 }catch(e){fail(e);showAuth(e.message)}
}
$('#begin').addEventListener('click',async()=>{
 if(busy||state?.attempt)return;$('#begin').disabled=true;
 try{await session();if(state.seen.length!==12)throw new Error('Revisa todas las páginas antes de iniciar.');state.attempt={id:crypto.randomUUID(),deadline:Date.now()+15*60*1000,answers:Array(10).fill(null),graded:false,result:null};persist();status('');renderExam()}
 catch(e){fail(e)}finally{$('#begin').disabled=false}
});
$('#exam-form').addEventListener('change',e=>{
 if(!state?.attempt||state.attempt.graded)return;
 if(Date.now()>=state.attempt.deadline){finish(true);return}
 const match=/^q(\d+)$/.exec(e.target.name);if(match){state.attempt.answers[Number(match[1])]=Number(e.target.value);persist()}
});
$('#exam-form').addEventListener('submit',e=>{e.preventDefault();finish(Date.now()>=state.attempt.deadline)});
$('#retry').addEventListener('click',save);
$('#new-attempt').addEventListener('click',()=>{if(!state.attempt?.result)return;state.attempt=null;persist();status('');renderExam()});
$('#check-session').addEventListener('click',async()=>{if(!state){await initialize();return}try{await session();status('Sesión recuperada.');if(state.attempt?.graded)save()}catch(e){fail(e)}});
$('#prev').addEventListener('click',()=>page(current-1));$('#next').addEventListener('click',()=>page(current+1));$('#exam-nav').addEventListener('click',()=>page(12));
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>page(Number(b.dataset.page))));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
let touch=null;$('#main').addEventListener('touchstart',e=>{if(current<12&&!e.target.closest('button,a,input'))touch={x:e.touches[0].clientX,y:e.touches[0].clientY};else touch=null},{passive:true});
$('#main').addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>85&&Math.abs(dx)>Math.abs(dy)*1.5)page(current+(dx<0?1:-1))},{passive:true});
initialize();
