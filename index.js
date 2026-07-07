require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const pool = mysql.createPool(process.env.DATABASE_URL);

function obtenerEscalaPredeterminada(curso) {
  return String(curso || "").toLowerCase().includes("arma") ? 100 : 10;
}

function normalizarErrores(errores) {
  // Los cursos viejos todavía no enviarán este campo.
  // Por eso permitimos que sea null mientras actualizamos sus archivos.
  if (errores === undefined || errores === null) {
    return {
      fueEnviado: false,
      datos: null
    };
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

  const datos = errores.map((respuesta, indice) => {
    const numero = Number(
      respuesta?.numero ?? respuesta?.pregunta_numero ?? indice + 1
    );

    const pregunta = String(respuesta?.pregunta ?? "").trim();

    const respuestaUsuario = String(
      respuesta?.respuesta_usuario ?? respuesta?.respondio ?? ""
    ).trim();

    const respuestaCorrecta = String(
      respuesta?.respuesta_correcta ?? respuesta?.correcta ?? ""
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

  return {
    fueEnviado: true,
    datos
  };
}

app.get("/", (req, res) => {
  res.send(
    "Servidor de Capacitación Galeam funcionando correctamente con MySQL Railway"
  );
});

app.get("/api/prueba", (req, res) => {
  res.json({
    mensaje: "La API está funcionando",
    sistema: "Capacitación Galeam"
  });
});

app.get("/api/db-test", async (req, res) => {
  try {
    const [filas] = await pool.query(
      "SELECT NOW() AS fecha_servidor"
    );

    res.json({
      mensaje: "Conexión a MySQL Railway correcta",
      datos: filas[0]
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error conectando a MySQL",
      error: error.message
    });
  }
});

app.post("/api/resultados", async (req, res) => {
  let conexion;

  try {
    const {
      nombre,
      numero_empleado,
      servicio,
      curso,
      calificacion,
      aprobado,
      calificacion_maxima,
      total_preguntas,
      respuestas_incorrectas
    } = req.body;

    const nombreLimpio = String(nombre || "").trim();
    const numeroEmpleadoLimpio = String(
      numero_empleado || ""
    ).trim();

    const servicioLimpio = String(servicio || "").trim();
    const cursoLimpio = String(curso || "").trim();
    const calificacionNumero = Number(calificacion);

    if (
      !nombreLimpio ||
      !numeroEmpleadoLimpio ||
      !servicioLimpio ||
      !cursoLimpio
    ) {
      return res.status(400).json({
        mensaje:
          "Faltan datos obligatorios: nombre, número de empleado, servicio o curso."
      });
    }

    if (
      nombreLimpio.length > 150 ||
      numeroEmpleadoLimpio.length > 60 ||
      servicioLimpio.length > 150 ||
      cursoLimpio.length > 255
    ) {
      return res.status(400).json({
        mensaje:
          "Uno de los datos de identificación excede la longitud permitida."
      });
    }

    // Extorsión usa 0 a 10.
    // Armas usa 0 a 100.
    const escalaPredeterminada =
      obtenerEscalaPredeterminada(cursoLimpio);

    const calificacionMaxima =
      calificacion_maxima === undefined ||
      calificacion_maxima === null ||
      calificacion_maxima === ""
        ? escalaPredeterminada
        : Number(calificacion_maxima);

    if (
      !Number.isInteger(calificacionMaxima) ||
      calificacionMaxima < 1 ||
      calificacionMaxima > 100
    ) {
      return res.status(400).json({
        mensaje:
          "La calificación máxima debe ser un entero entre 1 y 100."
      });
    }

    if (
      calificacion === "" ||
      calificacion === null ||
      calificacion === undefined ||
      !Number.isFinite(calificacionNumero) ||
      calificacionNumero < 0 ||
      calificacionNumero > calificacionMaxima
    ) {
      return res.status(400).json({
        mensaje: `La calificación debe ser un número entre 0 y ${calificacionMaxima}.`
      });
    }

    if (typeof aprobado !== "boolean") {
      return res.status(400).json({
        mensaje:
          "El campo aprobado debe enviarse como true o false."
      });
    }

    let totalPreguntasNumero = null;

    if (
      total_preguntas !== undefined &&
      total_preguntas !== null &&
      total_preguntas !== ""
    ) {
      totalPreguntasNumero = Number(total_preguntas);

      if (
        !Number.isInteger(totalPreguntasNumero) ||
        totalPreguntasNumero < 1 ||
        totalPreguntasNumero > 100
      ) {
        return res.status(400).json({
          mensaje:
            "El total de preguntas debe ser un entero entre 1 y 100."
        });
      }
    }

    const errores = normalizarErrores(respuestas_incorrectas);

    if (
      totalPreguntasNumero !== null &&
      errores.datos !== null &&
      errores.datos.length > totalPreguntasNumero
    ) {
      return res.status(400).json({
        mensaje:
          "La cantidad de respuestas incorrectas no puede ser mayor al total de preguntas."
      });
    }

    conexion = await pool.getConnection();
    await conexion.beginTransaction();

    // Busca cuántos intentos previos lleva esta persona
    // específicamente en este curso.
    const [filasPrevias] = await conexion.query(
      `SELECT COUNT(*) AS cantidad
       FROM resultados_capacitacion
       WHERE numero_empleado = ? AND curso = ?
       FOR UPDATE`,
      [numeroEmpleadoLimpio, cursoLimpio]
    );

    const intento = Number(filasPrevias[0].cantidad) + 1;

    const [resultado] = await conexion.query(
      `INSERT INTO resultados_capacitacion
      (
        nombre,
        numero_empleado,
        servicio,
        curso,
        calificacion,
        calificacion_maxima,
        aprobado,
        intento,
        total_preguntas,
        respuestas_incorrectas
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombreLimpio,
        numeroEmpleadoLimpio,
        servicioLimpio,
        cursoLimpio,
        calificacionNumero,
        calificacionMaxima,
        aprobado,
        intento,
        totalPreguntasNumero,
        errores.fueEnviado
          ? JSON.stringify(errores.datos)
          : null
      ]
    );

    await conexion.commit();

    res.status(201).json({
      mensaje: "Resultado guardado correctamente",
      id: resultado.insertId,
      intento
    });
  } catch (error) {
    if (conexion) {
      await conexion.rollback();
    }

    console.error("Error al guardar resultado:", error);

    const status =
      error.codigo ||
      (error.code === "ER_DUP_ENTRY" ? 409 : 500);

    res.status(status).json({
      mensaje:
        status === 409
          ? "No fue posible asignar el intento. Envía el resultado nuevamente."
          : error.message || "Error al guardar resultado"
    });
  } finally {
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
        aprobado,
        intento,
        total_preguntas,
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
      mensaje: "Error al consultar resultados",
      error: error.message
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
      "Error al consultar el detalle del resultado:",
      error
    );

    res.status(500).json({
      mensaje: "Error al consultar el detalle del resultado",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `Servidor corriendo en http://localhost:${PORT}`
  );
});
