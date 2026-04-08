/**
 * MISSION CONTROL DASHBOARD - CORE LOGIC
 * Architecture: Vanilla JS (ESM), pure web standards.
 */

console.log("🛠️ Script app.js loaded.");

// --- CONFIGURATION ---
const urlParams = new URLSearchParams(window.location.search);
const CHUNK_DURATION_PARAM = parseInt(urlParams.get('chunkDurationMs'), 10);
// Default 10 seconds (10000 milliseconds). Can be overridden via URL parameter 'chunkDurationMs'.
const VIDEO_CHUNK_DURATION_MS = isNaN(CHUNK_DURATION_PARAM) || CHUNK_DURATION_PARAM <= 0 ? 10000 : CHUNK_DURATION_PARAM;
const DATA_PATHS = {
    sealog: 'data/sealog.csv',
    videoFiles: 'data/videoFiles.json',
    camA: 'data/camA/',
    camB: 'data/camB/'
};

// --- STATE MANAGEMENT ---
const state = {
    telemetry: [],
    events: [],
    chunks: [],
    currentTime: 0,
    isPlaying: false,
    viewMode: 'split',
    isLoaded: false,
    activeChunk: null, // Track currently active chunk explicitly
    lastRenderedTime: -1 // Track last integer second to throttle UI updates
};

// --- DOM ELEMENTS ---
const elements = {
    videoA: document.getElementById('video-camA'),
    videoB: document.getElementById('video-camB'),
    timeDisplay: document.getElementById('current-time-display'),
    eventList: document.getElementById('event-list'),
    togglePlay: document.getElementById('btn-toggle-play'),
    playIcon: document.getElementById('play-icon'),
    pauseIcon: document.getElementById('pause-icon'),
    videoCanvas: document.getElementById('video-canvas'),
    eventCount: document.getElementById('event-count'),
    valDepth: document.getElementById('val-depth'),
    valTemp: document.getElementById('val-temp'),
    valSal: document.getElementById('val-sal')
};

// --- CHART INSTANCE ---
let telemetryChart = null;

// --- INITIALIZATION ---
async function init() {
    console.log("🚀 Initializing Mission Systems...");

    try {
        // 1. Load Data
        console.log("📡 Fetching sealog data...");
        const [telemetry, events] = await loadSealogData();
        console.log(`✅ Telemetry: ${telemetry.length}, Events: ${events.length}`);

        console.log("📡 Fetching video filenames...");
        const filesRes = await fetch(DATA_PATHS.videoFiles);
        const filenames = await filesRes.json();
        console.log(`✅ Filenames: ${filenames.length}`);

        state.telemetry = telemetry;
        state.events = events;
        state.chunks = mapVideoChunks(filenames);

        // 2. Set Initial Time
        state.currentTime = state.chunks[0]?.startTime || state.telemetry[0]?.timestamp || Date.now();

        // 3. Render Initial UI
        renderEvents();
        initChart();
        // @ts-ignore Lucide is globally available
        lucide.createIcons();

        // 4. Setup Event Listeners
        setupListeners();

        // 5. Start Master Clock
        state.isLoaded = true;
        requestAnimationFrame(clockLoop);

        console.log("✅ All systems go.");
    } catch (err) {
        console.error("❌ Critical System Failure:", err);
        if (elements.eventList) {
            elements.eventList.innerHTML = `<div class="error p-4">SYSTEM ERROR: ${err.message}</div>`;
        }
    }
}

