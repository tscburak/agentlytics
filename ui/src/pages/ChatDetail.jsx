import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Bot, Wrench, Settings, Play, CheckCircle, ChevronRight, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchChat } from '../lib/api'
import { editorColor, editorLabel, formatDateTime, formatNumber } from '../lib/constants'
import KpiCard from '../components/KpiCard'

const ROLE_CONFIG = {
  user: { icon: User, label: 'User', borderColor: 'rgba(34,197,94,0.2)', bg: 'rgba(34,197,94,0.05)' },
  assistant: { icon: Bot, label: 'Assistant', borderColor: 'rgba(99,102,241,0.2)', bg: 'rgba(99,102,241,0.05)' },
  system: { icon: Settings, label: 'System', borderColor: 'rgba(107,114,128,0.2)', bg: 'rgba(107,114,128,0.05)' },
  tool: { icon: Wrench, label: 'Tool', borderColor: 'rgba(234,179,8,0.2)', bg: 'rgba(234,179,8,0.05)' },
}

// Parse message content into segments: text, tool-call, tool-result
function parseContent(content) {
  const segments = []
  const regex = /\[tool-call: ([^\]]+)\]|\[tool-result: ([^\]]+)\]\s*(.*?)(?=\n\[tool-|$)/gs
  let lastIdx = 0
  let match
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      const text = content.slice(lastIdx, match.index).trim()
      if (text) segments.push({ type: 'text', value: text })
    }
    if (match[1]) {
      segments.push({ type: 'tool-call', name: match[1].replace(/\(.*\)$/, '').trim(), args: match[1] })
    } else if (match[2]) {
      segments.push({ type: 'tool-result', name: match[2].trim(), preview: (match[3] || '').trim() })
    }
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < content.length) {
    const text = content.slice(lastIdx).trim()
    if (text) segments.push({ type: 'text', value: text })
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: content }]
}

function ToolArgsDiff({ args }) {
  const old = args.old_string || args.old_text || args.oldText || args.search || null
  const nw = args.new_string || args.new_text || args.newText || args.replace || null
  if (old == null && nw == null) return null
  const maxLines = 12
  const oldLines = (old || '').split('\n').slice(0, maxLines)
  const newLines = (nw || '').split('\n').slice(0, maxLines)
  return (
    <div className="mt-1.5 text-[9px] font-mono overflow-x-auto" style={{ border: '1px solid var(--c-border)' }}>
      {(args.file_path || args.TargetFile) && (
        <div className="px-2 py-0.5" style={{ background: 'var(--c-code-bg)', color: 'var(--c-text)' }}>{args.file_path || args.TargetFile}</div>
      )}
      {old && oldLines.map((line, i) => (
        <div key={'o' + i} className="px-2" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
          <span style={{ color: 'var(--c-text3)', userSelect: 'none' }}>- </span>{line}
        </div>
      ))}
      {old && oldLines.length < (old || '').split('\n').length && (
        <div className="px-2" style={{ color: 'var(--c-text3)' }}>  ... {(old || '').split('\n').length - maxLines} more lines</div>
      )}
      {nw && newLines.map((line, i) => (
        <div key={'n' + i} className="px-2" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
          <span style={{ color: 'var(--c-text3)', userSelect: 'none' }}>+ </span>{line}
        </div>
      ))}
      {nw && newLines.length < (nw || '').split('\n').length && (
        <div className="px-2" style={{ color: 'var(--c-text3)' }}>  ... {(nw || '').split('\n').length - maxLines} more lines</div>
      )}
    </div>
  )
}

function ToolArgsDetail({ args }) {
  if (!args || Object.keys(args).length === 0) return null
  const hasDiff = args.old_string || args.new_string || args.old_text || args.new_text || args.search || args.replace
  if (hasDiff) return <ToolArgsDiff args={args} />
  // Summarize key args
  const file = args.file_path || args.TargetFile || args.filePath || args.path || null
  const cmd = args.CommandLine || args.command || null
  const query = args.Query || args.query || args.search_term || null
  const url = args.Url || args.url || null
  return (
    <div className="mt-1.5 text-[9px] font-mono overflow-x-auto" style={{ background: 'var(--c-code-bg)', border: '1px solid var(--c-border)' }}>
      {file && <div className="px-2 py-0.5" style={{ color: 'var(--c-text)' }}>file: {file}</div>}
      {cmd && <div className="px-2 py-0.5" style={{ color: 'var(--c-text)' }}>cmd: {cmd}</div>}
      {query && <div className="px-2 py-0.5" style={{ color: 'var(--c-text)' }}>query: {query}</div>}
      {url && <div className="px-2 py-0.5" style={{ color: 'var(--c-text)' }}>url: {url}</div>}
      {!file && !cmd && !query && !url && (
        <pre className="px-2 py-1 whitespace-pre-wrap break-all" style={{ color: 'var(--c-text2)' }}>{JSON.stringify(args, null, 2)}</pre>
      )}
    </div>
  )
}

