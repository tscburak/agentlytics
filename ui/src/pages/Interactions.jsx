import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Search, X, MessageSquare, Zap } from 'lucide-react'
import { fetchProjects, fetchFileInteractions, fetchChats } from '../lib/api'
import { editorLabel, formatNumber, formatDate } from '../lib/constants'
import { useTheme } from '../lib/theme'
import KpiCard from '../components/KpiCard'
import EditorIcon from '../components/EditorIcon'
import SectionTitle from '../components/SectionTitle'
import DateRangePicker from '../components/DateRangePicker'
import AnimatedLoader from '../components/AnimatedLoader'

export default function Interactions() {
  const navigate = useNavigate()
  const { dark } = useTheme()

  // Data state
  const [projects, setProjects] = useState([])
  const [interactions, setInteractions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState(null)

  // UI state
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState(null)
  const [selectedPath, setSelectedPath] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState(new Set())

  useEffect(() => {
    fetchProjects().then(setProjects)
  }, [])

  useEffect(() => {
    if (!selectedProject) {
      setInteractions([])
      setLoading(false)
      return
    }

    setLoading(true)
    const params = { folder: selectedProject.folder }
    if (dateRange) {
      if (dateRange.from) params.dateFrom = dateRange.from.getTime()
      if (dateRange.to) params.dateTo = dateRange.to.getTime()
    }
    fetchFileInteractions(params)
      .then(data => {
        setInteractions(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedProject, dateRange])

  // Build file tree structure
  const fileTree = useMemo(() => {
    if (!selectedProject || interactions.length === 0) return null

    const tree = { name: 'root', children: {}, isFolder: true, path: '' }
    const projectPath = selectedProject.folder

    for (const file of interactions) {
      // Get relative path from project folder
      let relativePath = file.path
      if (file.path.startsWith(projectPath)) {
        relativePath = file.path.slice(projectPath.length).replace(/^\//, '')
      }

      const parts = relativePath.split('/').filter(p => p.length > 0)
      let current = tree

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (!part) continue  // Skip empty parts
        const isLast = i === parts.length - 1
        const isFile = isLast

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            isFolder: !isFile,
            path: isLast ? file.path : (current.path ? current.path + '/' + part : part),
            children: {},
            data: isFile ? file : null
          }
        }

        if (isFile && !current.children[part].data) {
          current.children[part].data = file
        }

        current = current.children[part]
      }
    }

    return tree
  }, [interactions, selectedProject])

  // Flatten tree for rendering with filtering
  const flatTree = useMemo(() => {
    if (!fileTree) return []

    const result = []
    const searchLower = search.toLowerCase()

    function traverse(node, depth = 0) {
      if (!node?.children) return
      const entries = Object.entries(node.children)
        .sort(([a, aData], [b, bData]) => {
          // Folders first, then files
          if (aData?.isFolder && !bData?.isFolder) return -1
          if (!aData?.isFolder && bData?.isFolder) return 1
          const aName = aData?.name || ''
          const bName = bData?.name || ''
          return aName.localeCompare(bName)
        })

      for (const [name, data] of entries) {
        // Filter by search
        if (search && !name.toLowerCase().includes(searchLower) &&
            !data.path?.toLowerCase().includes(searchLower)) {
          continue
        }

        result.push({ ...data, depth })

        if (data.isFolder && expandedFolders.has(data.path)) {
          traverse(data, depth + 1)
        }
      }
    }

    traverse(fileTree)
    return result
  }, [fileTree, expandedFolders, search])

  // Toggle folder expansion
  const toggleFolder = (path) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // Aggregate stats for selected item
  const selectedItem = useMemo(() => {
    if (!selectedPath) return null

    // Find all files under selected path (if folder) or exact match
    const files = interactions.filter(f => {
      if (f.path === selectedPath) return true
      return f.path.startsWith(selectedPath + '/')
    })

    if (files.length === 0) return null

    const allSessions = new Set()
    const allModels = new Set()
    const allEditors = new Set()
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCacheRead = 0
    let totalCacheWrite = 0

    for (const f of files) {
      f.sessions.forEach(s => allSessions.add(s))
      f.models.forEach(m => allModels.add(m))
      f.editors.forEach(e => allEditors.add(e))
      totalInputTokens += f.inputTokens
      totalOutputTokens += f.outputTokens
      totalCacheRead += f.cacheRead
      totalCacheWrite += f.cacheWrite
    }

    return {
      path: selectedPath,
      isFile: files.length === 1 && files[0].path === selectedPath,
      fileCount: files.length,
      sessions: Array.from(allSessions),
      models: Array.from(allModels),
      editors: Array.from(allEditors),
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheRead: totalCacheRead,
      cacheWrite: totalCacheWrite,
      totalTokens: totalInputTokens + totalOutputTokens
    }
  }, [selectedPath, interactions])

  return (
    <div className="fade-in space-y-4">
      {/* Project selector */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <SectionTitle>Select Project</SectionTitle>
          <select
            value={selectedProject?.folder || ''}
            onChange={e => {
              const project = projects.find(p => p.folder === e.target.value)
              setSelectedProject(project || null)
              setSelectedPath(null)
              setExpandedFolders(new Set())
            }}
            className="flex-1 px-3 py-2 text-[12px] outline-none rounded-sm"
            style={{ background: 'var(--c-bg3)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
          >
            <option value="">Select a project...</option>
            {projects.map(p => (
              <option key={p.folder} value={p.folder}>{p.name} ({p.folder})</option>
            ))}
          </select>
          {selectedProject && (
            <button
              onClick={() => {
                setSelectedProject(null)
                setSelectedPath(null)
                setExpandedFolders(new Set())
              }}
              className="p-2 rounded-sm hover:bg-[var(--c-bg3)]"
              style={{ color: 'var(--c-text3)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {!selectedProject ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--c-text3)' }}>
          Select a project to view file interactions
        </div>
      ) : loading ? (
        <AnimatedLoader label="Loading file interactions..." />
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text3)' }} />
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-[12px] outline-none rounded-sm"
                style={{ background: 'var(--c-bg3)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
              />
            </div>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>

          {/* Main content: File tree + Details panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* File tree */}
            <div className="card p-3 lg:col-span-1">
              <SectionTitle>File Structure</SectionTitle>
              <div className="mt-2 space-y-0.5 max-h-[600px] overflow-y-auto scrollbar-thin">
                {flatTree.length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: 'var(--c-text3)' }}>
                    {search ? 'No files match your search' : 'No file interactions found'}
                  </div>
                ) : (
                  flatTree.map(item => (
                    <div
                      key={item.path}
                      className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer transition ${
                        selectedPath === item.path ? 'bg-[var(--c-bg3)]' : 'hover:bg-[var(--c-bg3)]'
                      }`}
                      style={{ paddingLeft: `${12 + item.depth * 16}px` }}
                      onClick={() => {
                        if (item.isFolder) {
                          toggleFolder(item.path)
                        } else {
                          setSelectedPath(item.path)
                        }
                      }}
                    >
                      {item.isFolder ? (
                        expandedFolders.has(item.path) ? (
                          <ChevronDown size={12} style={{ color: 'var(--c-text3)' }} />
                        ) : (
                          <ChevronRight size={12} style={{ color: 'var(--c-text3)' }} />
                        )
                      ) : (
                        <div style={{ width: 12 }} />
                      )}
                      {item.isFolder ? (
                        <FolderOpen size={14} style={{ color: '#f59e0b' }} />
                      ) : (
                        <File size={14} style={{ color: 'var(--c-text2)' }} />
                      )}
                      <span className="text-[12px] truncate flex-1" style={{ color: 'var(--c-text2)' }}>
                        {item.name}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Details panel */}
            <div className="card p-4 lg:col-span-2">
              {!selectedItem ? (
                <div className="text-center py-12 text-sm" style={{ color: 'var(--c-text3)' }}>
                  Select a file or folder to view details
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2">
                      {selectedItem.isFile ? (
                        <File size={16} style={{ color: 'var(--c-accent)' }} />
                      ) : (
                        <FolderOpen size={16} style={{ color: 'var(--c-accent)' }} />
                      )}
                      <h3 className="text-sm font-bold" style={{ color: 'var(--c-white)' }}>
                        {selectedItem.path.split('/').pop()}
                      </h3>
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--c-text3)' }}>
                      {selectedItem.path}
                    </div>
                  </div>

                  {/* KPIs */}
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))' }}>
                    <KpiCard label={selectedItem.isFile ? 'tool calls' : 'files'} value={selectedItem.fileCount} />
                    <KpiCard label="sessions" value={formatNumber(selectedItem.sessions.length)} />
                    <KpiCard label="input tokens" value={formatNumber(selectedItem.inputTokens)} />
                    <KpiCard label="output tokens" value={formatNumber(selectedItem.outputTokens)} />
                    {(selectedItem.cacheRead > 0 || selectedItem.cacheWrite > 0) && (
                      <KpiCard label="cache tokens" value={formatNumber(selectedItem.cacheRead + selectedItem.cacheWrite)} />
                    )}
                  </div>

                  {/* Expandable sections */}
                  <div className="space-y-3">
                    {/* Models */}
                    <ExpandableSection title="Models Used" count={selectedItem.models.length}>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedItem.models.map(model => (
                          <span
                            key={model}
                            className="px-2 py-1 text-[11px] rounded"
                            style={{ background: 'var(--c-bg3)', color: 'var(--c-text2)' }}
                          >
                            {model}
                          </span>
                        ))}
                      </div>
                    </ExpandableSection>

                    {/* Editors/IDEs */}
                    <ExpandableSection title="IDEs Used" count={selectedItem.editors.length}>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedItem.editors.map(editor => (
                          <div key={editor} className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: 'var(--c-bg3)' }}>
                            <EditorIcon source={editor} size={14} />
                            <span className="text-[11px]" style={{ color: 'var(--c-text2)' }}>
                              {editorLabel(editor)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ExpandableSection>

                    {/* Sessions */}
                    <ExpandableSection title="Sessions" count={selectedItem.sessions.length}>
                      <div className="mt-2 max-h-48 overflow-y-auto scrollbar-thin">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-[10px] uppercase" style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text3)' }}>
                              <th className="text-left py-1">Session ID</th>
                              <th className="text-right py-1">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedItem.sessions.slice(0, 50).map(sessionId => (
                              <tr key={sessionId} style={{ borderBottom: '1px solid var(--c-border)' }}>
                                <td className="py-1 font-mono" style={{ color: 'var(--c-text2)' }}>
                                  {sessionId.slice(0, 12)}...
                                </td>
                                <td className="py-1 text-right">
                                  <button
                                    onClick={() => navigate('/sessions', { state: { sessionId } })}
                                    className="text-[10px] px-2 py-0.5 rounded"
                                    style={{ background: 'var(--c-accent)', color: 'white' }}
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {selectedItem.sessions.length > 50 && (
                              <tr>
                                <td colSpan="2" className="py-2 text-center" style={{ color: 'var(--c-text3)' }}>
                                  ...and {selectedItem.sessions.length - 50} more
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </ExpandableSection>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Expandable section component
function ExpandableSection({ title, count, children }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border rounded-sm p-2" style={{ borderColor: 'var(--c-border)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-[11px] font-medium" style={{ color: 'var(--c-text2)' }}>
          {title}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: 'var(--c-text3)' }}>{count}</span>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
      </button>
      {expanded && <div>{children}</div>}
    </div>
  )
}
