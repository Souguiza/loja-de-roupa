$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDirectory = Join-Path $projectRoot 'backups'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$fileName = "agape-postgres-$timestamp.dump"
$mediaFileName = "agape-postgres-$timestamp.media.zip"
$containerFile = "/backups/$fileName"

$mediaDirectory = $env:MEDIA_ROOT
if ([string]::IsNullOrWhiteSpace($mediaDirectory)) {
  $backendEnvPath = Join-Path $projectRoot 'backend/.env'
  if (Test-Path -LiteralPath $backendEnvPath -PathType Leaf) {
    foreach ($line in Get-Content -LiteralPath $backendEnvPath) {
      if ($line -match '^\s*MEDIA_ROOT\s*=\s*(.*?)\s*$') {
        $mediaDirectory = $matches[1].Trim().Trim('"').Trim("'")
        break
      }
    }
  }
}
if ([string]::IsNullOrWhiteSpace($mediaDirectory)) { $mediaDirectory = './uploads' }
if (-not [System.IO.Path]::IsPathRooted($mediaDirectory)) {
  $mediaDirectory = Join-Path (Join-Path $projectRoot 'backend') $mediaDirectory
}
$mediaDirectory = [System.IO.Path]::GetFullPath($mediaDirectory)

New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
Push-Location $projectRoot
try {
  & docker compose exec -T db pg_dump -U loja -d loja_roupas --format=custom --file=$containerFile
  if ($LASTEXITCODE -ne 0) {
    throw 'O pg_dump falhou. Confira se o Docker Desktop está ativo e o serviço db está saudável.'
  }

  $backupPath = Join-Path $backupDirectory $fileName
  if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
    throw "O backup não apareceu no diretório esperado: $backupPath"
  }

  $hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
  Set-Content -LiteralPath "$backupPath.sha256" -Value "$hash  $fileName" -Encoding ascii

  if (-not (Test-Path -LiteralPath $mediaDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $mediaDirectory -Force | Out-Null
  }
  [System.Reflection.Assembly]::Load('System.IO.Compression.FileSystem') | Out-Null
  $mediaBackupPath = Join-Path $backupDirectory $mediaFileName
  [System.IO.Compression.ZipFile]::CreateFromDirectory($mediaDirectory, $mediaBackupPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  $mediaHash = (Get-FileHash -LiteralPath $mediaBackupPath -Algorithm SHA256).Hash
  Set-Content -LiteralPath "$mediaBackupPath.sha256" -Value "$mediaHash  $mediaFileName" -Encoding ascii

  Write-Output "Backup criado: $backupPath"
  Write-Output "SHA-256: $hash"
  Write-Output "Fotos do catálogo: $mediaBackupPath"
  Write-Output "SHA-256 das fotos: $mediaHash"
} finally {
  Pop-Location
}
