// graph.js — 학교 지도를 정점과 간선으로 표현한 데이터를 다룬다.
// 실제 학교로 바꿀 때는 data/graph.json만 교체하면 된다.

const EARTH_RADIUS_M = 6371000;

// 이동수단별 가중치. 초기값이며 실측 후 조정한다.
//   vibration: 진동 RMS 1 m/s²당, uphill·downhill: 경사 1%당 추가되는 길이 배수
//   bump: 턱 하나의 추가 비용 (m로 환산)
//   maxSlopePct: 이 값을 넘는 구간은 지나가지 않는다. 1/12는 국내 장애인 편의시설의 경사로 기준이다.
export const VEHICLES = {
  wheelchair: { label: '휠체어', vibration: 0.5, uphill: 0.30, downhill: 0.10, bump: 20, maxSlopePct: 100 / 12 },
  stroller: { label: '유모차', vibration: 0.6, uphill: 0.10, downhill: 0.05, bump: 10, maxSlopePct: 100 / 12 },
  bicycle: { label: '자전거', vibration: 0.3, uphill: 0.20, downhill: 0.02, bump: 8, maxSlopePct: Infinity },
};

const DEFAULT_UNMEASURED_FACTOR = 1.5;  // 측정된 구간이 하나도 없을 때의 배수
const SURFACE_LEVELS = { fair: 2, poor: 3.2 };  // 길이당 비용이 이 값 이상이면 보통, 불편

// 두 좌표 사이의 거리(m). 하버사인 공식.
export function distanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// graph.json을 읽는다. 간선에 length가 없으면 양 끝 좌표로 계산해 넣는다.
export async function loadGraph() {
  const response = await fetch('data/graph.json');
  if (!response.ok) throw new Error(`graph.json을 읽지 못했습니다 (${response.status})`);
  const graph = await response.json();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  graph.edges.forEach((edge) => {
    edge.fromName = nodeById.get(edge.from).name;
    edge.toName = nodeById.get(edge.to).name;
    edge.length ??= Math.round(distanceMeters(nodeById.get(edge.from), nodeById.get(edge.to)));
  });
  return graph;
}

