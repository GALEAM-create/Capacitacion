const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=path.join(__dirname,'..'),source=fs.readFileSync(base+'/index.js','utf8');

const results=[],envios=new Map();
let nextID=1,pending=[],tx=false,failInsert=false;

const connection={
 async beginTransaction(){tx=true;pending=[]},
 async commit(){for(const action of pending)action();pending=[];tx=false},
 async rollback(){pending=[];tx=false},
 release(){},
 async query(sql,values=[]){
  if(sql.includes('GET_LOCK'))return [[{obtenido:1}]];
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
  if(sql.startsWith('SELECT numero_empleado'))return [envios.has(values[0])?[envios.get(values[0])]:[]];
  if(sql.includes('GREATEST('))return [[{ultimo_intento:results.length}]];
  if(sql.includes('INSERT INTO resultados_capacitacion')){
    const id=nextID++;
    pending.push(()=>results.push({id,values}));
    return [{insertId:id}];
  }
  if(sql.startsWith('INSERT INTO envios_elearning')){
    if(failInsert)throw Error('simulated SQL failure');
    const [envio_id,numero_empleado,curso,huella,resultado]=values;
    pending.push(()=>envios.set(envio_id,{numero_empleado,curso,huella,resultado}));
    return [{affectedRows:1}];
  }
  throw Error('Unexpected SQL '+sql);
 }
};

const ctx={
 console:{log(){},error(){}},
 crypto,
 pool:{getConnection:async()=>connection},
 CALIFICACION_MAXIMA:100,
 CALIFICACION_APROBATORIA:70,
 normalizarCalificacion:(_,v)=>v,
 normalizarErrores:v=>v,
 crearNombreBloqueo:()=> 'test',
 normalizarNombre:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase(),
 CENTRAL_DOCS_SLUG:'central',
 CENTRAL_DOCS_NOMBRE:'Central',
 CENTRAL_DOCS_SERVICIO:'CENTRAL',
 NET_VET_SLUG:'net',
 NET_VET_NOMBRE:'Net',
 FELIX:{SLUG:'felix',NOMBRE:'Felix',servicioPermitido:()=>false},
 DIAMANTE_SLUG:'diamante',
 DIAMANTE_NOMBRE:'Diamante',
 servicioNetVet:()=>false,
 servicioDiamante:()=>false,
 esCursoUsoSeguroArmas:()=>false
};
vm.createContext(ctx);

new vm.Script(source);

// Load shared result persistence.
vm.runInContext(
 source.slice(
  source.indexOf('function normalizarModalidad('),
  source.indexOf('async function corregirModalidadesHistoricas(')
 ),
 ctx
);

// Load La Naranja constants, answer key and service rule.
vm.runInContext(
 source.slice(
  source.indexOf('const LA_NARANJA_SLUG'),
  source.indexOf('const app = express();')
 ),
 ctx
);

// Load course-access logic.
vm.runInContext(
 source.slice(
  source.indexOf('function participantePuedeAccederCurso('),
  source.indexOf('function validarTexto(')
 ),
 ctx
);

// Capture the La Naranja endpoint handler.
let handler;
ctx.app={post:(url,...handlers)=>handler=handlers.at(-1)};
ctx.requerirParticipante=()=>{};
ctx.limiteResultados=()=>{};
vm.runInContext(
 source.slice(
  source.indexOf('// Evaluación e-learning Walmart La Naranja:'),
  source.indexOf('// Endpoint autenticado: la calificación y los datos personales se resuelven en el servidor.')
 ),
 ctx
);

const key=[1,1,1,2,1,2,2,1,1,0];
const person={
 id:1,
 numero_empleado:'TEST-NARANJA',
 nombre:'Participante de prueba',
 servicio:'WALMART LA NARANJA'
};

const payload=()=>({
 envio_id:crypto.randomUUID(),
 respuestas:[...key],
 numero_empleado_sesion:person.numero_empleado,
 modalidad:'PRESENCIAL',
 calificacion:0
});

async function call(body,participant=person,sesionEvaluacion=null){
 let code=200,output;
 await handler(
  {body,participante:participant,sesionEvaluacion},
  {status(s){code=s;return this},json(d){output=d;return this}}
 );
 return {code,output};
}

