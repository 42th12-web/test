// sensor.test.js — 가짜 센서 신호를 만들어 신호 처리 결과를 확인한다. (npm test)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SIGNAL, analyzeSamples, computeCalibration, countBumps, movingAverage, rms,
} from '../js/sensor.js';

const G = 9.81;
const RATE = 60;
const FLAT = { x: 0, y: 0, z: G };

// seconds초 동안의 샘플을 만든다. at(t)는 그 시각의 벡터 {x, y, z}를 돌려준다.
function makeSamples(seconds, at) {
  const samples = [];
  for (let i = 0; i <= seconds * RATE; i += 1) {
    const t = i / RATE;
    samples.push({ t, ...at(t) });
  }
  return samples;
}

// 앞이 경사 percent%만큼 들린 자세의 중력 벡터. mountDeg는 휴대폰을 붙인 기울기.
function tilted(percent, mountDeg = 0) {
  const angle = Math.atan(percent / 100) + (mountDeg * Math.PI) / 180;
  return { x: 0, y: G * Math.sin(angle), z: G * Math.cos(angle) };
}

function calibrationOf(gravity) {
  return computeCalibration(makeSamples(2, () => gravity));
}

test('이동 평균은 일정한 값을 그대로 둔다', () => {
  assert.deepEqual(movingAverage([2, 2, 2, 2, 2], 3), [2, 2, 2, 2, 2]);
});

test('이동 평균은 양 끝에서 있는 값만 평균한다', () => {
  assert.deepEqual(movingAverage([0, 3, 6], 3), [1.5, 3, 4.5]);
});

test('사인파의 RMS는 진폭 / √2 이다', () => {
  const wave = Array.from({ length: 600 }, (_, i) => 2 * Math.sin((2 * Math.PI * i) / 30));
  assert.ok(Math.abs(rms(wave) - 2 / Math.SQRT2) < 0.01);
});

test('턱은 0.3초 안에 다시 세지 않는다', () => {
  const times = [0, 0.1, 0.2, 0.5, 1.0];
  assert.equal(countBumps([5, 5, 5, 5, 0], times, 3), 2);
});

test('임계값 아래의 진동은 턱이 아니다', () => {
  assert.equal(countBumps([1, -2, 2.9], [0, 1, 2], 3), 0);
});

test('정지 상태면 보정에 성공한다', () => {
  const result = computeCalibration(makeSamples(2, () => FLAT));
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.magnitude - G) < 1e-9);
});

test('흔들리면 보정에 실패한다', () => {
  const shaking = makeSamples(2, (t) => ({ ...FLAT, z: G + 2 * Math.sin(t * 40) }));
  const result = computeCalibration(shaking);
  assert.deepEqual([result.ok, result.reason], [false, 'moved']);
});

test('중력 크기가 이상하면 보정에 실패한다', () => {
  const result = computeCalibration(makeSamples(2, () => ({ x: 0, y: 0, z: 1 })));
  assert.deepEqual([result.ok, result.reason], [false, 'bad-gravity']);
});

test('매끄러운 평지는 진동·턱·경사가 모두 0이다', () => {
  const result = analyzeSamples(makeSamples(20, () => FLAT), calibrationOf(FLAT));
  assert.equal(result.rmsVibration, 0);
  assert.equal(result.bumpCount, 0);
  assert.equal(result.avgSlopePct, 0);
  assert.equal(result.maxSlopePct, 0);
});

test('진동이 크면 RMS도 커진다', () => {
  const vibrating = (amplitude) => makeSamples(20, (t) => ({
    ...FLAT, z: G + amplitude * Math.sin(2 * Math.PI * 15 * t),
  }));
  const small = analyzeSamples(vibrating(0.5), calibrationOf(FLAT));
  const large = analyzeSamples(vibrating(2), calibrationOf(FLAT));
  assert.ok(Math.abs(large.rmsVibration - 2 / Math.SQRT2) < 0.1);
  assert.ok(large.rmsVibration > small.rmsVibration * 3);
});

