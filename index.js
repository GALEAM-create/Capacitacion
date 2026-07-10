try {
  require("dotenv").config();
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") {
    throw error;
  }

  console.log(
    "dotenv no está instalado; se usarán las variables proporcionadas por Railway."
  );
}

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
const NOMBRE_COOKIE = "galeam_admin";
const DURACION_SESION_MINUTOS = Number(process.env.SESSION_MINUTES || 30);
const DURACION_SESION_MS = DURACION_SESION_MINUTOS * 60 * 1000;
const ES_PRODUCCION =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT);

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
  throw new Error(
    "SESSION_SECRET debe contener por lo menos 32 caracteres."
  );
}

if (
  !Number.isFinite(DURACION_SESION_MINUTOS) ||
  DURACION_SESION_MINUTOS < 5 ||
  DURACION_SESION_MINUTOS > 720
) {
  throw new Error(
    "SESSION_MINUTES debe ser un número entre 5 y 720."
  );
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

const limiteLogin = rateLimit({
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


function codificarBase64Url(valor) {
  return Buffer.from(valor).toString("base64url");
}

function crearTokenSesion(usuario) {
  const ahora = Date.now();
  const datos = {
    usuario,
    emitido: ahora,
    expira: ahora + DURACION_SESION_MS,
    nonce: crypto.randomBytes(16).toString("hex")
  };

  const cuerpo = codificarBase64Url(JSON.stringify(datos));
  const firma = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(cuerpo)
    .digest("base64url");

  return `${cuerpo}.${firma}`;
}

function comparacionSegura(a, b) {
  const bufferA = Buffer.from(String(a || ""));
  const bufferB = Buffer.from(String(b || ""));

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

function verificarTokenSesion(token) {
  try {
    const [cuerpo, firmaRecibida, sobrante] = String(token || "").split(".");

    if (!cuerpo || !firmaRecibida || sobrante !== undefined) {
      return null;
    }

    const firmaEsperada = crypto
      .createHmac("sha256", process.env.SESSION_SECRET)
      .update(cuerpo)
      .digest("base64url");

    if (!comparacionSegura(firmaRecibida, firmaEsperada)) {
      return null;
    }

    const datos = JSON.parse(
      Buffer.from(cuerpo, "base64url").toString("utf8")
    );

    if (
      datos.usuario !== process.env.ADMIN_USER ||
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
  const encabezado = String(req.headers.cookie || "");
  const cookies = {};

  encabezado.split(";").forEach(parte => {
    const indice = parte.indexOf("=");

    if (indice < 1) return;

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

function obtenerSesion(req) {
  const cookies = obtenerCookies(req);
  return verificarTokenSesion(cookies[NOMBRE_COOKIE]);
}

function opcionesCookie() {
  return {
    httpOnly: true,
    secure: ES_PRODUCCION,
    sameSite: "strict",
    path: "/",
    maxAge: DURACION_SESION_MS,
    priority: "high"
  };
}

function requerirAdministrador(req, res, next) {
  const sesion = obtenerSesion(req);

  if (!sesion) {
    res.clearCookie(NOMBRE_COOKIE, {
      httpOnly: true,
      secure: ES_PRODUCCION,
      sameSite: "strict",
      path: "/"
    });

    return res.status(401).json({
      mensaje: "Debes iniciar sesión para consultar esta información."
    });
  }

  res.set("Cache-Control", "no-store");
  req.sesionAdmin = sesion;
  next();
}

function enviarPanelAdmin(req, res) {
  const rutaAdmin = path.join(__dirname, "admin.html");

  try {
    const nonce = crypto.randomBytes(18).toString("base64");
    const html = fs
      .readFileSync(rutaAdmin, "utf8")
      .replaceAll("__CSP_NONCE__", nonce);

    res.set({
      "Cache-Control": "no-store",
      "Content-Security-Policy": [
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
      ].join("; ")
    });

    res.type("html").send(html);
  } catch (error) {
    console.error("No fue posible cargar admin.html:", error);
    res.status(500).send("No fue posible cargar el panel administrativo.");
  }
}

app.get("/admin", enviarPanelAdmin);
app.get("/admin/", enviarPanelAdmin);
app.get("/admin.html", (req, res) => res.redirect(302, "/admin"));

app.get("/api/admin/session", (req, res) => {
  const sesion = obtenerSesion(req);

  res.set("Cache-Control", "no-store");

  if (!sesion) {
    return res.status(401).json({ autenticado: false });
  }

  res.json({
    autenticado: true,
    usuario: sesion.usuario,
    expira: sesion.expira
  });
});

app.post("/api/admin/login", limiteLogin, async (req, res) => {
  try {
    const usuario = String(req.body.usuario || "").trim();
    const clave = String(req.body.clave || "");

    if (!usuario || !clave || usuario.length > 100 || clave.length > 200) {
      return res.status(400).json({
        mensaje: "Escribe un usuario y una contraseña válidos."
      });
    }

    const usuarioValido = comparacionSegura(
      usuario,
      process.env.ADMIN_USER
    );

    // La comparación de contraseña se ejecuta aun si el usuario no coincide,
    // para reducir diferencias de tiempo entre ambos tipos de error.
    const claveValida = await bcrypt.compare(
      clave,
      process.env.ADMIN_PASSWORD_HASH
    );

    if (!usuarioValido || !claveValida) {
      return res.status(401).json({
        mensaje: "Usuario o contraseña incorrectos."
      });
    }

    const token = crearTokenSesion(process.env.ADMIN_USER);
    res.cookie(NOMBRE_COOKIE, token, opcionesCookie());
    res.set("Cache-Control", "no-store");

    res.json({
      mensaje: "Acceso autorizado.",
      usuario: process.env.ADMIN_USER,
      duracion_minutos: DURACION_SESION_MINUTOS
    });
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    res.status(500).json({
      mensaje: "No fue posible iniciar sesión."
    });
  }
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie(NOMBRE_COOKIE, {
    httpOnly: true,
    secure: ES_PRODUCCION,
    sameSite: "strict",
    path: "/"
  });
  res.set("Cache-Control", "no-store");
  res.json({ mensaje: "Sesión cerrada correctamente." });
});

function crearNombreBloqueo(numeroEmpleado, curso) {
  const identificador = `${numeroEmpleado}__${curso}`;

  const hash = crypto
    .createHash("sha256")
    .update(identificador)
    .digest("hex")
    .slice(0, 48);

  return `galeam_intento_${hash}`;
}

function obtenerEscalaDeEntrada(curso, calificacionMaximaRecibida) {
  if (
    calificacionMaximaRecibida !== undefined &&
    calificacionMaximaRecibida !== null &&
    calificacionMaximaRecibida !== ""
  ) {
    const escala = Number(calificacionMaximaRecibida);

    if (escala !== 10 && escala !== 100) {
      const error = new Error(
        "La calificación máxima de origen debe ser 10 o 100."
      );
      error.codigo = 400;
      throw error;
    }

    return escala;
  }

  /*
    Compatibilidad temporal:
    la versión anterior del curso de Armas enviaba resultados de 0 a 10.
    Mientras actualizamos esa página, aquí los convertimos a 0-100.
  */
  return String(curso || "").toLowerCase().includes("arma")
    ? 10
    : 100;
}

function normalizarCalificacion(
  curso,
  calificacionRecibida,
  calificacionMaximaRecibida
) {
  const calificacion = Number(calificacionRecibida);

  const escalaEntrada = obtenerEscalaDeEntrada(
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

  if (calificacion < 0 || calificacion > escalaEntrada) {
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

function normalizarErrores(errores) {
  if (errores === undefined || errores === null) {
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

    if (!Number.isInteger(numero) || numero < 1 || numero > 100) {
      const error = new Error(
        "Cada respuesta incorrecta debe incluir un número de pregunta válido."
      );
      error.codigo = 400;
      throw error;
    }

    if (!pregunta || !respuestaUsuario || !respuestaCorrecta) {
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

app.get("/", (req, res) => {
  res.send("API de Capacitación Galeam funcionando.");
});

app.get("/api/prueba", (req, res) => {
  res.json({
    mensaje: "La API está funcionando.",
    sistema: "Capacitación Galeam",
    escala: "0 a 100",
    aprobatorio: CALIFICACION_APROBATORIA
  });
});

app.get(
  "/api/diagnostico-db",
  requerirAdministrador,
  async (req, res) => {
  try {
    const [datosBase] = await pool.query(
      "SELECT DATABASE() AS base_actual"
    );

    const [conteo] = await pool.query(
      "SELECT COUNT(*) AS registros FROM resultados_capacitacion"
    );

    res.json({
      base_actual: datosBase[0].base_actual,
      registros: conteo[0].registros
    });
  } catch (error) {
    console.error("Error en diagnóstico de base:", error);

    res.status(500).json({
      mensaje: "No fue posible revisar la conexión con la base de datos."
    });
  }
  }
);

app.options("/api/resultados", corsCapacitaciones);

app.post(
  "/api/resultados",
  corsCapacitaciones,
  limiteResultados,
  async (req, res) => {
  let conexion;
  let bloqueoObtenido = false;
  let nombreBloqueo = null;
  let transaccionIniciada = false;

  try {
    const nombre = validarTexto(
      req.body.nombre,
      "nombre",
      150
    );

    const numeroEmpleado = validarTexto(
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

    const calificacion = normalizarCalificacion(
      curso,
      req.body.calificacion,
      req.body.calificacion_maxima
    );

    let totalPreguntas = null;

    if (
      req.body.total_preguntas !== undefined &&
      req.body.total_preguntas !== null &&
      req.body.total_preguntas !== ""
    ) {
      totalPreguntas = Number(req.body.total_preguntas);

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

    const respuestasIncorrectas = normalizarErrores(
      req.body.respuestas_incorrectas
    );

    if (
      totalPreguntas !== null &&
      respuestasIncorrectas !== null &&
      respuestasIncorrectas.length > totalPreguntas
    ) {
      const error = new Error(
        "La cantidad de respuestas incorrectas no puede superar el total de preguntas."
      );
      error.codigo = 400;
      throw error;
    }

    const aprobado =
      calificacion >= CALIFICACION_APROBATORIA;

    conexion = await pool.getConnection();

    nombreBloqueo = crearNombreBloqueo(
      numeroEmpleado,
      curso
    );

    const [resultadoBloqueo] = await conexion.query(
      "SELECT GET_LOCK(?, 10) AS obtenido",
      [nombreBloqueo]
    );

    bloqueoObtenido =
      Number(resultadoBloqueo[0].obtenido) === 1;

    if (!bloqueoObtenido) {
      return res.status(503).json({
        mensaje:
          "No fue posible asignar el intento en este momento. Inténtalo nuevamente."
      });
    }

    await conexion.beginTransaction();
    transaccionIniciada = true;

    const [filasPrevias] = await conexion.query(
      `SELECT
        GREATEST(
          COALESCE(MAX(intento), 0),
          COUNT(*)
        ) AS ultimo_intento
       FROM resultados_capacitacion
       WHERE numero_empleado = ? AND curso = ?`,
      [numeroEmpleado, curso]
    );

    const intento =
      Number(filasPrevias[0].ultimo_intento) + 1;

    const [resultado] = await conexion.query(
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
          : JSON.stringify(respuestasIncorrectas),
        aprobado,
        intento
      ]
    );

    await conexion.commit();
    transaccionIniciada = false;

    res.status(201).json({
      mensaje: "Resultado guardado correctamente.",
      id: resultado.insertId,
      intento,
      calificacion,
      aprobado
    });
  } catch (error) {
    if (conexion && transaccionIniciada) {
      await conexion.rollback();
    }

    console.error("Error al guardar resultado:", error);

    res.status(error.codigo || 500).json({
      mensaje:
        error.codigo === 400
          ? error.message
          : "No fue posible guardar el resultado."
    });
  } finally {
    if (conexion && bloqueoObtenido && nombreBloqueo) {
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
);

app.get("/api/resultados", requerirAdministrador, async (req, res) => {
  try {
    const curso = String(req.query.curso || "").trim();

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
      consulta += " WHERE curso = ?";
      parametros.push(curso);
    }

    consulta += " ORDER BY fecha DESC, id DESC";

    const [resultados] = await pool.query(
      consulta,
      parametros
    );

    res.json(resultados);
  } catch (error) {
    console.error("Error al consultar resultados:", error);

    res.status(500).json({
      mensaje: "No fue posible consultar los resultados."
    });
  }
});

app.get(
  "/api/resultados/:id/detalle",
  requerirAdministrador,
  async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        mensaje: "El identificador del resultado no es válido."
      });
    }

    const [resultados] = await pool.query(
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
      return res.status(404).json({
        mensaje: "No se encontró el resultado solicitado."
      });
    }

    res.json(resultados[0]);
  } catch (error) {
    console.error(
      "Error al consultar detalle de intento:",
      error
    );

    res.status(500).json({
      mensaje: "No fue posible consultar el detalle del intento."
    });
  }
  }
);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}.`);
});
