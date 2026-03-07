import { editorColor, editorLabel } from '../lib/constants'

export default function EditorDot({ source, showLabel = false, size = 8 }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="rounded-full flex-shrink-0"
        style={{ width: size, height: size, background: editorColor(source) }}
      />
      {showLabel && <span className="text-[10px]" style={{ color: 'var(--c-text)' }}>{editorLabel(source)}</span>}
    </span>
  )
}
