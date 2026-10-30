// storage.js — 측정 결과를 브라우저에 저장하고 파일로 내보낸다.

const MEASUREMENTS_KEY = 'bakwigil.measurements.v1';

export function loadMeasurements() {
  try {
    return JSON.parse(localStorage.getItem(MEASUREMENTS_KEY)) ?? [];
  } catch {
    return [];
  }
}

// 저장에 성공하면 true. 사생활 보호 모드 등에서는 실패할 수 있다.
export function addMeasurement(measurement) {
  try {
    const all = loadMeasurements();
    all.push(measurement);
    localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

// 같은 구간, 같은 방향의 측정만 골라낸다.
export function measurementsFor(edgeId, direction) {
  return loadMeasurements().filter((m) => m.edgeId === edgeId && m.direction === direction);
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
