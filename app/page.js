"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import ControlSlider from "@/components/ControlSlider";
import StatCard from "@/components/StatCard";
import {
  gradientDescentOptimize,
  runDynamicSimulation,
  buildCostCurve,
  MATERIALS,
} from "@/lib/simulation";

function SectionLabel({ children }) {
  return (
    <div className="text-[11px] tracking-wide text-ink-500 border-b border-graphite-700 pb-2 mb-4">
      {children}
    </div>
  );
}

function ChartPanel({ title, children }) {
  return (
    <div className="border border-graphite-700 bg-graphite-900/40 p-4">
      <div className="text-[13px] text-ink-300 mb-3">{title}</div>
      <div style={{ width: "100%", height: 260 }}>{children}</div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#1c2124",
  border: "1px solid #333a3f",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
};

export default function Page() {
  const [Q_Lmin, setQ] = useState(15);
  const [target, setTarget] = useState(0.9);
  const [material, setMaterial] = useState("Al");
  const [area, setArea] = useState(0.3);
  const [elecPrice, setElecPrice] = useState(150);
  const [electrodePrice, setElectrodePrice] = useState(9000);
  const [initialMassKg, setInitialMassKg] = useState(5);
  const [kPass, setKPass] = useState(0.012);
  const [vThreshold, setVThreshold] = useState(8);

  const params = useMemo(
    () => ({
      Q_Lmin,
      target,
      material,
      area,
      elecPrice,
      electrodePrice,
      initialMassKg,
      kPass,
      vThreshold,
    }),
    [Q_Lmin, target, material, area, elecPrice, electrodePrice, initialMassKg, kPass, vThreshold]
  );

  const optimization = useMemo(() => gradientDescentOptimize(params), [params]);
  const dynamic = useMemo(
    () => runDynamicSimulation(optimization.J, params),
    [optimization.J, params]
  );
  const costCurve = useMemo(
    () => buildCostCurve(params, Math.max(30, optimization.J * 1.8)),
    [params, optimization.J]
  );

  const replacementLabel =
    dynamic.alarmTime === null ? "720h 이내 미도달" : `${dynamic.alarmTime}h 시점`;

  return (
    <main className="min-h-screen bg-graphite-950 px-6 py-8 md:px-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-ink-100">EC-OptiSim</h1>
          <p className="text-[13px] text-ink-500 mt-1">
            패러데이 법칙 · 경사하강법 · 동적 부동태화 모델 기반 전기응집 공정 시뮬레이터
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          <StatCard
            label="최적 전류밀도 J*"
            value={optimization.J.toFixed(1)}
            unit="A/m²"
            accent="patina"
            sub={`제거율 ${(optimization.result.Reff * 100).toFixed(1)}%`}
          />
          <StatCard
            label="운영비용"
            value={optimization.result.cost.toFixed(0)}
            unit="원/h"
            accent="amber"
          />
          <StatCard
            label="역극성 전환 횟수 (720h)"
            value={dynamic.reversalCount}
            unit="회"
            accent="teal"
          />
          <StatCard
            label="전극 교체 알람"
            value={replacementLabel}
            accent="rust"
            sub="잔존량 20% 도달 시점"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar controls */}
          <aside className="border border-graphite-700 bg-graphite-900/40 p-5 h-fit">
            <SectionLabel>공정 조건</SectionLabel>
            <ControlSlider
              label="유량 Q"
              value={Q_Lmin}
              unit="L/min"
              min={1}
              max={50}
              step={1}
              onChange={setQ}
            />
            <ControlSlider
              label="목표 제거율"
              value={Math.round(target * 100)}
              unit="%"
              min={60}
              max={99}
              step={1}
              onChange={(v) => setTarget(v / 100)}
            />
            <div className="mb-5">
              <div className="text-[13px] text-ink-300 mb-1.5">전극 재질</div>
              <div className="flex gap-2">
                {Object.entries(MATERIALS).map(([key, m]) => (
                  <button
                    key={key}
                    onClick={() => setMaterial(key)}
                    className={`px-3 py-1.5 text-[12px] border ${
                      material === key
                        ? "border-patina-500 text-patina-400 bg-patina-500/10"
                        : "border-graphite-600 text-ink-500"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <SectionLabel>전극 조건</SectionLabel>
            <ControlSlider
              label="전극 면적 A"
              value={area}
              unit="m²"
              min={0.05}
              max={1}
              step={0.01}
              onChange={setArea}
              format={(v) => v.toFixed(2)}
            />
            <ControlSlider
              label="초기 전극 질량"
              value={initialMassKg}
              unit="kg"
              min={1}
              max={20}
              step={0.5}
              onChange={setInitialMassKg}
            />
            <ControlSlider
              label="부동태화 계수 k_pass"
              value={kPass}
              unit="V/h"
              min={0.001}
              max={0.05}
              step={0.001}
              onChange={setKPass}
              format={(v) => v.toFixed(3)}
            />
            <ControlSlider
              label="전압 임계값"
              value={vThreshold}
              unit="V"
              min={3}
              max={15}
              step={0.5}
              onChange={setVThreshold}
            />

            <SectionLabel>경제성 조건</SectionLabel>
            <ControlSlider
              label="전기 단가"
              value={elecPrice}
              unit="원/kWh"
              min={100}
              max={300}
              step={5}
              onChange={setElecPrice}
            />
            <ControlSlider
              label="전극 단가"
              value={electrodePrice}
              unit="원/kg"
              min={3000}
              max={20000}
              step={500}
              onChange={setElectrodePrice}
            />

            <div className="text-[11px] text-ink-500 mt-6 pt-4 border-t border-graphite-700 leading-relaxed">
              V₀, R_cell, k_rem 등 일부 물리 상수는 실측 문헌값이 아닌 교육용 예시값입니다.
              패러데이 법칙에 따른 전극 소모량 계산만 엄밀합니다.
            </div>
          </aside>

          {/* Charts */}
          <div className="flex flex-col gap-6">
            <ChartPanel title="전류밀도(J)별 운영비용 · 제거율">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={costCurve} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#252b2f" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="J"
                    stroke="#8b9198"
                    fontSize={11}
                    label={{ value: "J (A/m²)", position: "insideBottom", offset: -2, fill: "#8b9198", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="cost"
                    stroke="#d9a441"
                    fontSize={11}
                    label={{ value: "원/h", angle: -90, position: "insideLeft", fill: "#d9a441", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="removal"
                    orientation="right"
                    stroke="#4fa184"
                    fontSize={11}
                    domain={[0, 100]}
                    label={{ value: "제거율 %", angle: 90, position: "insideRight", fill: "#4fa184", fontSize: 11 }}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="cost" type="monotone" dataKey="cost" name="비용(원/h)" stroke="#d9a441" dot={false} strokeWidth={2} />
                  <Line yAxisId="removal" type="monotone" dataKey="removal" name="제거율(%)" stroke="#4fa184" dot={false} strokeWidth={2} />
                  <ReferenceDot
                    yAxisId="cost"
                    x={Number(optimization.J.toFixed(1))}
                    y={Number(optimization.result.cost.toFixed(1))}
                    r={5}
                    fill="#c1591b"
                    stroke="none"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="시간에 따른 전압 파형 (역극성 전환 톱니형)">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dynamic.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#252b2f" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="t"
                    stroke="#8b9198"
                    fontSize={11}
                    label={{ value: "시간 (h)", position: "insideBottom", offset: -2, fill: "#8b9198", fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#3aafa9"
                    fontSize={11}
                    label={{ value: "전압 (V)", angle: -90, position: "insideLeft", fill: "#3aafa9", fontSize: 11 }}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <ReferenceLine y={vThreshold} stroke="#c1591b" strokeDasharray="4 4" label={{ value: "임계값", fill: "#c1591b", fontSize: 11 }} />
                  <Line type="monotone" dataKey="V" name="전압(V)" stroke="#3aafa9" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="전극 잔존 질량 추이">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dynamic.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#252b2f" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="t"
                    stroke="#8b9198"
                    fontSize={11}
                    label={{ value: "시간 (h)", position: "insideBottom", offset: -2, fill: "#8b9198", fontSize: 11 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="#4fa184"
                    fontSize={11}
                    label={{ value: "잔존 질량 %", angle: -90, position: "insideLeft", fill: "#4fa184", fontSize: 11 }}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <ReferenceLine y={20} stroke="#c1591b" strokeDasharray="4 4" label={{ value: "교체 알람 (20%)", fill: "#c1591b", fontSize: 11 }} />
                  <Line type="monotone" dataKey="remainingPct" name="잔존질량(%)" stroke="#4fa184" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>
        </div>
      </div>
    </main>
  );
}
