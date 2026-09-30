$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ('trackbridge-install-test-' + [Guid]::NewGuid().ToString('N'))
function Assert($condition, $message) { if (!$condition) { throw $message } }
function Reject($action) { $failed = $false; try { & $action } catch { $failed = $true }; Assert $failed 'Expected rejection' }
try {
    $project = Join-Path $root 'project'
    $package = Join-Path $project 'research/kalinago-repair-pack03'
    $paks = Join-Path $root 'Game/Content/Paks'
    New-Item -ItemType Directory -Path $package,$paks -Force | Out-Null
    $script = Join-Path $project 'Manage-KalinagoTest.ps1'
    Copy-Item (Join-Path $PSScriptRoot '../Manage-KalinagoTest.ps1') $script
    $files = @()
    foreach ($ext in @('pak','utoc','ucas')) {
        $name = "TrackBridge_Kalinago_1003_P.$ext"
        $sourceName = if ($ext -eq 'pak') { $name + '.disabled' } else { $name }
        $source = Join-Path $package $sourceName
        [IO.File]::WriteAllText($source, "synthetic-$ext")
        $files += @{name=$name;sha256=(Get-FileHash $source -Algorithm SHA256).Hash;bytes=(Get-Item $source).Length}
    }
    $manifest = @{installable=$false;offlineReadbackPassed=$true;files=$files}
    $manifestPath = Join-Path $package 'test-manifest.json'
    function Save { $manifest | ConvertTo-Json -Depth 8 | Set-Content $manifestPath }
    Save
    # Hash mismatch must leave the target directory untouched.
    $hash = $files[1].sha256; $files[1].sha256 = '0' * 64; Save
    Reject { & $script -Mode Install -PaksDirectory $paks }
    Assert (@(Get-ChildItem $paks -Force).Count -eq 0) 'Hash failure left output'
    $files[1].sha256 = $hash; Save
    $manifest.runtimeRejected=$true;Save
    Reject { & $script -Mode Install -PaksDirectory $paks }
    $manifest.Remove('runtimeRejected');Save
    & $script -Mode Install -PaksDirectory $paks
    foreach ($entry in $files) { Assert ((Get-FileHash (Join-Path $paks $entry.name)).Hash -eq $entry.sha256) 'Installed hash mismatch' }
    Reject { & $script -Mode Install -PaksDirectory $paks }
    & $script -Mode Rollback -PaksDirectory $paks
    Assert (@(Get-ChildItem $paks -Force).Count -eq 0) 'Rollback left mounted containers'
    $archive = Get-ChildItem (Join-Path $project 'research') -Directory -Filter 'rollback-*'
    foreach ($entry in $files) { Assert ((Get-FileHash (Join-Path $archive.FullName ($entry.name + '.disabled'))).Hash -eq $entry.sha256) 'Archive hash mismatch' }
    Reject { & $script -Mode Install -PaksDirectory $root }
    $manifest.files=@($files[0],$files[0],$files[2]);Save
    Reject { & $script -Mode Install -PaksDirectory $paks }
    Write-Output 'Synthetic installer tests passed: hashes, rejected build, install, collision, rollback, directory and duplicate manifest'
} finally { if (Test-Path $root) { Remove-Item $root -Recurse -Force } }
