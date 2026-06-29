require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = mysql.createPool(process.env.DATABASE_URL);

app.get("/", (req, res) => {
  res.send("Servidor de Capacitación Galeam funcionando correctamente con MySQL Railway");
});

app.get("/api/prueba", (req, res) => {
  res.json({
    mensaje: "La API está funcionando",
    sistema: "Capacitación Galeam"
  });
});

app.get("/api/db-test", async (req, res) => {
  try {
    const [filas] = await pool.query("SELECT NOW() AS fecha_servidor");

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
  try {
    const {
      nombre,
      numero_empleado,
      servicio,
      curso,
      calificacion,
      aprobado
    } = req.body;

    const nombreLimpio = String(nombre || "").trim();
    const numeroEmpleadoLimpio = String(numero_empleado || "").trim();
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
        mensaje: "Faltan datos obligatorios: nombre, número de empleado, servicio o curso."
      });
    }

    if (
      calificacion === "" ||
      calificacion === null ||
      calificacion === undefined ||
      !Number.isFinite(calificacionNumero) ||
      calificacionNumero < 0 ||
      calificacionNumero > 10
    ) {
      return res.status(400).json({
        mensaje: "La calificación debe ser un número entre 0 y 10."
      });
    }

    if (typeof aprobado !== "boolean") {
      return res.status(400).json({
        mensaje: "El campo aprobado debe enviarse como true o false."
      });
    }

    const [resultado] = await pool.query(
      `INSERT INTO resultados_capacitacion
      (nombre, numero_empleado, servicio, curso, calificacion, aprobado)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        nombreLimpio,
        numeroEmpleadoLimpio,
        servicioLimpio,
        cursoLimpio,
        calificacionNumero,
        aprobado
      ]
    );

    res.status(201).json({
      mensaje: "Resultado guardado correctamente",
      id: resultado.insertId
    });
  } catch (error) {
    console.error("Error al guardar resultado:", error);

    res.status(500).json({
      mensaje: "Error al guardar resultado",
      error: error.message
    });
  }
});

app.get("/api/resultados", async (req, res) => {
  try {
    const curso = String(req.query.curso || "").trim();

    let consulta = `
      SELECT *
      FROM resultados_capacitacion
    `;

    const parametros = [];

    if (curso) {
      consulta += " WHERE curso = ?";
      parametros.push(curso);
    }

    consulta += " ORDER BY fecha DESC";

    const [resultados] = await pool.query(consulta, parametros);

    res.json(resultados);
  } catch (error) {
    console.error("Error al consultar resultados:", error);

    res.status(500).json({
      mensaje: "Error al consultar resultados",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
