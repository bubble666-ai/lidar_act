# LiDAR-ACT

**LiDAR Activation & Cloud Transform** — an edge-deployed gateway for real-time LiDAR point cloud ingestion, activation, and tiled distribution.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/bubble666-ai/lidar_act)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)
![Edge Runtime](https://img.shields.io/badge/runtime-Vercel%20Edge-black)
![Version](https://img.shields.io/badge/version-3.1.0-blue)

---

## Overview

LiDAR-ACT provides a globally distributed edge layer between LiDAR field sensors (or client applications) and your point cloud processing backend. It acts as a transparent, low-latency conduit — the edge never inspects or transforms the actual point cloud data.

**Supported formats:** LAS 1.2–1.4 · LAZ · E57 · PLY · 3D Tiles (Cesium)

---

## Architecture

```
          Field Sensors / Client Apps
                    │
                    │ HTTPS (TLS 1.3)
                    ▼
    ┌───────────────────────────────────────┐
    │         Vercel Edge Network           │
    │                                       │
    │  ┌─────────────┐  ┌───────────────┐   │
    │  │  Management  │  │  Data Plane   │   │
    │  │    Plane     │  │  (streaming   │   │
    │  │             │  │   gateway)    │   │
    │  │  /health    │  │               │   │
    │  │  /metrics   │  │  /v1/ingest/* │   │
    │  │  /readyz    │  │  /v1/tiles/*  │   │
    │  └─────────────┘  └───────┬───────┘   │
    │     iad1 · cdg1 · hnd1 · syd1         │
    └───────────────────────────┼───────────┘
                                │
                                │ HTTPS (streamed, unbuffered)
                                ▼
                    ┌───────────────────┐
                    │  LiDAR Processing │
                    │     Cluster       │
                    │                   │
                    │  Point cloud      │
                    │  tiling, filtering │
                    │  classification   │
                    └───────────────────┘
```

### Design Principles

1. **Zero buffering** — Point cloud payloads are streamed through the edge without being held in memory. This is critical for multi-GB `.las` uploads.
2. **Transparent proxy** — The edge layer adds no transformation. Data integrity is preserved byte-for-byte.
3. **Multi-region** — Deployed to 4 edge regions (US-East, Europe, Asia-Pacific, Oceania) for global sensor coverage.
4. **Separation of concerns** — Management plane (health, metrics) is handled locally at the edge; data plane is forwarded upstream.

---

## Project Structure

```
lidar_act/
├── api/
│   └── index.js              # Edge handler — router + dispatch
├── lib/
│   ├── config.js              # Environment & runtime configuration
│   ├── gateway.js             # Upstream dispatch (streaming proxy)
│   ├── sanitizer.js           # RFC 7230 header sanitization
│   ├── logger.js              # OpenTelemetry-aligned telemetry
│   └── responses.js           # JSON:API response envelope builders
├── .gitignore
├── LICENSE
├── package.json
├── vercel.json                # Edge routing, regions, headers
└── README.md
```

### Module Dependency Graph

```
index.js
  ├── config.js          (env vars, feature flags)
  ├── gateway.js         (upstream dispatch)
  │     ├── config.js
  │     └── sanitizer.js (header cleaning, RFC 7230)
  ├── logger.js          (structured telemetry)
  │     └── config.js
  └── responses.js       (JSON:API envelopes)
```

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) v18.17+
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`)
- A LiDAR processing backend (e.g., [PDAL](https://pdal.io)-based tile server)

### Deploy

```bash
# 1. Clone
git clone https://github.com/bubble666-ai/lidar_act.git
cd lidar_act

# 2. Set upstream processing cluster URL
vercel env add TARGET_DOMAIN
# → Enter: https://lidar-processing.example.com

# 3. Deploy
vercel --prod
```

---

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `TARGET_DOMAIN` | ✅ | — | URL of the upstream LiDAR processing cluster |
| `SERVICE_NAME` | — | `lidar-act` | Service identifier in logs & metrics |
| `TELEMETRY` | — | `true` | Enable/disable structured logging |
| `VERBOSE` | — | `false` | Enable DEBUG-level log output |
| `UPSTREAM_TIMEOUT_MS` | — | `25000` | Upstream request timeout (ms) |
| `MAX_PAYLOAD_BYTES` | — | `10485760` | Payload size hint (informational) |

---

## API Reference

### Management Plane

#### `GET /`
Service discovery document with endpoint catalogue.

```json
{
  "meta": { "status": "ok" },
  "data": {
    "service": "lidar-act",
    "version": "3.1.0",
    "links": {
      "health": { "href": "/health" },
      "metrics": { "href": "/metrics" },
      "ingest": { "href": "/v1/ingest/{dataset}", "templated": true },
      "tiles": { "href": "/v1/tiles/{z}/{x}/{y}.laz", "templated": true }
    }
  }
}
```

#### `GET /health` · `GET /healthz` · `GET /readyz`
Kubernetes-compatible liveness/readiness probe.

```bash
curl https://lidar-act.vercel.app/health
```

#### `GET /metrics`
Prometheus exposition format (text/plain 0.0.4).

```
# HELP lidar_act_info Service build metadata
# TYPE lidar_act_info gauge
lidar_act_info{version="3.1.0",env="production"} 1
# HELP lidar_act_upstream_configured Whether upstream is set
# TYPE lidar_act_upstream_configured gauge
lidar_act_upstream_configured 1
```

### Data Plane

All non-management requests are transparently forwarded to `TARGET_DOMAIN`:

```bash
# Upload a point cloud
curl -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary @scan.laz \
  https://lidar-act.vercel.app/v1/ingest/site-42

# Fetch a processed 3D tile
curl https://lidar-act.vercel.app/v1/tiles/14/8192/5461.laz -o tile.laz
```

---

## Observability

### Health Monitoring

Configure your uptime monitor to poll `/health`:
```
GET https://your-deployment.vercel.app/health
Expected: 200 OK, data.status = "healthy"
```

### Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: lidar-act
    scheme: https
    metrics_path: /metrics
    scrape_interval: 30s
    static_configs:
      - targets: ['your-deployment.vercel.app']
```

### Log Format

All logs are emitted as NDJSON and follow OpenTelemetry semantic conventions:

```json
{"ts":"2025-01-15T10:30:00.000Z","sev":"INFO","svc":"lidar-act","ver":"3.1.0","evt":"http.request.in","http.method":"POST","http.target":"/v1/ingest/site-42"}
```

Compatible with Vercel Log Drains → Datadog, Grafana Loki, or any SIEM.

---

## Deployment Regions

| Region | Location | Code | Latency Target |
|---|---|---|---|
| US East | Ashburn, VA | `iad1` | Americas |
| Europe | Paris, FR | `cdg1` | EMEA |
| Asia Pacific | Tokyo, JP | `hnd1` | APAC |
| Oceania | Sydney, AU | `syd1` | Oceania |

---

## Performance Characteristics

| Metric | Value |
|---|---|
| Cold start | < 5 ms (edge runtime, no node_modules) |
| Header processing | < 0.1 ms |
| Payload streaming | Zero-copy pass-through (no buffering) |
| Bundle size | ~4 KB total (zero npm dependencies) |
| Max streaming duration | 300 s (Vercel edge limit) |

---

## Contributing

1. Fork → branch → commit → PR
2. Follow the existing modular pattern (one concern per file in `lib/`)
3. All exported functions must have JSDoc
4. Test locally with `vercel dev`

---

## Related Projects

- [PDAL](https://pdal.io) — Point Data Abstraction Library
- [Entwine](https://entwine.io) — Point cloud indexing
- [Cesium 3D Tiles](https://cesium.com/platform/cesium-ion/3d-tiling/) — OGC 3D Tiles
- [Potree](https://potree.github.io/) — WebGL point cloud renderer

---

## License

[MIT](./LICENSE)
