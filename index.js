const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

const CALIFICACION_MAXIMA = 100;
const CALIFICACION_APROBATORIA = 70;
const COOKIE_ADMIN = "galeam_admin";
const COOKIE_PARTICIPANTE = "galeam_participante";
const SESION_ADMIN_MINUTOS = Number(process.env.SESSION_MINUTES || 30);
const SESION_PARTICIPANTE_MINUTOS = Number(
  process.env.PARTICIPANT_SESSION_MINUTES || 120
);
const ES_PRODUCCION =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT);

const ARCHIVO_CATALOGO_CURSOS = path.join(
  __dirname,
  "cursos.json"
);
const ARCHIVO_META_CURSO = "curso.json";
const DIRECTORIOS_IGNORADOS = new Set([
  ".git",
  ".github",
  "node_modules",
  "public",
  "dist",
  "build"
]);
const EXTENSIONES_RECURSOS_CURSO = new Set([
  ".webp",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".avif",
  ".ico",
  ".mp4",
  ".webm",
  ".vtt",
  ".css",
  ".js",
  ".json",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf"
]);

const VARIABLES_OBLIGATORIAS = [
  "DATABASE_URL",
  "ADMIN_USER",
  "ADMIN_PASSWORD_HASH",
  "SESSION_SECRET"
];

const variablesFaltantes = VARIABLES_OBLIGATORIAS.filter(
  nombre => !String(process.env[nombre] || "").trim()
);

if (variablesFaltantes.length) {
  throw new Error(
    `Faltan variables de Railway: ${variablesFaltantes.join(", ")}.`
  );
}

if (String(process.env.SESSION_SECRET).length < 32) {
  throw new Error("SESSION_SECRET debe contener por lo menos 32 caracteres.");
}

for (const [nombre, valor] of [
  ["SESSION_MINUTES", SESION_ADMIN_MINUTOS],
  ["PARTICIPANT_SESSION_MINUTES", SESION_PARTICIPANTE_MINUTOS]
]) {
  if (!Number.isFinite(valor) || valor < 5 || valor > 720) {
    throw new Error(`${nombre} debe ser un número entre 5 y 720.`);
  }
}

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false
  })
);

app.use(express.json({ limit: "1mb" }));

const origenesPermitidos = new Set(
  String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(origen => origen.trim())
    .filter(Boolean)
);

const corsCapacitaciones = cors({
  origin(origen, callback) {
    if (!origen || origenesPermitidos.size === 0) {
      return callback(null, true);
    }

    return callback(null, origenesPermitidos.has(origen));
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  maxAge: 86400
});

const limiteLoginAdmin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    mensaje:
      "Demasiados intentos de acceso. Espera 15 minutos antes de volver a intentarlo."
  }
});

const limiteLoginParticipante = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    mensaje:
      "Demasiados intentos de acceso. Espera 15 minutos antes de volver a intentarlo."
  }
});

const limiteResultados = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    mensaje:
      "Se recibieron demasiados registros desde esta conexión. Inténtalo más tarde."
  }
});

const pool = mysql.createPool(process.env.DATABASE_URL);

