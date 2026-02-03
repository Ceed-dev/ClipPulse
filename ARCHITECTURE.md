# ClipPulse Architecture

## Overview

ClipPulse is a Google Apps Script-based tool that collects social media data from **Instagram** and **X (Twitter)**, then outputs structured data to Google Sheets. It uses natural language instructions parsed by an LLM to determine collection parameters and target platforms.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Google Apps Script                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Web App    │  │ Orchestrator │  │   Platform Collectors    │  │
│  │   (UI.html)  │→ │  (Control)   │→ │ (Instagram/X/TikTok)     │  │
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
│  - TwitterAPI.io│
│    (X/Twitter)  │
│  - TikTok API   │
│    (disabled)   │
└─────────────────┘
```

## Core Components

### 1. Web UI (`UI.html`)
- Single-page HTML interface served via Apps Script HTML Service
- Handles user instruction input and execution triggering
- Polls backend for run status updates
- Displays progress for both Instagram and X platforms
- Shows collapsible data field reference for each platform
- Dark/Light mode toggle

### 2. Orchestrator (`Orchestrator.js`)
- Controls the entire run lifecycle
- Manages state transitions: `CREATED` → `PLANNING` → `RUNNING_INSTAGRAM` → `RUNNING_X` → `FINALIZING` → `COMPLETED`
- Handles 6-minute execution limit via continuation triggers
- Coordinates platform collectors in sequence
- Supports mock mode for testing

### 3. LLM Planner (`LLMPlanner.js`)
- Parses natural language instructions using OpenAI GPT-4o
- Determines target platforms from instruction context
- Generates structured collection plans with:
  - Target platforms (Instagram, X, or both)
  - Target counts per platform
  - Keywords and hashtags
  - Query strategies (Instagram hashtag search, X query syntax)
  - User handles for targeted collection

### 4. Instagram Collector (`InstagramCollector.js`)
- Implements hashtag search and owned-account retrieval strategies
- Normalizes API responses to fixed 23-column schema
- Handles pagination and deduplication
- Creates Drive artifacts (video or watch.html)
- Supports optional RapidAPI enrichment for hashtag search results

### 4a. Instagram RapidAPI (`InstagramRapidAPI.js`)
- Optional third-party data enrichment for hashtag search results
- Official Instagram Graph API hashtag search returns limited fields (no `media_url`, `username`, etc.)
- RapidAPI `/media?id=...` endpoint provides additional fields
- Uses numeric Instagram media IDs (not shortcodes)
- Gracefully handles "media not found" responses (returns null, doesn't fail)

### 5. X Collector (`XCollector.js`)
- Uses TwitterAPI.io Advanced Search API
- Builds search queries from plan keywords, hashtags, and user handles
- Supports query modifiers: `from:user`, `#hashtag`, `lang:`, date ranges
- Two query types: "Latest" (recent) and "Top" (popular)
- Normalizes API responses to fixed 28-column schema
- Handles cursor-based pagination
- Creates Drive artifacts (watch.html with tweet link)

### 6. State Store (`StateStore.js`)
- Persists run state to Script Properties
- Tracks progress, cursors, and processed IDs for each platform
- Supports `xProgress` alongside `instagramProgress`
- Enables resume after timeout/continuation

### 7. Sheet Writer (`SheetWriter.js`)
- Creates spreadsheets with platform-specific schemas:
  - Instagram: 23 columns
  - X: 28 columns
- Batch writes rows for efficiency
- Handles data normalization per platform

### 8. Drive Manager (`DriveManager.js`)
- Creates folder structure per run with platform subfolders
- Saves artifacts: `raw.json`, `video.mp4`, `watch.html`
- Generates shareable Drive URLs
- Supports Instagram, X, and TikTok folder creation

### 9. Auth (`Auth.js`)
- Manages Meta/Instagram OAuth2 flow
- X (Twitter) uses simple API key auth (no OAuth needed)
- Handles TikTok API authentication (disabled)
- Token refresh and caching

### 10. Mocks (`Mocks.js`)
- Provides mock data generators for testing
- Supports mock mode for Instagram and X collection
- Useful for development without API calls

## Data Flow

```
1. User Input
   └─→ Natural language instruction (e.g., "Find 50 posts about skincare from Instagram and X")

2. Planning Phase
   └─→ LLM parses instruction → Structured plan object
   └─→ Determines platforms: Instagram, X, or both

3. Collection Phase
   Instagram:
   └─→ Instagram Graph API calls → Normalized post data (23 columns)
   └─→ Create Drive artifacts → Get Drive URLs
   └─→ Batch write to Instagram sheet

   X (Twitter):
   └─→ TwitterAPI.io Advanced Search → Normalized tweet data (28 columns)
   └─→ Create Drive artifacts → Get Drive URLs
   └─→ Batch write to X sheet

4. Output
   └─→ Spreadsheet with Instagram tab (23 columns) and X tab (28 columns)
   └─→ Drive folder with raw.json + video/watch artifacts per post
```

