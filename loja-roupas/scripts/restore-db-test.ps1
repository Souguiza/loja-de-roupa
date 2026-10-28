param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,

  [ValidatePattern('^[a-z][a-z0-9_]{2,62}$')]
  [string]$TargetDatabase = 'loja_roupas_restore_test'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'backups'))
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath -ErrorAction Stop).Path
$resolvedBackup = [System.IO.Path]::GetFullPath($resolvedBackup)
$insideBackupDirectory = $resolvedBackup.StartsWith($backupDirectory + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
if (-not $insideBackupDirectory -or [System.IO.Path]::GetExtension($resolvedBackup) -ne '.dump') {
  throw "Informe um arquivo .dump armazenado dentro de $backupDirectory."
}

$checksumPath = "$resolvedBackup.sha256"
if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
  throw "Checksum não encontrado: $checksumPath"
}

$expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0].ToUpperInvariant()
$actualHash = (Get-FileHash -LiteralPath $resolvedBackup -Algorithm SHA256).Hash.ToUpperInvariant()
if ($expectedHash -notmatch '^[A-F0-9]{64}$' -or $actualHash -ne $expectedHash) {
  throw 'O checksum SHA-256 não confere. A restauração foi cancelada.'
}

$mediaArchive = [System.IO.Path]::ChangeExtension($resolvedBackup, $null) + '.media.zip'
if (-not (Test-Path -LiteralPath $mediaArchive -PathType Leaf)) {
  throw "O arquivo de fotos correspondente não foi encontrado: $mediaArchive"
}
$mediaChecksumPath = "$mediaArchive.sha256"
if (-not (Test-Path -LiteralPath $mediaChecksumPath -PathType Leaf)) {
  throw "Checksum das fotos não encontrado: $mediaChecksumPath"
}
$expectedMediaHash = ((Get-Content -LiteralPath $mediaChecksumPath -Raw).Trim() -split '\s+')[0].ToUpperInvariant()
$actualMediaHash = (Get-FileHash -LiteralPath $mediaArchive -Algorithm SHA256).Hash.ToUpperInvariant()
if ($expectedMediaHash -notmatch '^[A-F0-9]{64}$' -or $actualMediaHash -ne $expectedMediaHash) {
  throw 'O checksum SHA-256 das fotos não confere. A restauração foi cancelada.'
}

[System.Reflection.Assembly]::Load('System.IO.Compression.FileSystem') | Out-Null
$mediaZip = [System.IO.Compression.ZipFile]::OpenRead($mediaArchive)
try {
  foreach ($entry in $mediaZip.Entries) {
    if ($entry.FullName -notmatch '^[0-9a-fA-F-]{36}\.webp$') {
      throw "Arquivo inesperado no pacote de fotos: $($entry.FullName)"
    }
  }
} finally { $mediaZip.Dispose() }

$mediaRestoreDirectory = Join-Path $backupDirectory "$TargetDatabase-media"
if (Test-Path -LiteralPath $mediaRestoreDirectory) {
  throw "A pasta de teste '$mediaRestoreDirectory' já existe. Escolha outro nome de banco de destino."
}

$containerBackup = "/backups/$([System.IO.Path]::GetFileName($resolvedBackup))"
$safeDatabase = $TargetDatabase.Replace("'", "''")
Push-Location $projectRoot
try {
  & docker compose exec -T db pg_isready -U loja -d loja_roupas
  if ($LASTEXITCODE -ne 0) {
    throw 'O PostgreSQL não está pronto. Inicie o Docker Desktop e aguarde o serviço db ficar saudável.'
  }

  $existingDatabase = (& docker compose exec -T db psql -U loja -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$safeDatabase'").Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível verificar o banco de destino.' }
  if ($existingDatabase -eq '1') {
    throw "O banco '$TargetDatabase' já existe. Escolha outro nome para evitar sobrescrever dados."
  }

  & docker compose exec -T db createdb -U loja $TargetDatabase
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível criar o banco isolado '$TargetDatabase'." }

  & docker compose exec -T db pg_restore -U loja --no-owner --no-privileges --dbname=$TargetDatabase $containerBackup
  if ($LASTEXITCODE -ne 0) {
    throw "A restauração falhou. O banco isolado '$TargetDatabase' foi mantido para inspeção; o banco da loja não foi alterado."
  }

  [System.IO.Compression.ZipFile]::ExtractToDirectory($mediaArchive, $mediaRestoreDirectory)
  $restoredImageCount = @(Get-ChildItem -LiteralPath $mediaRestoreDirectory -File -Filter '*.webp').Count

  Write-Output "Backup validado e restaurado no banco isolado '$TargetDatabase'."
  Write-Output "Fotos extraídas para teste em '$mediaRestoreDirectory' ($restoredImageCount arquivo(s))."
  Write-Output 'O banco loja_roupas não foi alterado. Remova manualmente o banco e a pasta de teste após concluir a verificação.'
} finally {
  Pop-Location
}