function normalizarNombre(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validarTexto(valor, nombreCampo, longitudMaxima) {
  const limpio = String(valor || "").trim();

  if (!limpio) {
    const error = new Error(
      `Falta el campo obligatorio: ${nombreCampo}.`
    );
    error.codigo = 400;
    throw error;
  }

  if (limpio.length > longitudMaxima) {
    const error = new Error(
      `El campo ${nombreCampo} excede la longitud permitida.`
    );
    error.codigo = 400;
    throw error;
  }

  return limpio;
}

function compararSeguro(a, b) {
  const bufferA = Buffer.from(String(a || ""));
  const bufferB = Buffer.from(String(b || ""));

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

function codificarBase64Url(valor) {
  return Buffer.from(valor).toString("base64url");
}

function crearTokenSesion(tipo, datos, duracionMinutos) {
  const ahora = Date.now();

  const cuerpoDatos = {
    tipo,
    ...datos,
    emitido: ahora,
    expira: ahora + duracionMinutos * 60 * 1000,
    nonce: crypto.randomBytes(16).toString("hex")
  };

  const cuerpo = codificarBase64Url(
    JSON.stringify(cuerpoDatos)
  );

  const firma = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(cuerpo)
    .digest("base64url");

  return `${cuerpo}.${firma}`;
}

function verificarTokenSesion(token, tipoEsperado) {
  try {
    const [cuerpo, firmaRecibida, sobrante] =
      String(token || "").split(".");

    if (!cuerpo || !firmaRecibida || sobrante !== undefined) {
      return null;
    }

    const firmaEsperada = crypto
      .createHmac("sha256", process.env.SESSION_SECRET)
      .update(cuerpo)
      .digest("base64url");

    if (!compararSeguro(firmaRecibida, firmaEsperada)) {
      return null;
    }

    const datos = JSON.parse(
      Buffer.from(cuerpo, "base64url").toString("utf8")
    );

    if (
      datos.tipo !== tipoEsperado ||
      !Number.isFinite(datos.expira) ||
      datos.expira <= Date.now()
    ) {
      return null;
    }

    return datos;
  } catch (error) {
    return null;
  }
}

function obtenerCookies(req) {
  const cookies = {};

  String(req.headers.cookie || "")
    .split(";")
    .forEach(parte => {
      const indice = parte.indexOf("=");

      if (indice < 1) {
        return;
      }

      const nombre = parte.slice(0, indice).trim();
      const valor = parte.slice(indice + 1).trim();

      try {
        cookies[nombre] = decodeURIComponent(valor);
      } catch (error) {
        cookies[nombre] = valor;
      }
    });

  return cookies;
}

function opcionesCookie(duracionMinutos) {
  return {
    httpOnly: true,
    secure: ES_PRODUCCION,
    sameSite: "strict",
    path: "/",
    maxAge: duracionMinutos * 60 * 1000,
    priority: "high"
  };
}

function limpiarCookie(res, nombre) {
  res.clearCookie(nombre, {
    httpOnly: true,
    secure: ES_PRODUCCION,
    sameSite: "strict",
    path: "/"
  });
}

async function obtenerAdministradorDesdeSesion(req) {
  const token = obtenerCookies(req)[COOKIE_ADMIN];
  const sesion = verificarTokenSesion(token, "admin");

  if (
    !sesion ||
    !Number.isInteger(Number(sesion.admin_id))
  ) {
    return null;
  }

  const [filas] = await pool.query(
    `SELECT
      id,
      usuario,
      nombre,
      rol,
      activo
     FROM usuarios_admin
     WHERE id = ?
       AND activo = 1
     LIMIT 1`,
    [Number(sesion.admin_id)]
  );

  return filas[0] || null;
}

async function requerirAdministrador(req, res, next) {
  try {
    const administrador =
      await obtenerAdministradorDesdeSesion(req);

    if (!administrador) {
      limpiarCookie(res, COOKIE_ADMIN);

      return res.status(401).json({
        mensaje:
          "Debes iniciar sesión para consultar esta información."
      });
    }

    res.set("Cache-Control", "no-store");
    req.administrador = administrador;
    next();
  } catch (error) {
    next(error);
  }
}

function requerirRolAdministrador(req, res, next) {
  if (req.administrador?.rol !== "administrador") {
    return res.status(403).json({
      mensaje:
        "Tu cuenta no tiene permiso para administrar usuarios."
    });
  }

  next();
}

async function obtenerParticipanteDesdeSesion(req) {
  const token = obtenerCookies(req)[COOKIE_PARTICIPANTE];
  const sesion = verificarTokenSesion(
    token,
    "participante"
  );

  if (
    !sesion ||
    !Number.isInteger(Number(sesion.participante_id))
  ) {
    return null;
  }

  const [filas] = await pool.query(
    `SELECT
      id,
      numero_empleado,
      nombre,
      servicio,
      activo
     FROM participantes
     WHERE id = ?
       AND activo = 1
     LIMIT 1`,
    [Number(sesion.participante_id)]
  );

  return filas[0] || null;
}

async function requerirParticipante(req, res, next) {
  try {
    const participante =
      await obtenerParticipanteDesdeSesion(req);

    if (!participante) {
      limpiarCookie(res, COOKIE_PARTICIPANTE);

      return res.status(401).json({
        mensaje:
          "Debes identificarte para acceder a la capacitación."
      });
    }

    res.set("Cache-Control", "no-store");
    req.participante = participante;
    next();
  } catch (error) {
    next(error);
  }
}

function inyectarNonce(html, nonce) {
  return html
    .replaceAll("__CSP_NONCE__", nonce)
    .replace(
      /<script(?![^>]*\bnonce=)([^>]*)>/gi,
      `<script nonce="${nonce}"$1>`
    );
}

function enviarHtmlConNonce(res, ruta, tipo = "app") {
  try {
    const nonce = crypto
      .randomBytes(18)
      .toString("base64");

    const html = inyectarNonce(
      fs.readFileSync(ruta, "utf8"),
      nonce
    );

    const politica =
      tipo === "curso"
        ? [
            "default-src 'self'",
            `script-src 'self' 'nonce-${nonce}'`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "media-src 'self'",
            "connect-src 'self'",
            "font-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'"
          ]
        : [
            "default-src 'self'",
            `script-src 'self' 'nonce-${nonce}'`,
            `style-src 'self' 'nonce-${nonce}'`,
            "img-src 'self' data:",
            "connect-src 'self'",
            "font-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'"
          ];

    res.set({
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        politica.join("; ")
    });

    res.type("html").send(html);
  } catch (error) {
    console.error(
      `No fue posible cargar ${ruta}:`,
      error
    );

    res
      .status(500)
      .send(
        "No fue posible cargar la página solicitada."
      );
  }
}


function rutaEstaDentro(base, candidata) {
  const relativa = path.relative(
    path.resolve(base),
    path.resolve(candidata)
  );

  return (
    relativa === "" ||
    (
      !relativa.startsWith("..") &&
      !path.isAbsolute(relativa)
    )
  );
}

function limpiarRutaCatalogo(valor) {
  const ruta = String(valor || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "");

  if (
    !ruta ||
    ruta.includes("://") ||
    ruta.startsWith("/") ||
    ruta.split("/").includes("..")
  ) {
    return "";
  }

  return ruta;
}

function normalizarSlugCurso(valor) {
  const slug = String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug;
}

function convertirEnteroEnRango(
  valor,
  predeterminado,
  minimo,
  maximo
) {
  const numero = Number(valor);

  if (
    !Number.isInteger(numero) ||
    numero < minimo ||
    numero > maximo
  ) {
    return predeterminado;
  }

  return numero;
}

function normalizarDefinicionCurso(
  entrada,
  carpetaPredeterminada = ""
) {
  if (
    !entrada ||
    typeof entrada !== "object" ||
    Array.isArray(entrada)
  ) {
    return null;
  }

  const slug = normalizarSlugCurso(
    entrada.slug ||
    entrada.id ||
    entrada.curso_slug
  );

  const nombre = String(
    entrada.nombre ||
    entrada.curso ||
    ""
  ).trim();

  if (!slug || !nombre) {
    return null;
  }

  const carpeta =
    limpiarRutaCatalogo(
      entrada.carpeta_assets ||
      entrada.carpeta ||
      entrada.ruta ||
      carpetaPredeterminada ||
      slug
    );

  const archivoHtml =
    limpiarRutaCatalogo(
      entrada.archivo_html ||
      entrada.archivo ||
      "index.html"
    );

  if (!carpeta || !archivoHtml) {
    return null;
  }

  const escalaOrigen =
    Number(
      entrada.calificacion_maxima_origen ??
      entrada.escala_origen ??
      100
    ) === 10
      ? 10
      : 100;

  return {
    nombre: nombre.slice(0, 150),
    slug,
    descripcion: String(
      entrada.descripcion || ""
    ).trim().slice(0, 500) || null,
    archivo_html: archivoHtml,
    carpeta_assets: carpeta,
    activo:
      entrada.activo === undefined
        ? 1
        : entrada.activo
          ? 1
          : 0,
    orden: convertirEnteroEnRango(
      entrada.orden,
      100,
      0,
      100000
    ),
    calificacion_aprobatoria:
      convertirEnteroEnRango(
        entrada.calificacion_aprobatoria ??
        entrada.minimo_aprobatorio,
        70,
        0,
        100
      ),
    calificacion_maxima_origen:
      escalaOrigen
  };
}

function leerJsonSeguro(ruta) {
  try {
    return JSON.parse(
      fs.readFileSync(ruta, "utf8")
    );
  } catch (error) {
    console.warn(
      `No fue posible leer ${ruta}:`,
      error.message
    );

    return null;
  }
}

function descubrirCursosDelRepositorio() {
  const encontrados = new Map();

  if (fs.existsSync(ARCHIVO_CATALOGO_CURSOS)) {
    const catalogo =
      leerJsonSeguro(
        ARCHIVO_CATALOGO_CURSOS
      );

    const entradas = Array.isArray(catalogo)
      ? catalogo
      : Array.isArray(catalogo?.cursos)
        ? catalogo.cursos
        : [];

    for (const entrada of entradas) {
      const curso =
        normalizarDefinicionCurso(
          entrada
        );

      if (curso) {
        encontrados.set(
          curso.slug,
          curso
        );
      }
    }
  }

  const elementos = fs.readdirSync(
    __dirname,
    {
      withFileTypes: true
    }
  );

  for (const elemento of elementos) {
    if (
      !elemento.isDirectory() ||
      DIRECTORIOS_IGNORADOS.has(
        elemento.name
      )
    ) {
      continue;
    }

    const rutaMeta = path.join(
      __dirname,
      elemento.name,
      ARCHIVO_META_CURSO
    );

    if (!fs.existsSync(rutaMeta)) {
      continue;
    }

    const entrada =
      leerJsonSeguro(rutaMeta);

    const curso =
      normalizarDefinicionCurso(
        entrada,
        elemento.name
      );

    if (curso) {
      encontrados.set(
        curso.slug,
        curso
      );
    }
  }

  return [...encontrados.values()];
}

async function agregarColumnaSiFalta(
  tabla,
  columna,
  definicion
) {
  const [filas] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tabla, columna]
  );

  if (
    Number(
      filas[0]?.total || 0
    ) === 0
  ) {
    await pool.query(
      `ALTER TABLE \`${tabla}\`
       ADD COLUMN \`${columna}\`
       ${definicion}`
    );
  }
}

