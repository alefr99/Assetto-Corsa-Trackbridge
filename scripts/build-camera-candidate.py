"""Rebuild the experimental 1005 camera candidate without game files or cooking.

Requires Python 3.11+, Node 18+, .NET SDK 10 and retoc 0.1.5. The baseline
1003 UCAS must be materialized with Git LFS. Nothing is installed in the game.
"""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from zen_camera_patch import container_entries, zen_layout, preserve_other_exports, require

ROOT = Path(__file__).resolve().parents[1]
MAIN = 'F1Manager24/Content/Circuits/Bahrain/Lvl_Bahrain.umap'
CHUNK = 'a19df12ebed9e12600000001'
STEM = 'TrackBridge_Kalinago_1005_P'
BASE = ROOT / 'research/kalinago-repair-pack03'
REPAIR = ROOT / 'research/camera-repair1005'
MAPPING = ROOT / 'research/runtime_20260921/5.1.1-498643+++volta24+game+1.11.0-F1Manager24/Mappings/5.1.1-498643+++volta24+game+1.11.0-F1Manager24.usmap'
SCRIPT_OBJECTS = ROOT / 'research/kalinago-full-stage01/scriptobjects.bin'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2), encoding='utf-8')


def build(args):
    out = args.output.resolve()
    require(not out.exists(), 'Choose a new output directory')
    require(digest(MAPPING) == '5f6b0a3d8a2517ef2a6b442c897d68d5f3104f3c40e68bd9a7f53d0e37ac4dc2', 'Unexpected game mapping')
    require(digest(SCRIPT_OBJECTS) == '1277ee958caf2dcf97f570450d0c25b32143ef03915c82d2b890a5e88daf98c5', 'Unexpected script objects')
    source_manifest = json.loads((BASE / 'test-manifest.json').read_text())
    source_files = {}
    for entry in source_manifest['files']:
        path = BASE / (entry['name'] + ('.disabled' if entry['name'].endswith('.pak') else ''))
        require(path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'], 'Baseline hash mismatch; materialize Git LFS: ' + str(path))
        source_files[Path(entry['name']).suffix] = path
    out.mkdir(parents=True)
    package = out / 'package'
    package.mkdir()
    env = dict(os.environ, DOTNET_CLI_TELEMETRY_OPTOUT='1')
    with (out / 'build-log.txt').open('w', encoding='utf-8') as log, tempfile.TemporaryDirectory(prefix='camera-work-', dir=out) as temporary:
        work = Path(temporary)
        env['DOTNET_CLI_HOME'] = str(work / 'dotnet-home')
        def run(*command):
            command = [str(c) for c in command]
            result = subprocess.run(command, cwd=ROOT, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            log.write(json.dumps(command) + '\n' + result.stdout + '\n')
            log.flush()
            if result.returncode:
                raise RuntimeError('Command failed; see build-log.txt:\n' + result.stdout[-2000:])
            return result.stdout
        require('0.1.5' in run(args.retoc, '--version'), 'Use retoc 0.1.5')
        # Bundled IL dependencies avoid Windows NuGet cache paths and network restore.
        def compile_tool(name):
            project = work / (name + '-source')
            project.mkdir()
            source = ROOT / 'tools' / name
            for path in source.glob('*.cs'):
                shutil.copyfile(path, project / path.name)
            dlls = sorted((source / 'bin/Debug/net10.0').glob('*.dll'))
            require(bool(dlls), 'Missing bundled tool dependencies')
            references = ''.join(f'<Reference Include="{html.escape(p.stem)}"><HintPath>{html.escape(str(p))}</HintPath></Reference>' for p in dlls if p.stem != name)
            csproj = project / (name + '.csproj')
            csproj.write_text('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup><ItemGroup>' + references + '</ItemGroup></Project>')
            config = project / 'NuGet.config'
            config.write_text('<configuration><packageSources><clear /></packageSources></configuration>')
            target = work / (name + '-bin')
            run(args.dotnet, 'build', csproj, '--configfile', config, '-o', target)
            return target / (name + '.dll')
        writer, probe = compile_tool('TrackWriter'), compile_tool('TrackProbe')
        patch = work / 'level-patch.json'
        run('node', '-e', "const fs=require('fs'),{prepareCameraRepair}=require('./prepare-camera-repair'),{applyVisibility}=require('./camera-visibility-input');const read=p=>JSON.parse(fs.readFileSync(p));const fit=read('research/kalinago-fit03.json');const p=prepareCameraRepair(read('research/bahrain_properties01/properties/F1Manager24/Content/Circuits/Bahrain/Lvl_Bahrain.umap.json'),fit,fs.readFileSync('research/bahrain_live05/track-0-nodes.bin'));fs.writeFileSync(process.argv[1],JSON.stringify(applyVisibility(p,fit,read('research/camera-repair1005/visibility.json')),null,2));", patch)
        proposal = json.loads(patch.read_text())
        require(proposal == json.loads((REPAIR / 'level-patch.json').read_text()), 'Prepared camera patch differs from reviewed candidate')
        raw = work / 'original-raw'
        run(args.retoc, 'verify', source_files['.utoc'])
        run(args.retoc, 'unpack-raw', source_files['.utoc'], raw)
        manifest = json.loads((raw / 'manifest.json').read_text())
        old_header = next((raw / 'chunks').glob('*00000006'))
        old_id, old_entries = container_entries(old_header.read_bytes())
        package_id = int.from_bytes(bytes.fromhex(CHUNK[:16]), 'little')
        require(len(old_entries) == 293, 'Unexpected baseline package count')
        original = (raw / 'chunks' / CHUNK).read_bytes()
        old_layout = zen_layout(original)
        def to_zen(input_map, name):
            stage = work / (name + '-stage')
            target_map = stage / MAIN
            target_map.parent.mkdir(parents=True)
            for extension in ('.umap', '.uexp'):
                shutil.copyfile(input_map.with_suffix(extension), target_map.with_suffix(extension))
            shutil.copyfile(SCRIPT_OBJECTS, stage / 'scriptobjects.bin')
            target = work / (name + '-zen') / (STEM + '.utoc')
            target.parent.mkdir()
            run(args.retoc, 'to-zen', stage, target, '--version', 'UE5_1', '--no-parallel')
            unpacked = work / (name + '-raw')
            run(args.retoc, 'unpack-raw', target, unpacked)
            return unpacked
        cached_map = ROOT / 'research/kalinago-cameras-main03/Lvl_Bahrain.umap'
        cached = to_zen(cached_map, 'cached')
        require((cached / 'chunks' / CHUNK).read_bytes()[:old_layout['header_size']] == original[:old_layout['header_size']], 'Prepared level has different names, object identities or dependency graph')
        edited = work / 'edited-level'
        run(args.dotnet, writer, cached_map, MAPPING, edited, '--level-patch', patch)
        converted = to_zen(edited / 'Lvl_Bahrain.umap', 'edited')
        new_header = next((converted / 'chunks').glob('*00000006'))
        new_id, new_entries = container_entries(new_header.read_bytes())
        require(new_entries[package_id] == old_entries[package_id], 'Camera package dependencies changed')
        edited_main, preserved = preserve_other_exports(original, (converted / 'chunks' / CHUNK).read_bytes(), [24] + [e['index'] for e in proposal['exports']])
        (raw / 'chunks' / CHUNK).write_bytes(edited_main)
        header_bytes = bytearray(old_header.read_bytes())
        header_bytes[8:16] = new_header.read_bytes()[8:16]
        old_header.unlink()
        (raw / 'chunks' / new_header.name).write_bytes(header_bytes)
        target = package / (STEM + '.utoc')
        run(args.retoc, 'pack-raw', raw, target)
        require(run(args.retoc, 'verify', target).strip() == 'verified', 'Container verification failed')
        shutil.copyfile(source_files['.pak'], package / (STEM + '.pak.disabled'))
        check_raw = work / 'readback-raw'
        run(args.retoc, 'unpack-raw', target, check_raw)
        require((check_raw / 'chunks' / CHUNK).read_bytes() == edited_main, 'Written main chunk differs')
        new_raw_header = next((check_raw / 'chunks').glob('*00000006'))
        require(new_raw_header.read_bytes() == header_bytes, 'Written dependency header differs')
        require(container_entries(new_raw_header.read_bytes()) == (new_id, old_entries), 'Package store entries differ')
        # Compare to a new extraction of the baseline, not the modified staging files.
        baseline_raw = work / 'baseline-raw'
        run(args.retoc, 'unpack-raw', source_files['.utoc'], baseline_raw)
        untouched = [p for p in (baseline_raw / 'chunks').iterdir() if p.name != CHUNK and not p.name.endswith('00000006')]
        require(len(untouched) == 399, 'Unexpected resource chunk count')
        require(len(list((check_raw / 'chunks').iterdir())) == 401, 'Unexpected output chunk count')
        require(all(digest(p) == digest(check_raw / 'chunks' / p.name) for p in untouched), 'Non-camera resource changed')
        # Script object data is a validation fixture only. Never ship global.utoc.
        global_raw = work / 'global-raw'
        (global_raw / 'chunks').mkdir(parents=True)
        shutil.copyfile(SCRIPT_OBJECTS, global_raw / 'chunks/000000000000000000000005')
        write_json(global_raw / 'manifest.json', dict(version=manifest['version'], mount_point='../../../', chunk_paths={}))
        global_utoc = work / 'global.utoc'
        run(args.retoc, 'pack-raw', global_raw, global_utoc)
        selected_path = Path('selected-properties') / (MAIN + '.json')
        def read_cameras(name, files):
            view = work / (name + '-view')
            view.mkdir()
            for src, filename in files + [(global_utoc, 'global.utoc'), (global_utoc.with_suffix('.ucas'), 'global.ucas')]:
                os.link(src, view / filename)
            decoded = work / (name + '-decoded')
            run(args.dotnet, probe, view, decoded, '--standalone', '--usmap', MAPPING, '--export-indices', REPAIR / 'export-indices.json', MAIN)
            return decoded
        before = read_cameras('baseline', [(source_files[e], 'TrackBridge_Kalinago_1003_P' + e) for e in ('.utoc', '.ucas', '.pak')])
        after = read_cameras('candidate', [(package / (STEM + e + ('.disabled' if e == '.pak' else '')), STEM + e) for e in ('.utoc', '.ucas', '.pak')])
        audit = out / 'offline-audit.json'
        run('node', 'audit-camera-package.js', after / selected_path, patch, before / selected_path, audit)
        report = json.loads(audit.read_text())
        report.update(unchangedResourceChunks=399, preservedUneditedExports=preserved, packageDependenciesPreserved=293, sampledVisiblePoints=165, fullGameClassesDecoded=False)
        write_json(audit, report)
        shutil.copyfile(after / selected_path, out / 'camera-readback.json')
        shutil.copyfile(patch, out / 'level-patch.json')
        shutil.copyfile(REPAIR / 'visibility.json', out / 'visibility.json')
        manifest_out = dict(installable=False, experimentalTestOnly=True, offlineReadbackPassed=True,
                            targetSlot='Bahrain', build='1005', runtimeValidated=False, weekendValidated=False,
                            raceValidated=False, crashFixValidatedInGame=False, rootCauseProven=False,
                            baselineFiles=source_manifest['files'], validation=report, files=[])
        for extension in ('.pak', '.utoc', '.ucas'):
            path = package / (STEM + extension + ('.disabled' if extension == '.pak' else ''))
            manifest_out['files'].append(dict(name=STEM + extension, bytes=path.stat().st_size, sha256=digest(path)))
        write_json(package / 'test-manifest.json', manifest_out)
        shutil.copyfile(ROOT / 'Manage-KalinagoTest.ps1', out / 'Manage-KalinagoTest.ps1')
        shutil.copyfile(ROOT / 'CAMERA-TEST.md', out / 'LEEME.md')
    print('Built and independently verified:', out)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--retoc', default='retoc')
    parser.add_argument('--dotnet', default='dotnet')
    parser.add_argument('--output', type=Path, required=True)
    build(parser.parse_args())
