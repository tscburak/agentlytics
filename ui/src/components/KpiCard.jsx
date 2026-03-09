import { useState, useEffect, useRef } from 'react'
import { Info } from 'lucide-react'

export default function KpiCard({ label, value, sub, onClick, infoTooltip }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className={`card px-3 py-2${onClick ? ' cursor-pointer hover:opacity-80 transition' : ''}`} onClick={onClick}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold truncate" style={{ color: onClick ? 'var(--c-accent)' : 'var(--c-white)' }}>{value}</div>
          <div className="text-[11px]" style={{ color: 'var(--c-text2)' }}>{label}</div>
          {sub && <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-text3)' }}>{sub}</div>}
        </div>
        {infoTooltip && (
          <span ref={ref} className="relative flex-shrink-0 -mt-1 -mr-1">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
              className="flex items-center justify-center w-4 h-4 rounded-full transition hover:opacity-80"
              style={{ color: 'var(--c-text3)', background: 'var(--c-bg3)' }}
            >
              <Info size={10} />
            </button>
            {open && (
              <div
                className="absolute right-0 top-6 z-50 w-56 p-2 rounded shadow-lg"
                style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}
              >
                <div className="text-[11px]" style={{ color: 'var(--c-text2)' }}>{infoTooltip}</div>
              </div>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
