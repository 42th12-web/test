// measure.js — 측정 탭 화면. 버튼 동작과 결과 표시를 담당하고, 계산은 sensor.js에 맡긴다.

import {
  SIGNAL, analyzeSamples, computeCalibration, estimateSampleRate,
  listenToMotion, requestMotionPermission, requestWakeLock, startSimulatedMotion,
} from './sensor.js';
import {
  addMeasurement, downloadJson, importMeasurements, loadMeasurements, measurementsFor,
} from './storage.js';

const TEST_EDGE_ID = 'test';      // 지도에 없는 아무 길을 시험 측정할 때 쓰는 구간
const RECOMMENDED_RUNS = 3;       // 구간별 권장 측정 횟수
const SPEED_DIFF_LIMIT = 0.2;     // 이전 측정과 속도가 20% 넘게 다르면 경고
const SETTLE_MS = 1000;           // 보정 버튼을 누른 손이 떨어지기를 기다리는 시간
const CHART_SECONDS = 5;          // 실시간 그래프에 보여 줄 시간
const SENSOR_TIMEOUT_MS = 1500;   // 이 시간 안에 값이 안 들어오면 센서가 없는 것으로 본다

const el = (id) => document.getElementById(id);

const state = {
  graph: null,
  isListening: false,
  isDemo: false,      // 체험 모드면 결과를 저장하지 않는다
  calibration: null,
  isCalibrating: false,
  isRecording: false,
  samples: [],        // 측정 중 모으는 샘플
  buffer: null,       // 보정 중 모으는 샘플
  chartPoints: [],    // 실시간 그래프용 { t, value }
  latest: null,
  smoothed: null,     // 실시간 그래프에서 느린 변화를 빼기 위한 평균
  result: null,
  wakeLock: null,
};

function setMessage(id, text, kind = '') {
  const node = el(id);
  node.textContent = text;
  node.className = `msg${kind ? ` is-${kind}` : ''}`;
}

function selectedEdge() {
  const id = el('edgeSelect').value;
  if (id === TEST_EDGE_ID) {
    const length = Number(el('lengthInput').value);
    return { id, label: '테스트 구간', length: length > 0 ? length : null };
  }
  const edge = state.graph.edges.find((e) => e.id === id);
  return { ...edge, label: `${edge.fromName} ↔ ${edge.toName}` };
}

function selectedDirection() {
  return document.querySelector('input[name="direction"]:checked').value;
}

// ---------- 2단계: 구간 선택 ----------

function fillEdgeOptions() {
  const select = el('edgeSelect');
  const options = [new Option('테스트 구간 (아무 길)', TEST_EDGE_ID)];
  state.graph.edges.forEach((edge) => {
    options.push(new Option(`${edge.fromName} ↔ ${edge.toName} (${edge.length}m)`, edge.id));
  });
  select.replaceChildren(...options);
}

function updateEdgeFields() {
  const edge = selectedEdge();
  const isTest = edge.id === TEST_EDGE_ID;
  el('lengthField').hidden = !isTest;
  el('directionField').hidden = isTest;
  if (!isTest) {
    el('forwardLabel').textContent = `${edge.fromName} → ${edge.toName}`;
    el('reverseLabel').textContent = `${edge.toName} → ${edge.fromName}`;
  }
  updateCountInfo();
}

function updateCountInfo() {
  const count = measurementsFor(selectedEdge().id, selectedDirection()).length;
  el('countInfo').textContent = `이 구간 저장된 측정 ${count}회 (권장 ${RECOMMENDED_RUNS}회)`;
}

// ---------- 1단계: 센서 켜기 ----------

async function enableSensor() {
  const permission = await requestMotionPermission();
  if (permission === 'unsupported') {
    showNoSensor();
    return;
  }

  // 권한 응답과 실제 동작이 다른 브라우저가 있어서, 거부되어도 일단 값이 들어오는지 지켜본다
  setMessage('sensorMsg', '센서 확인 중…');
  // 버튼을 다시 눌러도 샘플이 두 번씩 들어오지 않도록 한 번만 연결한다
  if (!state.isListening) {
    state.isListening = true;
    listenToMotion(handleSample);
  }
  setTimeout(() => {
    if (state.latest) return;
    if (permission === 'granted') showNoSensor();
    else setMessage('sensorMsg', '센서 권한이 거부되었습니다. 브라우저를 다시 열고 허용해 주세요.', 'error');
  }, SENSOR_TIMEOUT_MS);
}

