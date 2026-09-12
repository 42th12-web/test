export default function ControlSlider({ label, value, unit, min, max, step, onChange, format }) {
  const display = format ? format(value) : value;
  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] text-ink-300">{label}</span>
        <span className="font-mono text-[13px] text-patina-400">
          {display}
          {unit ? <span className="text-ink-500 ml-0.5">{unit}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
