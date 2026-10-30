// route.test.js — 최소 힙, 다익스트라, 비용 계산을 확인한다. (npm test)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dijkstra } from '../js/dijkstra.js';
import {
  VEHICLES, buildAdjacency, buildArcs, costFunction, distanceMeters, isPassable,
  measuredCost, summarizeMeasurements,
} from '../js/graph.js';
import { MinHeap } from '../js/heap.js';

const adjacencyOf = (entries) => new Map(Object.entries(entries));
const edge = (to, cost) => ({ to, edgeId: `to-${to}`, cost });
const nodesOf = (result) => result.steps.map((step) => step.to);

const surface = (values = {}) => ({
  runs: 3, rms: 1, rmsStd: 0, bumps: 0, avgSlope: 0, maxSlope: 0, ...values,
});
const arcOf = (values) => ({
  edgeId: 'e1', from: 'a', to: 'b', length: 100, surface: surface(values),
});

test('힙은 작은 값부터 꺼낸다', () => {
  const heap = new MinHeap();
  [5, 1, 9, 3, 7, 3, 0].forEach((n) => heap.push(n, n));
  const popped = [];
  while (heap.size > 0) popped.push(heap.pop().value);
  assert.deepEqual(popped, [0, 1, 3, 3, 5, 7, 9]);
});

test('빈 힙에서 꺼내면 null이다', () => {
  assert.equal(new MinHeap().pop(), null);
});

test('무작위 값 1000개도 정렬된 순서로 나온다', () => {
  const values = Array.from({ length: 1000 }, () => Math.random());
  const heap = new MinHeap();
  values.forEach((v) => heap.push(v, v));
  const popped = values.map(() => heap.pop().value);
  assert.deepEqual(popped, [...values].sort((a, b) => a - b));
});

test('직접 가는 길보다 싼 우회로를 고른다', () => {
  const adjacency = adjacencyOf({
    a: [edge('b', 10), edge('c', 1)],
    c: [edge('b', 2)],
  });
  const result = dijkstra(adjacency, 'a', 'b');
  assert.equal(result.cost, 3);
  assert.deepEqual(nodesOf(result), ['c', 'b']);
});

test('정점은 가까운 순서로 확정된다', () => {
  const adjacency = adjacencyOf({
    a: [edge('b', 5), edge('c', 1)],
    c: [edge('d', 1)],
  });
  assert.deepEqual(dijkstra(adjacency, 'a', 'b').order, ['a', 'c', 'd', 'b']);
});

test('갈 수 없으면 비용은 무한대, 경로는 null이다', () => {
  const result = dijkstra(adjacencyOf({ a: [edge('b', 1)] }), 'a', 'z');
  assert.equal(result.cost, Infinity);
  assert.equal(result.steps, null);
});

test('좌표 사이 거리를 계산한다 (위도 1도 ≈ 111km)', () => {
  const meters = distanceMeters({ lat: 37, lng: 127 }, { lat: 38, lng: 127 });
  assert.ok(Math.abs(meters - 111195) < 100);
});

test('비용 공식을 그대로 계산한다', () => {
  const arc = arcOf({ rms: 2, bumps: 3, avgSlope: 2 });
  // 100 × (1 + 0.5×2 + 0.3×2) + 20×3
  assert.ok(Math.abs(measuredCost(arc, VEHICLES.wheelchair) - 320) < 1e-9);
});

test('내리막에는 내리막 계수를 쓴다', () => {
  const arc = arcOf({ rms: 0, avgSlope: -2 });
  // 100 × (1 + 0.1×2)
  assert.ok(Math.abs(measuredCost(arc, VEHICLES.wheelchair) - 120) < 1e-9);
});

test('1/12를 넘는 경사는 휠체어·유모차만 막는다', () => {
  const steep = arcOf({ maxSlope: 10 });
  assert.equal(isPassable(steep, VEHICLES.wheelchair), false);
  assert.equal(isPassable(steep, VEHICLES.stroller), false);
  assert.equal(isPassable(steep, VEHICLES.bicycle), true);
});

test('한 방향만 측정하면 반대 방향은 경사 부호를 뒤집는다', () => {
  const graph = { edges: [{ id: 'e1', from: 'a', to: 'b', length: 100 }] };
  const summaries = summarizeMeasurements([{
    edgeId: 'e1', direction: 'forward', rmsVibration: 1, bumpCount: 2, avgSlopePct: 3, maxSlopePct: 4,
  }]);
  const [forward, reverse] = buildArcs(graph, summaries);
  assert.equal(forward.surface.avgSlope, 3);
  assert.equal(reverse.surface.avgSlope, -3);
  assert.equal(reverse.surface.bumps, 2);
  assert.deepEqual([reverse.from, reverse.to], ['b', 'a']);
});

test('미측정 구간은 측정된 구간의 평균 수준이다', () => {
  const measured = arcOf({ rms: 2 });
  const unmeasured = { ...measured, edgeId: 'e2', surface: null };
  const costOf = costFunction([measured, unmeasured], VEHICLES.wheelchair);
  assert.equal(costOf(unmeasured), costOf(measured));
});

test('예시 데이터에서 이동수단에 따라 추천 경로가 달라진다', () => {
  const graph = JSON.parse(readFileSync('data/graph.json', 'utf8'));
  const { measurements } = JSON.parse(readFileSync('data/measurements.json', 'utf8'));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  graph.edges.forEach((e) => { e.length = distanceMeters(nodeById.get(e.from), nodeById.get(e.to)); });
  const arcs = buildArcs(graph, summarizeMeasurements(measurements));

  const routeOf = (vehicle) => {
    const result = dijkstra(buildAdjacency(arcs, costFunction(arcs, vehicle)), 'n1', 'n10');
    return nodesOf(result).join('-');
  };
  const routes = new Set(Object.values(VEHICLES).map(routeOf));
  assert.ok(routes.size >= 2);
});
