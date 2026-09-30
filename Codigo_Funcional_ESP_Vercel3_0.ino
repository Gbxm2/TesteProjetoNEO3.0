/**
 * ============================================================================
 * INDUSTRIAL SAFETY MONITOR - FIRMWARE ESP32 DO CAPACETE INTELIGENTE (IoT EDGE)
 * ============================================================================
 * [GUIA PARA O SQUAD DE HARDWARE & FIRMWARE]
 * 
 * OBJETIVO:
 * Este firmware é embarcado no microcontrolador ESP32 acoplado ao capacete de segurança
 * industrial (Capacete Inteligente IoT - Nó EMP001 / Gabriel Araújo).
 * 
 * MAPEAMENTO DE HARDWARE & PINAGEM:
 * - MPU6050 (Acelerômetro + Giroscópio): I2C (SDA=GPIO 21, SCL=GPIO 22)
 * - SW-420 (Sensor de Vibração Piezoelétrico): GPIO 5 (Entrada Digital)
 * - FC-04 (Sensor de Som / Microfone de Impacto Acústico): GPIO 23 (Entrada Digital)
 * - GPS NEO-6M (Telemetria Geográfica): Hardware Serial 2 (RX=GPIO 16, TX=GPIO 17)
 * 
 * ALGORITMO DE FUSÃO SENSORIAL E PONTUAÇÃO DE IMPACTO:
 * 1. Amostragem em alta frequência do MPU6050 (~200 leituras/seg, intervalo 5ms).
 * 2. Cálculo do vetor de aceleração resultante em unidades de força G (gravidade).
 * 3. Gatilho de Janela de Análise (200ms) quando aceleração ultrapassar LIMITE_INICIO_IMPACTO_G (2.0G).
 * 4. Pontuação composta (Score 0 a 100):
 *    - Contribuição MPU6050: Até 60 pontos baseados no pico de desaceleração.
 *    - Contribuição Vibração (SW-420): 25 pontos se houver vibração mecânica coincidente.
 *    - Contribuição Som (FC-04): 15 pontos se houver ruído acústico de colisão coincidente.
 * 5. Impacto crítico confirmado se Score >= 60 ou pico isolado >= 12.0G.
 * 
 * CAMADA DE COMUNICAÇÃO DISTRIBUÍDA:
 * - Transmite pacotes JSON via HTTP POST para /api/dados (IP do gateway ou túnel) a cada 1000ms.
 * - Disponibiliza WebServer local (porta 80) com autenticação HTTP Basic e atualização OTA.
 * - Proteção contra força bruta embutida no microcontrolador com bloqueio temporário de IP.
 * ============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <TinyGPSPlus.h>

// ============================================================
// CONFIGURAÇÕES WI-FI
// ============================================================

const char* ssid = "Carlos Ara_EXT";
const char* password = "OLI24130";

// ============================================================
// LOGIN DO PAINEL WEB
// ============================================================

const char* webUsername = "Gbxm";
const char* webPassword = "Gbxm#1853";

// ============================================================
// SENHA OTA
// ============================================================

const char* updatePassword = "Gbxm#1853";

// ============================================================
// HOSTNAME
// ============================================================

const char* hostname = "ESP32-SENSORES";

// ============================================================
// SERVIDOR WEB
// ============================================================

WebServer server(80);

// ============================================================
// API EXTERNA
// ============================================================

// IP atual da sua maquina na rede local: 192.168.0.109
const char* apiURL = "http://192.168.0.109:3000/api/dados";

const unsigned long INTERVALO_API = 1000;
unsigned long ultimoEnvioAPI = 0;

// ============================================================
// SW-420
// ============================================================

const int sensorPin = 5;

// ============================================================
// FC-04
// ============================================================

const int soundSensorPin = 23;

// Na maioria dos módulos FC-04, LOW significa som detectado.
// Se o seu funcionar ao contrário, altere para HIGH.
const int SOM_ATIVO = LOW;

// ============================================================
// MPU6050
// ============================================================

Adafruit_MPU6050 mpu;

// ============================================================
// GPS NEO-6M
// ============================================================

TinyGPSPlus gps;

HardwareSerial GPS_Serial(2);

#define GPS_RX 16
#define GPS_TX 17

const unsigned long INTERVALO_GPS = 30000;

unsigned long ultimaLeituraGPS = 0;

// ============================================================
// CONTROLE GERAL
// ============================================================

bool detectar = true;

// ============================================================
// VALORES DOS SENSORES
// ============================================================

float aceleracaoTotal = 0.0;

float aceleracaoG = 0.0;

float picoAceleracaoG = 0.0;

bool vibracaoDetectada = false;

bool somDetectado = false;

bool impactoDetectado = false;

// ============================================================
// SISTEMA DE PONTUAÇÃO
// ============================================================

int pontuacaoImpacto = 0;

// Pontuação individual
int pontosMPU = 0;
int pontosVibracao = 0;
int pontosSom = 0;

// ============================================================
// CONFIGURAÇÕES DA DETECÇÃO
// ============================================================

// A partir de 2 g começa uma avaliação de impacto
const float LIMITE_INICIO_IMPACTO_G = 2.0;

// A partir de 12 g é considerado impacto relevante imediatamente
const float LIMITE_IMPACTO_FORTE_G = 12.0;

// Pontuação mínima para impacto relevante
const int LIMITE_PONTUACAO = 60;

// Janela para analisar os três sensores
const unsigned long JANELA_IMPACTO = 200;

// Tempo que "IMPACTO DETECTADO" permanece no painel
const unsigned long TEMPO_EXIBICAO_IMPACTO = 3000;

// Tempo mínimo entre eventos
const unsigned long COOLDOWN_IMPACTO = 1500;

// ============================================================
// CONTROLE DO EVENTO
// ============================================================

bool avaliandoImpacto = false;

unsigned long inicioAvaliacao = 0;

unsigned long ultimoImpacto = 0;

unsigned long impactoExibirAte = 0;

bool vibracaoDuranteEvento = false;

bool somDuranteEvento = false;

float picoEventoG = 0.0;

// ============================================================
// LEITURA RÁPIDA DO MPU6050
// ============================================================

// Aproximadamente 200 leituras por segundo
const unsigned long INTERVALO_MPU = 5;

unsigned long ultimaLeituraMPU = 0;

// ============================================================
// LOGS
// ============================================================

#define MAX_LOGS 50

String logs[MAX_LOGS];

int logCount = 0;

// ============================================================
// PROTEÇÃO CONTRA TENTATIVAS DE LOGIN
// ============================================================

#define MAX_TENTATIVAS 5

#define TEMPO_BLOQUEIO 300000UL

struct TentativaLogin {

  IPAddress ip;

  int tentativas;

  unsigned long bloqueadoAte;

  bool usado;
};

#define MAX_IPS_BLOQUEADOS 8

TentativaLogin tentativas[MAX_IPS_BLOQUEADOS];

// ============================================================
// HEADERS OTA
// ============================================================

const char* headerKeys[] = {
  "X-OTA-Password"
};

const size_t headerKeysCount = 1;

// ============================================================
// FUNÇÃO PARA ADICIONAR LOG
// ============================================================

void adicionarLog(String mensagem) {

  Serial.println(mensagem);

  if (logCount < MAX_LOGS) {

    logs[logCount] = mensagem;

    logCount++;

  } else {

    for (int i = 0; i < MAX_LOGS - 1; i++) {

      logs[i] = logs[i + 1];
    }

    logs[MAX_LOGS - 1] = mensagem;
  }
}

// ============================================================
// ENCONTRAR IP
// ============================================================

int encontrarIP(IPAddress ip) {

  for (int i = 0; i < MAX_IPS_BLOQUEADOS; i++) {

    if (tentativas[i].usado &&
        tentativas[i].ip == ip) {

      return i;
    }
  }

  return -1;
}

// ============================================================
// CRIAR REGISTRO DE IP
// ============================================================

int criarRegistroIP(IPAddress ip) {

  for (int i = 0; i < MAX_IPS_BLOQUEADOS; i++) {

    if (!tentativas[i].usado) {

      tentativas[i].ip = ip;

      tentativas[i].tentativas = 0;

      tentativas[i].bloqueadoAte = 0;

      tentativas[i].usado = true;

      return i;
    }
  }

  return -1;
}

// ============================================================
// VERIFICAR SE IP ESTÁ BLOQUEADO
// ============================================================

bool ipBloqueado(IPAddress ip) {

  int indice = encontrarIP(ip);

  if (indice == -1) {

    return false;
  }

  if (tentativas[indice].bloqueadoAte == 0) {

    return false;
  }

  if (millis() >= tentativas[indice].bloqueadoAte) {

    tentativas[indice].bloqueadoAte = 0;

    tentativas[indice].tentativas = 0;

    return false;
  }

  return true;
}

// ============================================================
// REGISTRAR FALHA DE LOGIN
// ============================================================

void registrarFalhaLogin(IPAddress ip) {

  int indice = encontrarIP(ip);

  if (indice == -1) {

    indice = criarRegistroIP(ip);
  }

  if (indice == -1) {

    return;
  }

  tentativas[indice].tentativas++;

  Serial.print("Falha de login - IP: ");

  Serial.println(ip);

  if (tentativas[indice].tentativas >= MAX_TENTATIVAS) {

    tentativas[indice].bloqueadoAte =
      millis() + TEMPO_BLOQUEIO;

    Serial.print("IP bloqueado por 5 minutos: ");

    Serial.println(ip);
  }
}

// ============================================================
// LOGIN BEM-SUCEDIDO
// ============================================================

void loginSucesso(IPAddress ip) {

  int indice = encontrarIP(ip);

  if (indice == -1) {

    return;
  }

  tentativas[indice].tentativas = 0;

  tentativas[indice].bloqueadoAte = 0;
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================

bool autenticar() {

  IPAddress ip = server.client().remoteIP();

  if (ipBloqueado(ip)) {

    server.send(
      429,
      "text/plain",
      "IP temporariamente bloqueado."
    );

    return false;
  }

  if (!server.hasHeader("Authorization")) {

    server.requestAuthentication();

    return false;
  }

  if (!server.authenticate(
        webUsername,
        webPassword)) {

    registrarFalhaLogin(ip);

    server.requestAuthentication();

    return false;
  }

  loginSucesso(ip);

  return true;
}

// ============================================================
// CALCULAR PONTOS DO MPU6050
// ============================================================

int calcularPontosMPU(float g) {

  if (g < 2.0) {

    return 0;

  } else if (g < 4.0) {

    return 10;

  } else if (g < 6.0) {

    return 25;

  } else if (g < 8.0) {

    return 40;

  } else if (g < 10.0) {

    return 50;

  } else if (g < 12.0) {

    return 60;

  } else {

    return 70;
  }
}

// ============================================================
// INICIAR AVALIAÇÃO DE IMPACTO
// ============================================================

void iniciarAvaliacaoImpacto() {

  if (avaliandoImpacto) {

    return;
  }

  if (
    millis() - ultimoImpacto <
    COOLDOWN_IMPACTO
  ) {

    return;
  }

  avaliandoImpacto = true;

  inicioAvaliacao = millis();

  picoEventoG = aceleracaoG;

  vibracaoDuranteEvento =
    vibracaoDetectada;

  somDuranteEvento =
    somDetectado;

  Serial.println();

  Serial.println(
    ">>> INICIO DA AVALIACAO DE IMPACTO <<<"
  );
}

// ============================================================
// FINALIZAR AVALIAÇÃO DE IMPACTO
// ============================================================

void finalizarAvaliacaoImpacto() {

  avaliandoImpacto = false;

  // ----------------------------------------------------------
  // Calcula pontuação
  // ----------------------------------------------------------

  pontosMPU =
    calcularPontosMPU(
      picoEventoG
    );

  pontosVibracao =
    vibracaoDuranteEvento
      ? 20
      : 0;

  pontosSom =
    somDuranteEvento
      ? 10
      : 0;

  pontuacaoImpacto =
    pontosMPU +
    pontosVibracao +
    pontosSom;

  // ----------------------------------------------------------
  // Determina resultado
  // ----------------------------------------------------------

  bool impactoRelevante =
    pontuacaoImpacto >=
    LIMITE_PONTUACAO;

  // Impacto extremamente forte
  // sempre é relevante
  if (
    picoEventoG >=
    LIMITE_IMPACTO_FORTE_G
  ) {

    impactoRelevante = true;
  }

  impactoDetectado =
    impactoRelevante;

  if (impactoRelevante) {

    impactoExibirAte =
      millis() +
      TEMPO_EXIBICAO_IMPACTO;

    ultimoImpacto =
      millis();

    // --------------------------------------------------------
    // LOG PRINCIPAL
    // --------------------------------------------------------

    adicionarLog(
      "========================================"
    );

    adicionarLog(
      "IMPACTO RELEVANTE DETECTADO!"
    );

    adicionarLog(
      "Pontuacao: " +
      String(pontuacaoImpacto) +
      "/100"
    );

    adicionarLog(
      "Pico MPU6050: " +
      String(picoEventoG, 2) +
      " g"
    );

    adicionarLog(
      "Pontos MPU6050: " +
      String(pontosMPU)
    );

    adicionarLog(
      "Pontos SW-420: " +
      String(pontosVibracao)
    );

    adicionarLog(
      "Pontos FC-04: " +
      String(pontosSom)
    );

    adicionarLog(
      "Vibracao: " +
      String(
        vibracaoDuranteEvento
          ? "SIM"
          : "NAO"
      )
    );

    adicionarLog(
      "Som: " +
      String(
        somDuranteEvento
          ? "SIM"
          : "NAO"
      )
    );

    adicionarLog(
      "========================================"
    );

  } else {

    adicionarLog(
      "Evento descartado. Pontuacao: " +
      String(pontuacaoImpacto) +
      "/100"
    );
  }

  // ----------------------------------------------------------
  // Reset
  // ----------------------------------------------------------

  vibracaoDuranteEvento =
    false;

  somDuranteEvento =
    false;
}

// ============================================================
// PROCESSAMENTO DOS SENSORES
// ============================================================

void processarSensores() {

  if (!detectar) {

    return;
  }

  unsigned long agora = millis();

  // ----------------------------------------------------------
  // SW-420
  // ----------------------------------------------------------

  int estadoVibracao =
    digitalRead(sensorPin);

  vibracaoDetectada =
    (estadoVibracao == HIGH);

  // ----------------------------------------------------------
  // FC-04
  // ----------------------------------------------------------

  int estadoSom =
    digitalRead(soundSensorPin);

  somDetectado =
    (estadoSom == SOM_ATIVO);

  // ----------------------------------------------------------
  // MPU6050
  // ----------------------------------------------------------

  if (
    agora - ultimaLeituraMPU >=
    INTERVALO_MPU
  ) {

    ultimaLeituraMPU = agora;

    sensors_event_t a;

    sensors_event_t g;

    sensors_event_t temp;

    mpu.getEvent(
      &a,
      &g,
      &temp
    );

    // --------------------------------------------------------
    // Aceleração total
    // --------------------------------------------------------

    aceleracaoTotal =
      sqrt(
        a.acceleration.x *
        a.acceleration.x +

        a.acceleration.y *
        a.acceleration.y +

        a.acceleration.z *
        a.acceleration.z
      );

    // --------------------------------------------------------
    // Converte para G
    // --------------------------------------------------------

    aceleracaoG =
      aceleracaoTotal /
      9.80665;

    // --------------------------------------------------------
    // Atualiza pico
    // --------------------------------------------------------

    if (
      aceleracaoG >
      picoAceleracaoG
    ) {

      picoAceleracaoG =
        aceleracaoG;
    }

    // --------------------------------------------------------
    // Se já está avaliando impacto
    // --------------------------------------------------------

    if (avaliandoImpacto) {

      if (
        aceleracaoG >
        picoEventoG
      ) {

        picoEventoG =
          aceleracaoG;
      }

      if (vibracaoDetectada) {

        vibracaoDuranteEvento =
          true;
      }

      if (somDetectado) {

        somDuranteEvento =
          true;
      }

      // ------------------------------------------------------
      // Impacto muito forte
      // ------------------------------------------------------

      if (
        picoEventoG >=
        LIMITE_IMPACTO_FORTE_G
      ) {

        finalizarAvaliacaoImpacto();

        return;
      }

      // ------------------------------------------------------
      // Finaliza janela de 200 ms
      // ------------------------------------------------------

      if (
        agora - inicioAvaliacao >=
        JANELA_IMPACTO
      ) {

        finalizarAvaliacaoImpacto();

        return;
      }

    }

    // --------------------------------------------------------
    // Detecta início de novo evento
    // --------------------------------------------------------

    if (!avaliandoImpacto) {

      if (
        aceleracaoG >=
        LIMITE_INICIO_IMPACTO_G ||

        vibracaoDetectada ||

        somDetectado
      ) {

        iniciarAvaliacaoImpacto();
      }
    }
  }

  // ----------------------------------------------------------
  // Mantém impacto no painel por alguns segundos
  // ----------------------------------------------------------

  if (
    impactoDetectado &&
    millis() > impactoExibirAte
  ) {

    impactoDetectado =
      false;
  }
}

// ============================================================
// PÁGINA HTML
// ============================================================

String paginaHTML() {

  String html = R"rawliteral(

<!DOCTYPE html>

<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>ESP32 - Monitor de Sensores</title>

<style>

body {

  margin: 0;

  font-family: Arial, sans-serif;

  background: #111;

  color: #fff;

}

.container {

  max-width: 1100px;

  margin: auto;

  padding: 20px;

}

h1 {

  text-align: center;

}

.card {

  background: #1e1e1e;

  border-radius: 12px;

  padding: 20px;

  margin-bottom: 20px;

  box-shadow: 0 4px 15px rgba(0,0,0,0.3);

}

.status {

  font-size: 18px;

  margin: 8px 0;

}

.score {

  font-size: 36px;

  font-weight: bold;

  text-align: center;

  margin: 20px 0;

}

.relevante {

  color: #ff4444;

}

.normal {

  color: #2ecc71;

}

button {

  padding: 12px 20px;

  margin: 5px;

  border: none;

  border-radius: 8px;

  cursor: pointer;

  font-size: 15px;

}

.start {

  background: #2ecc71;

}

.stop {

  background: #e74c3c;

  color: white;

}

.statusBtn {

  background: #3498db;

  color: white;

}

.clear {

  background: #555;

  color: white;

}

.update {

  background: #9b59b6;

  color: white;

}

.log {

  background: #000;

  padding: 15px;

  border-radius: 8px;

  height: 250px;

  overflow-y: auto;

  font-family: monospace;

  white-space: pre-wrap;

}

.gps-valid {

  color: #2ecc71;

}

.gps-invalid {

  color: #e74c3c;

}

.maps {

  display: inline-block;

  padding: 12px 20px;

  background: #4285F4;

  color: white;

  text-decoration: none;

  border-radius: 8px;

  margin-top: 10px;

}

input[type=file] {

  margin: 10px 0;

}

.progress {

  width: 100%;

  background: #333;

  border-radius: 10px;

  overflow: hidden;

}

.progress-bar {

  width: 0%;

  height: 20px;

  background: #9b59b6;

}

</style>

</head>

<body>

<div class="container">

<h1>ESP32 - Monitor de Sensores</h1>

<div class="card">

<h2>Wi-Fi</h2>

<div class="status">

Status:

<span id="wifi">---</span>

</div>

<div class="status">

IP:

<span id="ip">---</span>

</div>

</div>

<div class="card">

<h2>Controle</h2>

<div class="status">

Detecção:

<span id="detectar">---</span>

</div>

<button class="start"
onclick="comando('INICIAR')">

INICIAR

</button>

<button class="stop"
onclick="comando('PARAR')">

PARAR

</button>

<button class="statusBtn"
onclick="comando('STATUS')">

STATUS

</button>

</div>

<div class="card">

<h2>Resultado da Detecção</h2>

<div id="score"
class="score normal">

0 / 100

</div>

<div class="status">

Status:

<span id="statusImpacto">
NORMAL
</span>

</div>

<div class="status">

Pico do impacto:

<span id="picoG">
0.00
</span>

g

</div>

</div>

<div class="card">

<h2>MPU6050</h2>

<div class="status">

Aceleração total:

<span id="aceleracao">---</span>

m/s²

</div>

<div class="status">

Aceleração:

<span id="aceleracaoG">---</span>

g

</div>

<div class="status">

Pico registrado:

<span id="picoAceleracaoG">---</span>

g

</div>

<div class="status">

Pontos MPU6050:

<span id="pontosMPU">---</span>

</div>

</div>

<div class="card">

<h2>SW-420</h2>

<div class="status">

Vibração:

<span id="vibracao">---</span>

</div>

<div class="status">

Pontos:

<span id="pontosVibracao">---</span>

</div>

</div>

<div class="card">

<h2>FC-04</h2>

<div class="status">

Som:

<span id="som">---</span>

</div>

<div class="status">

Pontos:

<span id="pontosSom">---</span>

</div>

</div>

<div class="card">

<h2>GPS NEO-6M</h2>

<div class="status">

Estado:

<span id="gpsEstado">---</span>

</div>

<div class="status">

Latitude:

<span id="latitude">---</span>

</div>

<div class="status">

Longitude:

<span id="longitude">---</span>

</div>

<div class="status">

Altitude:

<span id="altitude">---</span>

m

</div>

<div class="status">

Satélites:

<span id="satelites">---</span>

</div>

<div class="status">

HDOP:

<span id="hdop">---</span>

</div>

<a id="maps"
class="maps"
href="#"
target="_blank">

Abrir no Google Maps

</a>

</div>

<div class="card">

<h2>Logs</h2>

<div id="log"
class="log">

Carregando...

</div>

<button class="clear"
onclick="limparLog()">

LIMPAR LOG

</button>

</div>

<div class="card">

<h2>Atualização OTA</h2>

<input
type="file"
id="firmware"
accept=".bin">

<br>

<button class="update"
onclick="atualizarFirmware()">

ATUALIZAR FIRMWARE

</button>

<div class="progress">

<div
id="progressBar"
class="progress-bar">
</div>

</div>

</div>

</div>

<script>

function atualizarDados() {

  fetch('/dados')

  .then(response => response.json())

  .then(data => {

    document.getElementById('wifi').innerText =
      data.wifi;

    document.getElementById('ip').innerText =
      data.ip;

    document.getElementById('detectar').innerText =
      data.detectar ? 'ATIVO' : 'PARADO';

    document.getElementById('aceleracao').innerText =
      data.aceleracao.toFixed(2);

    document.getElementById('aceleracaoG').innerText =
      data.aceleracaoG.toFixed(2);

    document.getElementById('picoAceleracaoG').innerText =
      data.picoAceleracaoG.toFixed(2);

    document.getElementById('picoG').innerText =
      data.picoG.toFixed(2);

    document.getElementById('pontosMPU').innerText =
      data.pontosMPU;

    document.getElementById('pontosVibracao').innerText =
      data.pontosVibracao;

    document.getElementById('pontosSom').innerText =
      data.pontosSom;

    document.getElementById('impacto').innerText =
      data.impacto ? 'DETECTADO' : 'NORMAL';

    document.getElementById('vibracao').innerText =
      data.vibracao ? 'DETECTADA' : 'NORMAL';

    document.getElementById('som').innerText =
      data.som ? 'DETECTADO' : 'NORMAL';

    document.getElementById('score').innerText =
      data.pontuacao + ' / 100';

    const score =
      document.getElementById('score');

    const status =
      document.getElementById('statusImpacto');

    if (data.impacto) {

      score.className =
        'score relevante';

      status.innerText =
        'IMPACTO RELEVANTE';

      status.className =
        'relevante';

    } else {

      score.className =
        'score normal';

      status.innerText =
        data.avaliando
          ? 'ANALISANDO EVENTO...'
          : 'NORMAL';

      status.className =
        'normal';
    }

    document.getElementById('latitude').innerText =
      data.latitude;

    document.getElementById('longitude').innerText =
      data.longitude;

    document.getElementById('altitude').innerText =
      data.altitude;

    document.getElementById('satelites').innerText =
      data.satelites;

    document.getElementById('hdop').innerText =
      data.hdop;

    const gpsEstado =
      document.getElementById('gpsEstado');

    if (data.gpsValido) {

      gpsEstado.innerText =
        'LOCALIZAÇÃO VÁLIDA';

      gpsEstado.className =
        'gps-valid';

      document.getElementById('maps').href =
        data.mapsUrl;

    } else {

      gpsEstado.innerText =
        'AGUARDANDO LOCALIZAÇÃO';

      gpsEstado.className =
        'gps-invalid';

      document.getElementById('maps').href =
        '#';
    }

    document.getElementById('log').innerText =
      data.log;

  })

  .catch(error => {

    console.log(error);

  });

}

function comando(cmd) {

  fetch('/comando?acao=' + cmd)

  .then(response => response.text())

  .then(data => {

    console.log(data);

    atualizarDados();

  });

}

function limparLog() {

  fetch('/limparlog')

  .then(() => {

    atualizarDados();

  });

}

function atualizarFirmware() {

  const arquivo =
    document.getElementById('firmware').files[0];

  if (!arquivo) {

    alert('Selecione um arquivo .bin');

    return;
  }

  const senha =
    prompt('Digite a senha de atualização OTA:');

  if (!senha) {

    return;
  }

  const xhr =
    new XMLHttpRequest();

  xhr.open(
    'POST',
    '/update',
    true
  );

  xhr.setRequestHeader(
    'X-OTA-Password',
    senha
  );

  xhr.upload.addEventListener(
    'progress',
    function(event) {

      if (event.lengthComputable) {

        const porcentagem =
          (event.loaded /
           event.total) * 100;

        document.getElementById(
          'progressBar'
        ).style.width =
          porcentagem + '%';
      }

    }
  );

  xhr.onload = function() {

    if (xhr.status === 200) {

      alert(
        'Atualização concluída. O ESP32 será reiniciado.'
      );

    } else {

      alert(
        'Erro na atualização: ' +
        xhr.responseText
      );

    }

  };

  xhr.send(arquivo);

}

setInterval(
  atualizarDados,
  500
);

atualizarDados();

</script>

</body>

</html>

)rawliteral";

  return html;
}

// ============================================================
// ROOT
// ============================================================

void handleRoot() {

  if (!autenticar()) {

    return;
  }

  server.send(
    200,
    "text/html",
    paginaHTML()
  );
}

// ============================================================
// GERAR JSON DOS DADOS
// ============================================================
// Esta função mantém exatamente os mesmos campos e valores
// usados anteriormente pela rota /dados.

String gerarJSONDados() {

  String json = "{";

  json += "\"wifi\":\"";

  json +=
    WiFi.status() == WL_CONNECTED
      ? "CONECTADO"
      : "DESCONECTADO";

  json += "\",";

  json += "\"ip\":\"";

  json += WiFi.localIP().toString();

  json += "\",";

  json += "\"detectar\":";

  json += detectar
    ? "true"
    : "false";

  json += ",";

  json += "\"aceleracao\":";

  json += String(
    aceleracaoTotal,
    2
  );

  json += ",";

  json += "\"aceleracaoG\":";

  json += String(
    aceleracaoG,
    2
  );

  json += ",";

  json += "\"picoAceleracaoG\":";

  json += String(
    picoAceleracaoG,
    2
  );

  json += ",";

  json += "\"picoG\":";

  json += String(
    picoEventoG,
    2
  );

  json += ",";

  json += "\"pontuacao\":";

  json += String(
    pontuacaoImpacto
  );

  json += ",";

  json += "\"pontosMPU\":";

  json += String(
    pontosMPU
  );

  json += ",";

  json += "\"pontosVibracao\":";

  json += String(
    pontosVibracao
  );

  json += ",";

  json += "\"pontosSom\":";

  json += String(
    pontosSom
  );

  json += ",";

  json += "\"avaliando\":";

  json += avaliandoImpacto
    ? "true"
    : "false";

  json += ",";

  json += "\"impacto\":";

  json += impactoDetectado
    ? "true"
    : "false";

  json += ",";

  json += "\"vibracao\":";

  json += vibracaoDetectada
    ? "true"
    : "false";

  json += ",";

  json += "\"som\":";

  json += somDetectado
    ? "true"
    : "false";

  json += ",";

  json += "\"gpsValido\":";

  json += gps.location.isValid()
    ? "true"
    : "false";

  json += ",";

  json += "\"latitude\":";

  if (gps.location.isValid()) {

    json += String(
      gps.location.lat(),
      6
    );

  } else {

    json += "0";
  }

  json += ",";

  json += "\"longitude\":";

  if (gps.location.isValid()) {

    json += String(
      gps.location.lng(),
      6
    );

  } else {

    json += "0";
  }

  json += ",";

  json += "\"altitude\":";

  if (gps.altitude.isValid()) {

    json += String(
      gps.altitude.meters(),
      2
    );

  } else {

    json += "0";
  }

  json += ",";

  json += "\"satelites\":";

  if (gps.satellites.isValid()) {

    json += String(
      gps.satellites.value()
    );

  } else {

    json += "0";
  }

  json += ",";

  json += "\"hdop\":";

  if (gps.hdop.isValid()) {

    json += String(
      gps.hdop.hdop(),
      2
    );

  } else {

    json += "0";
  }

  json += ",";

  json += "\"mapsUrl\":\"";

  if (gps.location.isValid()) {

    json +=
      "https://www.google.com/maps?q=";

    json += String(
      gps.location.lat(),
      6
    );

    json += ",";

    json += String(
      gps.location.lng(),
      6
    );
  }

  json += "\",";

  json += "\"log\":\"";

  for (
    int i = 0;
    i < logCount;
    i++
  ) {

    String linha =
      logs[i];

    linha.replace(
      "\\",
      "\\\\"
    );

    linha.replace(
      "\"",
      "\\\""
    );

    linha.replace(
      "\n",
      "\\n"
    );

    linha.replace(
      "\r",
      ""
    );

    json += linha;

    if (
      i <
      logCount - 1
    ) {

      json += "\\n";
    }
  }

  json += "\"";

  json += "}";
  return json;
}

// ============================================================
// DADOS
// ============================================================

void handleDados() {

  if (!autenticar()) {

    return;
  }

  String json = gerarJSONDados();

  server.send(
    200,
    "application/json",
    json
  );
}

// ============================================================
// ENVIAR DADOS PARA API
// ============================================================

void enviarDadosAPI() {

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  unsigned long agora = millis();

  if (agora - ultimoEnvioAPI < INTERVALO_API) {
    return;
  }

  ultimoEnvioAPI = agora;

  String json = gerarJSONDados();

  HTTPClient http;

  http.begin(apiURL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2000);

  int codigoHTTP = http.POST(json);

  if (codigoHTTP > 0) {
    Serial.print("API: dados enviados | HTTP ");
    Serial.println(codigoHTTP);
  } else {
    Serial.print("API: erro ao enviar dados: ");
    Serial.println(http.errorToString(codigoHTTP));
  }

  http.end();
}

// ============================================================
// COMANDOS
// ============================================================

void handleComando() {

  if (!autenticar()) {

    return;
  }

  if (!server.hasArg("acao")) {

    server.send(
      400,
      "text/plain",
      "Comando não informado."
    );

    return;
  }

  String acao =
    server.arg("acao");

  if (acao == "INICIAR") {

    detectar = true;

    adicionarLog(
      "Sistema de deteccao INICIADO."
    );

    server.send(
      200,
      "text/plain",
      "Deteccao iniciada."
    );
  }

  else if (acao == "PARAR") {

    detectar = false;

    vibracaoDetectada = false;

    somDetectado = false;

    impactoDetectado = false;

    avaliandoImpacto = false;

    pontuacaoImpacto = 0;

    picoEventoG = 0;

    adicionarLog(
      "Sistema de deteccao PARADO."
    );

    server.send(
      200,
      "text/plain",
      "Deteccao parada."
    );
  }

  else if (acao == "STATUS") {

    String status =

      "Deteccao: " +

      String(
        detectar
          ? "ATIVA"
          : "PARADA"
      ) +

      "\nIP: " +

      WiFi.localIP().toString() +

      "\nPontuacao: " +

      String(
        pontuacaoImpacto
      ) +

      "/100";

    server.send(
      200,
      "text/plain",
      status
    );
  }

  else {

    server.send(
      400,
      "text/plain",
      "Comando desconhecido."
    );
  }
}

// ============================================================
// LIMPAR LOG
// ============================================================

void handleLimparLog() {

  if (!autenticar()) {

    return;
  }

  logCount = 0;

  server.send(
    200,
    "text/plain",
    "Log limpo."
  );
}

// ============================================================
// OTA
// ============================================================

void handleUpdate() {

  HTTPUpload& upload =
    server.upload();

  if (
    server.header(
      "X-OTA-Password"
    ) != updatePassword
  ) {

    if (
      upload.status ==
      UPLOAD_FILE_START
    ) {

      Serial.println(
        "OTA: senha incorreta."
      );
    }

    return;
  }

  if (
    upload.status ==
    UPLOAD_FILE_START
  ) {

    Serial.printf(
      "OTA iniciando: %s\n",
      upload.filename.c_str()
    );

    if (
      !Update.begin(
        UPDATE_SIZE_UNKNOWN
      )
    ) {

      Update.printError(Serial);
    }
  }

  else if (
    upload.status ==
    UPLOAD_FILE_WRITE
  ) {

    if (
      Update.write(
        upload.buf,
        upload.currentSize
      )
      != upload.currentSize
    ) {

      Update.printError(Serial);
    }
  }

  else if (
    upload.status ==
    UPLOAD_FILE_END
  ) {

    if (
      Update.end(true)
    ) {

      Serial.printf(
        "OTA concluída: %u bytes\n",
        upload.totalSize
      );

    } else {

      Update.printError(Serial);
    }
  }
}

// ============================================================
// RESULTADO OTA
// ============================================================

void handleUpdateResult() {

  if (
    server.header(
      "X-OTA-Password"
    ) != updatePassword
  ) {

    server.send(
      401,
      "text/plain",
      "Senha OTA incorreta."
    );

    return;
  }

  if (Update.hasError()) {

    server.send(
      500,
      "text/plain",
      "Falha na atualização OTA."
    );

  } else {

    server.send(
      200,
      "text/plain",
      "Atualização concluída. Reiniciando..."
    );

    delay(1000);

    ESP.restart();
  }
}

// ============================================================
// ATUALIZAÇÃO DO GPS
// ============================================================

void atualizarGPS() {

  while (
    GPS_Serial.available() > 0
  ) {

    gps.encode(
      GPS_Serial.read()
    );
  }

  if (
    millis() -
    ultimaLeituraGPS >=
    INTERVALO_GPS
  ) {

    ultimaLeituraGPS =
      millis();

    Serial.println();

    Serial.println(
      "========== LOCALIZACAO =========="
    );

    if (
      gps.location.isValid()
    ) {

      Serial.print(
        "Latitude:  "
      );

      Serial.println(
        gps.location.lat(),
        6
      );

      Serial.print(
        "Longitude: "
      );

      Serial.println(
        gps.location.lng(),
        6
      );

      Serial.print(
        "Altitude:  "
      );

      if (
        gps.altitude.isValid()
      ) {

        Serial.print(
          gps.altitude.meters(),
          2
        );

      } else {

        Serial.print(
          "N/A"
        );
      }

      Serial.println(
        " m"
      );

      Serial.print(
        "Satélites: "
      );

      if (
        gps.satellites.isValid()
      ) {

        Serial.println(
          gps.satellites.value()
        );

      } else {

        Serial.println(
          "N/A"
        );
      }

      Serial.print(
        "HDOP:      "
      );

      if (
        gps.hdop.isValid()
      ) {

        Serial.println(
          gps.hdop.hdop(),
          2
        );

      } else {

        Serial.println(
          "N/A"
        );
      }

      Serial.print(
        "Google Maps: https://www.google.com/maps?q="
      );

      Serial.print(
        gps.location.lat(),
        6
      );

      Serial.print(",");

      Serial.println(
        gps.location.lng(),
        6
      );

    } else {

      Serial.println(
        "Localização ainda não disponível."
      );

      Serial.print(
        "Satélites: "
      );

      if (
        gps.satellites.isValid()
      ) {

        Serial.println(
          gps.satellites.value()
        );

      } else {

        Serial.println(
          "N/A"
        );
      }
    }

    Serial.println(
      "================================="
    );
  }
}

// ============================================================
// SETUP
// ============================================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();

  Serial.println(
    "================================="
  );

  Serial.println(
    "       INICIANDO ESP32"
  );

  Serial.println(
    "================================="
  );

  // ----------------------------------------------------------
  // Inicializa proteção de login
  // ----------------------------------------------------------

  for (
    int i = 0;
    i < MAX_IPS_BLOQUEADOS;
    i++
  ) {

    tentativas[i].usado =
      false;

    tentativas[i].tentativas =
      0;

    tentativas[i].bloqueadoAte =
      0;
  }

  // ----------------------------------------------------------
  // SW-420
  // ----------------------------------------------------------

  pinMode(
    sensorPin,
    INPUT
  );

  // ----------------------------------------------------------
  // FC-04
  // ----------------------------------------------------------

  pinMode(
    soundSensorPin,
    INPUT
  );

  // ----------------------------------------------------------
  // MPU6050
  // ----------------------------------------------------------

  Wire.begin(
    18,
    19
  );

  if (
    !mpu.begin()
  ) {

    Serial.println(
      "ERRO: MPU6050 não encontrado!"
    );

    while (true) {

      delay(1000);
    }
  }

  Serial.println(
    "MPU6050 encontrado."
  );

  // ----------------------------------------------------------
  // ±16 G
  // ----------------------------------------------------------

  mpu.setAccelerometerRange(
    MPU6050_RANGE_16_G
  );

  mpu.setGyroRange(
    MPU6050_RANGE_500_DEG
  );

  // ----------------------------------------------------------
  // Filtro alto para capturar impactos rápidos
  // ----------------------------------------------------------

  mpu.setFilterBandwidth(
    MPU6050_BAND_260_HZ
  );

  Serial.println(
    "MPU6050 configurado em +/-16G."
  );

  Serial.println(
    "Filtro: 260 Hz."
  );

  // ----------------------------------------------------------
  // GPS
  // ----------------------------------------------------------

  GPS_Serial.begin(
    9600,
    SERIAL_8N1,
    GPS_RX,
    GPS_TX
  );

  Serial.println(
    "GPS NEO-6M iniciado."
  );

  Serial.print(
    "GPS RX: GPIO "
  );

  Serial.println(
    GPS_RX
  );

  Serial.print(
    "GPS TX: GPIO "
  );

  Serial.println(
    GPS_TX
  );

  // ----------------------------------------------------------
  // WI-FI
  // ----------------------------------------------------------

  WiFi.mode(
    WIFI_STA
  );

  WiFi.setHostname(
    hostname
  );

  Serial.println();

  Serial.println(
    "Conectando ao Wi-Fi..."
  );

  Serial.print(
    "Rede: "
  );

  Serial.println(
    ssid
  );

  WiFi.begin(
    ssid,
    password
  );

  while (
    WiFi.status() !=
    WL_CONNECTED
  ) {

    delay(500);

    Serial.print(".");
  }

  Serial.println();

  Serial.println();

  Serial.println(
    "================================="
  );

  Serial.println(
    "        WIFI CONECTADO"
  );

  Serial.println(
    "================================="
  );

  Serial.print(
    "SSID: "
  );

  Serial.println(
    WiFi.SSID()
  );

  Serial.print(
    "IP DO ESP32: "
  );

  Serial.println(
    WiFi.localIP()
  );

  Serial.print(
    "Gateway: "
  );

  Serial.println(
    WiFi.gatewayIP()
  );

  Serial.print(
    "Mascara: "
  );

  Serial.println(
    WiFi.subnetMask()
  );

  Serial.print(
    "RSSI: "
  );

  Serial.print(
    WiFi.RSSI()
  );

  Serial.println(
    " dBm"
  );

  Serial.println(
    "================================="
  );

  Serial.print(
    "PAINEL WEB: http://"
  );

  Serial.println(
    WiFi.localIP()
  );

  Serial.println(
    "================================="
  );

  // ----------------------------------------------------------
  // HEADERS OTA
  // ----------------------------------------------------------

  server.collectHeaders(
    headerKeys,
    headerKeysCount
  );

  // ----------------------------------------------------------
  // ROTAS
  // ----------------------------------------------------------

  server.on(
    "/",
    HTTP_GET,
    handleRoot
  );

  server.on(
    "/dados",
    HTTP_GET,
    handleDados
  );

  server.on(
    "/comando",
    HTTP_GET,
    handleComando
  );

  server.on(
    "/limparlog",
    HTTP_GET,
    handleLimparLog
  );

  server.on(
    "/update",
    HTTP_POST,
    handleUpdateResult,
    handleUpdate
  );

  // ----------------------------------------------------------
  // INICIA SERVIDOR
  // ----------------------------------------------------------

  server.begin();

  Serial.println();

  Serial.println(
    "================================="
  );

  Serial.println(
    "      SERVIDOR WEB INICIADO"
  );

  Serial.print(
    "Acesse no navegador: http://"
  );

  Serial.println(
    WiFi.localIP()
  );

  Serial.println(
    "================================="
  );

  adicionarLog(
    "Sistema iniciado."
  );

  adicionarLog(
    "IP: " +
    WiFi.localIP().toString()
  );

  adicionarLog(
    "Sistema de pontuacao de impacto ativo."
  );

  adicionarLog(
    "MPU6050: +/-16G | Amostragem: ~200Hz"
  );

  adicionarLog(
    "SW-420: GPIO5 | FC-04: GPIO23"
  );
}

// ============================================================
// LOOP
// ============================================================

void loop() {

  // ----------------------------------------------------------
  // Servidor web
  // ----------------------------------------------------------

  server.handleClient();

  // Envia o mesmo JSON da rota /dados para a API externa
  enviarDadosAPI();

  // ----------------------------------------------------------
  // GPS
  // ----------------------------------------------------------

  atualizarGPS();

  // ----------------------------------------------------------
  // Sensores
  // ----------------------------------------------------------

  processarSensores();
}