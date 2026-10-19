[CmdletBinding()]
param([Parameter(Mandatory)][string]$ArchivePath)
$ErrorActionPreference='Stop'
$ArchivePath=(Resolve-Path -LiteralPath $ArchivePath).Path
$approvedRoot=[IO.Path]::GetFullPath('D:\Field Sales OS\.local-backups\')
if (!$ArchivePath.StartsWith($approvedRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($ArchivePath) -ne 'production.dump') { throw 'Expected a task-created local backup archive' }
Add-Type -AssemblyName System.Security
$secret=[Security.Cryptography.RandomNumberGenerator]::GetBytes(64)
$keyPath="$ArchivePath.key.dpapi"
$cipherPath="$ArchivePath.aes"
$tagPath="$ArchivePath.hmac"
foreach ($file in @($keyPath,$cipherPath,$tagPath)) { if (Test-Path -LiteralPath $file) { throw 'Protected backup already exists' } }
$plainHash=(Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
$protected=[Security.Cryptography.ProtectedData]::Protect($secret,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($keyPath,$protected)
$aes=[Security.Cryptography.Aes]::Create()
$aes.Key=[byte[]]$secret[0..31]; $aes.GenerateIV()
$inputStream=[IO.File]::OpenRead($ArchivePath)
$outputStream=[IO.File]::Open($cipherPath,[IO.FileMode]::CreateNew)
try {
  $outputStream.Write($aes.IV)
  $encrypt=[Security.Cryptography.CryptoStream]::new($outputStream,$aes.CreateEncryptor(),[Security.Cryptography.CryptoStreamMode]::Write)
  try { $inputStream.CopyTo($encrypt); $encrypt.FlushFinalBlock() } finally { $encrypt.Dispose() }
} finally { $inputStream.Dispose(); $outputStream.Dispose(); $aes.Dispose() }
$mac=[Security.Cryptography.HMACSHA256]::new([byte[]]$secret[32..63])
$stream=[IO.File]::OpenRead($cipherPath)
try { [IO.File]::WriteAllBytes($tagPath,$mac.ComputeHash($stream)) } finally { $stream.Dispose(); $mac.Dispose() }
# Re-open the protected key and authenticate/decrypt the entire archive, streaming.
$recovered=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($keyPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$mac=[Security.Cryptography.HMACSHA256]::new([byte[]]$recovered[32..63])
$stream=[IO.File]::OpenRead($cipherPath)
try { $actualTag=$mac.ComputeHash($stream) } finally { $stream.Dispose(); $mac.Dispose() }
if (![Security.Cryptography.CryptographicOperations]::FixedTimeEquals($actualTag,[IO.File]::ReadAllBytes($tagPath))) { throw 'Backup authentication failed' }
$aes=[Security.Cryptography.Aes]::Create(); $aes.Key=[byte[]]$recovered[0..31]
$stream=[IO.File]::OpenRead($cipherPath)
$iv=[byte[]]::new(16); if ($stream.Read($iv,0,16) -ne 16) { throw 'Invalid backup IV' }; $aes.IV=$iv
$decrypt=[Security.Cryptography.CryptoStream]::new($stream,$aes.CreateDecryptor(),[Security.Cryptography.CryptoStreamMode]::Read)
$sha=[Security.Cryptography.SHA256]::Create()
try { $roundtrip=[Convert]::ToHexString($sha.ComputeHash($decrypt)) } finally { $sha.Dispose(); $decrypt.Dispose(); $stream.Dispose(); $aes.Dispose() }
if ($roundtrip -ne $plainHash) { throw 'Encrypted archive roundtrip differs from restored archive' }
Remove-Item -LiteralPath $ArchivePath
@{archive=$cipherPath;sha256=(Get-FileHash -LiteralPath $cipherPath -Algorithm SHA256).Hash;plaintextSha256=$plainHash;encryption='AES-256-CBC + HMAC-SHA256';keyProtection='Windows DPAPI CurrentUser; preserve this Windows profile for recovery';verifiedDecrypt=$true} | ConvertTo-Json | Set-Content -LiteralPath "$ArchivePath.encryption.json"
Write-Output 'ENCRYPTED_BACKUP_ROUNDTRIP_PASS'
