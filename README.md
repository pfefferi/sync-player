# Mission Control - Sync Player

A web-based dashboard for synchronized multi-camera video playback with real-time telemetry visualization.

## Features

- **Dual Camera Sync** — Simultaneous playback of two camera feeds (e.g., 4K + 1080p)
- **Telemetry Overlay** — Real-time depth, temperature, and salinity readings
- **Event Timeline** — Clickable event cards for instant navigation
- **Interactive Chart** — Depth visualization with click-to-seek
- **Keyboard Controls** — Space (play/pause), Arrow keys (±5s seek)

## Tech Stack

- Vanilla JavaScript (ES Modules)
- [Chart.js](https://www.chartjs.org/) — Telemetry visualization
- [PapaParse](https://www.papaparse.com/) — CSV parsing
- [Lucide](https://lucide.dev/) — Icons

## Setup

1. Place your data files:
   ```
   data/
   ├── sealog.csv        # Telemetry CSV with timestamps
   ├── videoFiles.json   # List of video filenames
   ├── camA/             # Camera A video chunks
   └── camB/             # Camera B video chunks
   ```

2. Serve locally (requires a web server for ES modules):
   ```bash
   npx serve .
   # or
   python -m http.server 8000
   ```

3. Open in browser: `http://localhost:8000`

## Video Filename Format

Videos should be named with UTC timestamps:
```
2025-12-21 08-30-53 UTC.mp4
```

The player parses these to sync with telemetry data.

## Configuration

Override chunk duration via URL parameter:
```
?chunkDurationMs=15000  # 15 second chunks (default: 10000)
```

## License

MIT
