const bcrypt = require("bcryptjs");
const readline = require("readline");

const interfaz = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

interfaz.question(
  "Escribe la contraseña que usarás para el panel: ",
  async clave => {
    try {
      if (clave.length < 12) {
        console.error(
          "La contraseña debe tener al menos 12 caracteres."
        );
        process.exitCode = 1;
        return;
      }

      const hash = await bcrypt.hash(clave, 12);
      console.log("\nCopia este valor en ADMIN_PASSWORD_HASH de Railway:\n");
      console.log(hash);
    } catch (error) {
      console.error("No fue posible generar el hash:", error.message);
      process.exitCode = 1;
    } finally {
      interfaz.close();
    }
  }
);