async function sincronizarCursosDesdeRepositorio() {
  const cursos =
    descubrirCursosDelRepositorio();

  for (const curso of cursos) {
    const baseProyecto =
      path.resolve(__dirname);

    const carpetaCurso =
      path.resolve(
        __dirname,
        curso.carpeta_assets
      );

    const archivoCurso =
      path.resolve(
        carpetaCurso,
        curso.archivo_html
      );

    if (
      !rutaEstaDentro(
        baseProyecto,
        carpetaCurso
      ) ||
      !rutaEstaDentro(
        carpetaCurso,
        archivoCurso
      )
    ) {
      console.warn(
        `Se ignoró el curso ${curso.slug}: la ruta no es válida.`
      );
      continue;
    }

    if (
      !fs.existsSync(archivoCurso) ||
      !fs.statSync(
        archivoCurso
      ).isFile()
    ) {
      console.warn(
        `Se ignoró el curso ${curso.slug}: no existe ${curso.carpeta_assets}/${curso.archivo_html}.`
      );
      continue;
    }

    await pool.query(
      `INSERT INTO cursos_capacitacion
        (
          nombre,
          slug,
          descripcion,
          archivo_html,
          carpeta_assets,
          activo,
          orden,
          calificacion_aprobatoria,
          calificacion_maxima_origen
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nombre =
           VALUES(nombre),
         descripcion =
           VALUES(descripcion),
         archivo_html =
           VALUES(archivo_html),
         carpeta_assets =
           VALUES(carpeta_assets),
         activo =
           VALUES(activo),
         orden =
           VALUES(orden),
         calificacion_aprobatoria =
           VALUES(calificacion_aprobatoria),
         calificacion_maxima_origen =
           VALUES(calificacion_maxima_origen)`,
      [
        curso.nombre,
        curso.slug,
        curso.descripcion,
        curso.archivo_html,
        curso.carpeta_assets,
        curso.activo,
        curso.orden,
        curso.calificacion_aprobatoria,
        curso.calificacion_maxima_origen
      ]
    );

    console.log(
      `Curso sincronizado: ${curso.nombre} (${curso.slug}).`
    );
  }
}

function crearNombreBloqueo(numeroEmpleado, curso) {
  const hash = crypto
    .createHash("sha256")
    .update(`${numeroEmpleado}__${curso}`)
    .digest("hex")
    .slice(0, 48);

  return `galeam_intento_${hash}`;
}

function obtenerEscalaDeEntrada(
  curso,
  calificacionMaximaRecibida
) {
  if (
    calificacionMaximaRecibida !== undefined &&
    calificacionMaximaRecibida !== null &&
    calificacionMaximaRecibida !== ""
  ) {
    const escala = Number(
      calificacionMaximaRecibida
    );

    if (escala !== 10 && escala !== 100) {
      const error = new Error(
        "La calificación máxima de origen debe ser 10 o 100."
      );
      error.codigo = 400;
      throw error;
    }

    return escala;
  }

  return String(curso || "")
    .toLowerCase()
    .includes("arma")
    ? 10
    : 100;
}

function normalizarCalificacion(
  curso,
  calificacionRecibida,
  calificacionMaximaRecibida
) {
  const calificacion = Number(
    calificacionRecibida
  );

  const escalaEntrada =
    obtenerEscalaDeEntrada(
      curso,
      calificacionMaximaRecibida
    );

  if (!Number.isInteger(calificacion)) {
    const error = new Error(
      "La calificación debe ser un número entero."
    );
    error.codigo = 400;
    throw error;
  }

  if (
    calificacion < 0 ||
    calificacion > escalaEntrada
  ) {
    const error = new Error(
      `La calificación debe estar entre 0 y ${escalaEntrada}.`
    );
    error.codigo = 400;
    throw error;
  }

  return escalaEntrada === 10
    ? calificacion * 10
    : calificacion;
}

function normalizarErrores(errores) {
  if (
    errores === undefined ||
    errores === null
  ) {
    return null;
  }

  if (!Array.isArray(errores)) {
    const error = new Error(
      "El campo respuestas_incorrectas debe ser un arreglo."
    );
    error.codigo = 400;
    throw error;
  }

  if (errores.length > 100) {
    const error = new Error(
      "Se recibieron demasiadas respuestas incorrectas."
    );
    error.codigo = 400;
    throw error;
  }

  return errores.map((respuesta, indice) => {
    const numero = Number(
      respuesta?.numero ??
        respuesta?.pregunta_numero ??
        indice + 1
    );

    const pregunta = String(
      respuesta?.pregunta ?? ""
    ).trim();

    const respuestaUsuario = String(
      respuesta?.respuesta_usuario ??
        respuesta?.respondio ??
        ""
    ).trim();

    const respuestaCorrecta = String(
      respuesta?.respuesta_correcta ??
        respuesta?.correcta ??
        ""
    ).trim();

    if (
      !Number.isInteger(numero) ||
      numero < 1 ||
      numero > 100
    ) {
      const error = new Error(
        "Cada respuesta incorrecta debe incluir un número de pregunta válido."
      );
      error.codigo = 400;
      throw error;
    }

    if (
      !pregunta ||
      !respuestaUsuario ||
      !respuestaCorrecta
    ) {
      const error = new Error(
        "Cada respuesta incorrecta debe incluir pregunta, respuesta del participante y respuesta correcta."
      );
      error.codigo = 400;
      throw error;
    }

    if (
      pregunta.length > 1200 ||
      respuestaUsuario.length > 300 ||
      respuestaCorrecta.length > 300
    ) {
      const error = new Error(
        "Una de las respuestas enviadas excede la longitud permitida."
      );
      error.codigo = 400;
      throw error;
    }

    return {
      numero,
      pregunta,
      respuesta_usuario: respuestaUsuario,
      respuesta_correcta: respuestaCorrecta
    };
  });
}

