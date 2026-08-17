const preguntas = [
  {
    q: "Una persona eleva la voz porque no puede ingresar. ¿Cuál es la mejor primera respuesta?",
    o: [
      "Responder con el mismo tono",
      "Escuchar y reconocer su molestia",
      "Amenazar con retirarla"
    ],
    a: 1
  },
  {
    q: "¿Qué significa reconocer la emoción?",
    o: [
      "Aceptar cualquier conducta",
      "Ceder ante su petición",
      "Mostrar que comprendemos cómo se siente"
    ],
    a: 2
  },
  {
    q: "¿Cuándo debe detenerse el diálogo?",
    o: [
      "Cuando hacen una pregunta",
      "Cuando existen amenazas o riesgo de agresión",
      "Cuando el procedimiento tarda"
    ],
    a: 1
  },
  {
    q: "¿Qué combina la técnica práctica?",
    o: [
      "Escucha + límite + opción",
      "Orden + amenaza + sanción",
      "Silencio + retirada"
    ],
    a: 0
  },
  {
    q: "¿Cuál frase ayuda a desescalar?",
    o: [
      "Aquí mando yo",
      "No me importa",
      "Lo que sí puedo hacer es…"
    ],
    a: 2
  }
];

const secciones = [
  {
    c: "Capacitación · Agosto 2026",
    t: "Manejo de conflictos y comunicación asertiva",
    s: "Prevenir · Desescalar · Comunicar · Actuar profesionalmente",
    h: `<div class="portada">
      <div class="frase foto-portada">
        <span>La meta no es ganar una discusión.</span>
        <strong>Es mantener el control profesional y reducir riesgos.</strong>
      </div>
      <div class="objetivos">
        <img class="imagen-curso" src="assets/media/objetivos.jpg" alt="Equipo de seguridad">
        <p>Reconocer señales tempranas de tensión</p>
        <p>Comunicar límites con respeto</p>
        <p>Aplicar escucha activa y ofrecer opciones</p>
        <p>Decidir cuándo solicitar apoyo</p>
      </div>
    </div>`
  },
  {
    c: "01 · Tu función",
    t: "El papel del guardia ante un conflicto",
    s: "Tu presencia puede evitar que una situación pequeña se convierta en un riesgo.",
    h: grid([
      ["Prevenir", "Detecta señales de tensión antes de que el problema crezca.", "verde"],
      ["Desescalar", "Baja la intensidad mediante tono, escucha, distancia y opciones.", ""],
      ["Proteger", "Si aumenta el riesgo, prioriza seguridad, apoyo y protocolo.", "roja"]
    ])
  },
  {
    c: "02 · Entender el origen",
    t: "¿Qué provoca los conflictos?",
    s: "Identificar la causa ayuda a responder sin tomar el enojo como algo personal.",
    h: grid([
      ["Acceso y restricciones", "Rechazo a controles o reglas.", ""],
      ["Esperas y filas", "Frustración por retrasos.", "dorada"],
      ["Quejas", "Percepción de trato injusto.", ""],
      ["Incidentes", "Pérdidas, daños o incumplimientos.", "roja"],
      ["Personas alteradas", "Estrés, enojo o intoxicación.", "dorada"],
      ["Conflictos entre terceros", "Clientes, personal o proveedores.", ""]
    ]) + video("perspectiva.mp4", "Conflictos: no pierdas la perspectiva")
  },
  {
    c: "03 · Anticiparte",
    t: "Detecta el escalamiento",
    s: "Observa cambios en la voz, el cuerpo, la distancia y la disposición a escuchar.",
    h: lista([
      "Voz más alta o tono desafiante",
      "Gestos exagerados, señalar o golpear objetos",
      "Invasión del espacio personal",
      "Negativa repetida a escuchar",
      "Movimientos bruscos o puños cerrados"
    ]) + `<div class="alerta">Si percibes riesgo: aumenta la distancia, conserva una salida y solicita apoyo.</div>`
  },
  {
    c: "04 · Elegir cómo responder",
    t: "Pasiva, agresiva o asertiva",
    s: "La autoridad profesional se sostiene con claridad, respeto y control emocional.",
    h: grid([
      ["Pasiva", "Evita el conflicto, cede o no establece límites.", "dorada"],
      ["Agresiva", "Grita, amenaza, humilla o intenta imponerse.", "roja"],
      ["Asertiva", "Es clara, firme, respetuosa y orientada a soluciones.", "verde"]
    ]) + video("tipos-comunicacion.mp4", "Tipos de comunicación")
  },
  {
    c: "05 · Técnica práctica",
    t: "Escucha + límite + opción",
    s: "Primero entiende. Después responde.",
    h: `<div class="pasos">
      <div>
        <b>01</b>
        <h3>Escucha</h3>
        <blockquote>“Entiendo que está molesto por la espera.”</blockquote>
        <p>No interrumpas; pregunta qué ocurrió.</p>
      </div>
      <div>
        <b>02</b>
        <h3>Límite</h3>
        <blockquote>“Necesito que mantengamos un trato respetuoso.”</blockquote>
        <p>Valida la emoción, no la conducta insegura.</p>
      </div>
      <div>
        <b>03</b>
        <h3>Opción</h3>
        <blockquote>“Podemos revisar el caso con mi supervisor.”</blockquote>
        <p>Ofrece una alternativa real.</p>
      </div>
    </div>` + video("comunicacion-asertiva.mp4", "Comunicación asertiva")
  },
  {
    c: "06 · Presencia profesional",
    t: "Tu cuerpo también comunica",
    s: "Una postura controlada puede reducir tensión.",
    h: fotoTexto(
      "lenguaje-corporal.jpeg",
      lista([
        "Postura abierta, firme y profesional",
        "Manos visibles y movimientos lentos",
        "Distancia suficiente; evita acorralar",
        "Contacto visual natural, sin retar",
        "Voz baja, estable y clara",
        "Conserva una salida y posición para pedir apoyo"
      ]),
      "Lenguaje corporal profesional"
    )
  },
  {
    c: "07 · Palabras que cambian el rumbo",
    t: "Frases que ayudan y frases que escalan",
    h: `<div class="comparacion">
      <div class="bien">
        <h3>✓ Sí ayudan</h3>
        ${[
          "Permítame ayudarle a resolverlo.",
          "Entiendo que está molesto.",
          "Voy a explicarle el procedimiento.",
          "Lo que sí puedo hacer es…",
          "Solicitaré apoyo de mi supervisor."
        ].map(x => `<p>“${x}”</p>`).join("")}
      </div>
      <div class="mal">
        <h3>× Evita</h3>
        ${[
          "Aquí mando yo.",
          "Si no le gusta, váyase.",
          "No me importa.",
          "Usted no sabe con quién se mete.",
          "Amenazas, burlas o sarcasmo."
        ].map(x => `<p>“${x}”</p>`).join("")}
      </div>
    </div>`
  },
  {
    c: "08 · Mantener el límite",
    t: "Cuando alguien se niega a cumplir una regla",
    h: fotoTexto(
      "regla.jpg",
      `<div class="reglas">
        ${[
          "Repite la solicitud con calma",
          "Explica brevemente la regla",
          "Expón el beneficio de cooperar",
          "Indica consecuencias reales",
          "Ofrece una decisión clara",
          "Actúa conforme al protocolo"
        ].map((x, i) => `<p><b>0${i + 1}</b>${x}</p>`).join("")}
      </div>`,
      "Guardia explicando un procedimiento"
    ) + `<blockquote class="ejemplo">“El acceso requiere autorización. Podemos verificarla con el responsable del área o esperar aquí mientras la confirmamos.”</blockquote>`
  },
  {
    c: "09 · Prioridad: seguridad",
    t: "¿Cuándo dejar de dialogar?",
    s: "Detente y solicita apoyo cuando la situación deja de ser segura o supera tus facultades.",
    h: fotoTexto(
      "alerta.jpeg",
      grid([
        ["Amenazas creíbles", "O intento de agresión.", "roja"],
        ["Arma u objeto peligroso", "Mantén distancia y solicita apoyo.", "roja"],
        ["Invasión persistente", "Del espacio de seguridad.", "roja"],
        ["Riesgo para terceros", "Prioriza la protección.", "roja"],
        ["El protocolo lo indica", "Interviene supervisor o autoridad.", "roja"]
      ]),
      "Situación de riesgo"
    )
  },
  {
    c: "10 · Ponlo en práctica",
    t: "Tres escenarios, una misma disciplina",
    h: `<div class="casos-media">
      ${caso(
        "caso-acceso.jpg",
        "Acceso restringido",
        "Reconoce la molestia, explica el requisito y ofrece verificar la autorización."
      )}
      ${caso(
        "cliente-alterado.jpg",
        "Cliente alterado",
        "No iguales la agresividad. Escucha, establece un límite y ofrece una opción."
      )}
      ${caso(
        "discusion.jpg",
        "Dos personas discutiendo",
        "Mantén distancia, pide apoyo y separa verbalmente solo si es seguro."
      )}
    </div>`
  },
  {
    c: "11 · Antes de actuar",
    t: "Checklist del guardia",
    s: "Marca cada punto para completar tu repaso.",
    h: `<div class="checklist">
      ${[
        "Mantengo la calma y controlo mi tono",
        "Escucho antes de responder",
        "Explico brevemente el procedimiento",
        "Evito insultos, amenazas y sarcasmo",
        "Mantengo una distancia segura",
        "Ofrezco alternativas dentro de mis facultades",
        "Sé cuándo solicitar apoyo",
        "Actúo conforme al protocolo"
      ].map(x => `<button type="button" data-check>☐ ${x}</button>`).join("")}
    </div>`
  },
  {
    c: "12 · Evaluación final",
    t: "Comprueba lo aprendido",
    s: "Selecciona una respuesta en cada pregunta.",
    quiz: true
  },
  {
    c: "Capacitación completada",
    t: "Resolver cuando sea posible. Proteger cuando sea necesario.",
    h: `<div class="cierre cierre-foto">
      <blockquote>
        “La firmeza no requiere gritos.<br>
        La autoridad no requiere humillar.<br>
        Escuchar no significa ceder.”
      </blockquote>
      <p>Adapta siempre tus respuestas a los procedimientos del servicio y al marco legal aplicable.</p>
    </div>`
  }
];

