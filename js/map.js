// map.js — Leaflet 지도에 그래프와 경로를 그린다. L은 index.html에서 불러온 Leaflet이다.

// 색은 CSS 변수에서 읽어 화면 테마와 맞춘다.
function color(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function createMap(elementId, graph) {
  const map = L.map(elementId);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const bounds = L.latLngBounds(graph.nodes.map((node) => [node.lat, node.lng]));
  const overlay = L.layerGroup().addTo(map);
  map.fitBounds(bounds, { padding: [24, 24] });

  const latLngs = (step) => [step.from, step.to].map((id) => {
    const node = nodeById.get(id);
    return [node.lat, node.lng];
  });

  const addNodes = () => {
    graph.nodes.forEach((node) => {
      L.circleMarker([node.lat, node.lng], {
        radius: 5, color: color('--ink'), weight: 2, fillColor: color('--surface'), fillOpacity: 1,
      })
        .bindTooltip(node.name, { permanent: true, direction: 'top', className: 'node-label' })
        .addTo(overlay);
    });
  };

  return {
    // 탭이 숨겨져 있는 동안 크기를 잴 수 없어서, 탭을 열 때 다시 맞춘다.
    refresh() {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24] });
    },

    // 길찾기 지도: 모든 길을 옅게 깔고 두 경로를 겹쳐 그린다.
    drawRoutes(shortestSteps, bestSteps) {
      overlay.clearLayers();
      graph.edges.forEach((edge) => {
        L.polyline(latLngs(edge), { color: color('--map-base'), weight: 3 }).addTo(overlay);
      });
      (bestSteps ?? []).forEach((step) => {
        L.polyline(latLngs(step), { color: color('--route-best'), weight: 8, opacity: 0.9 }).addTo(overlay);
      });
      (shortestSteps ?? []).forEach((step) => {
        L.polyline(latLngs(step), { color: color('--route-short'), weight: 3, dashArray: '6 8' }).addTo(overlay);
      });
      addNodes();
    },

    // 노면 지도: levelOf(간선)로 정한 색으로 칠한다.
    drawSurface(levelOf) {
      overlay.clearLayers();
      graph.edges.forEach((edge) => {
        const level = levelOf(edge);
        L.polyline(latLngs(edge), {
          color: color(`--surface-${level}`),
          weight: 6,
          dashArray: level === 'blocked' ? '8 8' : null,
        }).addTo(overlay);
      });
      addNodes();
    },
  };
}
