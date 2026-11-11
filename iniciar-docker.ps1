# Hubify - sobe o servidor com Docker nesta maquina e mostra onde conectar.
# Uso (dentro da pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File .\iniciar-docker.ps1
#   -PortaHttps 8443   usa outra porta HTTPS (padrao 443)
#   -Parar             desliga o servidor (os dados sao mantidos)
param(
  [int]$PortaHttps = 443,
  [switch]$Parar
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Titulo($texto) { Write-Host ""; Write-Host "== $texto" -ForegroundColor Cyan }
function Falha($texto) { Write-Host ""; Write-Host "ERRO: $texto" -ForegroundColor Red; exit 1 }

if (-not (Test-Path '.\docker-compose.yml')) { Falha 'Rode este script dentro da pasta do projeto (onde fica o docker-compose.yml).' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Falha 'Docker nao encontrado. Instale o Docker Desktop e abra-o.' }

& cmd /c 'docker info >nul 2>&1'
if ($LASTEXITCODE -ne 0) {
  # Docker instalado mas fechado: abre o Docker Desktop e espera ficar pronto
  $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $desktop)) { Falha 'O Docker nao esta rodando. Abra o Docker Desktop, espere ele ficar pronto e rode de novo.' }
  Titulo 'Abrindo o Docker Desktop (pode levar 1 ou 2 minutos)'
  Start-Process -FilePath $desktop
  $ligado = $false
  for ($i = 0; $i -lt 90 -and -not $ligado; $i++) {
    Start-Sleep -Seconds 2
    & cmd /c 'docker info >nul 2>&1'
    if ($LASTEXITCODE -eq 0) { $ligado = $true }
  }
  if (-not $ligado) { Falha 'O Docker Desktop nao ficou pronto em 3 minutos. Abra-o manualmente, espere iniciar e rode de novo.' }
}

if ($Parar) {
  Titulo 'Desligando o Hubify'
  docker compose down
  exit $LASTEXITCODE
}

# IPs desta maquina na rede (ignora adaptadores virtuais do Docker/WSL/Hyper-V)
$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and
    $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker|Loopback|VirtualBox|VMware'
  } | Select-Object -ExpandProperty IPAddress)
if ($ips.Count -eq 0) { Write-Host 'Aviso: nao encontrei um IP de rede; o acesso vai funcionar so nesta maquina.' -ForegroundColor Yellow }

# Porta HTTPS: se a escolhida estiver ocupada por outro programa, usa a 8443
$ocupada = Get-NetTCPConnection -State Listen -LocalPort $PortaHttps -ErrorAction SilentlyContinue
$doHubify = (& cmd /c 'docker ps --filter name=hubify-frontend --format "{{.Ports}}" 2>nul') -match ":$PortaHttps->"
if ($ocupada -and -not $doHubify) {
  Write-Host "Aviso: a porta $PortaHttps ja esta em uso; vou usar a 8443." -ForegroundColor Yellow
  $PortaHttps = 8443
}

# Porta HTTP (so redireciona para o HTTPS e entrega o certificado): se a 80 estiver ocupada, usa a 8081
$PortaHttp = 80
$ocupada80 = Get-NetTCPConnection -State Listen -LocalPort $PortaHttp -ErrorAction SilentlyContinue
$doHubify80 = (& cmd /c 'docker ps --filter name=hubify-frontend --format "{{.Ports}}" 2>nul') -match ":$PortaHttp->"
if ($ocupada80 -and -not $doHubify80) {
  Write-Host "Aviso: a porta $PortaHttp ja esta em uso; vou usar a 8081 para o certificado." -ForegroundColor Yellow
  $PortaHttp = 8081
}

# .env: enderecos que entram no certificado HTTPS e as portas publicadas na rede
$hosts = (@($ips) + $env:COMPUTERNAME) -join ','
$linhas = @()
if (Test-Path '.\.env') { $linhas = @(Get-Content '.\.env' | Where-Object { $_ -notmatch '^\s*(HUBIFY_HOSTS|HUBIFY_HTTPS_PORT|HUBIFY_HTTP_PORT)\s*=' }) }
$linhas += "HUBIFY_HOSTS=$hosts"
$linhas += "HUBIFY_HTTPS_PORT=$PortaHttps"
$linhas += "HUBIFY_HTTP_PORT=$PortaHttp"
[IO.File]::WriteAllLines((Join-Path $PSScriptRoot '.env'), $linhas)

Titulo 'Montando e subindo os servicos (a primeira vez demora alguns minutos)'
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Falha 'O docker compose falhou. Veja as mensagens acima.' }

Titulo 'Esperando o servidor responder'
$pronto = $false
for ($i = 0; $i -lt 120 -and -not $pronto; $i++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5173/api/auth/users' -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $pronto = $true }
  } catch { Start-Sleep -Seconds 2 }
}

# Libera a porta no firewall para a rede (so funciona se o PowerShell estiver como administrador)
try {
  if (-not (Get-NetFirewallRule -DisplayName 'Hubify' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'Hubify' -Direction Inbound -Protocol TCP -LocalPort $PortaHttps -Action Allow -Profile Private,Domain -ErrorAction Stop | Out-Null
    Write-Host "Firewall: porta $PortaHttps liberada para redes privadas."
  }
  if (-not (Get-NetFirewallRule -DisplayName 'Hubify HTTP' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'Hubify HTTP' -Direction Inbound -Protocol TCP -LocalPort $PortaHttp -Action Allow -Profile Private,Domain -ErrorAction Stop | Out-Null
  }
} catch {
  Write-Host "Aviso: nao consegui liberar a porta $PortaHttps no firewall (abra o PowerShell como administrador e rode de novo, se outros aparelhos nao conectarem)." -ForegroundColor Yellow
}

$sufixo = ''
if ($PortaHttps -ne 443) { $sufixo = ":$PortaHttps" }
$linha = '=' * 62
Write-Host ""
Write-Host $linha -ForegroundColor Green
if ($pronto) { Write-Host '  HUBIFY NO AR - conecte pelo navegador de qualquer aparelho da rede:' -ForegroundColor Green }
else { Write-Host '  Os servicos subiram, mas o backend ainda nao respondeu. Tente em 1 minuto:' -ForegroundColor Yellow }
Write-Host ""
foreach ($ip in $ips) { Write-Host "     https://$ip$sufixo" }
Write-Host ""
Write-Host '  Nesta maquina:  http://localhost:5173'
Write-Host '  Para o navegador nao mostrar "sua conexao nao e particular", instale uma vez em cada aparelho:'
$sufixoHttp = ''
if ($PortaHttp -ne 80) { $sufixoHttp = ":$PortaHttp" }
foreach ($ip in $ips) { Write-Host "     http://$ip$sufixoHttp/hubify-ca.crt" }
Write-Host '  (passo a passo no README, secao "HTTPS sem aviso")'
Write-Host $linha -ForegroundColor Green
Write-Host ""
Write-Host 'Ver o que esta rodando:  docker compose ps'
Write-Host 'Ver os registros:        docker compose logs -f'
Write-Host 'Desligar:                powershell -ExecutionPolicy Bypass -File .\iniciar-docker.ps1 -Parar'
