"use client";

const TANK = { x: 40, y: 170, width: 320, height: 220 };
const WATER_Y = TANK.y + 36;
const ELECTRODE_TOP = TANK.y - 20;
const ELECTRODE_MAX_HEIGHT = TANK.y + TANK.height - 20 - ELECTRODE_TOP;
const LEFT_X = 130;
const RIGHT_X = 270;
const ELECTRODE_WIDTH = 14;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function Electrode({ x, role, remainingPct, bubbleDuration, materialLabel }) {
  const isAnode = role === "anode";
  const height = clamp((remainingPct / 100) * ELECTRODE_MAX_HEIGHT, 6, ELECTRODE_MAX_HEIGHT);
  const y = isAnode ? ELECTRODE_TOP + (ELECTRODE_MAX_HEIGHT - height) : ELECTRODE_TOP;

  return (
    <g>
      <rect
        x={x - ELECTRODE_WIDTH / 2}
        y={y}
        width={ELECTRODE_WIDTH}
        height={isAnode ? height : ELECTRODE_MAX_HEIGHT}
        fill={isAnode ? "#4fa184" : "#3aafa9"}
        rx="2"
      />
      <text x={x} y={ELECTRODE_TOP - 12} textAnchor="middle" fontSize="13" fill="#ece9e2">
        {isAnode ? "Anode" : "Cathode"}
      </text>

      {isAnode ? (
        <g>
          <text x={x} y={WATER_Y + 48} textAnchor="middle" fontSize="11" fill="#8b9198">
            {materialLabel}
          </text>
          <text x={x} y={WATER_Y + 66} textAnchor="middle" fontSize="11" fill="#8b9198">
            {materialLabel}ⁿ⁺+ne⁻
          </text>
          <text x={x} y={WATER_Y + 84} textAnchor="middle" fontSize="10" fill="#6fb89a">
            잔존 {remainingPct.toFixed(0)}%
          </text>
        </g>
      ) : (
        <g>
          <text x={x} y={WATER_Y + 48} textAnchor="middle" fontSize="11" fill="#8b9198">
            2H₂O+2e⁻
          </text>
          <text x={x} y={WATER_Y + 66} textAnchor="middle" fontSize="11" fill="#8b9198">
            H₂(g)+2OH⁻
          </text>
          {[0, 1, 2, 3, 4].map((i) => (
            <circle
              key={i}
              cx={x + (i % 2 === 0 ? -4 : 5)}
              cy={WATER_Y + 26}
              r="2.6"
              fill="#5fc4bd"
              opacity="0.85"
              style={{
                animation: `bubble-rise ${bubbleDuration}s linear infinite`,
                animationDelay: `${(i * bubbleDuration) / 5}s`,
              }}
            />
          ))}
        </g>
      )}
    </g>
  );
}

export default function ElectrodeDiagram({ remainingPct, polarity, J, materialLabel }) {
  const anodeSide = polarity === 0 ? "left" : "right";
  const bubbleDuration = clamp(2.4 - J / 60, 0.5, 2.4);

  return (
    <svg viewBox="0 0 400 400" style={{ width: "100%", height: "100%" }}>
      <style>{`
        @keyframes bubble-rise {
          0% { transform: translateY(0); opacity: 0.9; }
          85% { opacity: 0.5; }
          100% { transform: translateY(-120px); opacity: 0; }
        }
      `}</style>

      <rect x="140" y="20" width="120" height="40" fill="none" stroke="#4a5359" />
      <circle cx="170" cy="40" r="12" fill="#1c2124" stroke="#4fa184" />
      <text x="170" y="44" textAnchor="middle" fontSize="11" fill="#4fa184">A</text>
      <circle cx="230" cy="40" r="12" fill="#1c2124" stroke="#3aafa9" />
      <text x="230" y="44" textAnchor="middle" fontSize="11" fill="#3aafa9">V</text>
      <text x="200" y="14" textAnchor="middle" fontSize="12" fill="#b9beC0">전원 공급</text>

      <line x1={LEFT_X} x2={LEFT_X} y1="60" y2={ELECTRODE_TOP - 20} stroke="#4a5359" />
      <line x1={LEFT_X} x2="140" y1={ELECTRODE_TOP - 20} y2="40" stroke="#4a5359" />
      <line x1={RIGHT_X} x2={RIGHT_X} y1="60" y2={ELECTRODE_TOP - 20} stroke="#4a5359" />
      <line x1={RIGHT_X} x2="260" y1={ELECTRODE_TOP - 20} y2="40" stroke="#4a5359" />

      <rect x={TANK.x} y={TANK.y} width={TANK.width} height={TANK.height} fill="none" stroke="#4a5359" />
      <rect
        x={TANK.x}
        y={WATER_Y}
        width={TANK.width}
        height={TANK.y + TANK.height - WATER_Y}
        fill="#1c2124"
        opacity="0.7"
      />
      <line x1={TANK.x} x2={TANK.x + TANK.width} y1={WATER_Y} y2={WATER_Y} stroke="#3aafa9" strokeDasharray="3 3" />

      <Electrode
        x={LEFT_X}
        role={anodeSide === "left" ? "anode" : "cathode"}
        remainingPct={remainingPct}
        bubbleDuration={bubbleDuration}
        materialLabel={materialLabel}
      />
      <Electrode
        x={RIGHT_X}
        role={anodeSide === "right" ? "anode" : "cathode"}
        remainingPct={remainingPct}
        bubbleDuration={bubbleDuration}
        materialLabel={materialLabel}
      />

      <text x="200" y={TANK.y + TANK.height + 26} textAnchor="middle" fontSize="11" fill="#8b9198">
        {materialLabel}ⁿ⁺+nOH⁻ → {materialLabel}(OH)ₙ
      </text>
    </svg>
  );
}
