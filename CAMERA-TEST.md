# Candidato de cámara 1005: cómo probarlo

Este paquete sustituye Bahrain por Kalinago. Es una **prueba experimental**, no una versión estable certificada. No se ha ejecutado F1 Manager en el entorno de reconstrucción. El cierre de 1002 accedió a una cámara con un puntero inválido; el volcado no permite demostrar quién lo produjo. Las correcciones de este candidato necesitan confirmación en el juego.

## Qué se ha cambiado y comprobado

- `Camera_S2`: su nodo inicial cero se omitía durante la conversión. Ahora se escribe la cobertura 5–14 y se traslada su cámara al circuito.
- Se excluye `RaceSimSplineCameraActor_2` de la lista de actores del nivel: su recorrido móvil seguía siendo el de Bahrain. Sus exportaciones e índices se conservan.
- Se ajustan las posiciones de las 33 cámaras remapeadas: 165 líneas de visión muestreadas despejadas contra los OBJ de origen. Una cámara larga necesita una posición elevada, a 64 m sobre su punto central. Esto puede producir un encuadre alto; los modelos de garajes del juego y la visibilidad entre muestras requieren revisión visual.
- Se conservan byte por byte los 399 bloques de recursos ajenos al nivel principal, 132 exportaciones que no se editan dentro de ese nivel y las dependencias de los 293 paquetes. Se conserva el PAK del prototipo 1003 con su mapa SVG.
- `retoc verify` pasa. Un lector independiente, CUE4Parse, decodifica 122 exportaciones nativas y confirma cambios, enlaces, cámara de salida y cobertura de 129 nodos de carrera y 28 nodos activos de boxes. Las clases Blueprint ausentes del juego no se deserializan: esta comprobación no demuestra la carga completa del nivel.

## Instalación y prueba en Windows

1. Cierra F1 Manager 2024 y copia tus partidas de prueba. Descomprime el ZIP **fuera** de la carpeta del juego, por ejemplo en `C:\TrackBridge\camera1005`.
2. Retira el paquete Kalinago anterior antes de instalar este. Si instalaste 1003 con el script del repositorio, desde ese repositorio ejecuta:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Manage-KalinagoTest.ps1 -Mode Rollback -PaksDirectory "C:\Program Files (x86)\Steam\steamapps\common\F1 Manager 2024\F1Manager24\Content\Paks"
   ```

   Adapta la ruta a tu instalación. Si lo copiaste manualmente, mueve sus tres archivos `.pak`, `.utoc` y `.ucas` fuera de `Paks`. Evita tener dos variantes Kalinago activas, incluso en subcarpetas. No retires los contenedores originales del juego.
3. Abre PowerShell dentro de la carpeta descomprimida. Instala el candidato con sus hashes:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Manage-KalinagoTest.ps1 -Mode Install -PackageDirectory ".\package" -PaksDirectory "C:\Program Files (x86)\Steam\steamapps\common\F1 Manager 2024\F1Manager24\Content\Paks"
   ```

   El script publica los tres archivos y verifica los hashes. La copia `pak.disabled` de la descarga se mantiene desactivada. No copies los archivos de investigación ni `global.utoc` al juego.
4. Arranca el juego y utiliza una partida de prueba para un fin de semana de Bahrain. Primero comprueba el menú/mapa y la carga de entrenamientos. Anota si el juego cierra antes de mostrar los coches.
5. A velocidad normal, sigue un coche al menos cinco vueltas completas. Cambia varias veces entre cámara de TV, a bordo, helicóptero y vista general. Comprueba especialmente la meta, los últimos sectores y el retorno a la cámara de TV.
6. Envía coches de varios equipos a boxes. Observa entrada, parada, salida y regreso a pista. Repite el cambio de cámaras cuando uno esté en boxes y otro en carrera. Mira si hay pantallas negras, cámaras bajo el suelo o transiciones que cierren el juego.
7. Completa clasificación y una carrera hasta el resultado final. Guarda, cierra el juego y vuelve a cargar la partida. Repite una sesión para comprobar que el resultado no depende de una única carga.
8. Anota versión del juego, cámara/acción exacta, vuelta, equipo, resultado y los hashes de `package/test-manifest.json`. Si cierra, conserva la carpeta de fallo más reciente de `%LOCALAPPDATA%\F1Manager24\Saved\Crashes` y el registro de `%LOCALAPPDATA%\F1Manager24\Saved\Logs`, si existe. Una captura a bordo que funcione y TV que falle ayuda a aislar el director de cámaras.

Para retirar **1005**, cierra el juego y ejecuta desde la descarga:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Manage-KalinagoTest.ps1 -Mode Rollback -PackageDirectory ".\package" -PaksDirectory "C:\Program Files (x86)\Steam\steamapps\common\F1 Manager 2024\F1Manager24\Content\Paks"
```

Una carga correcta no basta para declarar estabilidad. El candidato mantiene todos los demás supuestos experimentales de 1003, incluidos simulación, boxes y final de carrera.

## Reconstrucción reproducible desde el repositorio

Requisitos: Node 18+, Python 3.11+, .NET SDK 10 y `retoc` **0.1.5**. Materializa el UCAS 1003 con Git LFS. Las dependencias IL de las herramientas están incluidas en el repositorio. La reconstrucción usa únicamente archivos locales; no requiere claves AES, FModel ni Unreal Editor.

```bash
git lfs pull --include="research/kalinago-repair-pack03/TrackBridge_Kalinago_1003_P.ucas"
npm test
python tests/zen_camera_patch_test.py
python scripts/build-camera-candidate.py --retoc /ruta/retoc --dotnet /ruta/dotnet --output /ruta/nueva/camera1005
```

La carpeta de salida debe ser nueva. Solo se escribe `test-manifest.json` cuando pasan todos los controles. `global.utoc` se crea exclusivamente en el directorio temporal de comprobación y no se distribuye. El archivo UCAS puede tener un hash distinto entre reconstrucciones por el orden del empaquetado; los bloques de contenido y el parche deben superar las mismas comprobaciones en cada ejecución.

Para recalcular las posiciones contra la geometría, genera el JSON con `visibilityInput` de `camera-visibility-input.js` y ejecuta `python scripts/fit-camera-visibility.py INPUT.json NEW_REPORT.json`. Requiere NumPy y los OBJ de origen. Los resultados previos solo se reutilizan con `--resume` cuando coinciden el hash completo de la entrada y los hashes de todas las geometrías.