function grid(datos) {
  return `<div class="grid">${datos.map(x => `
    <article class="tarjeta ${x[2]}">
      <h3>${x[0]}</h3>
      <p>${x[1]}</p>
    </article>
  `).join("")}</div>`;
}

function lista(datos) {
  return `<div class="lista">${datos.map((x, i) => `
    <p><b>${String(i + 1).padStart(2, "0")}</b> &nbsp; ${x}</p>
  `).join("")}</div>`;
}

function video(archivo, titulo) {
  return `<div class="video-curso">
    <h3>${titulo}</h3>
    <video controls playsinline preload="metadata">
      <source src="assets/media/${archivo}" type="video/mp4">
      Tu navegador no puede reproducir este video.
    </video>
  </div>`;
}

function fotoTexto(archivo, html, alt) {
  return `<div class="foto-texto">
    <img src="assets/media/${archivo}" alt="${alt}">
    <div>${html}</div>
  </div>`;
}

function caso(archivo, titulo, texto) {
  return `<article>
    <img src="assets/media/${archivo}" alt="${titulo}">
    <div>
      <h3>${titulo}</h3>
      <p>${texto}</p>
      <b>¿Qué dirías en los primeros 10 segundos?</b>
    </div>
  </article>`;
}

const API_URL = "https://capacitacion-production-3120.up.railway.app";
const COURSE_SLUG = "resolucion-de-conflictos";

