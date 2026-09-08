[CmdletBinding()]
param(
  [string]$Serial
)

$adbPath = 'C:\Users\Notebook\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$ports = @(9222, 9223)

if (-not (Test-Path -LiteralPath $adbPath)) {
  throw "No se encontro ADB en $adbPath"
}

if (-not $Serial) {
  $deviceRows = @(& $adbPath devices | Select-String '\sdevice\s')
  if ($deviceRows.Count -ne 1) {
    throw 'ADB debe detectar exactamente un dispositivo autorizado.'
  }
  $Serial = ($deviceRows[0].ToString() -split '\s+')[0]
}

Write-Output "Dispositivo ADB: $Serial"

foreach ($port in $ports) {
  & $adbPath -s $Serial forward "tcp:$port" 'localabstract:chrome_devtools_remote' | Out-Null
  $version = Invoke-RestMethod "http://127.0.0.1:$port/json/version"
  $pages = @(Invoke-RestMethod "http://127.0.0.1:$port/json/list")
  [pscustomobject]@{
    Port = $port
    Package = $version.'Android-Package'
    Browser = $version.Browser
    Protocol = $version.'Protocol-Version'
    PageCount = $pages.Count
    Pages = ($pages | ForEach-Object { "$($_.title) <$($_.url)>" }) -join "`n"
  } | Format-List
}