// 노트북처럼 센서가 없는 기기는 오류가 아니므로 쓸 수 있는 방법을 안내한다.
function showNoSensor() {
  setMessage('sensorMsg', '이 기기에서는 움직임 센서를 찾지 못했습니다. 측정은 휴대폰에서 하고, 여기서는 체험 모드를 쓰거나 데이터 탭에서 측정 파일을 가져올 수 있습니다.');
  el('sensorBadge').textContent = '센서 없음';
}

function startDemo() {
  state.isDemo = true;
  startSimulatedMotion(handleSample, () => state.isRecording);
}

function handleSample(sample) {
  if (!state.latest) onFirstSample();
  state.latest = sample;
  if (state.buffer) state.buffer.push(sample);
  if (state.isRecording) {
    state.samples.push(sample);
    pushChartPoint(sample);
  }
}

function onFirstSample() {
  setMessage('sensorMsg', state.isDemo ? '체험 모드입니다. 가짜 신호라서 결과는 저장되지 않습니다.' : '센서가 켜졌습니다.', 'ok');
  el('enableBtn').disabled = true;
  el('demoBtn').hidden = true;
  el('calibrateBtn').disabled = false;
  const badge = el('sensorBadge');
  badge.textContent = state.isDemo ? '체험 모드' : '센서 켜짐';
  badge.classList.add('is-on');
}

// ---------- 3단계: 보정 ----------

async function calibrate() {
  if (state.isCalibrating) return;
  state.isCalibrating = true;
  el('calibrateBtn').disabled = true;
  el('recordBtn').disabled = true;
  setMessage('calibrateMsg', '손을 떼세요…');

  await wait(SETTLE_MS);
  setMessage('calibrateMsg', '움직이지 마세요…');
  state.buffer = [];
  await wait(SIGNAL.CALIBRATION_SEC * 1000);
  const result = computeCalibration(state.buffer);
  state.buffer = null;
  state.isCalibrating = false;
  el('calibrateBtn').disabled = false;

  if (result.ok) {
    state.calibration = result;
    el('recordBtn').disabled = false;
    setMessage('calibrateMsg', `보정 완료 (중력 ${result.magnitude.toFixed(2)} m/s²)`, 'ok');
  } else {
    state.calibration = null;
    const reasons = {
      moved: '보정 중에 흔들렸습니다. 손을 떼고 다시 해 주세요.',
      'bad-gravity': '센서 값이 이상합니다. 다시 해 주세요.',
      'no-data': '센서 값이 들어오지 않았습니다. 다시 해 주세요.',
    };
    setMessage('calibrateMsg', reasons[result.reason], 'error');
  }
}

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// ---------- 4단계: 측정 ----------

async function toggleRecording() {
  if (state.isRecording) await stopRecording();
  else await startRecording();
}

async function startRecording() {
  el('resultCard').hidden = true;
  state.result = null;
  state.samples = [];
  state.chartPoints = [];
  state.smoothed = null;
  state.isRecording = true;

  const button = el('recordBtn');
  button.textContent = '측정 종료';
  button.classList.add('is-recording');
  el('calibrateBtn').disabled = true;
  requestAnimationFrame(renderLive);   // 화면 켜짐 요청을 기다리지 않고 그래프부터 시작한다

  state.wakeLock = await requestWakeLock();
  el('recordMsg').textContent = state.wakeLock || state.isDemo
    ? ''
    : '화면 켜짐 유지를 쓸 수 없습니다. 측정 중 화면이 꺼지지 않게 주의해 주세요.';
}

async function stopRecording() {
  state.isRecording = false;
  await state.wakeLock?.release();
  state.wakeLock = null;

  const button = el('recordBtn');
  button.textContent = '측정 시작';
  button.classList.remove('is-recording');
  el('calibrateBtn').disabled = false;

  const edge = selectedEdge();
  const analysis = analyzeSamples(state.samples, state.calibration, { lengthM: edge.length });
  state.result = analysis;
  showResult(analysis, edge);
}

