// EC-OptiSim 시뮬레이션 엔진
// -----------------------------------------------------------------------
// 아래 상수(V0, Rcell, kRem)는 실제 문헌값을 그대로 가져온 것이 아니라
// 전형적인 소형 전기응집 셀의 거동을 재현하기 위한 '교육용 예시 값'이다.
// 패러데이 법칙(전극 소모량)만 물리적으로 엄밀하고, 나머지 계수는
// 그래프의 형태(비용이 J에 따라 커지고, 제거율이 S자형으로 포화되는 모습)를
// 재현하도록 조정된 illustrative parameter이다.
// -----------------------------------------------------------------------

export const FARADAY = 96485; // C/mol

export const MATERIALS = {
  Al: { label: "알루미늄 (Al)", M: 26.98, z: 3 },
  Fe: { label: "철 (Fe)", M: 55.85, z: 2 },
};

const V0 = 1.8; // V, 표준 기전력 (예시값)
const R_CELL = 0.06; // Ohm, 셀 내부 저항 (예시값)
const K_REM = 500; // 제거율 반응 계수 (예시값, L/g 단위) — J가 수십 A/m² 대일 때
// 목표 제거율(80~95%)에 도달하도록 보정한 값. 문헌값이 아닌 illustrative 상수.
const PENALTY_WEIGHT = 4.5e6;

/**
 * 주어진 전류밀도 J(A/m^2)에서의 공정 성능을 계산한다.
 */
export function evaluateJ(J, params) {
  const { area, Q_Lmin, material, elecPrice, electrodePrice, target } = params;
  const { M, z } = MATERIALS[material];

  const I = J * area; // A
  const V = V0 + I * R_CELL; // V (정상상태, 부동태화 미포함)
  const P_kW = (I * V) / 1000; // kW
  const elecCostPerHour = P_kW * elecPrice; // 원/h

  const mDot = (I * M) / (z * FARADAY); // g/s
  const kgPerHour = (mDot * 3600) / 1000; // kg/h
  const electrodeCostPerHour = kgPerHour * electrodePrice; // 원/h

  const cost = elecCostPerHour + electrodeCostPerHour; // 원/h

  const Q_Ls = Q_Lmin / 60; // L/s
  const Reff = 1 - Math.exp(-K_REM * (mDot / Q_Ls)); // 0~1

  const deficit = Math.max(0, target - Reff);
  const penalty = PENALTY_WEIGHT * deficit * deficit;

  return { I, V, cost, Reff, mDot, total: cost + penalty };
}

/**
 * 경사하강법(수치 미분 기반)으로 목적함수를 최소화하는 J*를 탐색한다.
 * 목적함수 = 운영비용 + 목표 제거율 미달 패널티
 * → 비용은 J에 대해 단조증가, 제거율도 단조증가이므로
 *   패널티가 '목표를 만족하는 최소 J'로 수렴을 유도한다.
 */
export function gradientDescentOptimize(params) {
  const h = 0.05; // 수치미분 스텝
  const maxJ = 400;
  let J = 10; // 초기값
  const history = [];

  // 패널티 항 때문에 목적함수의 기울기 크기가 영역에 따라 수 자릿수씩
  // 요동친다 (패널티 영역에서는 매우 가파르고, 순수 비용 영역에서는 완만함).
  // 그래서 기울기 '크기'를 그대로 학습률에 곱하면 한 스텝만에 탐색범위
  // 끝까지 튕겨나갈 수 있다. 대신 기울기의 '부호'만 사용해 방향을 정하고,
  // 스텝 크기는 매 반복마다 기하급수적으로 감쇠시키는 경사하강법을 쓴다
  // (RProp류의 부호 기반 경사하강법).
  let step = maxJ / 3;
  const decay = 0.965;

  for (let i = 0; i < 320; i++) {
    const fPlus = evaluateJ(Math.min(J + h, maxJ), params).total;
    const fMinus = evaluateJ(Math.max(J - h, 0.01), params).total;
    const grad = (fPlus - fMinus) / (2 * h);

    J = J - step * Math.sign(grad);
    J = Math.max(0.1, Math.min(maxJ, J));
    step *= decay;

    history.push(J);
  }

  // 안전장치: 이산 스텝 특성상 목표 제거율에 아주 살짝 못 미치거나
  // 넘치는 경우, 미세 보정으로 경계값에 최대한 가깝게 맞춘다.
  let result = evaluateJ(J, params);
  let guard = 0;
  while (result.Reff < params.target && J < maxJ && guard < 2000) {
    J += 0.05;
    result = evaluateJ(J, params);
    guard++;
  }
  guard = 0;
  while (J > 0.1) {
    const next = evaluateJ(Math.max(0.1, J - 0.05), params);
    if (next.Reff < params.target || guard >= 2000) break;
    J = Math.max(0.1, J - 0.05);
    result = next;
    guard++;
  }

  return { J, history, result };
}

/**
 * J*를 기반으로 시간 축(0~720h) 동적 시뮬레이션을 수행한다.
 * - 부동태화: V(t) = V0 + I*Rcell + kPass * t_accum
 * - 전압이 임계값 이상이면 역극성 전환 (t_accum 리셋)
 * - 전극 질량은 패러데이 법칙에 따라 지속적으로 감소
 */
export function runDynamicSimulation(J, params) {
  const { area, material, initialMassKg, kPass, vThreshold } = params;
  const { M, z } = MATERIALS[material];

  const I = J * area;
  const mDot = (I * M) / (z * FARADAY); // g/s
  const kgPerHour = (mDot * 3600) / 1000;

  const totalHours = 720;
  const dt = 1; // hour

  let tAccum = 0;
  let cumMassLost = 0;
  let reversalCount = 0;
  let alarmTime = null;
  let alarmTriggered = false;
  let polarity = 0; // 0: 초기 극성, 1: 역극성 전환 후

  const series = [];

  for (let t = 0; t <= totalHours; t += dt) {
    const V = V0 + I * R_CELL + kPass * tAccum;

    cumMassLost += kgPerHour * dt;
    const massRemaining = Math.max(0, initialMassKg - cumMassLost);
    const remainingPct = (massRemaining / initialMassKg) * 100;

    if (!alarmTriggered && remainingPct <= 20) {
      alarmTriggered = true;
      alarmTime = t;
    }

    series.push({
      t,
      V: Number(V.toFixed(3)),
      remainingPct: Number(remainingPct.toFixed(2)),
      polarity,
    });

    tAccum += dt;
    if (V >= vThreshold) {
      tAccum = 0;
      reversalCount++;
      polarity = polarity === 0 ? 1 : 0;
    }
  }

  return { series, reversalCount, alarmTime, I, mDot, kgPerHour };
}

/**
 * J vs (비용, 제거율) 커브 데이터를 생성한다 (그래프용).
 */
export function buildCostCurve(params, jMax = 60, steps = 40) {
  const data = [];
  for (let i = 0; i <= steps; i++) {
    const J = (jMax * i) / steps + 0.1;
    const { cost, Reff } = evaluateJ(J, params);
    data.push({ J: Number(J.toFixed(1)), cost: Number(cost.toFixed(1)), removal: Number((Reff * 100).toFixed(1)) });
  }
  return data;
}
