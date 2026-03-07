export default function KpiCard({ label, value, sub }) {
  return (
    <div className="card px-3 py-2">
      <div className="text-base font-bold" style={{ color: 'var(--c-white)' }}>{value}</div>
      <div className="text-[10px]" style={{ color: 'var(--c-text2)' }}>{label}</div>
      {sub && <div className="text-[9px] mt-0.5" style={{ color: 'var(--c-text3)' }}>{sub}</div>}
    </div>
  )
}