async function guardarResultado({
  nombre,
  numeroEmpleado,
  servicio,
  curso,
  calificacionRecibida,
  calificacionMaximaRecibida,
  totalPreguntasRecibido,
  erroresRecibidos,
  calificacionAprobatoria =
    CALIFICACION_APROBATORIA
}) {
  let conexion;
  let bloqueoObtenido = false;
  let nombreBloqueo = null;
  let transaccionIniciada = false;

  try {
    const calificacion =
      normalizarCalificacion(
        curso,
        calificacionRecibida,
        calificacionMaximaRecibida
      );

    let totalPreguntas = null;

    if (
      totalPreguntasRecibido !== undefined &&
      totalPreguntasRecibido !== null &&
      totalPreguntasRecibido !== ""
    ) {
      totalPreguntas = Number(
        totalPreguntasRecibido
      );

      if (
        !Number.isInteger(totalPreguntas) ||
        totalPreguntas < 1 ||
        totalPreguntas > 100
      ) {
        const error = new Error(
          "El total de preguntas debe ser un entero entre 1 y 100."
        );
        error.codigo = 400;
        throw error;
      }
    }

    const respuestasIncorrectas =
      normalizarErrores(erroresRecibidos);

    if (
      totalPreguntas !== null &&
      respuestasIncorrectas !== null &&
      respuestasIncorrectas.length >
        totalPreguntas
    ) {
      const error = new Error(
        "La cantidad de respuestas incorrectas no puede superar el total de preguntas."
      );
      error.codigo = 400;
      throw error;
    }

    const aprobado =
      calificacion >=
      calificacionAprobatoria;

    conexion = await pool.getConnection();

    nombreBloqueo = crearNombreBloqueo(
      numeroEmpleado,
      curso
    );

    const [resultadoBloqueo] =
      await conexion.query(
        "SELECT GET_LOCK(?, 10) AS obtenido",
        [nombreBloqueo]
      );

    bloqueoObtenido =
      Number(
        resultadoBloqueo[0].obtenido
      ) === 1;

    if (!bloqueoObtenido) {
      const error = new Error(
        "No fue posible asignar el intento en este momento. Inténtalo nuevamente."
      );
      error.codigo = 503;
      throw error;
    }

    await conexion.beginTransaction();
    transaccionIniciada = true;

    const [filasPrevias] =
      await conexion.query(
        `SELECT
          GREATEST(
            COALESCE(MAX(intento), 0),
            COUNT(*)
          ) AS ultimo_intento
         FROM resultados_capacitacion
         WHERE numero_empleado = ?
           AND curso = ?`,
        [numeroEmpleado, curso]
      );

    const intento =
      Number(
        filasPrevias[0].ultimo_intento
      ) + 1;

    const [resultado] =
      await conexion.query(
        `INSERT INTO resultados_capacitacion
          (
            nombre,
            numero_empleado,
            servicio,
            curso,
            calificacion,
            calificacion_maxima,
            total_preguntas,
            respuestas_incorrectas,
            aprobado,
            intento
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nombre,
          numeroEmpleado,
          servicio,
          curso,
          calificacion,
          CALIFICACION_MAXIMA,
          totalPreguntas,
          respuestasIncorrectas === null
            ? null
            : JSON.stringify(
                respuestasIncorrectas
              ),
          aprobado,
          intento
        ]
      );

    await conexion.commit();
    transaccionIniciada = false;

    return {
      id: resultado.insertId,
      intento,
      calificacion,
      aprobado
    };
  } catch (error) {
    if (
      conexion &&
      transaccionIniciada
    ) {
      await conexion.rollback();
    }

    throw error;
  } finally {
    if (
      conexion &&
      bloqueoObtenido &&
      nombreBloqueo
    ) {
      try {
        await conexion.query(
          "SELECT RELEASE_LOCK(?)",
          [nombreBloqueo]
        );
      } catch (error) {
        console.error(
          "No fue posible liberar el bloqueo:",
          error
        );
      }
    }

    if (conexion) {
      conexion.release();
    }
  }
}

async function inicializarBase() {
  const rutaCursoIngenieriaSocial = path.join(
    __dirname,
    "curso-ingenieria-social.html"
  );

  if (!fs.existsSync(rutaCursoIngenieriaSocial)) {
    throw new Error(
      "Falta el archivo curso-ingenieria-social.html en la raíz del proyecto."
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios_admin (
      id INT NOT NULL AUTO_INCREMENT,
      usuario VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      rol ENUM(
        'administrador',
        'consulta'
      ) NOT NULL DEFAULT 'consulta',
      activo TINYINT(1) NOT NULL DEFAULT 1,
      fecha_creacion TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,
      ultimo_acceso DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_usuarios_admin_usuario (
        usuario
      )
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS participantes (
      id INT NOT NULL AUTO_INCREMENT,
      numero_empleado VARCHAR(50) NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      nombre_normalizado VARCHAR(150) NOT NULL,
      servicio VARCHAR(100) NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      fecha_creacion TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,
      ultimo_acceso DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_participantes_numero (
        numero_empleado
      ),
      KEY idx_participantes_nombre (
        nombre_normalizado
      )
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cursos_capacitacion (
      id INT NOT NULL AUTO_INCREMENT,
      nombre VARCHAR(150) NOT NULL,
      slug VARCHAR(150) NOT NULL,
      descripcion VARCHAR(500) NULL,
      archivo_html VARCHAR(255) NOT NULL,
      carpeta_assets VARCHAR(255)
        NOT NULL DEFAULT '.',
      activo TINYINT(1) NOT NULL DEFAULT 1,
      orden INT NOT NULL DEFAULT 0,
      calificacion_aprobatoria INT NOT NULL DEFAULT 70,
      calificacion_maxima_origen INT NOT NULL DEFAULT 100,
      fecha_creacion TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_cursos_slug (slug),
      UNIQUE KEY uk_cursos_nombre (nombre)
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
  `);

  await agregarColumnaSiFalta(
    "cursos_capacitacion",
    "calificacion_aprobatoria",
    "INT NOT NULL DEFAULT 70 AFTER `orden`"
  );

  await agregarColumnaSiFalta(
    "cursos_capacitacion",
    "calificacion_maxima_origen",
    "INT NOT NULL DEFAULT 100 AFTER `calificacion_aprobatoria`"
  );

  await pool.query(
    `INSERT INTO usuarios_admin
      (
        usuario,
        password_hash,
        nombre,
        rol,
        activo
      )
     VALUES (?, ?, ?, 'administrador', 1)
     ON DUPLICATE KEY UPDATE
       password_hash =
         VALUES(password_hash),
       activo = 1`,
    [
      String(process.env.ADMIN_USER).trim(),
      String(
        process.env.ADMIN_PASSWORD_HASH
      ).trim(),
      "Administrador Galeam"
    ]
  );

  await pool.query(
    `INSERT INTO cursos_capacitacion
      (
        nombre,
        slug,
        descripcion,
        archivo_html,
        carpeta_assets,
        activo,
        orden,
        calificacion_aprobatoria,
        calificacion_maxima_origen
      )
     VALUES (?, ?, ?, ?, ?, 1, 1, 80, 100)
     ON DUPLICATE KEY UPDATE
       descripcion =
         VALUES(descripcion),
       archivo_html =
         VALUES(archivo_html),
       carpeta_assets =
         VALUES(carpeta_assets),
       activo = 1,
       orden = 1,
       calificacion_aprobatoria = 80,
       calificacion_maxima_origen = 100`,
    [
      "Ingeniería Social (llamada de extorsión)",
      "ingenieria-social",
      "Reconoce técnicas de manipulación, señales de alerta y el protocolo de actuación ante una llamada de extorsión.",
      "curso-ingenieria-social.html",
      "."
    ]
  );

  await sincronizarCursosDesdeRepositorio();

  const [resultados] =
    await pool.query(
      `SELECT
        nombre,
        numero_empleado,
        servicio
       FROM resultados_capacitacion
       WHERE numero_empleado IS NOT NULL
         AND TRIM(numero_empleado) <> ''
         AND nombre IS NOT NULL
         AND TRIM(nombre) <> ''
       ORDER BY fecha DESC, id DESC`
    );

  const vistos = new Set();

  for (const fila of resultados) {
    const numero = String(
      fila.numero_empleado || ""
    ).trim();

    if (
      !numero ||
      vistos.has(numero.toLowerCase())
    ) {
      continue;
    }

    vistos.add(numero.toLowerCase());

    const nombre = String(
      fila.nombre || ""
    ).trim();

    await pool.query(
      `INSERT IGNORE INTO participantes
        (
          numero_empleado,
          nombre,
          nombre_normalizado,
          servicio,
          activo
        )
       VALUES (?, ?, ?, ?, 1)`,
      [
        numero,
        nombre,
        normalizarNombre(nombre),
        String(
          fila.servicio || ""
        ).trim() || null
      ]
    );
  }
}

app.get("/", (req, res) => {
  res.send(
    "API de Capacitación Galeam funcionando. Portal: /portal · Administración: /admin"
  );
});

app.get("/api/prueba", (req, res) => {
  res.json({
    mensaje:
      "La API está funcionando.",
    sistema:
      "Capacitación Galeam",
    portal: "/portal",
    administracion: "/admin"
  });
});

app.get("/admin", (req, res) => {
  enviarHtmlConNonce(
    res,
    path.join(__dirname, "admin.html")
  );
});

app.get("/admin/", (req, res) => {
  res.redirect(302, "/admin");
});

app.get("/admin.html", (req, res) => {
  res.redirect(302, "/admin");
});

app.get("/portal", (req, res) => {
  enviarHtmlConNonce(
    res,
    path.join(__dirname, "portal.html")
  );
});

app.get("/portal/", (req, res) => {
  res.redirect(302, "/portal");
});

app.get(
  "/api/admin/session",
  async (req, res) => {
    try {
      const administrador =
        await obtenerAdministradorDesdeSesion(
          req
        );

      res.set(
        "Cache-Control",
        "no-store"
      );

      if (!administrador) {
        return res
          .status(401)
          .json({
            autenticado: false
          });
      }

      res.json({
        autenticado: true,
        usuario: administrador.usuario,
        nombre: administrador.nombre,
        rol: administrador.rol
      });
    } catch (error) {
      res.status(500).json({
        mensaje:
          "No fue posible revisar la sesión."
      });
    }
  }
);

app.post(
  "/api/admin/login",
  limiteLoginAdmin,
  async (req, res) => {
    try {
      const usuario = validarTexto(
        req.body.usuario,
        "usuario",
        100
      );

      const clave = validarTexto(
        req.body.clave,
        "contraseña",
        200
      );

      const [filas] =
        await pool.query(
          `SELECT
            id,
            usuario,
            password_hash,
            nombre,
            rol,
            activo
           FROM usuarios_admin
           WHERE usuario = ?
           LIMIT 1`,
          [usuario]
        );

      const administrador = filas[0];

      const hashComparacion =
        administrador?.password_hash ||
        process.env.ADMIN_PASSWORD_HASH;

      const claveValida =
        await bcrypt.compare(
          clave,
          hashComparacion
        );

      if (
        !administrador ||
        !administrador.activo ||
        !claveValida
      ) {
        return res
          .status(401)
          .json({
            mensaje:
              "Usuario o contraseña incorrectos."
          });
      }

      await pool.query(
        `UPDATE usuarios_admin
         SET ultimo_acceso = NOW()
         WHERE id = ?`,
        [administrador.id]
      );

      const token = crearTokenSesion(
        "admin",
        {
          admin_id: administrador.id
        },
        SESION_ADMIN_MINUTOS
      );

      res.cookie(
        COOKIE_ADMIN,
        token,
        opcionesCookie(
          SESION_ADMIN_MINUTOS
        )
      );

      res.set(
        "Cache-Control",
        "no-store"
      );

      res.json({
        mensaje: "Acceso autorizado.",
        usuario: administrador.usuario,
        nombre: administrador.nombre,
        rol: administrador.rol
      });
    } catch (error) {
      console.error(
        "Error al iniciar sesión administrativa:",
        error
      );

      res
        .status(error.codigo || 500)
        .json({
          mensaje:
            error.codigo === 400
              ? error.message
              : "No fue posible iniciar sesión."
        });
    }
  }
);

app.post(
  "/api/admin/logout",
  (req, res) => {
    limpiarCookie(
      res,
      COOKIE_ADMIN
    );

    res.set(
      "Cache-Control",
      "no-store"
    );

    res.json({
      mensaje:
        "Sesión cerrada correctamente."
    });
  }
);

app.get(
  "/api/admin/usuarios",
  requerirAdministrador,
  requerirRolAdministrador,
  async (req, res) => {
    const [filas] =
      await pool.query(
        `SELECT
          id,
          usuario,
          nombre,
          rol,
          activo,
          fecha_creacion,
          ultimo_acceso
         FROM usuarios_admin
         ORDER BY activo DESC,
                  usuario ASC`
      );

    res.json(filas);
  }
);

app.post(
  "/api/admin/usuarios",
  requerirAdministrador,
  requerirRolAdministrador,
  async (req, res) => {
    try {
      const usuario = validarTexto(
        req.body.usuario,
        "usuario",
        100
      )
        .toLowerCase()
        .replace(/\s+/g, "_");

      const nombre = validarTexto(
        req.body.nombre,
        "nombre",
        150
      );

      const clave = validarTexto(
        req.body.clave,
        "contraseña",
        200
      );

      const rol =
        req.body.rol ===
        "administrador"
          ? "administrador"
          : "consulta";

      if (
        !/^[a-z0-9._-]{3,100}$/.test(
          usuario
        )
      ) {
        return res
          .status(400)
          .json({
            mensaje:
              "El usuario debe tener al menos 3 caracteres y usar letras, números, punto, guion o guion bajo."
          });
      }

      const hash =
        await bcrypt.hash(
          clave,
          12
        );

      const [resultado] =
        await pool.query(
          `INSERT INTO usuarios_admin
            (
              usuario,
              password_hash,
              nombre,
              rol,
              activo
            )
           VALUES (?, ?, ?, ?, 1)`,
          [
            usuario,
            hash,
            nombre,
            rol
          ]
        );

      res.status(201).json({
        mensaje:
          "Usuario administrativo creado.",
        id: resultado.insertId,
        usuario,
        nombre,
        rol
      });
    } catch (error) {
      if (
        error.code ===
        "ER_DUP_ENTRY"
      ) {
        return res
          .status(409)
          .json({
            mensaje:
              "Ese usuario ya existe."
          });
      }

      console.error(
        "Error al crear usuario administrativo:",
        error
      );

      res
        .status(error.codigo || 500)
        .json({
          mensaje:
            error.codigo === 400
              ? error.message
              : "No fue posible crear el usuario."
        });
    }
  }
);

app.patch(
  "/api/admin/usuarios/:id/contrasena",
  requerirAdministrador,
  requerirRolAdministrador,
  async (req, res) => {
    try {
      const id = Number(
        req.params.id
      );

      if (
        !Number.isInteger(id) ||
        id < 1
      ) {
        return res
          .status(400)
          .json({
            mensaje:
              "Usuario no válido."
          });
      }

      const clave = validarTexto(
        req.body.clave,
        "contraseña nueva",
        200
      );

      const confirmacion =
        validarTexto(
          req.body.confirmacion,
          "confirmación de contraseña",
          200
        );

      if (
        clave !== confirmacion
      ) {
        return res
          .status(400)
          .json({
            mensaje:
              "Las contraseñas no coinciden."
          });
      }

      const [usuarios] =
        await pool.query(
          `SELECT
            id,
            usuario,
            nombre
           FROM usuarios_admin
           WHERE id = ?
           LIMIT 1`,
          [id]
        );

      if (!usuarios.length) {
        return res
          .status(404)
          .json({
            mensaje:
              "No se encontró el usuario administrativo."
          });
      }

      const hash =
        await bcrypt.hash(
          clave,
          12
        );

      await pool.query(
        `UPDATE usuarios_admin
         SET password_hash = ?
         WHERE id = ?`,
        [hash, id]
      );

      res.json({
        mensaje:
          `Contraseña actualizada para ${usuarios[0].usuario}.`
      });
    } catch (error) {
      console.error(
        "Error al cambiar contraseña administrativa:",
        error
      );

      res
        .status(error.codigo || 500)
        .json({
          mensaje:
            error.codigo === 400
              ? error.message
              : "No fue posible cambiar la contraseña."
        });
    }
  }
);

app.patch(
  "/api/admin/usuarios/:id/estado",
  requerirAdministrador,
  requerirRolAdministrador,
  async (req, res) => {
    const id = Number(
      req.params.id
    );

    const activo =
      Number(req.body.activo) === 1
        ? 1
        : 0;

    if (
      !Number.isInteger(id) ||
      id < 1
    ) {
      return res
        .status(400)
        .json({
          mensaje:
            "Usuario no válido."
        });
    }

    if (
      id ===
        Number(
          req.administrador.id
        ) &&
      activo === 0
    ) {
      return res
        .status(400)
        .json({
          mensaje:
            "No puedes desactivar la cuenta con la que iniciaste sesión."
        });
    }

    await pool.query(
      `UPDATE usuarios_admin
       SET activo = ?
       WHERE id = ?`,
      [activo, id]
    );

    res.json({
      mensaje: activo
        ? "Usuario activado."
        : "Usuario desactivado."
    });
  }
);

app.get(
  "/api/admin/participantes",
  requerirAdministrador,
  async (req, res) => {
    const [filas] =
      await pool.query(
        `SELECT
          id,
          numero_empleado,
          nombre,
          servicio,
          activo,
          fecha_creacion,
          ultimo_acceso
         FROM participantes
         ORDER BY activo DESC,
                  nombre ASC
         LIMIT 2000`
      );

    res.json(filas);
  }
);

app.post(
  "/api/admin/participantes",
  requerirAdministrador,
  requerirRolAdministrador,
  async (req, res) => {
    try {
      const numeroEmpleado =
        validarTexto(
          req.body.numero_empleado,
          "número de empleado",
          50
        );

      const nombre = validarTexto(
        req.body.nombre,
        "nombre",
        150
      );

      const servicio =
        String(
          req.body.servicio || ""
        )
          .trim()
          .slice(0, 100) ||
        null;

      await pool.query(
        `INSERT INTO participantes
          (
            numero_empleado,
            nombre,
            nombre_normalizado,
            servicio,
            activo
          )
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           nombre =
             VALUES(nombre),
           nombre_normalizado =
             VALUES(nombre_normalizado),
           servicio =
             VALUES(servicio),
           activo = 1`,
        [
          numeroEmpleado,
          nombre,
          normalizarNombre(nombre),
          servicio
        ]
      );

      res.status(201).json({
        mensaje:
          "Participante guardado correctamente."
      });
    } catch (error) {
      console.error(
        "Error al guardar participante:",
        error
      );

      res
        .status(error.codigo || 500)
        .json({
          mensaje:
            error.codigo === 400
              ? error.message
              : "No fue posible guardar al participante."
        });
    }
  }
);

app.patch(
  "/api/admin/participantes/:id/estado",
  requerirAdministrador,
  requerirRolAdministrador,
  async (req, res) => {
    const id = Number(
      req.params.id
    );

    const activo =
      Number(req.body.activo) === 1
        ? 1
        : 0;

    if (
      !Number.isInteger(id) ||
      id < 1
    ) {
      return res
        .status(400)
        .json({
          mensaje:
            "Participante no válido."
        });
    }

    await pool.query(
      `UPDATE participantes
       SET activo = ?
       WHERE id = ?`,
      [activo, id]
    );

    res.json({
      mensaje: activo
        ? "Participante activado."
        : "Participante desactivado."
    });
  }
);

app.get(
  "/api/admin/cursos",
  requerirAdministrador,
  async (req, res) => {
    const [filas] =
      await pool.query(
        `SELECT
          id,
          nombre,
          slug,
          descripcion,
          activo,
          orden,
          calificacion_aprobatoria,
          calificacion_maxima_origen,
          fecha_creacion
         FROM cursos_capacitacion
         ORDER BY orden ASC,
                  nombre ASC`
      );

    res.json(filas);
  }
);

app.get(
  "/api/portal/session",
  async (req, res) => {
    try {
      const participante =
        await obtenerParticipanteDesdeSesion(
          req
        );

      res.set(
        "Cache-Control",
        "no-store"
      );

      if (!participante) {
        return res
          .status(401)
          .json({
            autenticado: false
          });
      }

      res.json({
        autenticado: true,
        participante
      });
    } catch (error) {
      res.status(500).json({
        mensaje:
          "No fue posible revisar la sesión."
      });
    }
  }
);

app.post(
  "/api/portal/login",
  limiteLoginParticipante,
  async (req, res) => {
    try {
      const nombre = validarTexto(
        req.body.nombre,
        "nombre completo",
        150
      );

      const numeroEmpleado =
        validarTexto(
          req.body.numero_empleado,
          "número de empleado",
          50
        );

      const [filas] =
        await pool.query(
          `SELECT
            id,
            numero_empleado,
            nombre,
            nombre_normalizado,
            servicio,
            activo
           FROM participantes
           WHERE numero_empleado = ?
           LIMIT 1`,
          [numeroEmpleado]
        );

      const participante =
        filas[0];

      const nombreCoincide =
        participante
          ? compararSeguro(
              normalizarNombre(nombre),
              String(
                participante.nombre_normalizado
              )
            )
          : false;

      if (
        !participante ||
        !participante.activo ||
        !nombreCoincide
      ) {
        return res
          .status(401)
          .json({
            mensaje:
              "No encontramos una coincidencia activa con ese nombre y número de empleado."
          });
      }

      await pool.query(
        `UPDATE participantes
         SET ultimo_acceso = NOW()
         WHERE id = ?`,
        [participante.id]
      );

      const token = crearTokenSesion(
        "participante",
        {
          participante_id:
            participante.id
        },
        SESION_PARTICIPANTE_MINUTOS
      );

      res.cookie(
        COOKIE_PARTICIPANTE,
        token,
        opcionesCookie(
          SESION_PARTICIPANTE_MINUTOS
        )
      );

      res.set(
        "Cache-Control",
        "no-store"
      );

      res.json({
        mensaje: "Acceso autorizado.",
        participante: {
          id: participante.id,
          numero_empleado:
            participante.numero_empleado,
          nombre:
            participante.nombre,
          servicio:
            participante.servicio
        }
      });
    } catch (error) {
      console.error(
        "Error al iniciar sesión del participante:",
        error
      );

      res
        .status(error.codigo || 500)
        .json({
          mensaje:
            error.codigo === 400
              ? error.message
              : "No fue posible iniciar sesión."
        });
    }
  }
);

app.post(
  "/api/portal/logout",
  (req, res) => {
    limpiarCookie(
      res,
      COOKIE_PARTICIPANTE
    );

    res.set(
      "Cache-Control",
      "no-store"
    );

    res.json({
      mensaje:
        "Sesión cerrada correctamente."
    });
  }
);

app.get(
  "/api/portal/cursos",
  requerirParticipante,
  async (req, res) => {
    const [cursos] =
      await pool.query(
        `SELECT
          id,
          nombre,
          slug,
          descripcion,
          orden
         FROM cursos_capacitacion
         WHERE activo = 1
         ORDER BY orden ASC,
                  nombre ASC`
      );

    const [resultados] =
      await pool.query(
        `SELECT
          id,
          curso,
          calificacion,
          calificacion_maxima,
          aprobado,
          intento,
          fecha
         FROM resultados_capacitacion
         WHERE numero_empleado = ?
         ORDER BY fecha ASC,
                  id ASC`,
        [
          req.participante
            .numero_empleado
        ]
      );

    const porCurso = new Map();

    for (
      const resultado of resultados
    ) {
      const clave = String(
        resultado.curso || ""
      )
        .trim()
        .toLowerCase();

      if (!porCurso.has(clave)) {
        porCurso.set(clave, []);
      }

      porCurso
        .get(clave)
        .push(resultado);
    }

    const respuesta =
      cursos.map(curso => {
        const historial =
          porCurso.get(
            curso.nombre.toLowerCase()
          ) || [];

        const ultimo =
          historial[
            historial.length - 1
          ] || null;

        const mejor =
          historial.length
            ? Math.max(
                ...historial.map(
                  item =>
                    Number(
                      item.calificacion ||
                        0
                    )
                )
              )
            : null;

        return {
          id: curso.id,
          nombre: curso.nombre,
          slug: curso.slug,
          descripcion:
            curso.descripcion,
          url:
            `/curso/${encodeURIComponent(
              curso.slug
            )}/`,
          estado: !ultimo
            ? "no_iniciado"
            : Number(
                  ultimo.aprobado
                ) === 1
              ? "aprobado"
              : "no_aprobado",
          intentos:
            historial.length,
          ultima_calificacion:
            ultimo
              ? Number(
                  ultimo.calificacion
                )
              : null,
          mejor_calificacion:
            mejor,
          calificacion_maxima:
            ultimo
              ? Number(
                  ultimo.calificacion_maxima ||
                    100
                )
              : 100,
          ultima_fecha:
            ultimo?.fecha || null,
          historial:
            historial.map(item => ({
              id: item.id,
              intento: Number(
                item.intento || 0
              ),
              calificacion: Number(
                item.calificacion || 0
              ),
              calificacion_maxima:
                Number(
                  item.calificacion_maxima ||
                    100
                ),
              aprobado:
                Number(
                  item.aprobado
                ) === 1,
              fecha: item.fecha
            }))
        };
      });

    res.json({
      participante:
        req.participante,
      cursos: respuesta
    });
  }
);

app.use(
  "/curso",
  requerirParticipante,
  async (req, res, next) => {
    try {
      if (
        req.method !== "GET" &&
        req.method !== "HEAD"
      ) {
        return next();
      }

      let rutaDecodificada;

      try {
        rutaDecodificada =
          decodeURIComponent(
            String(req.url || "")
              .split("?")[0]
          );
      } catch (error) {
        return res
          .status(400)
          .send(
            "La ruta solicitada no es válida."
          );
      }

      const partes =
        rutaDecodificada
          .replace(/^\/+/, "")
          .split("/")
          .filter(Boolean);

      const slug =
        normalizarSlugCurso(
          partes.shift()
        );

      if (!slug) {
        return next();
      }

      const [filas] =
        await pool.query(
          `SELECT
            id,
            nombre,
            slug,
            archivo_html,
            carpeta_assets
           FROM cursos_capacitacion
           WHERE slug = ?
             AND activo = 1
           LIMIT 1`,
          [slug]
        );

      const curso = filas[0];

      if (!curso) {
        return res
          .status(404)
          .send(
            "Curso no encontrado."
          );
      }

      const baseProyecto =
        path.resolve(__dirname);

      const baseCurso =
        path.resolve(
          __dirname,
          curso.carpeta_assets
        );

      if (
        !rutaEstaDentro(
          baseProyecto,
          baseCurso
        )
      ) {
        return res
          .status(400)
          .send(
            "Ruta de curso no válida."
          );
      }

      if (partes.length === 0) {
        if (
          !String(
            req.originalUrl || ""
          )
            .split("?")[0]
            .endsWith("/")
        ) {
          return res.redirect(
            302,
            `/curso/${encodeURIComponent(
              curso.slug
            )}/`
          );
        }

        const rutaHtml =
          path.resolve(
            baseCurso,
            curso.archivo_html
          );

        if (
          !rutaEstaDentro(
            baseCurso,
            rutaHtml
          ) ||
          !fs.existsSync(rutaHtml) ||
          !fs.statSync(
            rutaHtml
          ).isFile()
        ) {
          return res
            .status(404)
            .send(
              "No se encontró el archivo principal del curso."
            );
        }

        return enviarHtmlConNonce(
          res,
          rutaHtml,
          "curso"
        );
      }

      if (
        partes[0] === "archivo"
      ) {
        partes.shift();
      }

      if (partes.length === 0) {
        return res
          .status(404)
          .send(
            "Archivo no encontrado."
          );
      }

      const rutaRelativa =
        partes.join(path.sep);

      const rutaArchivo =
        path.resolve(
          baseCurso,
          rutaRelativa
        );

      if (
        !rutaEstaDentro(
          baseCurso,
          rutaArchivo
        )
      ) {
        return res
          .status(400)
          .send(
            "Ruta de archivo no válida."
          );
      }

      const extension =
        path.extname(
          rutaArchivo
        ).toLowerCase();

      if (
        !EXTENSIONES_RECURSOS_CURSO
          .has(extension)
      ) {
        return res
          .status(403)
          .send(
            "Tipo de archivo no permitido."
          );
      }

      if (
        !fs.existsSync(
          rutaArchivo
        ) ||
        !fs.statSync(
          rutaArchivo
        ).isFile()
      ) {
        return res
          .status(404)
          .send(
            "Archivo no encontrado."
          );
      }

      res.set(
        "Cache-Control",
        "private, max-age=3600"
      );

      return res.sendFile(
        rutaArchivo
      );
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/portal/resultados",
  requerirParticipante,
  limiteResultados,
  async (req, res) => {
    try {
      const slug = validarTexto(
        req.body.curso_slug,
        "curso",
        150
      );

      const [filas] =
        await pool.query(
          `SELECT
            nombre,
            calificacion_aprobatoria,
            calificacion_maxima_origen
           FROM cursos_capacitacion
           WHERE slug = ?
             AND activo = 1
           LIMIT 1`,
          [slug]
        );

      if (!filas.length) {
        return res
          .status(404)
          .json({
            mensaje:
              "El curso no está disponible."
          });
      }

      const resultado =
        await guardarResultado({
          nombre:
            req.participante.nombre,
          numeroEmpleado:
            req.participante
              .numero_empleado,
          servicio:
            req.participante
              .servicio ||
            "Sin servicio asignado",
          curso:
            filas[0].nombre,
          calificacionRecibida:
            req.body.calificacion,
          calificacionMaximaRecibida:
            req.body
              .calificacion_maxima ??
            Number(
              filas[0]
                .calificacion_maxima_origen ||
              100
            ),
          totalPreguntasRecibido:
            req.body
              .total_preguntas,
          erroresRecibidos:
            req.body
              .respuestas_incorrectas,
          calificacionAprobatoria:
            Number(
              filas[0]
                .calificacion_aprobatoria ||
              CALIFICACION_APROBATORIA
            )
        });

      res.status(201).json({
        mensaje:
          "Resultado guardado correctamente.",
        ...resultado
      });
    } catch (error) {
      console.error(
        "Error al guardar resultado del portal:",
        error
      );

      res
        .status(error.codigo || 500)
        .json({
          mensaje:
            error.codigo &&
            error.codigo < 500
              ? error.message
              : "No fue posible guardar el resultado."
        });
    }
  }
);

app.get(
  "/api/diagnostico-db",
  requerirAdministrador,
  async (req, res) => {
    try {
      const [datosBase] =
        await pool.query(
          "SELECT DATABASE() AS base_actual"
        );

      const [conteo] =
        await pool.query(
          `SELECT COUNT(*) AS registros
           FROM resultados_capacitacion`
        );

      res.json({
        base_actual:
          datosBase[0].base_actual,
        registros:
          conteo[0].registros
      });
    } catch (error) {
      console.error(
        "Error en diagnóstico de base:",
        error
      );

      res.status(500).json({
        mensaje:
          "No fue posible revisar la conexión con la base de datos."
      });
    }
  }
);

app.options(
  "/api/resultados",
  corsCapacitaciones
);

app.post(
  "/api/resultados",
  corsCapacitaciones,
  limiteResultados,
  async (req, res) => {
    try {
      const nombre = validarTexto(
        req.body.nombre,
        "nombre",
        150
      );

      const numeroEmpleado =
        validarTexto(
          req.body.numero_empleado,
          "número de empleado",
          50
        );

      const servicio = validarTexto(
        req.body.servicio,
        "servicio",
        100
      );

      const curso = validarTexto(
        req.body.curso,
        "curso",
        150
      );

      const [configuracionesCurso] =
        await pool.query(
          `SELECT
            calificacion_aprobatoria,
            calificacion_maxima_origen
           FROM cursos_capacitacion
           WHERE nombre = ?
             AND activo = 1
           LIMIT 1`,
          [curso]
        );

      const configuracionCurso =
        configuracionesCurso[0] || null;

      const resultado =
        await guardarResultado({
          nombre,
          numeroEmpleado,
          servicio,
          curso,
          calificacionRecibida:
            req.body.calificacion,
          calificacionMaximaRecibida:
            req.body
              .calificacion_maxima ??
            configuracionCurso
              ?.calificacion_maxima_origen,
          totalPreguntasRecibido:
            req.body
              .total_preguntas,
          erroresRecibidos:
            req.body
              .respuestas_incorrectas,
          calificacionAprobatoria:
            Number(
              configuracionCurso
                ?.calificacion_aprobatoria ||
              CALIFICACION_APROBATORIA
            )
        });

      res.status(201).json({
        mensaje:
          "Resultado guardado correctamente.",
        ...resultado
      });
    } catch (error) {
      console.error(
        "Error al guardar resultado público temporal:",
        error
      );

      res
        .status(error.codigo || 500)
        .json({
          mensaje:
            error.codigo &&
            error.codigo < 500
              ? error.message
              : "No fue posible guardar el resultado."
        });
    }
  }
);

app.get(
  "/api/resultados",
  requerirAdministrador,
  async (req, res) => {
    try {
      const curso = String(
        req.query.curso || ""
      ).trim();

      let consulta = `
        SELECT
          id,
          nombre,
          numero_empleado,
          servicio,
          curso,
          calificacion,
          calificacion_maxima,
          total_preguntas,
          aprobado,
          intento,
          fecha
        FROM resultados_capacitacion
      `;

      const parametros = [];

      if (curso) {
        consulta +=
          " WHERE curso = ?";
        parametros.push(curso);
      }

      consulta +=
        " ORDER BY fecha DESC, id DESC";

      const [resultados] =
        await pool.query(
          consulta,
          parametros
        );

      res.json(resultados);
    } catch (error) {
      console.error(
        "Error al consultar resultados:",
        error
      );

      res.status(500).json({
        mensaje:
          "No fue posible consultar los resultados."
      });
    }
  }
);

app.get(
  "/api/resultados/:id/detalle",
  requerirAdministrador,
  async (req, res) => {
    try {
      const id = Number(
        req.params.id
      );

      if (
        !Number.isInteger(id) ||
        id < 1
      ) {
        return res
          .status(400)
          .json({
            mensaje:
              "El identificador del resultado no es válido."
          });
      }

      const [resultados] =
        await pool.query(
          `SELECT
            id,
            intento,
            total_preguntas,
            respuestas_incorrectas
           FROM resultados_capacitacion
           WHERE id = ?`,
          [id]
        );

      if (!resultados.length) {
        return res
          .status(404)
          .json({
            mensaje:
              "No se encontró el resultado solicitado."
          });
      }

      res.json(
        resultados[0]
      );
    } catch (error) {
      console.error(
        "Error al consultar detalle de intento:",
        error
      );

      res.status(500).json({
        mensaje:
          "No fue posible consultar el detalle del intento."
      });
    }
  }
);

app.use(
  (error, req, res, next) => {
    console.error(
      "Error no controlado:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      mensaje:
        "Ocurrió un error interno."
    });
  }
);

inicializarBase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `Servidor corriendo en el puerto ${PORT}.`
      );

      console.log(
        "Portal protegido disponible en /portal."
      );
    });
  })
  .catch(error => {
    console.error(
      "No fue posible inicializar la plataforma:",
      error
    );

    process.exit(1);
  });