// --- DATA LOADERS ---
async function loadSealogData() {
    return new Promise((resolve, reject) => {
        console.log("📊 Starting Papa.parse...");
        // @ts-ignore Papa is globally available
        Papa.parse(DATA_PATHS.sealog, {
            download: true,
            header: true,
            dynamicTyping: true,
            complete: (results) => {
                console.log("📊 Papa.parse complete.");
                const telemetry = [];
                const events = [];

                results.data.forEach(row => {
                    const ts = row.ts;
                    if (!ts) return;

                    const timestamp = new Date(ts).getTime();

                    const point = {
                        timestamp,
                        depth: row['vehicleRealtimeCTDData.depth_value'],
                        temp: row['vehicleRealtimeCTDData.temp_value'],
                        salinity: row['vehicleRealtimeCTDData.sal_value']
                    };
                    telemetry.push(point);

                    if (row.event_value && row.event_value !== 'ASNAP') {
                        events.push({
                            id: row.id,
                            timestamp,
                            value: row.event_value,
                            text: row.event_free_text,
                            author: row.event_author
                        });
                    }
                });
                resolve([telemetry, events]);
            },
            error: (err) => {
                console.error("PapaParse Error:", err);
                reject(err);
            }
        });
    });
}

function mapVideoChunks(filenames) {
    return filenames.map(fname => {
        // Filename format: "2025-12-21 08-30-53 UTC.mp4"
        const clean = fname.replace(' UTC.mp4', '');
        const [date, time] = clean.split(' ');
        const isoStr = `${date}T${time.replace(/-/g, ':')}Z`;
        const startTime = new Date(isoStr).getTime();

        return {
            startTime,
            endTime: startTime + VIDEO_CHUNK_DURATION_MS,
            camA: DATA_PATHS.camA + fname,
            camB: DATA_PATHS.camB + fname
        };
    }).sort((a, b) => a.startTime - b.startTime);
}

// --- CORE LOGIC: MASTER CLOCK ---
let lastFrameTime = performance.now();

function clockLoop(now) {
    if (state.isPlaying) {
        const delta = now - lastFrameTime;
        state.currentTime += delta;
    }
    lastFrameTime = now;

    updateUI();
    syncVideos();

    requestAnimationFrame(clockLoop);
}