// 측정값 파일을 읽는다. 측정 도구에서 내보낸 배열도, { measurements: [...] } 형식도 받는다.
export async function loadMeasurements() {
  const response = await fetch('data/measurements.json');
  if (!response.ok) throw new Error(`measurements.json을 읽지 못했습니다 (${response.status})`);
  const data = await response.json();
  return data.measurements ?? data;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

// 같은 구간·방향의 반복 측정을 평균 낸다. 결과의 키는 "e3|forward" 형식이다.
export function summarizeMeasurements(measurements) {
  const groups = new Map();
  measurements.forEach((m) => {
    const key = `${m.edgeId}|${m.direction}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  const summaries = new Map();
  groups.forEach((runs, key) => {
    summaries.set(key, {
      runs: runs.length,
      rms: mean(runs.map((m) => m.rmsVibration)),
      rmsStd: standardDeviation(runs.map((m) => m.rmsVibration)),
      bumps: mean(runs.map((m) => m.bumpCount)),
      avgSlope: mean(runs.map((m) => m.avgSlopePct)),
      maxSlope: mean(runs.map((m) => Math.abs(m.maxSlopePct))),
    });
  });
  return summaries;
}

// 간선 하나를 양방향 호(arc) 두 개로 나눈다. 오르막과 내리막의 비용이 다르기 때문이다.
// 한 방향만 측정했으면 반대 방향은 경사 부호를 뒤집고 진동·턱은 그대로 쓴다.
export function buildArcs(graph, summaries) {
  const directions = [
    { direction: 'forward', opposite: 'reverse' },
    { direction: 'reverse', opposite: 'forward' },
  ];
  return graph.edges.flatMap((edge) => directions.map(({ direction, opposite }) => {
    const own = summaries.get(`${edge.id}|${direction}`);
    const other = summaries.get(`${edge.id}|${opposite}`);
    const surface = own ?? (other ? { ...other, avgSlope: -other.avgSlope } : null);
    const isForward = direction === 'forward';
    return {
      edgeId: edge.id,
      from: isForward ? edge.from : edge.to,
      to: isForward ? edge.to : edge.from,
      length: edge.length,
      surface,
    };
  }));
}

// 경사 기준을 넘으면 양방향 모두 막는다. 가파른 내리막도 위험하기 때문이다.
// 측정 안 된 구간은 판단할 수 없으므로 막지 않고, 화면에서 따로 경고한다.
export function isPassable(arc, vehicle) {
  return !arc.surface || arc.surface.maxSlope <= vehicle.maxSlopePct;
}

// 비용 = 길이 × (1 + a·R + b·S_up + b_down·S_down) + c·B
export function measuredCost(arc, vehicle) {
  const { rms, bumps, avgSlope } = arc.surface;
  const up = Math.max(avgSlope, 0);
  const down = Math.max(-avgSlope, 0);
  const factor = 1 + vehicle.vibration * rms + vehicle.uphill * up + vehicle.downhill * down;
  return arc.length * factor + vehicle.bump * bumps;
}

// 호를 비용으로 바꾸는 함수를 만든다. 지나갈 수 없는 호는 null이다.
// 측정 안 된 구간은 측정된 구간의 평균 수준으로 본다. 고정값을 쓰면 측정된 길보다 싸져서
// 경로가 측정 안 한 길로 몰리기 때문이다.
export function costFunction(arcs, vehicle) {
  const measured = arcs.filter((arc) => arc.surface);
  const unmeasuredFactor = measured.length > 0
    ? mean(measured.map((arc) => measuredCost(arc, vehicle) / arc.length))
    : DEFAULT_UNMEASURED_FACTOR;
  return (arc) => {
    if (!isPassable(arc, vehicle)) return null;
    return arc.surface ? measuredCost(arc, vehicle) : arc.length * unmeasuredFactor;
  };
}

// 호 목록으로 인접 리스트를 만든다. weightOf가 null을 주는 호는 뺀다.
export function buildAdjacency(arcs, weightOf) {
  const adjacency = new Map();
  arcs.forEach((arc) => {
    const cost = weightOf(arc);
    if (cost === null) return;
    if (!adjacency.has(arc.from)) adjacency.set(arc.from, []);
    adjacency.get(arc.from).push({ to: arc.to, edgeId: arc.edgeId, cost });
  });
  return adjacency;
}

// 경로의 호들을 합쳐 화면에 보여 줄 값을 계산한다.
export function summarizeRoute(steps, arcs, vehicle) {
  const routeArcs = steps.map((step) => arcs.find((arc) => (
    arc.edgeId === step.edgeId && arc.from === step.from
  )));
  const measured = routeArcs.filter((arc) => arc.surface);
  const measuredLength = measured.reduce((sum, arc) => sum + arc.length, 0);
  return {
    length: routeArcs.reduce((sum, arc) => sum + arc.length, 0),
    bumps: measured.reduce((sum, arc) => sum + arc.surface.bumps, 0),
    maxSlope: measured.reduce((largest, arc) => Math.max(largest, arc.surface.maxSlope), 0),
    vibration: measuredLength > 0
      ? measured.reduce((sum, arc) => sum + arc.surface.rms * arc.length, 0) / measuredLength
      : null,
    blocked: routeArcs.filter((arc) => !isPassable(arc, vehicle)).length,
    unmeasured: routeArcs.length - measured.length,
  };
}

// 노면 지도의 색. 양방향 중 더 나쁜 쪽을 기준으로 한다.
export function surfaceLevel(forwardArc, reverseArc, vehicle) {
  if (!forwardArc.surface) return 'unmeasured';
  if (!isPassable(forwardArc, vehicle) || !isPassable(reverseArc, vehicle)) return 'blocked';
  const costPerMeter = Math.max(
    measuredCost(forwardArc, vehicle) / forwardArc.length,
    measuredCost(reverseArc, vehicle) / reverseArc.length,
  );
  if (costPerMeter >= SURFACE_LEVELS.poor) return 'poor';
  return costPerMeter >= SURFACE_LEVELS.fair ? 'fair' : 'good';
}
