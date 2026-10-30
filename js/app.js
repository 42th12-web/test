// app.js — 앱 시작점. 탭 전환과 초기화를 담당한다.

import { loadGraph, loadMeasurements } from './graph.js';
import { initRoute, refreshMaps } from './route.js';

const tabs = document.querySelectorAll('.tab');

function showTab(name) {
  tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.hidden = panel.id !== `tab-${name}`;
  });
  window.scrollTo(0, 0);
  refreshMaps();
}

tabs.forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

const [graph, measurements] = await Promise.all([loadGraph(), loadMeasurements()]);
initRoute(graph, measurements);
