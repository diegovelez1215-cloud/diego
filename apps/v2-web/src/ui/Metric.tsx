export function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="v2-metric"><dt>{label}</dt><dd>{value}</dd>{note ? <span>{note}</span> : null}</div>;
}
