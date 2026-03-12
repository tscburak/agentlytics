export default function PageHeader({ icon: Icon, title, children }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: 'var(--c-white)' }}>
        {Icon && <Icon size={14} style={{ color: '#6366f1' }} />}
        {title}
      </div>
      {children}
    </div>
  )
}