// 화면이 다시 보이면 꺼진 화면 유지 기능을 다시 요청한다 (앱을 잠시 가리면 풀린다).
async function reacquireWakeLock() {
  if (state.isRecording && document.visibilityState === 'visible') {
    state.wakeLock = await requestWakeLock();
  }
}

// 그래프에는 중력을 뺀 수직 진동만 그린다. 평균을 조금씩 따라가게 해서 느린 변화를 없앤다.
function pushChartPoint(sample) {
  const { gravity, magnitude } = state.calibration;
  const vertical = (sample.x * gravity.x + sample.y * gravity.y + sample.z * gravity.z) / magnitude - magnitude;
  state.smoothed = state.smoothed === null ? vertical : state.smoothed * 0.95 + vertical * 0.05;
  state.chartPoints.push({ t: sample.t, value: vertical - state.smoothed });
  const oldest = sample.t - CHART_SECONDS;
  while (state.chartPoints[0].t < oldest) state.chartPoints.shift();
}

function renderLive() {
  if (!state.isRecording) return;
  const { samples } = state;
  if (samples.length > 1) {
    el('elapsedText').textContent = `${(samples[samples.length - 1].t - samples[0].t).toFixed(1)}초`;
    el('rateText').textContent = `${estimateSampleRate(samples).toFixed(0)} Hz`;
  }
  drawChart();
  requestAnimationFrame(renderLive);
}

