# Curso e-learning Walmart Félix Cuevas

Fecha: 18 de septiembre de 2026.

## Contenido y funcionamiento

- Doce páginas de contenido basadas en la presentación recibida, incluidas las tablas de gafetes y escalamiento recuperadas de las imágenes EMF.
- Diez preguntas del documento recibido. Clave indicada por el responsable: A, A, C, A, B, C, B, C, C, A.
- Tiempo de evaluación: 15 minutos. Calificación: 0–100. Aprobación: 80.
- Ruta autenticada: `/curso/consignas-walmart-felix-cuevas/`.
- Visible y accesible para `WALMART FELIX CUEVAS` y `FELIX CUEVAS`, con normalización de acentos, mayúsculas y espacios.
- Registro en `resultados_capacitacion` con nombre `Consignas específicas — Walmart Félix Cuevas` y modalidad E-LEARNING, consultable por los mecanismos existentes de historial y administración.

## Hallazgos corregidos

1. **Pérdida de sesión entre dominios.** El nuevo curso se sirve en el mismo origen que el portal y usa su cookie de sesión. No requiere transportar un token en el enlace. Se conserva la corrección previa de Diamante.
2. **Reclasificación incorrecta al arrancar.** Se retiró la actualización recurrente que convertía cualquier resultado del servicio Félix Cuevas a PRESENCIAL. Los registros existentes conservan su estado y cada nuevo envío usa su modalidad correspondiente. El endpoint del nuevo curso fuerza E-LEARNING.
3. **Recarga o sesión vencida.** Las respuestas, el avance, el identificador de envío y el vencimiento del cronómetro se conservan en sessionStorage por cuenta y pestaña. Un cambio de cuenta impide atribuir respuestas a otro participante. Una navegación con sesión vencida vuelve al portal; después de identificarse y abrir el curso en la misma pestaña se recupera el intento pendiente.
4. **Reintento duplicado.** La tabla `envios_elearning` almacena el identificador, huella de respuestas y resultado dentro de la misma transacción que inserta la calificación. Reenviar el mismo intento devuelve el resultado previo. Un identificador reutilizado con otras respuestas se rechaza.
5. **Calificación alterada desde el cliente.** El endpoint valida diez respuestas, calcula el resultado en el servidor y toma la identidad de la sesión. Rechaza servicios ajenos y cuentas distintas a la que inició el examen. La ruta genérica no acepta resultados e-learning de este curso; el flujo presencial existente conserva su modalidad.

## Verificación realizada

Ejecutar desde la raíz del repositorio:

```sh
node tests/felix-server.test.cjs
node tests/felix-client.test.cjs
```

Pruebas aprobadas:

- Clave completa: 100 puntos; dos errores: 80; tres errores: 70; sin respuestas: 0.
- Rechazo de respuestas mal formadas y servicios no autorizados.
- Conservación del enlace autenticado de Diamante y ruta nativa de Félix Cuevas en el catálogo.
- Calificación calculada por servidor y modalidad E-LEARNING aunque el cliente intente enviar otro valor.
- Rechazo de cambio de cuenta y de identificador de envío inválido.
- Reenvío sin duplicación y rollback si falla la persistencia del registro de envío.
- Inicio en portada, revisión de páginas, inicio del examen y respuestas incompletas.
- Recuperación de respuestas y fecha límite después de recargar.
- Sesión vencida, reidentificación con la cuenta original y pérdida de respuesta de red al guardar.
- Envío al terminar el tiempo y repetición voluntaria después de confirmar el resultado.
- Sintaxis JavaScript de servidor, portal y curso.

## Alcance y pendientes

Las pruebas usan dobles de base de datos y DOM en Node; no insertan calificaciones de personas reales. Se revisó la estructura del HTML y las reglas de adaptación a móvil. El navegador de revisión no pudo abrir la vista local por restricciones del entorno: queda pendiente verificar visualmente escritorio y teléfono, así como completar un intento con una cuenta real del servicio y confirmar su aparición en administrativos. El cronómetro se controla en el cliente; estas pruebas no certifican resistencia a manipulación deliberada del navegador. La conservación local depende de que el navegador permita sessionStorage y de mantener la misma pestaña.