function updateUI() {
    const currentSec = Math.floor(state.currentTime / 1000);
    const hasSecondChanged = currentSec !== state.lastRenderedTime;
    const isSeeking = Math.abs(state.currentTime - (state.lastRenderedTime * 1000)) > 2000;

    if (!hasSecondChanged && !isSeeking) {
        if (state.isPlaying) {
            const date = new Date(state.currentTime);
            elements.timeDisplay.textContent = date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
        }
        return;
    }

    state.lastRenderedTime = currentSec;

    const date = new Date(state.currentTime);
    elements.timeDisplay.textContent = date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');

    const active = state.events.reduce((prev, curr) => {
        if (curr.timestamp <= state.currentTime) {
            return (!prev || curr.timestamp > prev.timestamp) ? curr : prev;
        }
        return prev;
    }, null);

    document.querySelectorAll('.event-card').forEach(card => card.classList.remove('active'));
    if (active) {
        const activeCard = document.getElementById(`event-${active.id}`);
        if (activeCard) {
            activeCard.classList.add('active');

            if (elements.eventList.contains(activeCard)) {
                const rect = activeCard.getBoundingClientRect();
                const containerRect = elements.eventList.getBoundingClientRect();
                if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
                    activeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    }

    const currentPoint = state.telemetry.find(p => p.timestamp >= state.currentTime) || state.telemetry[state.telemetry.length - 1];
    if (currentPoint) {
        elements.valDepth.textContent = (currentPoint.depth || 0).toFixed(1);
        elements.valTemp.textContent = (currentPoint.temp || 0).toFixed(2);
        elements.valSal.textContent = (currentPoint.salinity || 0).toFixed(2);
    }
}

// --- VIDEO SYNC ENGINE ---
function syncVideos(forceSeek = false) {
    const chunk = state.chunks.find(c => state.currentTime >= c.startTime && state.currentTime < c.endTime);

    if (chunk) {
        const offset = (state.currentTime - chunk.startTime) / 1000;
        const sourceChanged = state.activeChunk !== chunk;

        if (sourceChanged) {
            state.activeChunk = chunk;
        }

        [elements.videoA, elements.videoB].forEach((vid, idx) => {
            if (!vid) return;
            const url = idx === 0 ? chunk.camA : chunk.camB;

            if (sourceChanged) {
                vid.src = url;
                vid.onloadedmetadata = () => {
                    vid.currentTime = offset;
                    if (state.isPlaying) vid.play().catch(() => { });
                };
            }

            const drift = Math.abs(vid.currentTime - offset);
            if (forceSeek || drift > 0.25) {
                vid.currentTime = offset;
            }

            if (state.isPlaying && vid.paused) vid.play().catch(() => { });
            if (!state.isPlaying && !vid.paused) vid.pause();
        });
    } else {
        if (state.activeChunk) {
            state.activeChunk = null;
            if (elements.videoA) elements.videoA.pause();
            if (elements.videoB) elements.videoB.pause();
        }
    }
}

// --- UI RENDERING ---
function renderEvents() {
    if (!elements.eventList) return;
    elements.eventList.innerHTML = '';
    elements.eventCount.textContent = `${state.events.length} EVENTS`;

    state.events.forEach(ev => {
        const date = new Date(ev.timestamp);
        const timeStr = date.toISOString().split('T')[1].split('.')[0];

        const card = document.createElement('div');
        card.className = 'event-card';
        card.id = `event-${ev.id}`;
        card.innerHTML = `
            <div class="event-header">
                <span class="event-time">${timeStr} UTC</span>
                <span class="event-author">${ev.author || 'SYSTEM'}</span>
            </div>
            <div class="event-title">${ev.value}</div>
            <div class="event-desc">${ev.text || ''}</div>
        `;

        card.onclick = () => {
            state.currentTime = ev.timestamp;
            syncVideos(true);
            updateUI();
        };

        elements.eventList.appendChild(card);
    });
}

function initChart() {
    const chartEl = document.getElementById('telemetryChart');
    if (!chartEl) return;
    const ctx = chartEl.getContext('2d');

    const chartData = state.telemetry.filter((_, i) => i % 10 === 0);

    // @ts-ignore Chart is globally available
    telemetryChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.map(d => d.timestamp),
            datasets: [{
                label: 'Depth (m)',
                data: chartData.map(d => d.depth),
                borderColor: '#00f2ff',
                backgroundColor: 'rgba(0, 242, 255, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: false },
                y: {
                    display: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1a2632',
                    titleColor: '#00f2ff',
                    bodyColor: '#e0f2f1'
                }
            },
            onClick: (e) => {
                // @ts-ignore Chart is globally available
                const points = telemetryChart.getElementsAtEventForMode(e, 'index', { intersect: false }, true);
                if (points.length > 0) {
                    const index = points[0].index;
                    state.currentTime = chartData[index].timestamp;
                    syncVideos(true);
                    updateUI();
                }
            }
        }
    });
}

// --- EVENT HANDLERS ---
function setupListeners() {
    if (elements.togglePlay) {
        elements.togglePlay.onclick = () => {
            togglePlayback();
        };
    }

    document.querySelectorAll('.btn[data-view]').forEach(btn => {
        btn.onclick = (e) => {
            const target = e.currentTarget;
            const mode = target.dataset.view;
            state.viewMode = mode;

            document.querySelectorAll('.btn[data-view]').forEach(b => b.classList.remove('active'));
            target.classList.add('active');

            if (elements.videoCanvas) {
                elements.videoCanvas.className = `video-canvas ${mode}`;
            }
        };
    });

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            togglePlayback();
        } else if (e.code === 'ArrowRight') {
            state.currentTime += 5000;
            syncVideos(true);
            updateUI();
        } else if (e.code === 'ArrowLeft') {
            state.currentTime -= 5000;
            syncVideos(true);
            updateUI();
        }
    });
}

function togglePlayback() {
    state.isPlaying = !state.isPlaying;
    updatePlayIcon();
}

function updatePlayIcon() {
    if (!elements.playIcon || !elements.pauseIcon) return;
    if (state.isPlaying) {
        elements.playIcon.style.display = 'none';
        elements.pauseIcon.style.display = 'block';
    } else {
        elements.playIcon.style.display = 'block';
        elements.pauseIcon.style.display = 'none';
    }
}

// --- BOOTSTRAP ---
init();
