# ClipPulse Architecture

## Overview

ClipPulse is a Google Apps Script-based tool that collects short-form video data from Instagram and outputs structured data to Google Sheets. It uses natural language instructions parsed by an LLM to determine collection parameters.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Google Apps Script                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Web App    │  │ Orchestrator │  │   Platform Collectors    │  │
│  │   (UI.html)  │→ │  (Control)   │→ │ (Instagram/TikTok)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│         ↓                ↓                       ↓                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  LLM Planner │  │ State Store  │  │    Sheet Writer          │  │
│  │  (OpenAI)    │  │ (Properties) │  │    Drive Manager         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         ↓                                         ↓
┌─────────────────┐                    ┌───────────────────────────┐
│  OpenAI API     │                    │     Google Services       │
│  (GPT-4o)       │                    │  - Google Drive           │
└─────────────────┘                    │  - Google Sheets          │
                                       │  - Script Properties      │
┌─────────────────┐                    └───────────────────────────┘
│ External APIs   │
│  - Instagram    │
│    Graph API    │
│  - TikTok API   │
│    (disabled)   │
└─────────────────┘
```

## Core Components

### 1. Web UI (`UI.html`)
- Single-page HTML interface served via Apps Script HTML Service
- Handles user instruction input and execution triggering
- Polls backend for run status updates
- Displays progress, results, and spreadsheet links

### 2. Orchestrator (`Orchestrator.js`)
- Controls the entire run lifecycle
- Manages state transitions: `CREATED` → `PLANNING` → `RUNNING_INSTAGRAM` → `FINALIZING` → `COMPLETED`
- Handles 6-minute execution limit via continuation triggers
- Coordinates platform collectors

### 3. LLM Planner (`LLMPlanner.js`)
- Parses natural language instructions using OpenAI GPT-4o
- Generates structured collection plans with:
  - Target platforms and counts
  - Keywords and hashtags
  - Query strategies

### 4. Instagram Collector (`InstagramCollector.js`)
- Implements hashtag search and owned-account retrieval strategies
- Normalizes API responses to fixed column schema
- Handles pagination and deduplication

### 5. State Store (`StateStore.js`)
- Persists run state to Script Properties
- Tracks progress, cursors, and processed IDs
- Enables resume after timeout/continuation

### 6. Sheet Writer (`SheetWriter.js`)
- Creates spreadsheets with fixed 23-column schema
- Batch writes rows for efficiency
- Handles data normalization

### 7. Drive Manager (`DriveManager.js`)
- Creates folder structure per run
- Saves artifacts: `raw.json`, `video.mp4`, `watch.html`
- Generates shareable Drive URLs

### 8. Auth (`Auth.js`)
- Manages Meta/Instagram OAuth2 flow
- Handles TikTok API authentication (disabled)
- Token refresh and caching

## Data Flow

```
1. User Input
   └─→ Natural language instruction (e.g., "Find 50 posts about skincare")

2. Planning Phase
   └─→ LLM parses instruction → Structured plan object

3. Collection Phase
   └─→ Instagram API calls → Normalized post data
   └─→ Create Drive artifacts → Get Drive URLs
   └─→ Batch write to Sheets

4. Output
   └─→ Spreadsheet with 23 columns per post
   └─→ Drive folder with raw.json + video/watch artifacts
```

## Run Lifecycle

| State | Description |
|-------|-------------|
| `CREATED` | Initial state, run ID generated |
| `PLANNING` | LLM parsing instruction, creating resources |
| `RUNNING_INSTAGRAM` | Collecting Instagram data |
| `RUNNING_TIKTOK` | (Disabled) Collecting TikTok data |
| `FINALIZING` | Optimizing spreadsheet, saving manifest |
| `COMPLETED` | Run finished successfully |
| `FAILED` | Run encountered unrecoverable error |

## Storage Structure

```
Google Drive:
ClipPulse/
├── runs/
│   └── YYYY/MM/
│       └── YYYYMMDD_HHMMSS_<hash>/
│           ├── spreadsheet/
│           ├── instagram/
│           │   └── <post_id>/
│           │       ├── raw.json
│           │       ├── video.mp4 (if downloadable)
│           │       └── watch.html (fallback)
│           └── tiktok/ (disabled)
└── manifests/

Google Sheets:
ClipPulse_<runId>
└── Instagram (23 columns)
```

## Key Design Decisions

### 6-Minute Timeout Handling
- Detects timeout at 5 minutes
- Saves state and schedules continuation trigger
- Resumes from saved cursor position

### Video Artifact Strategy
- Prefer actual video download when feasible
- Fallback to `watch.html` with permalink for large files or API limitations

### Batch Processing
- Process 10-20 posts per batch
- Single batch write to Sheets (no per-cell loops)

### Deduplication
- Track processed IDs in run state
- Skip duplicates from pagination

## Configuration

Required Script Properties:
- `OPENAI_API_KEY` - OpenAI API key
- `META_APP_ID` / `META_APP_SECRET` - Meta app credentials
- `CLIPPULSE_ROOT_FOLDER_ID` - Drive root folder (auto-created)

Optional:
- `OPENAI_MODEL` - Default: `gpt-4o`
- `MAX_POSTS_PER_PLATFORM_DEFAULT` - Default: 30
- `BATCH_SIZE` - Default: 15

## External Dependencies

- **OAuth2 Library**: `googleworkspace/apps-script-oauth2` (v43)
- **OpenAI API**: Chat Completions endpoint with JSON mode
- **Instagram Graph API**: v18.0+ (requires professional account)
