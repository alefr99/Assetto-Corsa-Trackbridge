param(
    [Parameter(Mandatory=$true)][ValidateSet('Install','Rollback')][string]$Mode,
    [string]$PaksDirectory
)
$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
# An explicit directory lets the repository stay outside the game installation.
$paks = if ($PaksDirectory) { [IO.Path]::GetFullPath($PaksDirectory) } else { Split-Path -Parent $project }
if (!(Test-Path -LiteralPath $paks -PathType Container) -or (Split-Path -Leaf $paks) -ne 'Paks') { throw 'Specify the existing game Content/Paks directory with -PaksDirectory.' }
$package = Join-Path $project 'research/kalinago-repair-pack03'
$manifest = Get-Content -LiteralPath (Join-Path $package 'test-manifest.json') -Raw | ConvertFrom-Json
if (Get-Process F1Manager24 -ErrorAction SilentlyContinue) { throw 'Close F1 Manager before installing or rolling back.' }
if ($Mode -eq 'Install' -and ($manifest.doNotInstall -eq $true -or $manifest.runtimeRejected -eq $true)) { throw 'This build was rejected after a runtime failure.' }
if ($manifest.installable -ne $false -or $manifest.offlineReadbackPassed -ne $true) { throw 'Unexpected prototype manifest' }
# Inactive research files matter only when this project is actually beneath Paks.
$prefix = $paks.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if ($Mode -eq 'Install' -and $project.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    $unexpected = @(Get-ChildItem -LiteralPath $project -Recurse -Filter *.pak -File)
    if ($unexpected.Count) { throw 'Research PAK files are active under the game directory. Disable them before proceeding.' }
}
$files = @($manifest.files.name)
if ($files.Count -ne 3 -or @($files | Select-Object -Unique).Count -ne 3 -or @($files | Where-Object { $_ -notmatch '^TrackBridge_Kalinago_(1003)_P\.(pak|utoc|ucas)$' }).Count) { throw 'Unexpected manifest file set' }
foreach ($name in $files) {
    $entry = @($manifest.files | Where-Object name -eq $name)
    if ($entry.Count -ne 1 -or $entry[0].sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw "Invalid manifest entry: $name" }
    $sourceName = if ($Mode -eq 'Install' -and $name.EndsWith('.pak')) { $name + '.disabled' } else { $name }
    $source = Join-Path $(if ($Mode -eq 'Install') { $package } else { $paks }) $sourceName
    if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing file: $source" }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $entry[0].sha256) { throw "Hash mismatch: $source" }
    if ($Mode -eq 'Install' -and (Test-Path -LiteralPath (Join-Path $paks $name))) { throw "Already installed: $name" }
}
if ($Mode -eq 'Install') {
    $staging = Join-Path $paks ('.trackbridge-stage-' + [Guid]::NewGuid().ToString('N'))
    $published = @()
    New-Item -ItemType Directory -Path $staging | Out-Null
    try {
        foreach ($name in $files) {
            $sourceName = if ($name.EndsWith('.pak')) { $name + '.disabled' } else { $name }
            $target = Join-Path $staging $name
            Copy-Item -LiteralPath (Join-Path $package $sourceName) -Destination $target
            $entry = $manifest.files | Where-Object name -eq $name
            if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Staged hash mismatch: $name" }
        }
        # Mount the PAK only once both companion containers are present.
        foreach ($name in ($files | Sort-Object { $_.EndsWith('.pak') })) {
            $target = Join-Path $paks $name
            if (Test-Path -LiteralPath $target) { throw "Destination appeared during staging: $name" }
            [IO.File]::Move((Join-Path $staging $name), $target)
            $published += $target
        }
    } catch {
        foreach ($file in $published) { Remove-Item -LiteralPath $file -ErrorAction Stop }
        throw
    } finally {
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    }
    Write-Output 'Experimental Kalinago container installed. Weekend/race validation is still required.'
} else {
    $archive = Join-Path $project ('research/rollback-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $archive | Out-Null
    $moved = @()
    try {
        # Disable mounting before moving the large data containers.
        foreach ($name in ($files | Sort-Object { -not $_.EndsWith('.pak') })) {
            [IO.File]::Move((Join-Path $paks $name), (Join-Path $archive ($name + '.disabled')))
            $moved += $name
        }
    } catch {
        foreach ($name in ($moved | Sort-Object { $_.EndsWith('.pak') })) { [IO.File]::Move((Join-Path $archive ($name + '.disabled')), (Join-Path $paks $name)) }
        throw
    }
    Write-Output "Test container removed from game mounting directory: $archive"
}
