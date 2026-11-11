# Hubify - servidor unico, sem Docker.
# Sobe o backend (Java, com banco embutido em arquivo) e o servidor Node, que entrega o site,
# a API e as chamadas num endereco so. Os outros aparelhos da rede so precisam abrir
# https://IP-DESTA-MAQUINA no navegador.
#
# Uso:  clique duas vezes em "Iniciar Servidor.bat"   (ou: powershell -File iniciar-servidor.ps1)
#   -Reconstruir     refaz o site e o backend mesmo que ja estejam prontos
#   -PortaHttps 8443 usa outra porta HTTPS (padrao 443)
#
# Precisa apenas de Java 25+ e Node.js 18+ instalados. A internet so e usada na PRIMEIRA
# execucao (baixar dependencias e montar o sistema); depois roda totalmente offline.
param(
  [switch]$Reconstruir,
  [int]$PortaHttps = 443,
  [int]$PortaHttp = 8080,
  [int]$PortaBackend = 8081
)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$dados = Join-Path $raiz 'servidor-dados'
$ferramentas = Join-Path $raiz '.tools'
$mavenVersao = '3.9.9'

function Titulo($texto) { Write-Host ""; Write-Host "== $texto" -ForegroundColor Cyan }
function Falha($texto) { Write-Host ""; Write-Host "ERRO: $texto" -ForegroundColor Red; exit 1 }

function Executar($descricao, $pasta, $comando, $argumentos) {
  Push-Location $pasta
  try {
    & $comando @argumentos
    if ($LASTEXITCODE -ne 0) { Falha "$descricao falhou (codigo $LASTEXITCODE)." }
  } finally { Pop-Location }
}

# Data da alteracao mais recente dentro de uma pasta (para saber se precisa reconstruir)
function MaisRecente($pasta) {
  $item = Get-ChildItem -Path $pasta -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($item) { return $item.LastWriteTime }
  return [datetime]::MinValue
}