test('측정 구간 안의 턱 3개를 센다', () => {
  const hits = [5, 10, 15];
  const samples = makeSamples(20, (t) => ({
    ...FLAT, z: G + (hits.some((hit) => Math.abs(t - hit) < 0.02) ? 8 : 0),
  }));
  assert.equal(analyzeSamples(samples, calibrationOf(FLAT)).bumpCount, 3);
});

test('시작·종료 버튼을 누를 때의 충격은 세지 않는다', () => {
  const samples = makeSamples(20, (t) => ({
    ...FLAT, z: G + (t < 0.5 || t > 19.5 ? 8 : 0),
  }));
  assert.equal(analyzeSamples(samples, calibrationOf(FLAT)).bumpCount, 0);
});

test('오르막은 +, 내리막은 − 경사로 나온다', () => {
  const up = analyzeSamples(makeSamples(20, () => tilted(5)), calibrationOf(FLAT));
  const down = analyzeSamples(makeSamples(20, () => tilted(-5)), calibrationOf(FLAT));
  assert.equal(up.avgSlopePct, 5);
  assert.equal(down.avgSlopePct, -5);
});

test('센서 부호가 반대인 기기(iOS)도 경사가 같다', () => {
  const flip = ({ x, y, z }) => ({ x: -x, y: -y, z: -z });
  const samples = makeSamples(20, () => flip(tilted(5)));
  const result = analyzeSamples(samples, calibrationOf(flip(FLAT)));
  assert.equal(result.avgSlopePct, 5);
});

test('휴대폰을 비스듬히 붙여도 경사가 같다', () => {
  const samples = makeSamples(20, () => tilted(5, 30));
  const result = analyzeSamples(samples, calibrationOf(tilted(0, 30)));
  assert.equal(result.avgSlopePct, 5);
});

test('출발할 때의 가속 때문에 평지가 통행 불가 경사로 나오지 않는다', () => {
  // 1초 동안 1.2 m/s²로 가속. 그대로 계산하면 경사 12%처럼 보인다.
  const samples = makeSamples(20, (t) => ({ ...FLAT, y: t < 1 ? 1.2 : 0 }));
  const result = analyzeSamples(samples, calibrationOf(FLAT));
  assert.ok(Math.abs(result.maxSlopePct) < 8.33);
});

test('걸음에 따른 앞뒤 흔들림은 최대 경사를 키우지 않는다', () => {
  const samples = makeSamples(20, (t) => ({ ...FLAT, y: 1.5 * Math.sin(2 * Math.PI * 2 * t) }));
  const result = analyzeSamples(samples, calibrationOf(FLAT));
  assert.ok(Math.abs(result.maxSlopePct) < 1);
});

test('평균 속도는 길이 ÷ 측정 시간이다', () => {
  const result = analyzeSamples(makeSamples(20, () => FLAT), calibrationOf(FLAT), { lengthM: 25 });
  assert.equal(result.avgSpeed, 1.25);
});

test('길이를 모르면 평균 속도는 비워 둔다', () => {
  const result = analyzeSamples(makeSamples(20, () => FLAT), calibrationOf(FLAT));
  assert.equal(result.avgSpeed, null);
});

test('너무 짧은 측정은 결과를 내지 않는다', () => {
  const seconds = SIGNAL.TRIM_SEC * 2 + SIGNAL.MIN_ANALYZED_SEC - 1;
  const result = analyzeSamples(makeSamples(seconds, () => FLAT), calibrationOf(FLAT));
  assert.equal(result.tooShort, true);
});

test('샘플이 크게 끊기면 표시한다', () => {
  const samples = makeSamples(20, () => FLAT).filter((s) => s.t < 8 || s.t > 10);
  assert.equal(analyzeSamples(samples, calibrationOf(FLAT)).hasGap, true);
});
