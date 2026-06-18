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
  res.send("Servidor Gesvera funcionando correctamente con MySQL Railway");
});

app.get("/api/prueba", (req, res) => {
  res.json({
    mensaje: "La API está funcionando",
    sistema: "Gesvera Capacitación"
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

    const [resultado] = await pool.query(
      `INSERT INTO resultados_capacitacion 
      (nombre, numero_empleado, servicio, curso, calificacion, aprobado)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, numero_empleado, servicio, curso, calificacion, aprobado]
    );

    res.json({
      mensaje: "Resultado guardado correctamente en MySQL Railway",
      id: resultado.insertId
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al guardar resultado",
      error: error.message
    });
  }
});

app.get("/api/resultados", async (req, res) => {
  try {
    const [resultados] = await pool.query(
      "SELECT * FROM resultados_capacitacion ORDER BY fecha DESC"
    );

    res.json(resultados);
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al consultar resultados",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});