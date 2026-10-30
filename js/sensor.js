// sensor.js — 가속도 센서 수집과 신호 처리.
//
// 위쪽은 화면과 상관없는 "계산" 함수들이라 node로 바로 시험할 수 있다 (tests/sensor.test.js).
// 아래쪽 "브라우저 전용" 부분만 휴대폰의 센서와 화면 켜짐 기능을 다룬다.
//
// 샘플 하나의 형식: { t: 초, x, y, z: m/s² }

export const SIGNAL = {
  CALIBRATION_SEC: 2,         // 보정 때 정지 상태를 기록하는 시간
  CALIBRATION_MAX_STD: 0.3,   // 보정 중 흔들림 허용치 (m/s²). 이보다 크면 움직인 것으로 본다
  GRAVITY_MIN: 8.8,           // 중력 크기가 이 범위를 벗어나면 센서 값을 믿지 않는다
  GRAVITY_MAX: 10.8,
  HIGH_PASS_WINDOW_SEC: 0.5,  // 이 길이의 이동 평균을 빼서 진동만 남긴다
  SLOPE_WINDOW_SEC: 3,        // 경사 계산용 이동 평균. 걸음에 따른 흔들림을 없애려고 길게 잡았다
  TRIM_SEC: 2,                // 앞뒤로 버리는 시간. 버튼 터치와 출발·정지 가속을 없앤다
  MIN_ANALYZED_SEC: 2,        // 앞뒤를 버린 뒤 최소한 남아야 하는 시간
  BUMP_THRESHOLD: 3,          // 턱·충격으로 셀 진동 세기 (m/s²)
  BUMP_LOCKOUT_SEC: 0.3,      // 한 번 감지한 뒤 다시 세지 않는 시간 (중복 방지)
  MAX_SLOPE_PERCENTILE: 0.95, // 순간적으로 튀는 값을 제외하고 상위 95% 지점을 최대 경사로 쓴다
  MAX_GAP_SEC: 0.5,           // 샘플 사이 간격이 이보다 크면 측정이 끊긴 것으로 본다
};

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function magnitude(v) {
  return Math.sqrt(dot(v, v));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

// 초당 샘플 수. 기기마다 달라서 실제 기록된 값으로 계산한다.
export function estimateSampleRate(samples) {
  if (samples.length < 2) return 0;
  const duration = samples[samples.length - 1].t - samples[0].t;
  return duration > 0 ? (samples.length - 1) / duration : 0;
}

// 가운데 정렬 이동 평균. 누적 합을 미리 구해 두어 O(n)에 계산한다.
// 양 끝에서는 창이 잘리므로 있는 값만으로 평균을 낸다.
export function movingAverage(values, windowSize) {
  const half = Math.floor(windowSize / 2);
  const prefix = [0];
  for (const value of values) prefix.push(prefix[prefix.length - 1] + value);
  return values.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    return (prefix[end] - prefix[start]) / (end - start);
  });
}

export function rms(values) {
  return Math.sqrt(mean(values.map((value) => value * value)));
}

// 진동 절댓값이 임계값을 넘는 횟수를 센다. 감지 후 lockoutSec 동안은 세지 않는다.
export function countBumps(vibration, times, threshold, lockoutSec = SIGNAL.BUMP_LOCKOUT_SEC) {
  let count = 0;
  let lastBumpTime = -Infinity;
  vibration.forEach((value, i) => {
    if (Math.abs(value) > threshold && times[i] - lastBumpTime >= lockoutSec) {
      count += 1;
      lastBumpTime = times[i];
    }
  });
  return count;
}

// 각도 차이를 -π ~ π 범위로 맞춘다.
function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// 경사(%)의 시간별 변화.
// 휴대폰의 앞뒤가 들리면 중력 벡터가 y-z 평면에서 그만큼 돈다. 그래서 보정 자세의 각도와의
// 차이를 구하면 기울기 θ가 된다. 차이를 쓰기 때문에 아이폰처럼 센서 값의 부호가 반대인
// 기기에서도, 휴대폰을 비스듬히 붙였을 때도 결과가 같다.
export function slopeSeries(samples, gravity, windowSize) {
  const lowY = movingAverage(samples.map((s) => s.y), windowSize);
  const lowZ = movingAverage(samples.map((s) => s.z), windowSize);
  const baseAngle = Math.atan2(gravity.y, gravity.z);
  return samples.map((_, i) => {
    const theta = wrapAngle(Math.atan2(lowY[i], lowZ[i]) - baseAngle);
    return Math.tan(theta) * 100;
  });
}

// 절댓값 기준으로 percentile 지점에 있는 값을 부호와 함께 돌려준다.
function signedPercentile(values, percentile) {
  const sorted = [...values].sort((a, b) => Math.abs(a) - Math.abs(b));
  return sorted[Math.floor(percentile * (sorted.length - 1))];
}

// 보정: 정지 상태의 평균 벡터가 "기준 중력"이 된다.
export function computeCalibration(samples) {
  if (samples.length === 0) return { ok: false, reason: 'no-data' };
  const gravity = {
    x: mean(samples.map((s) => s.x)),
    y: mean(samples.map((s) => s.y)),
    z: mean(samples.map((s) => s.z)),
  };
  const size = magnitude(gravity);
  const magnitudes = samples.map(magnitude);
  const average = mean(magnitudes);
  const std = Math.sqrt(mean(magnitudes.map((m) => (m - average) ** 2)));
  if (std > SIGNAL.CALIBRATION_MAX_STD) return { ok: false, reason: 'moved' };
  if (size < SIGNAL.GRAVITY_MIN || size > SIGNAL.GRAVITY_MAX) return { ok: false, reason: 'bad-gravity' };
  return { ok: true, gravity, magnitude: size };
}

