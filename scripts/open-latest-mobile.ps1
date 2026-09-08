$ErrorActionPreference = 'Stop'

$projectPath = 'C:\Users\Notebook\Documents\Pagina'
$port = 8080
$baseUrl = $null
$adbPath = 'C:\Users\Notebook\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$logDir = Join-Path $projectPath '.tmp'

function Fail([string]$message) {
  Write-Host "[ERROR] $message" -ForegroundColor Red
  exit 1
}

try {
  Write-Host 'Cine Juntos - abrir ultima version en el celular'
  Write-Host '---------------------------------------------------'

  if (-not (Test-Path -LiteralPath $projectPath)) {
    Fail "No existe el proyecto en $projectPath"
  }
  if (-not (Test-Path -LiteralPath $adbPath)) {
    Fail "No se encontro ADB en $adbPath"
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'Node.js no esta disponible en el PATH'
  }

  $appiumVersion = ''
  $appiumDriverOk = $false
  if (Get-Command appium -ErrorAction SilentlyContinue) {
    $appiumVersion = (& appium --version 2>$null | Select-Object -First 1).ToString().Trim()
    $savedErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $driverOutput = (& appium driver list --installed 2>&1 | Out-String)
    $ErrorActionPreference = $savedErrorActionPreference
    $appiumDriverOk = $driverOutput -match 'uiautomator2.*installed'
  }
  if ($appiumVersion -and $appiumDriverOk) {
    Write-Host "[OK] Appium $appiumVersion + uiautomator2 disponible" -ForegroundColor Green
  } else {
    Write-Host '[AVISO] Appium/uiautomator2 no pudo verificarse; se continuara con ADB.' -ForegroundColor Yellow
  }

  $localIp = @(Get-NetIPConfiguration |
    Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway } |
    ForEach-Object { $_.IPv4Address | ForEach-Object { $_.IPAddress } } |
    Where-Object { $_ -and $_ -notmatch '^(127\.|169\.254\.)' } |
    Select-Object -First 1)
  if ($localIp.Count -ne 1) {
    Fail 'No se pudo determinar la IP local de la PC para compartirla por Wi-Fi.'
  }
  $baseUrl = "http://${localIp}:$port/"
  Write-Host "[OK] Link de red local: $baseUrl" -ForegroundColor Green

  $deviceLines = @(& $adbPath devices | Select-String '\sdevice(\s|$)')
  if ($deviceLines.Count -ne 1) {
    Fail "ADB debe detectar exactamente un celular autorizado; detecto $($deviceLines.Count)."
  }
  $serial = ($deviceLines[0].ToString().Trim() -split '\s+')[0]
  Write-Host "[OK] Celular conectado: $serial" -ForegroundColor Green

  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $listener) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $stdoutPath = Join-Path $logDir 'mobile-dev-server.log'
    $stderrPath = Join-Path $logDir 'mobile-dev-server.err.log'
    Start-Process -FilePath 'node' `
      -ArgumentList @('scripts/dev-server.js', '--port', "$port") `
      -WorkingDirectory $projectPath `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -WindowStyle Hidden | Out-Null
    Write-Host '[INFO] Servidor iniciado en segundo plano.'
  } else {
    Write-Host '[OK] Servidor ya estaba iniciado.' -ForegroundColor Green
  }

  $serverReady = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $probe = Invoke-WebRequest -UseBasicParsing -Uri $baseUrl -TimeoutSec 2
      if ($probe.StatusCode -eq 200 -and $probe.Content -match 'Cine Juntos') {
        $serverReady = $true
        break
      }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $serverReady) {
    Fail "El servidor no respondio correctamente en $baseUrl"
  }
  Write-Host '[OK] Ultima version disponible en el servidor.' -ForegroundColor Green

  # El puerto 8080 se accede por la red local; USB solo envia la orden de apertura.
  & $adbPath -s $serial forward tcp:9223 localabstract:chrome_devtools_remote | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Fail 'No se pudo conectar al navegador remoto del celular.'
  }
  Write-Host '[OK] Tuneles USB configurados.' -ForegroundColor Green

  # Abre la URL con el navegador predeterminado del celular.
  & $adbPath -s $serial shell am start -a android.intent.action.VIEW -d $baseUrl | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Fail 'El celular rechazo la orden de abrir el navegador.'
  }

  $pageReady = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $pages = @(Invoke-RestMethod 'http://127.0.0.1:9223/json/list' -TimeoutSec 2)
      $page = $pages | Where-Object { $_.type -eq 'page' -and $_.url -like "$baseUrl*" } | Select-Object -First 1
      if ($page) {
        $pageReady = $true
        break
      }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $pageReady) {
    Fail 'El navegador se abrio, pero no se pudo confirmar la pagina por CDP.'
  }

  $npmRoot = (& npm root -g 2>$null | Select-Object -First 1).ToString().Trim()
  $playwrightCorePath = Join-Path $npmRoot '@playwright\cli\node_modules\playwright-core'
  $verifyScript = Join-Path $projectPath 'scripts\verify-mobile-page.js'
  if (-not (Test-Path -LiteralPath $playwrightCorePath)) {
    Fail 'No se encontro Playwright para confirmar que la pagina termino de cargar.'
  }
  $env:PLAYWRIGHT_CORE_PATH = $playwrightCorePath
  $verification = (& node $verifyScript 'http://127.0.0.1:9223' $baseUrl 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    Fail "La pagina no termino de cargar: $verification"
  }

  # Solo queda abierto el canal de verificacion CDP, que cerramos ahora.
  & $adbPath -s $serial forward --remove tcp:9223 | Out-Null
  $forwardClosed = $LASTEXITCODE -eq 0

  Write-Host '[OK] La ultima version quedo abierta en el celular.' -ForegroundColor Green
  Write-Host "     URL: $baseUrl"
  if ($forwardClosed) {
    Write-Host '     USB ya no es necesario: Android seguira usando la red local.' -ForegroundColor Green
  } else {
    Write-Host '     [AVISO] No se pudo cerrar el canal de verificacion USB.' -ForegroundColor Yellow
  }
  exit 0
} catch {
  Fail $_.Exception.Message
}