let pagina = 0;
let respuestas = {};
let enviado = false;
let guardando = false;
let errorGuardado = "";

const contenido = document.getElementById("contenido");
const anterior = document.getElementById("anterior");
const siguiente = document.getElementById("siguiente");
const puntosContenedor = document.getElementById("puntos");

function pintar() {
  document.querySelectorAll("video").forEach(videoActual => {
    videoActual.pause();
  });

  const seccion = secciones[pagina];
  const ultimaPagina = pagina === secciones.length - 1;
  const porcentaje = Math.round(
    pagina / (secciones.length - 1) * 100
  );

  document.getElementById("barra").style.width = `${porcentaje}%`;
  document.getElementById("porcentaje").textContent = `${porcentaje}%`;
  document.getElementById("contador").textContent =
    `${String(pagina + 1).padStart(2, "0")} / ${secciones.length}`;

  contenido.innerHTML = `
    <section class="encabezado">
      <p class="ceja">${seccion.c}</p>
      <h1>${seccion.t}</h1>
      ${seccion.s ? `<h2>${seccion.s}</h2>` : ""}
    </section>

    <section class="bloque">
      ${seccion.quiz ? crearQuiz() : seccion.h}
    </section>
  `;

  anterior.disabled = pagina === 0;
  siguiente.disabled = Boolean(seccion.quiz && !enviado);

  if (ultimaPagina) {
    siguiente.textContent = "Terminar curso →";
  } else if (seccion.quiz) {
    siguiente.textContent = enviado
      ? "Continuar →"
      : "Responde y guarda tu resultado";
  } else {
    siguiente.textContent = "Siguiente →";
  }

  pintarPuntos();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function pintarPuntos() {
  puntosContenedor.innerHTML = secciones.map((_, indice) => `
    <button
      type="button"
      class="${indice === pagina ? "activo" : indice < pagina ? "pasado" : ""}"
      data-ir="${indice}"
      aria-label="Ir a la sección ${indice + 1}">
    </button>
  `).join("");
}

function ir(indice) {
  const paginaFinal = secciones.length - 1;

  if (indice === paginaFinal && !enviado) {
    pagina = paginaFinal - 1;
    pintar();
    return;
  }

  pagina = Math.max(0, Math.min(indice, paginaFinal));
  pintar();
}

function terminarCurso() {
  const portal = new URLSearchParams(location.search).get("return");

  if (portal) {
    location.href = portal;
  } else if (history.length > 1) {
    history.back();
  } else {
    location.href = "/";
  }
}

function crearQuiz() {
  const aciertos = preguntas.reduce(
    (total, pregunta, indice) =>
      total + (respuestas[indice] === pregunta.a ? 1 : 0),
    0
  );

  const calificacion = Math.round(
    aciertos / preguntas.length * 100
  );

  const preguntasHTML = preguntas.map((pregunta, indicePregunta) => {
    const opcionesHTML = pregunta.o.map((opcion, indiceOpcion) => {
      const seleccionada =
        respuestas[indicePregunta] === indiceOpcion;

      const correcta =
        enviado && indiceOpcion === pregunta.a;

      const incorrecta =
        enviado &&
        seleccionada &&
        indiceOpcion !== pregunta.a;

      return `
        <label class="opcion
          ${seleccionada ? "seleccionada" : ""}
          ${correcta ? "correcta" : ""}
          ${incorrecta ? "incorrecta" : ""}">

          <input
            type="radio"
            name="q${indicePregunta}"
            data-pregunta="${indicePregunta}"
            data-respuesta="${indiceOpcion}"
            ${seleccionada ? "checked" : ""}
            ${enviado || guardando ? "disabled" : ""}>

          ${opcion}
        </label>
      `;
    }).join("");

    return `
      <div class="pregunta">
        <h3>${indicePregunta + 1}. ${pregunta.q}</h3>
        ${opcionesHTML}
      </div>
    `;
  }).join("");

  return `
    <div>
      ${guardando ? `
        <div class="alerta">
          Guardando tu resultado en la plataforma...
        </div>
      ` : ""}

      ${errorGuardado ? `
        <div class="alerta">
          No se pudo guardar la calificación. ${errorGuardado}
        </div>
      ` : ""}

      ${enviado ? `
        <div class="alerta">
          Calificación: ${calificacion}/100 ·
          ${aciertos} de ${preguntas.length} respuestas correctas.
          Resultado guardado correctamente.
        </div>
      ` : ""}

      ${preguntasHTML}

      <button
        type="button"
        class="accion"
        data-accion="evaluar"
        ${
          Object.keys(respuestas).length < preguntas.length ||
          enviado ||
          guardando
            ? "disabled"
            : ""
        }>
        ${guardando ? "Guardando..." : "Ver resultado"}
      </button>

      ${enviado ? `
        <button
          type="button"
          class="accion"
          data-accion="reiniciar">
          Intentar de nuevo
        </button>
      ` : ""}
    </div>
  `;
}

function responder(indicePregunta, indiceRespuesta) {
  respuestas[indicePregunta] = indiceRespuesta;
  errorGuardado = "";
  pintar();
}

async function evaluar() {
  if (
    guardando ||
    enviado ||
    Object.keys(respuestas).length < preguntas.length
  ) {
    return;
  }

  guardando = true;
  errorGuardado = "";
  pintar();

  try {
    const respuestaSesion = await fetch(
      `${API_URL}/api/portal/session`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        credentials: "include",
        cache: "no-store"
      }
    );

    const datosSesion = await respuestaSesion
      .json()
      .catch(() => ({}));

    if (
      !respuestaSesion.ok ||
      !datosSesion.autenticado ||
      !datosSesion.participante
    ) {
      throw new Error(
        datosSesion.mensaje ||
        "No fue posible recuperar tu sesión. Regresa al portal e inicia sesión nuevamente."
      );
    }

    const aciertos = preguntas.reduce(
      (total, pregunta, indice) =>
        total + (respuestas[indice] === pregunta.a ? 1 : 0),
      0
    );

    const calificacion = Math.round(
      aciertos / preguntas.length * 100
    );

    const respuestaGuardado = await fetch(
      `${API_URL}/api/portal/resultados`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          curso_slug: COURSE_SLUG,
          calificacion,
          calificacion_maxima: 100,
          total_preguntas: preguntas.length
        })
      }
    );

    const datosGuardado = await respuestaGuardado
      .json()
      .catch(() => ({}));

    if (!respuestaGuardado.ok) {
      throw new Error(
        datosGuardado.mensaje ||
        "No fue posible guardar el resultado."
      );
    }

    enviado = true;
  } catch (error) {
    errorGuardado =
      error.message ||
      "Verifica tu conexión e inténtalo nuevamente.";
  } finally {
    guardando = false;
    pintar();
  }
}

function reiniciar() {
  respuestas = {};
  enviado = false;
  guardando = false;
  errorGuardado = "";
  pintar();
}

anterior.addEventListener("click", () => {
  ir(pagina - 1);
});

siguiente.addEventListener("click", () => {
  if (pagina === secciones.length - 1) {
    terminarCurso();
  } else {
    ir(pagina + 1);
  }
});

contenido.addEventListener("change", evento => {
  const opcion = evento.target.closest(
    "[data-pregunta][data-respuesta]"
  );

  if (!opcion) return;

  responder(
    Number(opcion.dataset.pregunta),
    Number(opcion.dataset.respuesta)
  );
});

contenido.addEventListener("click", evento => {
  const check = evento.target.closest("[data-check]");

  if (check) {
    check.classList.toggle("marcado");
    return;
  }

  const accion = evento.target.closest("[data-accion]");

  if (!accion || accion.disabled) return;

  if (accion.dataset.accion === "evaluar") {
    evaluar();
  }

  if (accion.dataset.accion === "reiniciar") {
    reiniciar();
  }
});

puntosContenedor.addEventListener("click", evento => {
  const punto = evento.target.closest("[data-ir]");

  if (!punto) return;

  ir(Number(punto.dataset.ir));
});

pintar();
