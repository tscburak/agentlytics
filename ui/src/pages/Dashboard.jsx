import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
import KpiCard from '../components/KpiCard'
import ActivityHeatmap from '../components/ActivityHeatmap'
import { fetchDailyActivity, fetchOverview as fetchOverviewApi } from '../lib/api'
import { editorColor, editorLabel, formatNumber } from '../lib/constants'
import { useTheme } from '../lib/theme'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

const MONO = 'JetBrains Mono, monospace'

const MODE_COLORS = {
  agent: '#a855f7', chat: '#3b82f6', cascade: '#06b6d4', edit: '#10b981',
  copilot: '#f59e0b', thread: '#ec4899', opencode: '#f43f5e', claude: '#f97316',
}

export default function Dashboard({ overview }) {
  const navigate = useNavigate()
  const [dailyData, setDailyData] = useState(null)
  const [filteredData, setFilteredData] = useState(null)
  const [selectedEditor, setSelectedEditor] = useState(null)
  const [filterLoading, setFilterLoading] = useState(false)
  const { dark } = useTheme()
  const legendColor = dark ? '#888' : '#555'
  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: legendColor, font: { size: 10, family: MONO }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: { bodyFont: { family: MONO, size: 11 }, titleFont: { family: MONO, size: 11 } },
    },
  }

  useEffect(() => {
    fetchDailyActivity().then(setDailyData)
  }, [])

  useEffect(() => {
    if (!selectedEditor) {
      setFilteredData(null)
      fetchDailyActivity().then(setDailyData)
      return
    }
    setFilterLoading(true)
    Promise.all([
      fetchOverviewApi({ editor: selectedEditor }),
      fetchDailyActivity({ editor: selectedEditor }),
    ]).then(([ov, daily]) => {
      setFilteredData(ov)
      setDailyData(daily)
      setFilterLoading(false)
    })
  }, [selectedEditor])

  if (!overview) return <div className="text-sm py-12 text-center" style={{ color: 'var(--c-text2)' }}>loading...</div>

  // Use filtered data for charts/stats, but always show all editors from unfiltered overview
  const d = filteredData || overview
  const allEditors = overview.editors.sort((a, b) => b.count - a.count)
  const daysSpan = d.oldestChat && d.newestChat ? Math.max(1, Math.round((d.newestChat - d.oldestChat) / 86400000)) : 0
  const thisMonth = d.byMonth.length > 0 ? d.byMonth[d.byMonth.length - 1] : null

  const modes = Object.entries(d.byMode).sort((a, b) => b[1] - a[1])

  const sel = selectedEditor ? allEditors.find(e => e.id === selectedEditor) : null

  const editorChartData = {
    labels: allEditors.map(e => editorLabel(e.id)),
    datasets: [{
      data: allEditors.map(e => e.count),
      backgroundColor: allEditors.map(e => editorColor(e.id)),
      borderWidth: 0,
      spacing: 2,
    }],
  }

  const modeChartData = {
    labels: modes.map(e => e[0]),
    datasets: [{
      data: modes.map(e => e[1]),
      backgroundColor: modes.map(e => MODE_COLORS[e[0]] || '#6b7280'),
      borderWidth: 0,
    }],
  }

  const maxProject = d.topProjects.length > 0 ? d.topProjects[0].count : 1

  return (
    <div className="fade-in space-y-3">
      {/* Editor breakdown - top */}
      <div className="card p-3">
        <h3 className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--c-text2)' }}>editors</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {allEditors.map(e => {
            const isSelected = selectedEditor === e.id
            return (
              <div
                key={e.id}
                className="card px-3 py-3 text-center cursor-pointer transition"
                style={{
                  border: isSelected ? `1.5px solid ${editorColor(e.id)}` : '1px solid var(--c-border)',
                  opacity: selectedEditor && !isSelected ? 0.4 : 1,
                }}
                onClick={() => setSelectedEditor(isSelected ? null : e.id)}
              >
                <div className="w-2.5 h-2.5 rounded-full mx-auto mb-1.5" style={{ background: editorColor(e.id) }} />
                <div className="text-lg font-bold" style={{ color: 'var(--c-white)' }}>{e.count}</div>
                <div className="text-[10px]" style={{ color: 'var(--c-text2)' }}>{editorLabel(e.id)}</div>
              </div>
            )
          })}
        </div>
        {selectedEditor && sel && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => navigate(`/sessions?editor=${selectedEditor}`)}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 transition"
              style={{ color: 'var(--c-accent)', border: '1px solid var(--c-border)' }}
            >
              Show Sessions <ArrowRight size={11} />
            </button>
            <button
              onClick={() => setSelectedEditor(null)}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 transition"
              style={{ color: 'var(--c-text2)', border: '1px solid var(--c-border)' }}
            >
              <X size={9} /> Clear
            </button>
            <span className="text-[11px] ml-auto" style={{ color: 'var(--c-text)' }}>
              <span className="font-bold" style={{ color: editorColor(selectedEditor) }}>{editorLabel(selectedEditor)}</span>
              <span style={{ color: 'var(--c-text2)' }}> — {sel.count} sessions</span>
            </span>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard label="total sessions" value={formatNumber(d.totalChats)} sub={sel ? editorLabel(sel.id) : `${allEditors.length} editors`} />
        <KpiCard label="projects" value={d.topProjects.length} sub="unique folders" />
        <KpiCard label="time span" value={`${daysSpan}d`} sub={d.oldestChat ? `since ${new Date(d.oldestChat).toLocaleDateString()}` : ''} />
        <KpiCard label="this month" value={thisMonth ? thisMonth.count : 0} sub={thisMonth ? thisMonth.month : ''} />
      </div>

      {/* Activity Heatmap */}
      <div className="card p-3">
        <h3 className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--c-text2)' }}>activity</h3>
        {dailyData ? <ActivityHeatmap dailyData={dailyData} /> : <div className="text-[10px]" style={{ color: 'var(--c-text3)' }}>loading...</div>}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="card p-3">
          <h3 className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--c-text2)' }}>editors</h3>
          <div style={{ height: 200 }}>
            <Doughnut data={editorChartData} options={{ ...chartOpts, cutout: '65%' }} />
          </div>
        </div>
        <div className="card p-3">
          <h3 className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--c-text2)' }}>modes</h3>
          <div style={{ height: 200 }}>
            <Doughnut data={modeChartData} options={{ ...chartOpts, cutout: '60%' }} />
          </div>
        </div>
        <div className="card p-3">
          <h3 className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--c-text2)' }}>top projects</h3>
          <div className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-thin">
            {d.topProjects.slice(0, 12).map(p => (
              <div key={p.name} className="flex items-center gap-1.5">
                <div className="text-[9px] w-6 text-right" style={{ color: 'var(--c-text2)' }}>{p.count}</div>
                <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: 'var(--c-code-bg)' }}>
                  <div className="h-full bg-accent/30 rounded-sm" style={{ width: `${(p.count / maxProject * 100).toFixed(1)}%` }} />
                </div>
                <div className="text-[9px] truncate max-w-[140px]" style={{ color: 'var(--c-text2)' }} title={p.fullPath}>{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
