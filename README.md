# Assetto-Corsa-TrackBridge

Experimental tool for converting Assetto Corsa tracks for use in F1 Manager 2024.

Camera candidate 1005: [Spanish installation, runtime checks, rollback and rebuild instructions](CAMERA-TEST.md). The containers have been rebuilt and checked offline; the recorded camera crash still requires an in-game retest.

This is an early development version of the project and is currently available only in Russian.

The tool was created with the help of ChatGPT and is still experimental. Track conversion is not fully automated yet, and some parts of converted tracks may not work correctly.

Current limitations

Some animations may not work correctly

Camera positions may be broken or incomplete

Team garage interiors are not yet supported

Full-screen track maps are not yet replaced

Some manual editing may still be required

Future plans

Once I manage to create a complete track conversion without major bugs, I plan to use this project as a base for a new, much simpler and more user-friendly version of the program.

Status

Early Development / Experimental

Use at your own risk and always keep backups of your original game files.

## Development checks

Node.js 18+; no npm dependencies are required.

```sh
npm test
python tests/prepare_obj_test.py
```

After changing `index.html`, `core.js`, `project.js` or `app.js`, run `npm run build` to regenerate the standalone `TrackBridge.html`. Tests verify that the generated file is current.

See [STABILITY.md](STABILITY.md) for the reviewed fixes, remaining limitations and in-game validation requirements. Passing offline tests does not make the experimental game containers installable.