async function main(){
 const servicio=vm.runInContext('servicioLaNaranja',ctx);
 const calificar=vm.runInContext('calificarLaNaranja',ctx);
 const slug=vm.runInContext('LA_NARANJA_SLUG',ctx);
 const nombre=vm.runInContext('LA_NARANJA_NOMBRE',ctx);

 for(const value of ['WALMART LA NARANJA','Walmart La Naranja',' LA   NARANJA ','WALMART NARANJA'])assert(servicio(value));
 for(const value of ['WALMART DIAMANTE','NARANJA','WALMART LA NARANJA OTRO',''])assert(!servicio(value));

 assert.equal(calificar(key).calificacion,100);
 assert.equal(calificar([0,0,...key.slice(2)]).calificacion,80);
 assert.equal(calificar([0,0,0,...key.slice(3)]).calificacion,70);
 assert.equal(calificar(Array(10).fill(null)).calificacion,0);
 for(const bad of [[],Array(10).fill('1'),Array(10).fill(4),Array(10).fill(false),null])assert.throws(()=>calificar(bad));

 assert.equal(ctx.participantePuedeAccederCurso(person,{slug}),true);
 assert.equal(ctx.participantePuedeAccederCurso({...person,servicio:'DIAMANTE'},{nombre}),false);

 const p=payload();
 const r=await call(p);
 assert.equal(r.code,201);
 assert.equal(r.output.calificacion,100);
 assert.equal(r.output.aprobado,true);
 assert.equal(r.output.modalidad,'E-LEARNING');
 assert.equal(r.output.intento,1);
 assert.equal(results.length,1);

 // Same transmission must be idempotent: no duplicated attempt.
 const duplicate=await call(p);
 assert.deepEqual(duplicate,r);
 assert.equal(results.length,1);

 // Reusing the same envio_id with different answers must be rejected.
 assert.equal((await call({...p,respuestas:Array(10).fill(null)})).code,409);

 // Service, participant identity, answer shape, UUID and signed-course checks.
 assert.equal((await call(payload(),{...person,servicio:'DIAMANTE'})).code,403);
 assert.equal((await call({...payload(),numero_empleado_sesion:'OTHER'})).code,409);
 assert.equal((await call({...payload(),respuestas:[1]})).code,400);
 assert.equal((await call({...payload(),envio_id:'bad'})).code,400);
 assert.equal((await call(payload(),person,{curso_slug:'otro-curso'})).code,403);

 // If the idempotency record cannot be inserted, the result transaction rolls back.
 failInsert=true;
 const before=results.length;
 assert.equal((await call(payload())).code,500);
 assert.equal(results.length,before);
 assert.equal(tx,false);
 failInsert=false;

 // Catalog and admin-log wiring.
 const catalog=JSON.parse(fs.readFileSync(base+'/cursos.json'));
 const meta=catalog.find(c=>c.id===slug);
 assert(meta);
 assert.equal(meta.calificacion_aprobatoria,80);
 assert.equal(meta.enlace_externo,true);
 assert(meta.serviciosPermitidos.includes('WALMART LA NARANJA'));
 assert(String(meta.url).includes('/walmart-la-naranja/'));

 const admin=fs.readFileSync(base+'/admin.html','utf8');
 assert(admin.includes('const URL_RESULTADOS = "/api/resultados"'));
 assert(admin.includes('function llenarFiltros()'));
 assert(admin.includes('filtroCurso.innerHTML'));
 assert(source.includes('FROM resultados_capacitacion'));
 assert(source.includes('respuestas_incorrectas'));

 const portal=fs.readFileSync(base+'/portal.html','utf8');
 assert(portal.includes('String(curso.url).includes("#token=")'));

 console.log('PASS La Naranja: acceso por servicio, clave 100/80/70/0, calificación del servidor, modalidad forzada E-LEARNING, identidad, UUID, token firmado, idempotencia, rollback, catálogo y visibilidad en log administrativo.');
}

main().catch(e=>{console.error(e);process.exit(1)});
