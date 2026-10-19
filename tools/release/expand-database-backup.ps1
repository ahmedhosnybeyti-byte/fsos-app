# Decrypt into the same ACL-restricted backup directory; never prints a key.
# Requires the Windows account/profile which protected the DPAPI key.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$EncryptedArchive)
$ErrorActionPreference='Stop'
$EncryptedArchive=(Resolve-Path -LiteralPath $EncryptedArchive).Path
$approvedRoot=[IO.Path]::GetFullPath('D:\Field Sales OS\.local-backups\')
if (!$EncryptedArchive.StartsWith($approvedRoot,[StringComparison]::OrdinalIgnoreCase) -or ! $EncryptedArchive.EndsWith('.dump.aes')) { throw 'Expected an encrypted local database backup' }
Add-Type -AssemblyName System.Security
$base=$EncryptedArchive.Substring(0,$EncryptedArchive.Length-4)
$output="$base.recovered"
if (Test-Path -LiteralPath $output) { throw 'Refusing to overwrite recovered archive' }
$secret=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes("$base.key.dpapi"),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$mac=[Security.Cryptography.HMACSHA256]::new([byte[]]$secret[32..63])
$stream=[IO.File]::OpenRead($EncryptedArchive)
try { $tag=$mac.ComputeHash($stream) } finally { $stream.Dispose(); $mac.Dispose() }
if (![Security.Cryptography.CryptographicOperations]::FixedTimeEquals($tag,[IO.File]::ReadAllBytes("$base.hmac"))) { throw 'Backup authentication failed' }
$aes=[Security.Cryptography.Aes]::Create(); $aes.Key=[byte[]]$secret[0..31]
$stream=[IO.File]::OpenRead($EncryptedArchive)
$iv=[byte[]]::new(16); if ($stream.Read($iv,0,16) -ne 16) { throw 'Invalid backup IV' }; $aes.IV=$iv
$decrypt=[Security.Cryptography.CryptoStream]::new($stream,$aes.CreateDecryptor(),[Security.Cryptography.CryptoStreamMode]::Read)
$target=[IO.File]::Open($output,[IO.FileMode]::CreateNew)
try { $decrypt.CopyTo($target) } finally { $target.Dispose(); $decrypt.Dispose(); $stream.Dispose(); $aes.Dispose() }
$evidence=Get-Content -LiteralPath "$base.encryption.json" | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash -ne $evidence.plaintextSha256) { Remove-Item -LiteralPath $output; throw 'Decrypted archive checksum differs' }
Write-Output $output
