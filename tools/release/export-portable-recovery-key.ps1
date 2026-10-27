# Wrap the existing archive key for an independently retained RSA recipient.
# The recipient private key belongs in the user's vault, never this repository.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$EncryptedArchive,
  [Parameter(Mandatory)][string]$RecipientPublicKey,
  [Parameter(Mandatory)][string]$EnvelopePath
)
$ErrorActionPreference='Stop'
$EncryptedArchive=(Resolve-Path -LiteralPath $EncryptedArchive).Path
$RecipientPublicKey=(Resolve-Path -LiteralPath $RecipientPublicKey).Path
$EnvelopePath=[IO.Path]::GetFullPath($EnvelopePath)
$root=[IO.Path]::GetFullPath('D:\Field Sales OS\.local-backups\')
if (!$EncryptedArchive.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or !$EncryptedArchive.EndsWith('.dump.aes') -or !$EnvelopePath.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw 'Use the protected local backup directory' }
if (Test-Path -LiteralPath $EnvelopePath) { throw 'Refusing to overwrite a recovery envelope' }
Add-Type -AssemblyName System.Security
$base=$EncryptedArchive.Substring(0,$EncryptedArchive.Length-4)
$rsa=[Security.Cryptography.RSA]::Create()
$secret=$null
try {
  $rsa.ImportFromPem([IO.File]::ReadAllText($RecipientPublicKey))
  if ($rsa.KeySize -lt 3072) { throw 'Use an RSA recipient of at least 3072 bits' }
  $secret=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes("$base.key.dpapi"),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  if ($secret.Length -ne 64) { throw 'Unexpected key format' }
  $wrapped=$rsa.Encrypt($secret,[Security.Cryptography.RSAEncryptionPadding]::OaepSHA256)
  $stream=[IO.File]::Open($EnvelopePath,[IO.FileMode]::CreateNew)
  try { $stream.Write($wrapped) } finally { $stream.Dispose() }
} finally {
  if ($secret) { [Array]::Clear($secret,0,$secret.Length) }
  $rsa.Dispose()
}
Write-Output 'PORTABLE_KEY_ENVELOPE_CREATED; external custody must still be verified'
