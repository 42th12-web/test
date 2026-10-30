// storage.test.js — 측정 데이터를 합치는 규칙을 확인한다. (npm test)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeMeasurements } from '../js/storage.js';

const run = (timestamp, edgeId = 'e1') => ({
  edgeId, direction: 'forward', timestamp, rmsVibration: 1.2,
});

test('새 측정을 기존 목록 뒤에 붙인다', () => {
  const merged = mergeMeasurements([run('t1')], [run('t2')]);
  assert.deepEqual(merged.map((m) => m.timestamp), ['t1', 't2']);
});

test('같은 측정은 두 번 넣지 않는다', () => {
  assert.equal(mergeMeasurements([run('t1')], [run('t1')]).length, 1);
});

test('가져올 파일 안의 중복도 하나만 넣는다', () => {
  assert.equal(mergeMeasurements([], [run('t1'), run('t1')]).length, 1);
});

test('시각이 같아도 구간이 다르면 다른 측정이다', () => {
  assert.equal(mergeMeasurements([run('t1', 'e1')], [run('t1', 'e2')]).length, 2);
});

test('측정 데이터가 아니면 거부한다', () => {
  assert.throws(() => mergeMeasurements([], { edgeId: 'e1' }));
  assert.throws(() => mergeMeasurements([], [{ name: '다른 파일' }]));
});
