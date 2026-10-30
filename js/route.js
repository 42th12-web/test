// route.js — 길찾기 화면과 노면 지도 화면.

import { dijkstra } from './dijkstra.js';
import {
  VEHICLES, buildAdjacency, buildArcs, costFunction, summarizeMeasurements,
  summarizeRoute, surfaceLevel,
} from './graph.js';
import { createMap } from './map.js';

const el = (id) => document.getElementById(id);

const state = { graph: null, arcs: null, routeMap: null, surfaceMap: null };

function selectedVehicle() {
  return VEHICLES[document.querySelector('input[name="vehicle"]:checked').value];
}

function formatRow(label, shortest, best) {
  return `<tr><th scope="row">${label}</th><td>${shortest}</td><td>${best}</td></tr>`;
}

function formatVibration(value) {
  return value === null ? '—' : `${value.toFixed(2)} m/s²`;
}

// "최단 경로보다 32m 길지만 턱 3개를 피합니다" 같은 한 줄 요약을 만든다.
function summaryText(shortest, best, vehicle) {
  const extra = Math.round(best.length - shortest.length);
  const gains = [];
  if (shortest.blocked > 0) gains.push(`통행 불가 구간 ${shortest.blocked}곳`);
  const bumpsAvoided = Math.round(shortest.bumps - best.bumps);
  if (bumpsAvoided > 0) gains.push(`턱 ${bumpsAvoided}개`);
  const particle = bumpsAvoided > 0 ? '를' : '을';   // '개를', '곳을'
  const gainText = gains.length > 0 ? `${gains.join(', ')}${particle} 피합니다` : '노면이 더 편합니다';
  if (extra === 0) return `${vehicle.label}로는 최단 경로와 거리가 같고 ${gainText}.`;
  return `최단 경로보다 ${extra}m 길지만 ${gainText}.`;
}

function renderRoute() {
  const { arcs, routeMap } = state;
  const vehicle = selectedVehicle();
  const start = el('startSelect').value;
  const goal = el('goalSelect').value;
  const result = el('routeResult');

  if (start === goal) {
    routeMap.drawRoutes(null, null);
    result.hidden = true;
    el('routeMsg').textContent = '출발지와 도착지를 다르게 골라 주세요.';
    return;
  }

  // 같은 다익스트라를 가중치만 바꿔 두 번 실행한다.
  const shortest = dijkstra(buildAdjacency(arcs, (arc) => arc.length), start, goal);
  const best = dijkstra(buildAdjacency(arcs, costFunction(arcs, vehicle)), start, goal);
  routeMap.drawRoutes(shortest.steps, best.steps);

  if (!best.steps) {
    result.hidden = true;
    el('routeMsg').textContent = `${vehicle.label}로 지나갈 수 있는 경로가 없습니다.`;
    return;
  }

  const a = summarizeRoute(shortest.steps, arcs, vehicle);
  const b = summarizeRoute(best.steps, arcs, vehicle);
  const isSameRoute = shortest.steps.map((s) => s.edgeId).join() === best.steps.map((s) => s.edgeId).join();
  el('routeMsg').textContent = isSameRoute
    ? `${vehicle.label}에는 가장 짧은 길이 가장 편한 길입니다.`
    : summaryText(a, b, vehicle);

  el('compareBody').innerHTML = [
    formatRow('거리', `${Math.round(a.length)}m`, `${Math.round(b.length)}m`),
    formatRow('턱·충격', `${Math.round(a.bumps)}개`, `${Math.round(b.bumps)}개`),
    formatRow('최대 경사', `${a.maxSlope.toFixed(1)}%`, `${b.maxSlope.toFixed(1)}%`),
    formatRow('평균 진동', formatVibration(a.vibration), formatVibration(b.vibration)),
    formatRow('통행 불가', `${a.blocked}곳`, `${b.blocked}곳`),
  ].join('');
  el('unmeasuredNote').textContent = b.unmeasured > 0
    ? `추천 경로에 측정되지 않은 구간이 ${b.unmeasured}곳 있습니다.`
    : '';
  result.hidden = false;
}

function renderSurface() {
  const { graph, arcs, surfaceMap } = state;
  const vehicle = selectedVehicle();
  const levelLabels = {
    good: '편함', fair: '보통', poor: '불편', unmeasured: '미측정', blocked: '통행 불가',
  };
  const levelOf = (edge) => {
    const [forward, reverse] = arcs.filter((arc) => arc.edgeId === edge.id);
    return surfaceLevel(forward, reverse, vehicle);
  };
  surfaceMap.drawSurface(levelOf);
  el('surfaceVehicle').textContent = `${vehicle.label} 기준`;

  el('surfaceBody').replaceChildren(...graph.edges.map((edge) => {
    const { surface } = arcs.find((arc) => arc.edgeId === edge.id);
    const cells = [
      `${edge.fromName} ↔ ${edge.toName}`,
      levelLabels[levelOf(edge)],
      surface ? `${surface.rms.toFixed(2)} ± ${surface.rmsStd.toFixed(2)}` : '—',
      surface ? surface.bumps.toFixed(1) : '—',
      surface ? `${surface.maxSlope.toFixed(1)}%` : '—',
      surface ? `${surface.runs}회` : '0회',
    ];
    const row = document.createElement('tr');
    cells.forEach((text) => {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    });
    return row;
  }));
}

function renderAll() {
  renderRoute();
  renderSurface();
}

export function initRoute(graph, measurements) {
  state.graph = graph;
  state.arcs = buildArcs(graph, summarizeMeasurements(measurements));
  state.routeMap = createMap('routeMap', graph);
  state.surfaceMap = createMap('surfaceMap', graph);

  const nodeOptions = () => graph.nodes.map((node) => new Option(node.name, node.id));
  el('startSelect').replaceChildren(...nodeOptions());
  el('goalSelect').replaceChildren(...nodeOptions());
  el('goalSelect').selectedIndex = graph.nodes.length - 1;
  el('exampleBadge').hidden = !graph.example;

  ['startSelect', 'goalSelect'].forEach((id) => el(id).addEventListener('change', renderRoute));
  document.querySelectorAll('input[name="vehicle"]').forEach((radio) => {
    radio.addEventListener('change', renderAll);
  });
  renderAll();
}

// 탭을 열 때 지도 크기를 다시 맞춘다.
export function refreshMaps() {
  state.routeMap?.refresh();
  state.surfaceMap?.refresh();
}
