# Revisión de estabilidad

Estado: conversor experimental reforzado; el mod dentro del juego sigue sin estar certificado.

## Correcciones verificadas

- Lectura de ArrayBuffer y vistas Buffer/Uint8Array sin perder su desplazamiento.
- Rechazo de transformaciones y puntos no finitos antes de generar geometría.
- Rechazo de nombres ZIP con separadores Windows, rutas de unidad, componentes vacíos, caracteres de control o nombres que exceden el formato ZIP.
- Rechazo de valores DRS vacíos en lugar de convertirlos silenciosamente a cero.
- Calibración nativa: ambas métricas de error deben ser números finitos no negativos y cumplir sus tolerancias. Un informe incompleto ya no pasa la comprobación.
- Rechazo de sectores coincidentes con la meta.
- Identidad de pista en vivo: se comprueban las posiciones y los recuentos esperados; un array disperso, nulo o un objeto que solo declare `length` no puede pasar como captura válida.
- CLI: modelos, líneas AI y metadatos se resuelven respecto al directorio del INI; se rechazan enlaces simbólicos que salgan del origen y configuraciones sin modelos.
- Generación reproducible de `TrackBridge.html` desde `index.html` y los tres módulos. Las pruebas detectan una versión autónoma desactualizada.
- Suite unificada y GitHub Actions para Node 18/22, más la prueba Python de preparación OBJ.

Validación local: todas las pruebas JavaScript de `npm test` y `python tests/prepare_obj_test.py` pasan con los archivos de investigación del repositorio. Los casos nuevos incluyen la exportación CLI en subcarpetas y la conservación de los originales. No se han ejecutado Unreal Editor, las herramientas C# ni los scripts PowerShell en este entorno Linux. GitHub Actions debe confirmar la matriz tras publicar la rama.

## Limitaciones encontradas que siguen abiertas

1. `research/kalinago-repair-pack03/test-manifest.json` declara `installable: false`, `weekendValidated: false`, `raceValidated: false` y `crashFixValidatedInGame: false`. El fallo de cámara registrado no tiene una causa raíz demostrada. Aprobar las pruebas de geometría no demuestra que esté corregido.
2. `build-race-component.js` contiene decisiones específicas de Kalinago/Bahrain: recuentos, índices de entrada/salida de boxes y puntos de activación. No es un adaptador genérico para cualquier circuito.
3. Velocidades, DRS, límites de pista, incidentes y asignación de boxes conservan hipótesis sin validar. No se deben presentar como datos deportivos definitivos.
4. La exportación del navegador y la del CLI usan esquemas de manifiesto y nombres CSV diferentes. El adaptador actual consume directamente la salida del CLI; no se ha unificado aquí la salida web.
5. Los scripts de instalación/cooking y el escritor C# requieren validación propia en Windows y una instalación compatible del juego. No se ha generado ni sustituido ningún contenedor `.pak`, `.utoc` o `.ucas`.

## Prueba necesaria antes de declarar un circuito estable

Conservar el hash del ejecutable, de las entradas y de los contenedores que realmente se prueban. En una instalación de prueba, comprobar carga sin fallos, todas las cámaras y sus transiciones, salida de boxes, retorno y paradas para los equipos, clasificación, sectores, recuento de vueltas, DRS, carrera completa y resultado final. Repetir carga/guardado y una sesión larga; revisar el registro de fallos. Registrar el resultado por circuito y por versión del juego. La comprobación de identidad en vivo solo confirma coordenadas; nunca autoriza por sí misma instalar un paquete.
