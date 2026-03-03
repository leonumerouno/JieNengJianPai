(() => {
  const $ = (sel) => document.querySelector(sel)
  const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '--')

  const elCurr = $('#currentPressure')
  const elRate = $('#rate')
  const pill = $('#statusPill')
  const connDot = $('#connDot')
  const connText = $('#connText')
  const alarmBanner = $('#alarmBanner')
  const log = $('#alarmLog')
  const tableBody = $('#dataTableBody')
  const rowsPerPageInp = $('#rowsPerPage')
  const pagePrevBtn = $('#pagePrev')
  const pageNextBtn = $('#pageNext')
  const pageInfo = $('#pageInfo')

  const PRESET = {
    warn: -0.372,
    danger: 6.94,
    window: 180
  }

  const inputs = {
    alarmToggle: $('#alarmToggle'),
    resetBtn: $('#resetBtn'),
    clearLogBtn: $('#clearLogBtn')
  }

  const state = {
    connected: false,
    points: [],
    timestamps: [],
    base: -2,
    timer: null,
    chart: null,
    lastAlarmAt: 0,
    page: { size: 20, index: 0 }
  }

  function setConnection(on) {
    state.connected = on
    connDot.classList.toggle('dot--connected', on)
    connDot.classList.toggle('dot--disconnected', !on)
    connText.textContent = on ? '已连接（模拟数据）' : '未连接（模拟）'
  }

  function addLog(level, msg) {
    const li = document.createElement('li')
    const time = document.createElement('time')
    time.textContent = new Date().toLocaleString()
    const badge = document.createElement('span')
    badge.className = 'badge ' + (level === 'danger' ? 'badge--danger' : 'badge--warn')
    badge.textContent = level === 'danger' ? '危险' : '预警'
    const text = document.createElement('div')
    text.textContent = msg
    li.appendChild(time)
    li.appendChild(badge)
    li.appendChild(text)
    log.prepend(li)
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'square'
      o.frequency.value = 880
      g.gain.value = 0.04
      o.connect(g)
      g.connect(ctx.destination)
      o.start()
      setTimeout(() => { o.stop(); ctx.close() }, 250)
    } catch { /* ignore */ }
  }

  function classify(current) {
    if (!Number.isFinite(current)) return 'unknown'
    if (current > 6.94) return 'danger'
    if (current >= -0.372) return 'warn'
    return 'ok'
  }

  function updatePill(level) {
    pill.classList.remove('status-pill--ok', 'status-pill--warn', 'status-pill--danger')
    if (level === 'ok') {
      pill.textContent = '正常'
      pill.classList.add('status-pill', 'status-pill--ok')
    } else if (level === 'warn') {
      pill.textContent = '预警'
      pill.classList.add('status-pill', 'status-pill--warn')
    } else if (level === 'danger') {
      pill.textContent = '危险'
      pill.classList.add('status-pill', 'status-pill--danger')
    } else {
      pill.textContent = '--'
    }
  }

  function maybeAlarm(level, current) {
    if (level !== 'danger') {
      alarmBanner.classList.remove('show')
      return
    }
    alarmBanner.classList.add('show')
    const now = Date.now()
    if (inputs.alarmToggle.checked && now - state.lastAlarmAt > 1500) {
      state.lastAlarmAt = now
      addLog('danger', `压力值 ${fmt(current)} kPa 已达危险阈值`)
      beep()
      document.title = '⚠️ 危险 - 山地浅层滑坡预警'
    }
  }

  function ensureChart() {
    const ctx = document.getElementById('pressureChart').getContext('2d')
    const warn = PRESET.warn
    const danger = PRESET.danger
    state.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: state.timestamps,
        datasets: [
          {
            label: '压力',
            data: state.points,
            borderColor: '#2aa8ff',
            backgroundColor: 'rgba(42,168,255,.18)',
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.25
          },
          {
            label: '预警阈值',
            data: new Array(180).fill(warn),
            borderColor: '#ffb020',
            borderWidth: 1,
            pointRadius: 0,
            borderDash: [6,6]
          },
          {
            label: '危险阈值',
            data: new Array(180).fill(danger),
            borderColor: '#ff3b3b',
            borderWidth: 1,
            pointRadius: 0,
            borderDash: [6,6]
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index', intersect: false, backgroundColor: 'rgba(255,255,255,.95)'
          }
        },
        scales: {
          x: { ticks: { color: '#334155', maxRotation: 0 }, grid: { color: 'rgba(51,65,85,.15)' } },
          y: {
            ticks: { color: '#334155' },
            grid: { color: 'rgba(51,65,85,.15)' },
            title: { display: true, text: 'kPa', color: '#334155' }
          }
        }
      }
    })
  }

  function recalcAndRender() {
    if (!state.chart) return
    const warn = PRESET.warn
    const danger = PRESET.danger
    const len = state.points.length
    state.chart.data.labels = state.timestamps
    state.chart.data.datasets[0].data = state.points
    state.chart.data.datasets[1].data = new Array(len).fill(warn)
    state.chart.data.datasets[2].data = new Array(len).fill(danger)
    state.chart.update()
    renderTable()
  }

  function simulateTick() {
    const w = PRESET.window
    const t = new Date()
    const last = state.points[state.points.length - 1] ?? state.base
    const spike = Math.random() < 0.02 ? (Math.random() * 25 + 10) : 0
    const drift = (Math.random() - 0.5) * 1.4
    let next = last + drift + (Math.random() < 0.03 ? -spike : 0) + (Math.random() < 0.03 ? spike : 0)
    state.points.push(next)
    state.timestamps.push(t.toLocaleTimeString())
    if (state.points.length > w) {
      state.points.shift()
      state.timestamps.shift()
    }
    const prev = state.points.length > 1 ? state.points[state.points.length - 2] : next
    const rate = (next - prev) / (0.5/60)
    elCurr.textContent = fmt(next, 2)
    elRate.textContent = fmt(rate, 1)
    const level = classify(next)
    updatePill(level)
    maybeAlarm(level, next)
    recalcAndRender()
  }

  function resetData() {
    state.points = []
    state.timestamps = []
    recalcAndRender()
    addLog('warn', '已重置数据窗口')
    state.page.index = 0
    renderTable()
  }

  function renderTable() {
    if (!tableBody) return
    const size = state.page.size
    const total = state.points.length
    const pages = Math.max(1, Math.ceil(total / size))
    if (state.page.index > pages - 1) state.page.index = pages - 1
    const start = state.page.index * size
    const end = Math.min(total, start + size)
    const rows = []
    for (let i = end - 1; i >= start; i--) {
      const t = state.timestamps[i]
      const p = state.points[i]
      const prev = i > 0 ? state.points[i - 1] : p
      const rate = (p - prev) / (0.5/60)
      rows.push(`<tr><td>${t}</td><td>${fmt(p)}</td><td>${fmt(rate,1)}</td></tr>`)
    }
    tableBody.innerHTML = rows.join('')
    if (pageInfo) pageInfo.textContent = `第 ${state.page.index + 1}/${pages} 页`
  }

  function init() {
    setConnection(true)
    ensureChart()
    inputs.resetBtn.addEventListener('click', resetData)
    inputs.clearLogBtn.addEventListener('click', () => { log.innerHTML = '' })
    if (state.timer) clearInterval(state.timer)
    state.timer = setInterval(simulateTick, 500)

    if (rowsPerPageInp) {
      state.page.size = parseInt(rowsPerPageInp.value, 10) || 20
      rowsPerPageInp.addEventListener('change', () => {
        state.page.size = Math.max(5, parseInt(rowsPerPageInp.value, 10) || 20)
        state.page.index = 0
        renderTable()
      })
    }
    if (pagePrevBtn && pageNextBtn) {
      pagePrevBtn.addEventListener('click', () => {
        state.page.index = Math.max(0, state.page.index - 1)
        renderTable()
      })
      pageNextBtn.addEventListener('click', () => {
        const pages = Math.max(1, Math.ceil(state.points.length / state.page.size))
        state.page.index = Math.min(pages - 1, state.page.index + 1)
        renderTable()
      })
    }
    renderTable()
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') document.title = '山地浅层滑坡预防监测平台'
  })

  window.addEventListener('load', init)
})()