# ---------- Requisitos ----------
Titulo 'Verificando requisitos'
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { Falha 'Java nao encontrado. Instale o Java 25 (Temurin) e tente de novo.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Falha 'Node.js nao encontrado. Instale o Node.js 18 ou mais novo e tente de novo.' }

$javaVersao = (& cmd /c 'java -version 2>&1' | Select-Object -First 1)
if ($javaVersao -match '"(\d+)') {
  if ([int]$Matches[1] -lt 25) { Falha "O backend precisa do Java 25 ou mais novo (encontrado: $javaVersao)." }
}
Write-Host "Java: $javaVersao"
Write-Host "Node: $(node -v)"

New-Item -ItemType Directory -Force -Path $dados | Out-Null

# ---------- Site (frontend) ----------
$frontend = Join-Path $raiz 'frontend'
$site = Join-Path $frontend 'dist'
$siteIndex = Join-Path $site 'index.html'
$temFontesSite = Test-Path (Join-Path $frontend 'package.json')
$refazerSite = $temFontesSite -and ($Reconstruir -or -not (Test-Path $siteIndex))
if (-not (Test-Path $siteIndex) -and -not $temFontesSite) { Falha 'Nao encontrei o site pronto (frontend\dist) nem o codigo-fonte para monta-lo.' }
if (-not $refazerSite -and $temFontesSite) {
  $refazerSite = (MaisRecente (Join-Path $frontend 'src')) -gt (Get-Item $siteIndex).LastWriteTime
}
if ($refazerSite) {
  Titulo 'Montando o site (so na primeira vez ou quando o codigo muda)'
  if (-not (Test-Path (Join-Path $frontend 'node_modules'))) { Executar 'Instalar dependencias do site' $frontend 'npm.cmd' @('ci') }
  # Mesmo endereco para site, API e chamadas: as URLs ficam vazias
  $env:VITE_API_URL = ''
  $env:VITE_SOCKET_URL = ''
  Executar 'Montar o site' $frontend 'npm.cmd' @('run', 'build')
}

# ---------- Servidor Node ----------
$videoServer = Join-Path $raiz 'video-server'
if (-not (Test-Path (Join-Path $videoServer 'node_modules\node-forge'))) {
  Titulo 'Instalando dependencias do servidor'
  Executar 'Instalar dependencias do servidor' $videoServer 'npm.cmd' @('install', '--omit=dev')
}

# ---------- Backend (Java) ----------
$backend = Join-Path $raiz 'backend'
$jar = Get-ChildItem -Path (Join-Path $backend 'target') -Filter 'hubify-backend-*.jar' -ErrorAction SilentlyContinue | Select-Object -First 1
$temFontesBackend = Test-Path (Join-Path $backend 'pom.xml')
$refazerBackend = $temFontesBackend -and ($Reconstruir -or -not $jar)
if (-not $jar -and -not $temFontesBackend) { Falha 'Nao encontrei o backend pronto (backend\target\*.jar) nem o codigo-fonte para monta-lo.' }
if (-not $refazerBackend -and $temFontesBackend) {
  $fontes = MaisRecente (Join-Path $backend 'src')
  $pom = (Get-Item (Join-Path $backend 'pom.xml')).LastWriteTime
  $refazerBackend = ($fontes -gt $jar.LastWriteTime) -or ($pom -gt $jar.LastWriteTime)
}
if ($refazerBackend) {
  Titulo 'Montando o backend (so na primeira vez ou quando o codigo muda)'
  # Montar exige o JDK (com o compilador javac); para apenas rodar, o Java comum basta
  $javac = Get-Command javac -ErrorAction SilentlyContinue
  if (-not $javac) { Falha 'Para montar o backend e preciso o JDK 25 (Temurin JDK), nao apenas o JRE. Instale o JDK ou use o pacote pronto da pagina de Releases.' }
  $javacVersao = (& cmd /c 'javac -version 2>&1' | Select-Object -First 1)
  if ($javacVersao -match '(\d+)') {
    if ([int]$Matches[1] -lt 25) { Falha "Para montar o backend e preciso o JDK 25 ou mais novo (encontrado: $javacVersao)." }
  }
  $env:JAVA_HOME = Split-Path (Split-Path $javac.Source -Parent) -Parent
  $mvn = Get-Command mvn -ErrorAction SilentlyContinue
  if ($mvn) {
    $mvnCmd = $mvn.Source
  } else {
    $mvnCmd = Join-Path $ferramentas "apache-maven-$mavenVersao\bin\mvn.cmd"
    if (-not (Test-Path $mvnCmd)) {
      Write-Host "Baixando o Maven $mavenVersao (ferramenta de montagem, fica em .tools)..."
      New-Item -ItemType Directory -Force -Path $ferramentas | Out-Null
      $zip = Join-Path $ferramentas 'maven.zip'
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $ProgressPreference = 'SilentlyContinue'
      Invoke-WebRequest -UseBasicParsing -Uri "https://archive.apache.org/dist/maven/maven-3/$mavenVersao/binaries/apache-maven-$mavenVersao-bin.zip" -OutFile $zip
      Expand-Archive -Path $zip -DestinationPath $ferramentas -Force
      Remove-Item $zip
    }
  }
  Executar 'Montar o backend' $backend $mvnCmd @('-q', '-DskipTests', 'package')
  $jar = Get-ChildItem -Path (Join-Path $backend 'target') -Filter 'hubify-backend-*.jar' | Select-Object -First 1
  if (-not $jar) { Falha 'O backend foi montado, mas o arquivo .jar nao apareceu em backend\target.' }
}

# ---------- Subir ----------
Titulo 'Iniciando o backend'
$logBackend = Join-Path $dados 'backend.log'
$env:PORT = "$PortaBackend"
$env:HUBIFY_DATA_DIR = $dados
$processoBackend = Start-Process -FilePath 'java' `
  -ArgumentList @('-jar', "`"$($jar.FullName)`"", '--spring.profiles.active=local') `
  -WorkingDirectory $raiz -RedirectStandardOutput $logBackend -RedirectStandardError (Join-Path $dados 'backend-erros.log') `
  -WindowStyle Hidden -PassThru

try {
  $pronto = $false
  for ($i = 0; $i -lt 90 -and -not $pronto; $i++) {
    if ($processoBackend.HasExited) { Falha "O backend parou ao iniciar. Veja o motivo em: $logBackend" }
    try {
      $cliente = New-Object Net.Sockets.TcpClient
      $cliente.Connect('127.0.0.1', $PortaBackend)
      $cliente.Close()
      $pronto = $true
    } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $pronto) { Falha "O backend nao respondeu em 90 segundos. Veja: $logBackend" }
  Write-Host "Backend pronto (dados em $dados)"

  Titulo 'Iniciando o servidor'
  Write-Host 'Deixe esta janela aberta. Para desligar o Hubify, feche a janela ou aperte Ctrl+C.'
  Write-Host 'Se o Windows perguntar sobre o firewall, permita o acesso em redes privadas.'
  $env:PORT = "$PortaHttp"
  $env:HTTPS_PORT = "$PortaHttps"
  $env:BACKEND_URL = "http://127.0.0.1:$PortaBackend/api"
  $env:STATIC_DIR = $site
  $env:CERT_DIR = Join-Path $dados 'certificado'
  Push-Location $videoServer
  try { & node server.js } finally { Pop-Location }
} finally {
  if ($processoBackend -and -not $processoBackend.HasExited) {
    Stop-Process -Id $processoBackend.Id -Force -ErrorAction SilentlyContinue
  }
}