## Run Lifecycle

| State | Description |
|-------|-------------|
| `CREATED` | Initial state, run ID generated |
| `PLANNING` | LLM parsing instruction, creating resources |
| `RUNNING_INSTAGRAM` | Collecting Instagram data |
| `RUNNING_X` | Collecting X (Twitter) data |
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
│           ├── x/
│           │   └── <tweet_id>/
│           │       ├── raw.json
│           │       └── watch.html
│           └── tiktok/ (disabled)
└── manifests/

Google Sheets:
ClipPulse_<runId>
├── Instagram (23 columns)
└── X (28 columns)
```

## Spreadsheet Column Schemas

### Instagram Tab (23 columns)
1. platform_post_id
2. create_username
3. posted_at
4. caption_or_description
5. post_url
6. like_count
7. comments_count
8. media_type
9. media_url
10. thumbnail_url
11. shortcode
12. media_product_type
13. is_comment_enabled
14. is_shared_to_feed
15. children
16. edges_comments
17. edges_insights
18. edges_collaborators
19. boost_ads_list
20. boost_eligibility_info
21. copyright_check_information_status
22. drive_url
23. memo

### X Tab (28 columns)
1. platform_post_id
2. create_username
3. posted_at
4. text
5. post_url
6. source
7. retweet_count
8. reply_count
9. like_count
10. quote_count
11. view_count
12. lang
13. is_reply
14. in_reply_to_id
15. conversation_id
16. author_id
17. author_name
18. author_display_name
19. author_followers
20. author_following
21. author_is_blue_verified
22. author_created_at
23. hashtags
24. urls
25. user_mentions
26. media
27. drive_url
28. memo

## Key Design Decisions

### 6-Minute Timeout Handling
- Detects timeout at 5 minutes
- Saves state and schedules continuation trigger
- Resumes from saved cursor position

### Platform Collection Order
- Instagram collected first (if targeted)
- X collected second (if targeted)
- TikTok collected last (currently disabled)

### Video/Post Artifact Strategy
- Instagram: Prefer actual video download when feasible, fallback to `watch.html`
- X: Always create `watch.html` with tweet permalink

### Batch Processing
- Process 10-20 posts per batch
- Single batch write to Sheets (no per-cell loops)

### Deduplication
- Track processed IDs in run state per platform
- Skip duplicates from pagination

### Platform Detection from Instructions
- Keywords like "Twitter", "X", "tweets", "@username" → include X
- Keywords like "Instagram", "IG", "posts" → include Instagram
- No specific platform mention → collect from BOTH platforms

## Configuration

Required Script Properties:
- `OPENAI_API_KEY` - OpenAI API key
- `META_APP_ID` / `META_APP_SECRET` - Meta app credentials (for Instagram)
- `X_API_KEY` - TwitterAPI.io API key (for X)
- `CLIPPULSE_ROOT_FOLDER_ID` - Drive root folder (auto-created)

Optional:
- `OPENAI_MODEL` - Default: `gpt-4o`
- `MAX_POSTS_PER_PLATFORM_DEFAULT` - Default: 30
- `BATCH_SIZE` - Default: 15
- `USE_MOCKS` - Enable mock mode for testing
- `INSTAGRAM_RAPIDAPI_KEY` - RapidAPI key for Instagram data enrichment
- `INSTAGRAM_RAPIDAPI_HOST` - RapidAPI host (e.g., `instagram-api-fast-reliable-data-scraper.p.rapidapi.com`)

## External Dependencies

- **OAuth2 Library**: `googleworkspace/apps-script-oauth2` (v43)
- **OpenAI API**: Chat Completions endpoint with JSON mode
- **Instagram Graph API**: v18.0+ (requires professional account)
- **Instagram RapidAPI** (optional): "Instagram API – Fast & Reliable Data Scraper" for data enrichment
- **TwitterAPI.io**: Advanced Search API (API key authentication)

## X API Query Syntax

The X collector supports rich query syntax:

| Syntax | Example | Description |
|--------|---------|-------------|
| Keywords | `"AI" OR "machine learning"` | Search for keywords |
| Hashtags | `#tech #AI` | Search by hashtag |
| From user | `from:elonmusk` | Tweets from specific user |
| Date range | `since:2024-01-01_00:00:00_UTC` | Tweets after date |
| Language | `lang:en` | Filter by language |
| Exclude RT | `-is:retweet` | Exclude retweets |

Query type options:
- `Latest` - Most recent tweets matching query
- `Top` - Most popular/engaging tweets matching query
