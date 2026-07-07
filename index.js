require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

const CALIFICACION_MAXIMA = 100;
const CALIFICACION_APROBATORIA = 70;

if (!process.env.DATABASE_URL) {
  throw new Error("Falta configurar la variable DATABASE_URL en Railway.");
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const pool = mysql.createPool(process.env.DATABASE_URL);

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

app.get("/api/diagnostico-db", async (req, res) => {
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
});

app.post("/api/resultados", async (req, res) => {
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
});

app.get("/api/resultados", async (req, res) => {
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

app.get("/api/resultados/:id/detalle", async (req, res) => {
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
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}.`);
});