function ToolCallBlock({ name, args, detail }) {
  const [open, setOpen] = useState(false)
  const hasDetail = detail && Object.keys(detail).length > 0
  return (
    <div className="my-1 px-2.5 py-1.5 text-[10px]" style={{ background: 'var(--c-code-bg)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => hasDetail && setOpen(!open)}>
        {hasDetail
          ? (open ? <ChevronDown size={10} style={{ color: '#a78bfa' }} /> : <ChevronRight size={10} style={{ color: '#a78bfa' }} />)
          : <Play size={10} style={{ color: '#a78bfa' }} />
        }
        <span className="font-bold" style={{ color: 'var(--c-white)' }}>{name}</span>
        {args !== name && !hasDetail && <span className="truncate" style={{ color: 'var(--c-text2)' }}>{args}</span>}
        {hasDetail && <span style={{ color: 'var(--c-text2)' }}>{summarizeToolArgs(name, detail)}</span>}
      </div>
      {open && hasDetail && <ToolArgsDetail args={detail} />}
    </div>
  )
}

function summarizeToolArgs(name, args) {
  if (!args || typeof args !== 'object') return ''
  if (args.file_path || args.TargetFile) return args.file_path || args.TargetFile
  if (args.CommandLine || args.command) return args.CommandLine || args.command
  if (args.Query || args.query) return `${args.Query || args.query}${args.SearchPath ? ` in ${args.SearchPath}` : ''}`
  if (args.Url || args.url) return args.Url || args.url
  const vals = Object.values(args).filter(v => typeof v === 'string' && v.length > 0 && v.length < 120)
  return vals.length > 0 ? vals[0] : ''
}

function ToolResultBlock({ name, preview }) {
  const [open, setOpen] = useState(false)
  const isNoisy = preview.length > 120 || preview.startsWith('{') || preview.includes('contentId')
  const short = isNoisy ? `${name} completed` : preview.substring(0, 120)
  return (
    <div className="my-1 px-2.5 py-1.5 text-[10px]" style={{ background: 'var(--c-code-bg)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => preview && setOpen(!open)}>
        <CheckCircle size={10} style={{ color: '#34d399' }} />
        <span style={{ color: 'var(--c-text)' }}>{short}</span>
        {isNoisy && preview && <span style={{ color: 'var(--c-text3)' }}>{open ? '[-]' : '[+]'}</span>}
      </div>
      {open && <pre className="mt-1 text-[9px] overflow-x-auto whitespace-pre-wrap break-all" style={{ color: 'var(--c-text2)' }}>{preview}</pre>}
    </div>
  )
}

function MessageContent({ content, toolCallDetails }) {
  const segments = parseContent(content)
  let toolIdx = 0
  return segments.map((seg, i) => {
    if (seg.type === 'tool-call') {
      const detail = toolCallDetails ? toolCallDetails.find(tc => tc.name === seg.name && toolCallDetails.indexOf(tc) >= toolIdx) : null
      if (detail) toolIdx = toolCallDetails.indexOf(detail) + 1
      return <ToolCallBlock key={i} name={seg.name} args={seg.args} detail={detail?.args} />
    }
    if (seg.type === 'tool-result') return <ToolResultBlock key={i} name={seg.name} preview={seg.preview} />
    return <div key={i} className="md-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.value}</ReactMarkdown></div>
  })
}

export default function ChatDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [chat, setChat] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchChat(id).then(data => {
      setChat(data)
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="text-sm py-12 text-center" style={{ color: 'var(--c-text2)' }}>Loading conversation...</div>
  if (!chat) return <div className="text-sm py-12 text-center" style={{ color: 'var(--c-text2)' }}>Chat not found.</div>

  const s = chat.stats

  return (
    <div className="fade-in max-w-4xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm mb-4 transition"
        style={{ color: 'var(--c-text2)' }}
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Header */}
      <div className="card p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--c-white)' }}>{chat.name || '(untitled)'}</h2>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--c-text2)' }}>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: editorColor(chat.source) }} />
                {editorLabel(chat.source)}
              </span>
              {chat.mode && <span>· {chat.mode}</span>}
              {chat.folder && <span className="font-mono">· {chat.folder}</span>}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--c-text3)' }}>
              {formatDateTime(chat.createdAt)}
              {chat.lastUpdatedAt && chat.lastUpdatedAt !== chat.createdAt && ` — ${formatDateTime(chat.lastUpdatedAt)}`}
              <span className="ml-3 font-mono" style={{ color: 'var(--c-text3)' }}>{chat.id}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          <KpiCard label="Messages" value={s.totalMessages} />
          <KpiCard label="User" value={s.userMessages} />
          <KpiCard label="Assistant" value={s.assistantMessages} />
          <KpiCard label="Tool Calls" value={s.toolCalls.length} />
          {s.totalInputTokens > 0 && <KpiCard label="Input Tokens" value={formatNumber(s.totalInputTokens)} />}
          {s.totalOutputTokens > 0 && <KpiCard label="Output Tokens" value={formatNumber(s.totalOutputTokens)} />}
        </div>
      )}

      {/* Model badges */}
      {s && s.models.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {[...new Set(s.models)].map(m => (
            <span key={m} className="text-xs bg-accent/10 text-accent-light px-2.5 py-1 rounded-full font-mono">{m}</span>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="space-y-3">
        {chat.messages.length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--c-text2)' }}>
            {chat.encrypted ? '🔒 This conversation is encrypted.' : 'No messages found.'}
          </div>
        )}
        {chat.messages.map((msg, i) => {
          const cfg = ROLE_CONFIG[msg.role] || ROLE_CONFIG.system
          const Icon = cfg.icon
          return (
            <div key={i} className="rounded-r-lg px-4 py-3" style={{ borderLeft: `2px solid ${cfg.borderColor}`, background: cfg.bg }}>
              <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--c-text2)' }}>
                <Icon size={13} />
                <span className="font-medium">{cfg.label}</span>
                {msg.model && <span className="font-mono" style={{ color: 'var(--c-accent)', opacity: 0.6 }}>· {msg.model}</span>}
              </div>
              <div className="text-sm" style={{ color: 'var(--c-text)' }}>
                <MessageContent content={msg.content} toolCallDetails={chat.toolCallDetails} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
