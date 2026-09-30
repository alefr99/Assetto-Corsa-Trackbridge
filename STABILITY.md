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
- Suite unificada y GitHub Actions para Node 18/22, más pruebas de preparación OBJ e instalación sintética en PowerShell.
- ZIP del navegador compatible con el adaptador: manifiesto con unidades/transformación y CSV con nombres estables. La selección automática de AI respeta la carpeta exacta del INI; las líneas duplicadas bloquean la exportación.
- Prueba de integración que ejecuta el controlador real de exportación web con un DOM simulado, lee el ZIP producido y adapta las líneas originales de Kalinago. No sustituye una prueba visual en Chrome/Edge.
- Tablas spline, nudos y opciones de ajuste: rechazo de errores no finitos, tablas desordenadas y pasos de muestreo inválidos; regresión contra 122 tablas nativas capturadas.
- Detección de marcadores de cronometraje duplicados y limpieza de exportaciones parciales cuando falla una conversión.
- Instalador experimental: carpeta Paks explícita, copia y verificación previa en staging, publicación del PAK al final y limpieza de archivos publicados si falla; retirada del PAK antes de archivar sus acompañantes y recuperación si falla el traslado.

Validación local: pasan `npm test`, `python tests/prepare_obj_test.py` y `python tests/zen_camera_patch_test.py`. Las herramientas C# TrackWriter y TrackProbe se han recompilado con .NET 10 y ejecutado sobre el candidato 1005. No se ha ejecutado Unreal Editor ni F1 Manager. Las pruebas PowerShell usan contenedores sintéticos y un directorio temporal: nunca prueban la carga en el juego.

## Limitaciones encontradas que siguen abiertas

1. `research/kalinago-repair-pack03/test-manifest.json` declara `installable: false`, `weekendValidated: false`, `raceValidated: false` y `crashFixValidatedInGame: false`. El fallo de cámara registrado no tiene una causa raíz demostrada. Aprobar las pruebas de geometría no demuestra que esté corregido.
2. `build-race-component.js` contiene decisiones específicas de Kalinago/Bahrain: recuentos, índices de entrada/salida de boxes y puntos de activación. No es un adaptador genérico para cualquier circuito.
3. Velocidades, DRS, límites de pista, incidentes y asignación de boxes conservan hipótesis sin validar. No se deben presentar como datos deportivos definitivos.
4. La salida del navegador ya puede alimentar el adaptador mediante el manifiesto y las líneas CSV. Ambos métodos siguen produciendo preparación de geometría, no paquetes de juego. El adaptador conserva el requisito verificado de escala 100 y yaw 0.
5. Las pruebas sintéticas del instalador no cubren fallos de energía, concurrencia externa ni la carga real del mod. El cooking de recursos nuevos requiere un motor compatible. El candidato de cámara 1005 sí reconstruye los contenedores existentes sin recocinar recursos y conserva las dependencias del prototipo 1003; sigue pendiente de validación dentro del juego.

## Prueba necesaria antes de declarar un circuito estable

Conservar el hash del ejecutable, de las entradas y de los contenedores que realmente se prueban. En una instalación de prueba, comprobar carga sin fallos, todas las cámaras y sus transiciones, salida de boxes, retorno y paradas para los equipos, clasificación, sectores, recuento de vueltas, DRS, carrera completa y resultado final. Repetir carga/guardado y una sesión larga; revisar el registro de fallos. Registrar el resultado por circuito y por versión del juego. La comprobación de identidad en vivo solo confirma coordenadas; nunca autoriza por sí misma instalar un paquete.

## Instalador del prototipo existente

Mantén el repositorio y la descarga fuera del juego. El script acepta `-PaksDirectory` con la ruta existente de `Content/Paks` y `-PackageDirectory` para elegir el candidato 1005 descargado. Sin ese último argumento conserva el prototipo 1003. Rechaza juegos de archivos de versiones mezcladas y la presencia de otra variante Kalinago activa.

## Reconstrucción de cámara 1005

La cámara opcional cuyo nodo inicial cero se omitía se remapea y recoloca. Se excluye la cámara spline con trayectoria de Bahrain de la lista de actores, preservando sus exportaciones. Pasan 165 líneas de visión muestreadas para 33 cámaras contra la geometría de origen. Se preservan exactamente 399 bloques de recursos, 132 exportaciones no editadas del nivel y las dependencias de 293 paquetes. Un lector CUE4Parse independiente verifica 122 exportaciones nativas, sus enlaces y la cobertura de carrera/boxes. Los Blueprint del juego no disponibles en el entorno no se decodifican.

`scripts/analyze-camera-minidump.py` confirma desde el contexto de excepción el acceso inválido a `RaceSimCameraComponent + 0xb90`. Falta la memoria del objeto y código del llamador: la causa raíz y su reparación en ejecución no están demostradas. El manifiesto de 1005 conserva `installable: false` y `crashFixValidatedInGame: false`. Consulta [CAMERA-TEST.md](CAMERA-TEST.md) para instalar, probar, retirar y reconstruir el candidato.
