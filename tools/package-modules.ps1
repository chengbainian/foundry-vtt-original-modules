[CmdletBinding()]
param([string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist'))

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

# Explicit allowlist: an unreviewed module folder must never be released by accident.
$moduleFolders = @(
    'la-hd-lock',
    'madness-fx',
    'private-parchment',
    'scene-warp-transitions',
    'battle-transitions-scene-warp'
)

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('foundry-original-mods-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
    foreach ($folder in $moduleFolders) {
        $source = Join-Path (Join-Path $repoRoot 'modules') $folder
        $manifestPath = Join-Path $source 'module.json'
        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
            throw "Missing module manifest: $manifestPath"
        }
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $moduleId = [string]$manifest.id
        if ([string]::IsNullOrWhiteSpace($moduleId) -or $moduleId -match '[\\/:*?"<>|]') {
            throw "Invalid module ID in $manifestPath"
        }

        $packageRoot = Join-Path $tempRoot $moduleId
        New-Item -ItemType Directory -Path $packageRoot | Out-Null
        Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $packageRoot -Recurse -Force
        }

        # Remove runtime locks/logs and nested historical archives from the clean install ZIP.
        Get-ChildItem -LiteralPath $packageRoot -Recurse -File |
            Where-Object { $_.Name -in @('LOCK', 'LOG', 'LOG.old') -or $_.Extension -eq '.zip' } |
            Remove-Item -Force

        $archive = Join-Path $OutputDirectory ("$moduleId.zip")
        if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
        Compress-Archive -Path $packageRoot -DestinationPath $archive -CompressionLevel Optimal
        Write-Host "Packaged $moduleId@$($manifest.version): $archive"
    }
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
