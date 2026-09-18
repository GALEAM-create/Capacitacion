const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const base=path.join(__dirname,'..'),source=fs.readFileSync(base+'/index.js','utf8'),FELIX=require(base+'/felix-evaluation');
const results=[],envios=new Map();let nextID=1,pending=[],tx=false,failInsert=false;
const connection={async beginTransaction(){tx=true;pending=[]},async commit(){for(const action of pending)action();pending=[];tx=false},async rollback(){pending=[];tx=false},release(){},async query(sql,values=[]){
 if(sql.includes('GET_LOCK'))return [[{obtenido:1}]];
 if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
 if(sql.startsWith('SELECT numero_empleado'))return [envios.has(values[0])?[envios.get(values[0])]:[]];
 if(sql.includes('GREATEST('))return [[{ultimo_intento:results.length}]];
 if(sql.includes('INSERT INTO resultados_capacitacion')){const id=nextID++;pending.push(()=>results.push({id,values}));return [{insertId:id}]}
 if(sql.startsWith('INSERT INTO envios_elearning')){if(failInsert)throw Error('simulated SQL failure');const [envio_id,numero_empleado,curso,huella,resultado]=values;pending.push(()=>envios.set(envio_id,{numero_empleado,curso,huella,resultado}));return [{affectedRows:1}]}
 throw Error('Unexpected SQL '+sql);
}};
const ctx={console:{log(){},error(){}},crypto,FELIX,pool:{getConnection:async()=>connection},CALIFICACION_MAXIMA:100,CALIFICACION_APROBATORIA:70,
 normalizarCalificacion:(_,v)=>v,normalizarErrores:v=>v,crearNombreBloqueo:()=> 'test',normalizarNombre:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase(),CENTRAL_DOCS_SLUG:'central',CENTRAL_DOCS_NOMBRE:'Central',CENTRAL_DOCS_SERVICIO:'CENTRAL',NET_VET_SLUG:'net',NET_VET_NOMBRE:'Net',DIAMANTE_SLUG:'diamante',DIAMANTE_NOMBRE:'Diamante',servicioNetVet:()=>false,servicioDiamante:()=>false,esCursoUsoSeguroArmas:()=>false,esCursoUsoSeguroArmas:()=>false};vm.createContext(ctx);
new vm.Script(source);
vm.runInContext(source.slice(source.indexOf('function normalizarModalidad('),source.indexOf('async function corregirModalidadesHistoricas(')),ctx);
vm.runInContext(source.slice(source.indexOf('function participantePuedeAccederCurso('),source.indexOf('function validarTexto(')),ctx);
let handler;ctx.app={post:(url,...handlers)=>handler=handlers.at(-1)};ctx.requerirParticipante=()=>{};ctx.limiteResultados=()=>{};
vm.runInContext(source.slice(source.indexOf('// Evaluación e-learning Félix Cuevas:'),source.indexOf('// Endpoint autenticado Walmart Diamante:')),ctx);
const key=[0,0,2,0,1,2,1,2,2,0],person={id:1,numero_empleado:'TEST-FELIX',nombre:'Participante de prueba',servicio:'WALMART FELIX CUEVAS'};
const payload=()=>({envio_id:crypto.randomUUID(),respuestas:[...key],numero_empleado_sesion:person.numero_empleado,calificacion:0,modalidad:'PRESENCIAL'});
async function call(body,participant=person){let code=200,output;await handler({body,participante:participant},{status(s){code=s;return this},json(d){output=d;return this}});return {code,output}}
async function main(){
 for(const service of ['WALMART FELIX CUEVAS','Walmart Félix Cuevas',' FÉLIX   CUEVAS '])assert(FELIX.servicioPermitido(service));
 for(const service of ['WALMART DIAMANTE','FELIX','WALMART FELIX CUEVAS OTRO',''])assert(!FELIX.servicioPermitido(service));
 assert.equal(FELIX.calificar(key).calificacion,100);
 assert.equal(FELIX.calificar([1,1,...key.slice(2)]).calificacion,80);
 assert.equal(FELIX.calificar([1,1,1,...key.slice(3)]).calificacion,70);
 assert.equal(FELIX.calificar(Array(10).fill(null)).calificacion,0);
 for(const bad of [[],Array(10).fill('0'),Array(10).fill(3),Array(10).fill(false),null])assert.throws(()=>FELIX.calificar(bad));
 assert.equal(ctx.participantePuedeAccederCurso(person,{slug:FELIX.SLUG}),true);
 assert.equal(ctx.participantePuedeAccederCurso({...person,servicio:'DIAMANTE'},{nombre:FELIX.NOMBRE}),false);
 const p=payload(),r=await call(p);assert.equal(r.code,201);assert.equal(r.output.calificacion,100);assert.equal(r.output.modalidad,'E-LEARNING');assert.equal(results.length,1);
 const duplicate=await call(p);assert.deepEqual(duplicate,r);assert.equal(results.length,1);
 assert.equal((await call({...p,respuestas:Array(10).fill(null)})).code,409);
 assert.equal((await call(payload(),{...person,servicio:'DIAMANTE'})).code,403);
 assert.equal((await call({...payload(),numero_empleado_sesion:'OTHER'})).code,409);
 assert.equal((await call({...payload(),respuestas:[0]})).code,400);
 assert.equal((await call({...payload(),envio_id:'bad'})).code,400);
 failInsert=true;const before=results.length;assert.equal((await call(payload())).code,500);assert.equal(results.length,before);assert.equal(tx,false);failInsert=false;
 assert(!source.slice(source.indexOf('async function corregirModalidadesHistoricas'),source.indexOf('async function inicializarBase')).includes("curso = 'Consignas específicas — Walmart Félix Cuevas'"));
 const catalog=JSON.parse(fs.readFileSync(base+'/cursos.json'));const meta=catalog.find(c=>c.id===FELIX.SLUG);assert.equal(meta.enlace_externo,undefined);assert(fs.existsSync(path.join(base,meta.ruta,meta.archivo_html)));assert.equal(meta.calificacion_aprobatoria,80);
 const portal=fs.readFileSync(base+'/portal.html','utf8'),inline=portal.match(/<script nonce="__CSP_NONCE__">([\s\S]*?)<\/script>/)[1];new vm.Script(inline);
 const pc={URL,URL_CATALOGO_CURSOS:new URL('http://localhost/cursos.json')};vm.createContext(pc);vm.runInContext(inline.slice(inline.indexOf('    function claveCurso'),inline.indexOf('    async function cargarCursos')),pc);
 const serverCourse={id:123,slug:FELIX.SLUG,nombre:FELIX.NOMBRE,url:'/curso/'+FELIX.SLUG+'/',historial:[]};assert.equal(pc.combinarCursos([serverCourse],catalog,person).find(c=>c.slug===FELIX.SLUG).url,serverCourse.url);
 const diamante=catalog.find(c=>c.id==='consignas-walmart-diamante'),ds={id:124,slug:diamante.id,nombre:diamante.nombre,url:diamante.url.replace('#portada','#token=TEST')};assert.equal(pc.combinarCursos([ds],catalog,{servicio:'DIAMANTE'})[0].url,ds.url);
 console.log('PASS server: service restrictions, answer key 100/80/70/0, malformed answers, server-only grading, forced e-learning, identity mismatch, duplicate retry, rollback, catalog link and Diamante regression.');
}
main().catch(e=>{console.error(e);process.exit(1)});
