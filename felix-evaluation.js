// Clave de evaluación proporcionada por el responsable de capacitación.
const SLUG='consignas-walmart-felix-cuevas';
const NOMBRE='Consignas específicas — Walmart Félix Cuevas';
const PREGUNTAS=[
  {
    "q": "¿Qué se revisa en los rondines?",
    "options": [
      "Se verifican accesos a Seguridad Corporativa, UPS, Centro de Cómputo y que los torniquetes permanezcan sellados.",
      "se comprueba que el compañero haga bien su trabajo.",
      "se revisa que no estén haciendo fiesta los vecinos."
    ],
    "answer": 0
  },
  {
    "q": "¿Quién es el responsable del monitoreo net en toreo 24\\7 y en festivos?",
    "options": [
      "El elemento de monitoreo alto México.",
      "El elemento de Seguridad",
      "los elementos a cargo de las cámaras del C5."
    ],
    "answer": 0
  },
  {
    "q": "¿Cuál es uno de los requisitos para el ingreso de los proveedores?",
    "options": [
      "Pedir autorización a la autoridad competente.",
      "Dar una clave establecida por el guardia.",
      "Presentar comprobante de alta médica oficial vigente (IMSS / ISSSTE)."
    ],
    "answer": 2
  },
  {
    "q": "¿Con base a las consignas generales de Walmart, qué tiempo debes de llegar a tu servicio para hacer el cambio de turno?",
    "options": [
      "10 minutos antes.",
      "15 minutos después.",
      "20 minutos después."
    ],
    "answer": 0
  },
  {
    "q": "¿Cuál es nuestra prioridad máxima?",
    "options": [
      "Ser amigo de los proveedores.",
      "Preservar la integridad física y la vida de todas las personas que laboran o visitan las instalaciones corporativas.",
      "No caer en fraudes con la empresa."
    ],
    "answer": 1
  },
  {
    "q": "¿En qué área se debe realizar las revisiones físicas para los elementos salientes?",
    "options": [
      "En puntos ciegos.",
      "Dentro de la caseta.",
      "Frente a la cámara de CCTV del acceso principal para constancia en video."
    ],
    "answer": 2
  },
  {
    "q": "¿Qué hacer cuando llegué un usuario?",
    "options": [
      "invitarlo a comer.",
      "Dirigirse con respeto y cordialidad (\"Saluda y sonríe\").",
      "ofrecerle servicios como agua, baño, etc."
    ],
    "answer": 1
  },
  {
    "q": "¿Qué implica el control de bienes e intereses?",
    "options": [
      "inteligencia financiera.",
      "el empeño que le ponemos al trabajo.",
      "Cuidar los activos tangibles e intangibles de Walmart de México y Centroamérica con estricta rigurosidad."
    ],
    "answer": 2
  },
  {
    "q": "¿Cómo se tomará el hecho de que un asociado intente ingresar con la tarjeta de otro?",
    "options": [
      "se tomará como error y se le asesorará.",
      "se tomará como forma valida de ingresar.",
      "se tomará como intento de suplantación y deberá reportarse."
    ],
    "answer": 2
  },
  {
    "q": "¿A quien se le tiene que informar por alguna anomalía o conducta irregular, incluso de los compañeros?",
    "options": [
      "Al líder de seguridad corporativa.",
      "A mi compañero entrante.",
      "A mi familia para que sepa que hacer."
    ],
    "answer": 0
  }
];
function servicioPermitido(servicio){
 const s=String(servicio||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
 return ['WALMART FELIX CUEVAS','FELIX CUEVAS'].includes(s);
}
function calificar(respuestas){
 if(!Array.isArray(respuestas)||respuestas.length!==10||respuestas.some(r=>r!==null&&(!Number.isInteger(r)||r<0||r>2))){
  const e=new Error('Envía diez respuestas con opciones de 0 a 2 o null.');e.codigo=400;throw e;
 }
 const errores=[];
 PREGUNTAS.forEach((p,i)=>{if(respuestas[i]!==p.answer)errores.push({numero:i+1,pregunta:p.q,respuesta_usuario:respuestas[i]===null?'Sin respuesta':p.options[respuestas[i]],respuesta_correcta:p.options[p.answer]})});
 return {calificacion:(10-errores.length)*10,errores};
}
module.exports={SLUG,NOMBRE,servicioPermitido,calificar};
