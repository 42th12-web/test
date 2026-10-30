// graph.js — 학교 지도를 정점과 간선으로 표현한 데이터를 다룬다.
// 실제 학교로 바꿀 때는 data/graph.json만 교체하면 된다.

const EARTH_RADIUS_M = 6371000;

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