// 구간 하나의 측정값 전체를 계산한다.
export function analyzeSamples(samples, calibration, options = {}) {
  const { lengthM = null, bumpThreshold = SIGNAL.BUMP_THRESHOLD } = options;
  const durationSec = samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 0;
  const sampleRateHz = estimateSampleRate(samples);

  if (durationSec < SIGNAL.TRIM_SEC * 2 + SIGNAL.MIN_ANALYZED_SEC) {
    return { tooShort: true, durationSec: round(durationSec, 1), sampleRateHz: round(sampleRateHz, 1) };
  }

  // 1. 앞뒤를 잘라 버튼 터치와 출발·정지 구간을 뺀다
  const startTime = samples[0].t + SIGNAL.TRIM_SEC;
  const endTime = samples[samples.length - 1].t - SIGNAL.TRIM_SEC;
  const body = samples.filter((s) => s.t >= startTime && s.t <= endTime);
  const times = body.map((s) => s.t);

  // 2. 수직 성분 a_v = dot(a, ĝ₀) - |g₀|
  const { gravity, magnitude: gravitySize } = calibration;
  const unit = { x: gravity.x / gravitySize, y: gravity.y / gravitySize, z: gravity.z / gravitySize };
  const vertical = body.map((s) => dot(s, unit) - gravitySize);

  // 3. 이동 평균을 빼서 느린 변화를 없애고 진동만 남긴다
  const highPassWindow = Math.max(1, Math.round(sampleRateHz * SIGNAL.HIGH_PASS_WINDOW_SEC));
  const trend = movingAverage(vertical, highPassWindow);
  const vibration = vertical.map((value, i) => value - trend[i]);

  // 4. 경사
  const slopeWindow = Math.max(1, Math.round(sampleRateHz * SIGNAL.SLOPE_WINDOW_SEC));
  const slopes = slopeSeries(body, gravity, slopeWindow);

  // 샘플 사이가 크게 벌어졌으면 화면이 꺼졌거나 앱이 가려진 것이다
  let maxGapSec = 0;
  for (let i = 1; i < samples.length; i += 1) {
    maxGapSec = Math.max(maxGapSec, samples[i].t - samples[i - 1].t);
  }

  return {
    tooShort: false,
    durationSec: round(durationSec, 1),
    sampleRateHz: round(sampleRateHz, 1),
    avgSpeed: lengthM ? round(lengthM / durationSec) : null,
    rmsVibration: round(rms(vibration)),
    bumpCount: countBumps(vibration, times, bumpThreshold),
    avgSlopePct: round(mean(slopes), 1),
    maxSlopePct: round(signedPercentile(slopes, SIGNAL.MAX_SLOPE_PERCENTILE), 1),
    hasGap: maxGapSec > SIGNAL.MAX_GAP_SEC,
  };
}

// ---------- 여기부터 브라우저 전용 ----------

// iOS 등은 사용자가 버튼을 누른 순간에 이 함수를 불러야 권한 창이 뜬다.
export async function requestMotionPermission() {
  if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
  if (typeof DeviceMotionEvent.requestPermission !== 'function') return 'granted';
  try {
    return await DeviceMotionEvent.requestPermission();
  } catch {
    return 'denied';
  }
}

// 센서 값이 들어올 때마다 onSample을 부른다. 돌려주는 함수를 부르면 수집을 멈춘다.
export function listenToMotion(onSample) {
  const handler = (event) => {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    const time = event.timeStamp || performance.now();
    onSample({ t: time / 1000, x: a.x, y: a.y, z: a.z });
  };
  window.addEventListener('devicemotion', handler);
  return () => window.removeEventListener('devicemotion', handler);
}

// 체험 모드: 센서가 없는 노트북에서도 측정 화면을 보여 주기 위한 가짜 신호.
// 3% 오르막을 진동과 함께 지나가고 3초마다 턱을 하나 넘는다. isMoving()이 거짓이면 정지 상태다.
export function startSimulatedMotion(onSample, isMoving) {
  const GRAVITY = 9.81;
  const timer = setInterval(() => {
    const t = performance.now() / 1000;
    const moving = isMoving();
    const angle = moving ? Math.atan(0.03) : 0;
    const shake = moving ? 1.2 * Math.sin(2 * Math.PI * 11 * t) + 0.3 * (Math.random() - 0.5) : 0;
    const bump = moving && t % 3 < 0.03 ? 6 : 0;
    onSample({
      t,
      x: 0,
      y: GRAVITY * Math.sin(angle),
      z: GRAVITY * Math.cos(angle) + shake + bump,
    });
  }, 1000 / 60);
  return () => clearInterval(timer);
}

// 측정 중 화면이 꺼지지 않게 한다. 지원하지 않으면 null을 돌려준다.
export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return null;
  try {
    return await navigator.wakeLock.request('screen');
  } catch {
    return null;
  }
}
