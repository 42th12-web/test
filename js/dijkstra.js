// dijkstra.js — 직접 만든 최소 힙을 쓰는 다익스트라 알고리즘.
//
// 아직 확정되지 않은 정점 중 출발점에서 가장 가까운 정점을 힙에서 꺼내 확정하고,
// 그 정점을 거쳐 가는 길이 더 짧으면 이웃의 거리를 고친다.
// 비용이 모두 0 이상이므로 한 번 확정된 정점의 거리는 더 짧아지지 않는다.
// 시간 복잡도: O((V + E) log V)

import { MinHeap } from './heap.js';

// adjacency: Map<정점 id, [{ to, edgeId, cost }]> (인접 리스트)
// 돌려주는 값:
//   cost  — 출발점에서 도착점까지의 최소 비용 (갈 수 없으면 Infinity)
//   steps — 지나는 구간 [{ from, to, edgeId }] (갈 수 없으면 null)
//   order — 정점이 확정된 순서
export function dijkstra(adjacency, start, goal) {
  const dist = new Map([[start, 0]]);
  const prev = new Map();     // 정점 → 그 정점에 오기 직전의 { from, edgeId }
  const done = new Set();
  const order = [];
  const heap = new MinHeap();
  heap.push(start, 0);

  while (heap.size > 0) {
    const { value: node } = heap.pop();
    if (done.has(node)) continue;   // 더 긴 거리로 넣어 둔 옛 항목은 건너뛴다
    done.add(node);
    order.push(node);

    for (const { to, edgeId, cost } of adjacency.get(node) ?? []) {
      const next = dist.get(node) + cost;
      if (next < (dist.get(to) ?? Infinity)) {
        dist.set(to, next);
        prev.set(to, { from: node, edgeId });
        heap.push(to, next);
      }
    }
  }

  return {
    cost: dist.get(goal) ?? Infinity,
    steps: restoreSteps(prev, start, goal, dist),
    order,
  };
}

// 도착점에서 prev를 거꾸로 따라가 경로를 복원한다.
function restoreSteps(prev, start, goal, dist) {
  if (!dist.has(goal)) return null;
  const steps = [];
  let node = goal;
  while (node !== start) {
    const { from, edgeId } = prev.get(node);
    steps.unshift({ from, to: node, edgeId });
    node = from;
  }
  return steps;
}