function drawChart() {
  const canvas = el('liveChart');
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.documentElement);
  const range = SIGNAL.BUMP_THRESHOLD * 2;   // 그래프 위아래 끝이 ±6 m/s²
  const toY = (value) => height / 2 - (value / range) * (height / 2);

  // 빨간 점선은 턱으로 세는 기준선
  ctx.strokeStyle = styles.getPropertyValue('--chart-limit');
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  [SIGNAL.BUMP_THRESHOLD, -SIGNAL.BUMP_THRESHOLD].forEach((limit) => {
    ctx.moveTo(0, toY(limit));
    ctx.lineTo(width, toY(limit));
  });
  ctx.stroke();
  ctx.setLineDash([]);

  const points = state.chartPoints;
  if (points.length < 2) return;
  const latest = points[points.length - 1].t;
  ctx.strokeStyle = styles.getPropertyValue('--chart-line');
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  points.forEach((point, i) => {
    const x = width - ((latest - point.t) / CHART_SECONDS) * width;
    const y = Math.min(height, Math.max(0, toY(point.value)));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// ---------- 결과 ----------

function metricHtml(label, value, unit = '') {
  return `<div class="metric"><span class="label">${label}</span><strong>${value}</strong><small>${unit}</small></div>`;
}

function buildWarnings(analysis, edge) {
  const warnings = [];
  if (state.isDemo) warnings.push('체험 모드의 가짜 신호로 계산한 값이라 저장되지 않습니다.');
  if (analysis.hasGap) warnings.push('측정 중 센서가 끊겼습니다. 화면이 꺼지지 않게 하고 다시 측정해 주세요.');
  if (analysis.avgSpeed) {
    const previous = measurementsFor(edge.id, selectedDirection()).filter((m) => m.avgSpeed);
    if (previous.length > 0) {
      const average = previous.reduce((sum, m) => sum + m.avgSpeed, 0) / previous.length;
      if (Math.abs(analysis.avgSpeed - average) / average > SPEED_DIFF_LIMIT) {
        warnings.push(`이전 측정 평균 속도(${average.toFixed(2)} m/s)와 차이가 큽니다. 속도가 다르면 진동 값도 달라집니다.`);
      }
    }
  }
  return warnings;
}

function showResult(analysis, edge) {
  const card = el('resultCard');
  card.hidden = false;
  const warningList = el('warnings');
  const isUsable = !analysis.tooShort;
  el('saveBtn').disabled = !isUsable || state.isDemo;
  el('rawBtn').hidden = state.isDemo;

  if (analysis.tooShort) {
    el('metrics').innerHTML = metricHtml('측정 시간', analysis.durationSec, '초');
    const minimum = SIGNAL.TRIM_SEC * 2 + SIGNAL.MIN_ANALYZED_SEC;
    const item = document.createElement('li');
    item.textContent = `측정이 너무 짧습니다. ${minimum}초 이상 측정해 주세요.`;
    warningList.replaceChildren(item);
  } else {
    const count = measurementsFor(edge.id, selectedDirection()).length;
    el('metrics').innerHTML = [
      metricHtml('진동 RMS', analysis.rmsVibration, 'm/s²'),
      metricHtml('턱·충격', analysis.bumpCount, '회'),
      metricHtml('평균 경사', analysis.avgSlopePct, '%'),
      metricHtml('최대 경사', analysis.maxSlopePct, '%'),
      metricHtml('평균 속도', analysis.avgSpeed ?? '—', 'm/s'),
      metricHtml('저장된 측정', count, '회'),
    ].join('');
    warningList.replaceChildren(...buildWarnings(analysis, edge).map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
  }
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 2026-11-02T10:12:00+09:00 처럼 휴대폰 현지 시각으로 적는다.
function localTimestamp(date = new Date()) {
  const pad = (n) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

function saveResult() {
  const edge = selectedEdge();
  const { tooShort, hasGap, ...values } = state.result;
  const saved = addMeasurement({
    edgeId: edge.id,
    direction: selectedDirection(),
    timestamp: localTimestamp(),
    ...values,
    device: navigator.userAgent,
  });
  if (!saved) {
    const item = document.createElement('li');
    item.textContent = '저장하지 못했습니다. 사생활 보호 모드가 아닌지 확인해 주세요.';
    el('warnings').append(item);
    return;
  }
  el('resultCard').hidden = true;
  state.result = null;
  updateCountInfo();
  updateSavedCount();
}

function exportRaw() {
  downloadJson(`raw-${selectedEdge().id}-${Date.now()}.json`, {
    edgeId: selectedEdge().id,
    direction: selectedDirection(),
    calibration: state.calibration,
    samples: state.samples,
  });
}

// ---------- 데이터 탭의 저장 개수, 내보내기와 가져오기 ----------

function updateSavedCount() {
  const count = loadMeasurements().length;
  el('savedCount').textContent = count > 0 ? `저장된 측정 ${count}개` : '저장된 측정이 없습니다.';
  el('exportBtn').disabled = count === 0;
}

// 휴대폰에서 내보낸 파일을 노트북 등 다른 기기로 옮겨 올 때 쓴다.
async function importFile(event) {
  const [file] = event.target.files;
  event.target.value = '';   // 같은 파일을 다시 골라도 동작하도록 비운다
  if (!file) return;
  try {
    const { added, duplicates } = importMeasurements(JSON.parse(await file.text()));
    setMessage('importMsg', `${added}개를 가져왔습니다. (이미 있는 ${duplicates}개 제외)`, 'ok');
  } catch {
    setMessage('importMsg', '측정 데이터 파일이 아닙니다. 이 앱에서 내보낸 JSON 파일을 골라 주세요.', 'error');
  }
  updateCountInfo();
  updateSavedCount();
}

export function initMeasure(graph) {
  state.graph = graph;
  fillEdgeOptions();
  updateEdgeFields();
  updateSavedCount();

  el('enableBtn').addEventListener('click', enableSensor);
  el('demoBtn').addEventListener('click', startDemo);
  el('edgeSelect').addEventListener('change', updateEdgeFields);
  document.querySelectorAll('input[name="direction"]').forEach((radio) => {
    radio.addEventListener('change', updateCountInfo);
  });
  el('calibrateBtn').addEventListener('click', calibrate);
  el('recordBtn').addEventListener('click', toggleRecording);
  el('saveBtn').addEventListener('click', saveResult);
  el('retryBtn').addEventListener('click', () => { el('resultCard').hidden = true; });
  el('rawBtn').addEventListener('click', exportRaw);
  el('exportBtn').addEventListener('click', () => downloadJson('measurements.json', loadMeasurements()));
  el('importBtn').addEventListener('click', () => el('importInput').click());
  el('importInput').addEventListener('change', importFile);
  document.addEventListener('visibilitychange', reacquireWakeLock);
}
