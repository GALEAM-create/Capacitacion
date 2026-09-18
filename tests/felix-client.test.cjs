const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const code=fs.readFileSync(require('node:path').join(__dirname,'../walmart-felix-cuevas/curso.js'),'utf8'),questions=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../walmart-felix-cuevas/preguntas.json')));
const store=new Map(),saved=new Map();let auth=true,other=false,lose=false,recordCount=0,now=Date.now();
class Element{constructor(){this.hidden=true;this.disabled=false;this.textContent='';this.value='';this.innerHTML='';this.events={};this.dataset={}}addEventListener(event,cb){this.events[event]=cb}setAttribute(){}focus(){}scrollIntoView(){}querySelector(){return new Element()}}
function boot(){
 const elements=new Map(),lessons=Array.from({length:12},()=>new Element()),nav=Array.from({length:12},(_,i)=>Object.assign(new Element(),{dataset:{page:String(i)}}));
 const get=s=>{if(!elements.has(s))elements.set(s,new Element());return elements.get(s)};
 const c={console,crypto,innerWidth:390,location:{},history:{replaceState(){}},AbortController,
 Date:{now:()=>now},setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 document:{querySelector:get,querySelectorAll:s=>s==='.lesson'?lessons:s==='[data-page]'?nav:[],addEventListener(){}},
 fetch:async(url,opt={})=>{let status=200,data={};
  if(url.includes('/session')){status=auth?200:401;data={autenticado:auth,participante:{nombre:'Prueba',numero_empleado:other?'OTHER':'TEST',servicio:'WALMART FÉLIX CUEVAS'}};}
  else if(url.includes('preguntas'))data=questions;
  else if(url.includes('/resultados')){const p=JSON.parse(opt.body);if(!auth){status=401;data={mensaje:'Sesión vencida'}}else if(other){status=409;data={mensaje:'Cambió la cuenta'}}else{if(!saved.has(p.envio_id)){const key=[0,0,2,0,1,2,1,2,2,0],score=p.respuestas.reduce((n,r,i)=>n+(r===key[i]?10:0),0);saved.set(p.envio_id,{id:++recordCount,intento:recordCount,calificacion:score,aprobado:score>=80,modalidad:'E-LEARNING'})}data=saved.get(p.envio_id);if(lose){lose=false;throw Error('network response lost')}}}
  return {ok:status<400,status,json:async()=>data};
 }};vm.createContext(c);vm.runInContext(code,c);return {c,get,lessons,read:s=>vm.runInContext(s,c),fire:async(s,e,v={})=>get(s).events[e]({preventDefault(){},...v})};
}
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r))};
(async()=>{
 let t=boot();await settle();assert.equal(t.read('current'),0);assert(t.get('#exam-nav').disabled);
 t.read('page(12)');assert.equal(t.read('current'),0);
 for(let i=0;i<12;i++)await t.fire('#next','click');assert.equal(t.read('current'),12);
 await t.fire('#begin','click');assert.equal(t.read('state.attempt.answers.length'),10);
 await t.fire('#exam-form','change',{target:{name:'q0',value:'0'}});const deadline=t.read('state.attempt.deadline');
 t=boot();await settle();assert.equal(t.read('state.attempt.answers[0]'),0);assert.equal(t.read('state.attempt.deadline'),deadline);assert.equal(t.read('current'),12);
 await t.fire('#exam-form','submit');assert(t.get('#status').textContent.includes('diez preguntas'));
 const key=[0,0,2,0,1,2,1,2,2,0];for(let i=0;i<10;i++)await t.fire('#exam-form','change',{target:{name:'q'+i,value:String(key[i])}});
 auth=false;await t.fire('#exam-form','submit');await settle();assert.equal(t.get('#auth').hidden,false);assert.equal(t.read('state.attempt.result'),null);
 auth=true;other=true;await t.fire('#check-session','click');assert.equal(t.get('#auth').hidden,false);assert.equal(recordCount,0);
 other=false;lose=true;await t.fire('#check-session','click');await settle();assert.equal(recordCount,1);assert.equal(t.read('state.attempt.result'),null);
 await t.fire('#retry','click');assert.equal(recordCount,1);assert.equal(t.read('state.attempt.result.calificacion'),100);assert.equal(t.get('#new-attempt').hidden,false);
 await t.fire('#new-attempt','click');await t.fire('#begin','click');now+=16*60*1000;t.read('tick()');await settle();assert.equal(t.read('state.attempt.result.calificacion'),0);assert.equal(recordCount,2);
 console.log('PASS client state tests: portada, lesson gate, start, reload/answer/deadline recovery, missing answers, session expiry, account mismatch, retry after lost response, no duplicate result, timeout.');
})().catch(e=>{console.error(e);process.exit(1)});
