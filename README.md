# ClipPulse — Specification (Short-Video Trend Collector)

**Document version:** 1.0<br>
**Last updated:** 2026-01-22<br>
**Status:** Final (implementation-ready)

---

## 1. Overview

ClipPulse is an internal tool that collects and aggregates information from short vertical videos posted on Instagram, then outputs the results into a single Google Spreadsheet per run, with one row per post and one column per metric.

The tool is designed for on-demand usage: data is fetched each time a human runs a query, not on a schedule.

> **Note:** TikTok collection is currently disabled. The TikTok code is preserved for potential future use.

## 2. Purpose

Convert short-video market trends into structured, numeric, analyzable data so that the team can use the resulting dataset as reference material when forming hypotheses for later testing.

Manual browsing and manual metric collection is possible but inefficient; ClipPulse automates the workflow to improve speed and consistency.

## 3. Core requirements (confirmed)

### 3.1 What we collect

**Target data:**
- Posts on Instagram
- Video-related data associated with those posts
- Metrics are retrieved only via official APIs.

### 3.2 How the tool is used

A human gives instructions in natural language, e.g.:
- "Find 50 posts about skincare trends"
- "Collect TikTok only, 100 posts, US region"
- "Focus on fitness creators"

The system interprets instructions, decides API parameters, and retrieves data.

### 3.3 Execution model

- No scheduled crawling.
- Runs are triggered by human interaction only.
- Each execution creates one brand-new Spreadsheet containing:
  - Tab 1: Instagram

### 3.4 Output format

- Each post = one row
- Each metric = one column
- Include a Drive URL per row that points to the stored "video artifact" in Drive
- Include an additional memo column per row for exceptions/notes

## 4. Best-practice decisions (final)

### 4.1 Platform choice

**Google Apps Script (GAS) + Web App** is the primary platform.

**Reasons:**
- No separate server hosting required
- Native integration with Google Sheets and Drive
- Secure access control via Google accounts
- Fast iteration and simple operations for an internal tool

### 4.2 TikTok API choice

- **Primary:** TikTok Research API (best match for public-content research use cases)
- **Fallback:** TikTok Display API (only when Research API is unavailable and a connected user context is acceptable)

**Rationale:**
- Research API supports querying public content via structured query conditions.
- Display API is typically tied to authorized user data and may not satisfy "trend research" goals.

### 4.3 Video storage choice

- **Preferred:** Store the actual video file in Drive when it is feasible via official API-returned URLs and Apps Script limits.
- **Allowed fallback (approved):** If downloading the video file is not feasible, store a Drive "watch artifact" that contains a link to watch the video (so a human can click through and watch).

This preserves the requirement: Drive URL exists and the video is watchable via that link.

## 5. Technical stack

### 5.1 Runtime and hosting

- Google Apps Script (V8 runtime)
- Apps Script Web App deployment
- Frontend: HTML Service
- Backend: Apps Script server functions

### 5.2 Storage

**Google Drive:**
- Run folders
- Per-post artifact files (video or watch artifact)
- Per-post raw metadata JSON
- Run manifest JSON

**Google Sheets:**
- One spreadsheet per run, two tabs

### 5.3 External APIs

- Instagram Graph API (Instagram API with Facebook Login; professional accounts)
- TikTok Research API (disabled; code preserved for future use)
- TikTok Display API (disabled; code preserved for future use)

### 5.4 AI/LLM

**OpenAI GPT-5.2 Pro via Responses API**
- Model: `gpt-5.2-pro`

**Used for:**
- Parsing the user's natural-language instruction into a structured plan
- Deciding query strategy and parameters within allowed official API capabilities
- Generating fallback strategies if insufficient results are retrieved
- Producing short, consistent "memo" notes when fields are missing or errors occur

**Why this choice:**
- Highest accuracy / strongest instruction-following among available options
- Supports structured outputs to reduce parsing errors

### 5.5 Auth & secrets management

Store secrets in Apps Script Script Properties (never in client-side code):
- OpenAI API key
- TikTok client key/secret
- Meta app credentials

Use `googleworkspace/apps-script-oauth2` library for 3-legged OAuth flows (Meta + TikTok Display, if enabled).

## 6. Constraints and quotas (must design around)

Apps Script has hard limits that affect reliability:
- **Script runtime limit:** 6 minutes per execution
- **UrlFetch limits:** request/response size limits and daily call quotas
- **Triggers per user per script:** limited (must keep active trigger count low)

Therefore, ClipPulse must implement **batch processing + continuation**:
- Process items in batches (e.g., 10–20 posts at a time)
- Persist run state
- If not finished, schedule a short-delay continuation trigger (not a periodic schedule; only a continuation mechanism)

## 7. UI/UX specification (Web App)

### 7.1 Single-page UI components

**Header:**
- App title and subtitle
- Dark/Light mode toggle button (preference saved to localStorage)

**Instruction input:**
- Multiline text area
- Placeholder examples

**Execute button:**
- Starts a new run immediately

**Status / log view:**
- Shows:
  - Run status badge with spinner (PLANNING / RUNNING / COMPLETED / FAILED)
  - Live status message describing current operation
  - Progress counts with animated progress bar (Instagram collected)
  - Error messages when applicable

**Result link:**
- Link to the generated spreadsheet once created (even if still running)

### 7.2 Interaction flow

1. User enters instruction and clicks Execute
2. UI immediately shows:
   - Run ID
   - Link to spreadsheet (created at run start)
3. UI polls run status (e.g., every 3–5 seconds)
4. When completed, UI shows final counts and keeps the spreadsheet link

## 8. Data storage design (Drive)

### 8.1 Root folder structure

A single root folder is created once:

```
ClipPulse/
  runs/
    YYYY/
      MM/
        YYYYMMDD_HHMMSS_<runShortId>/
          spreadsheet/
          instagram/
          tiktok/
  manifests/
```

### 8.2 Naming conventions

**Run ID:**
- Format: `YYYYMMDD_HHMMSS_<8charHash>`

**Post artifact folder:**
- TikTok: `tiktok/<platform_post_id>/`
- Instagram: `instagram/<platform_post_id>/`

**Files inside each post folder:**
- `raw.json` (raw API response for that post)
- `video.mp4` (only if downloaded)
- `watch.html` (fallback "watch artifact" if video not downloaded)
- `thumbnail.jpg` (optional, if available and feasible)

### 8.3 What "Drive URL" means in the sheet

For each row, `drive_url` must point to the primary artifact:
- If `video.mp4` exists → `drive_url` = URL to `video.mp4`
- Else → `drive_url` = URL to `watch.html`

## 9. Spreadsheet output specification

### 9.1 Spreadsheet creation rules

- Each execution creates one new spreadsheet
- It contains one tab:
  - Instagram
- The tab has:
  - Header row (row 1)
  - Data rows starting at row 2
- Columns are fixed and must not change across runs

### 9.2 Shared columns (both tabs)

These columns appear first in both tabs, in this order:
1. `platform_post_id`
2. `create_username`
3. `posted_at` (ISO 8601 UTC)
4. `caption_or_description`

### 9.3 TikTok tab columns (DISABLED - preserved for future use)

| Column | Name | Type | Notes |
|--------|------|------|-------|
| 1 | platform_post_id | string | TikTok video ID |
| 2 | create_username | string | TikTok username |
| 3 | posted_at | string | ISO 8601 UTC |
| 4 | caption_or_description | string | from video_description |
| 5 | region_code | string | |
| 6 | music_id | string/number | store as string to avoid precision issues |
| 7 | hashtag_names | string | JSON string array |
| 8 | effect_ids | string | JSON string array |
| 9 | favorites_count | number | normalize from API (handle spelling differences) |
| 10 | video_duration | number | seconds |
| 11 | is_stem_verified | boolean | |
| 12 | voice_to_text | string | subtitles/transcription if provided |
| 13 | view | number | normalize from view_count |
| 14 | like | number | normalize from like_count |
| 15 | comments | number | normalize from comment_count |
| 16 | share_count | number | |
| 17 | playlist_id | string | |
| 18 | hashtag_info_list | string | JSON string array/object |
| 19 | sticker_info_list | string | JSON string array/object |
| 20 | effect_info_list | string | JSON string array/object |
| 21 | video_mention_list | string | JSON string array/object |
| 22 | video_label | string | JSON or string depending on API |
| 23 | video_tag | string | JSON or string depending on API |
| 24 | drive_url | string | Drive URL to primary artifact |
| 25 | memo | string | short note on missing fields/errors |

### 9.4 Instagram tab columns (full order)

| Column | Name | Type | Notes |
|--------|------|------|-------|
| 1 | platform_post_id | string | IG media ID |
| 2 | create_username | string | username |
| 3 | posted_at | string | ISO 8601 UTC |
| 4 | caption_or_description | string | caption text |
| 5 | post_url | string | share URL (permalink) |
| 6 | like_count | number | |
| 7 | comments_count | number | |
| 8 | media_type | string | IMAGE / VIDEO / CAROUSEL_ALBUM (etc) |
| 9 | media_url | string | may be ephemeral; store as returned |
| 10 | thumbnail_url | string | for video |
| 11 | shortcode | string | if available; else derive from permalink when possible |
| 12 | media_product_type | string | FEED / REELS / STORY / AD (when available) |
| 13 | is_comment_enabled | boolean | when available |
| 14 | is_shared_to_feed | boolean | Reels-specific when available |
| 15 | children | string | JSON string (carousel children info) |
| 16 | edges_comments | string | JSON string (summary or first N comments) |
| 17 | edges_insights | string | JSON string (metrics payload) |
| 18 | edges_collaborators | string | JSON string list |
| 19 | boost_ads_list | string | JSON string when available |
| 20 | boost_eligibility_info | string | JSON string when available |
| 21 | copyright_check_information_status | string | status string when available |
| 22 | drive_url | string | Drive URL to primary artifact |
| 23 | memo | string | short note on missing fields/errors |

### 9.5 Data encoding rules

- **Arrays/objects** must be stored as JSON strings in a single cell.
- **Timestamps:** Always store `posted_at` as ISO 8601 in UTC.
- **Empty / unavailable values:** Leave blank, and write a short explanation in memo.

## 10. Data retrieval and orchestration

### 10.1 Run lifecycle states

Each run transitions through these states:
1. `CREATED`
2. `PLANNING` (LLM parses instruction into a plan)
3. `RUNNING_INSTAGRAM`
4. `FINALIZING`
5. `COMPLETED` or `FAILED`

> **Note:** `RUNNING_TIKTOK` state is skipped (TikTok collection disabled).

### 10.2 Run planning (LLM-driven, structured)

**Input:**
- User instruction text

**Output:**
- A structured plan object containing (minimum):
  - target platforms: Instagram, TikTok, or both
  - target counts per platform
  - extracted keywords/hashtags/creator handles
  - time window preference (if stated)
  - region preferences (TikTok; if stated)

**Important:** The plan may influence how to query, but must not change the sheet column schema.

### 10.3 Post selection strategy (AI-driven but constrained)

The system can flexibly decide query parameters, but only within official API capabilities.

#### TikTok (preferred: Research API)

Use Research API video query endpoint

**Build query conditions using:**
- `keyword` (from instruction)
- `hashtag_name` (from instruction)
- `region_code` (if specified)
- `create_date` range (default if not specified)

**Pagination:**
- use cursor/search_id per API rules until target count reached or no more results

**If insufficient results:**
- expand date range (e.g., last 7 → 30 days)
- add synonyms/related keywords (LLM-generated)
- switch `is_random` to true if appropriate to broaden sampling

#### TikTok fallback (Display API)

- Only if Research API is not configured/available
- Collect what is possible for the authorized user context
- Missing fields must be blank + memo

#### Instagram (Graph API; professional account required)

Use one of these retrieval strategies (chosen by AI):
- **Hashtag-based retrieval** (preferred for trend discovery)
- **Owned-account media retrieval** (fallback)

**If insufficient results:**
- try multiple hashtags
- broaden to recent media if top media is limited (if available)
- relax filtering constraints

### 10.4 Deduplication rule (within a run)

- Do not write duplicate `platform_post_id` rows within the same tab.
- If duplicates occur from pagination, skip and note in internal logs (not in row memo unless it affects output).

## 11. Video artifact creation rules

### 11.1 TikTok

Because Research API does not guarantee a direct downloadable video file:
- Always create a post folder in Drive
- Always store `raw.json`
- Create `watch.html` containing:
  - a clickable TikTok watch URL (constructed from username + id when share URL is not provided)
  - any additional links returned by fallback APIs (e.g., embed link)
- If video download becomes feasible via official means:
  - Download only when it does not exceed Apps Script fetch limits
  - Otherwise keep watch artifact only

### 11.2 Instagram

- Always create a post folder in Drive
- Always store `raw.json`
- If `media_url` is a video URL and downloading is feasible within Apps Script limits:
  - download and store `video.mp4`
- Else:
  - store `watch.html` linking to `post_url` (permalink)
- If `thumbnail_url` exists and download is feasible:
  - store `thumbnail.jpg` (optional)

## 12. Memo column rules (per-row)

The memo column is mandatory and must be populated only when needed.

**Allowed memo content (examples):**
- "like_count not returned (missing permission or field unavailable)"
- "video not downloaded (URL too large); stored watch.html instead"
- "insights edge unavailable for this media; left blank"
- "TikTok Research API unavailable; used Display API fallback; many fields missing"

**Rules:**
- Must be short (target ≤ 300 characters).
- Must describe what happened and what the system did.

## 13. Internal configuration keys (Script Properties)

**Minimum required keys:**
- `CLIPPULSE_ROOT_FOLDER_ID`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-5.2-pro`)

**TikTok Research API:**
- `TIKTOK_RESEARCH_CLIENT_KEY`
- `TIKTOK_RESEARCH_CLIENT_SECRET`

**TikTok Display API (optional):**
- `TIKTOK_DISPLAY_CLIENT_KEY`
- `TIKTOK_DISPLAY_CLIENT_SECRET`

**Instagram / Meta:**
- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_API_VERSION` (stored to allow quick upgrades)
- `IG_DEFAULT_PAGE_ID` (or equivalent selection mechanism)
- `IG_DEFAULT_IG_USER_ID` (resolved during setup)

**Operational:**
- `MAX_POSTS_PER_PLATFORM_DEFAULT` (e.g., 30)
- `BATCH_SIZE` (e.g., 10–20)
- `MAX_RETRIES` (e.g., 3)
- `RETRY_BACKOFF_MS` (e.g., 1000 → exponential)

## 14. Implementation design (module responsibilities)

### 14.1 Apps Script files/modules (logical)

The codebase must be structured by responsibility. Example logical modules:

**Web UI**
- Serves HTML
- Starts run
- Polls run status

**Run Orchestrator**
- Creates run folders + spreadsheet
- Stores run state
- Schedules continuation triggers
- Coordinates platform collectors

**Instagram Collector**
- Retrieves posts via official API strategy
- Fetches per-media details/edges as needed
- Normalizes fields
- Creates Drive artifacts
- Writes rows to Instagram tab

**TikTok Collector**
- Uses Research API when configured
- Fallback to Display API when needed
- Normalizes fields
- Creates Drive artifacts
- Writes rows to TikTok tab

**Sheet Writer**
- Creates tabs
- Writes headers
- Appends rows in batches

**Drive Manager**
- Creates folder structure
- Writes `raw.json`
- Writes `watch.html`
- Saves media files when possible

**LLM Planner**
- Calls OpenAI Responses API
- Produces structured plan
- Produces concise memo messages when needed

**State Store**
- Persists run state (status, cursors, progress, created IDs)
- Supports resume after trigger continuation

## 15. Concrete implementation steps (phased)

### Phase 1 — Google project setup (minimal, required)

1. Create a new Apps Script project named `ClipPulse`
2. Create the Drive root folder `ClipPulse/` and record its folder ID
3. Deploy as a Web App (initial deployment)
4. Add Script Properties:
   - `CLIPPULSE_ROOT_FOLDER_ID`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` = `gpt-5.2-pro`

### Phase 2 — API credential setup (required)

**TikTok Research API:**
1. Create/apply for a Research project in TikTok developer portal
2. Obtain `client_key` and `client_secret`
3. Store in Script Properties

**Instagram Graph API:**
1. Create Meta app
2. Configure Instagram Graph API access
3. Ensure you have an Instagram professional account connected to a Facebook Page
4. Store Meta app credentials in Script Properties

### Phase 3 — Authentication flows (required)

**TikTok Research token retrieval (client credentials):**
- Store `access_token` and `expires_at` in Script Properties (or in run state cache)
- Refresh automatically when expired

**Meta (Instagram) OAuth flow:**
- Use Apps Script OAuth2 library
- Persist tokens securely
- Resolve and store default `ig_user_id` / page token during setup

### Phase 4 — Core run orchestration (required)

1. Implement "Create run":
   - Generate run ID
   - Create Drive run folder structure
   - Create spreadsheet with two tabs + headers
2. Implement run state persistence
3. Implement batch processing + continuation trigger

### Phase 5 — Collectors + normalization (required)

**TikTok collector:**
- Research API query + pagination
- Normalize field names into required column schema

**Instagram collector:**
- Hashtag strategy + fallback strategy
- Fetch media details and optional edges
- Normalize into required schema

### Phase 6 — Artifacts + sheet writing (required)

For each post:
1. Create Drive post folder
2. Write `raw.json`
3. Create `video.mp4` OR `watch.html`
4. Set `drive_url` accordingly
5. Append rows in batches (never per-cell loops)

### Phase 7 — UI + status polling (required)

1. Build HTML UI page
2. Implement server endpoints:
   - start run
   - get run status
3. Display:
   - running progress
   - spreadsheet link

### Phase 8 — Reliability hardening (required)

1. Add retries (429/5xx with exponential backoff)
2. Add run failure recovery:
   - If partial success, keep spreadsheet and mark run failed with reason
3. Ensure memo column is populated for all missing critical fields

## 16. Acceptance criteria

A run is considered correct when:

1. A user can open the Web App, submit an instruction, and start a run.
2. A new spreadsheet is created for each run and contains:
   - Instagram tab
3. Each collected post occupies exactly one row in the correct tab.
4. Columns match the specified schema exactly (names + order).
5. Each row contains a valid `drive_url` pointing to:
   - an mp4 file OR a watch artifact in Drive
6. When metrics are missing/unavailable:
   - fields are blank
   - memo contains a short explanation
7. The system completes or fails cleanly without exceeding Apps Script runtime limits (by using batching + continuation).

## 17. References (official docs)

- [TikTok Research API — Getting Started](https://developers.tiktok.com/doc/research-api-get-started)
- [TikTok Research API — Video Query (fields list)](https://developers.tiktok.com/doc/research-api-specs-query-videos/)
- [TikTok — Client Access Token Management (client_credentials)](https://developers.tiktok.com/doc/client-access-token-management)
- [TikTok Display API — Video Query overview](https://developers.tiktok.com/doc/tiktok-api-v2-video-query)
- [Apps Script Quotas (runtime, triggers, urlfetch limits)](https://developers.google.com/apps-script/guides/services/quotas)
- [Apps Script OAuth2 Library (googleworkspace/apps-script-oauth2)](https://github.com/googleworkspace/apps-script-oauth2)
- [OpenAI — Responses API Reference](https://platform.openai.com/docs/api-reference/responses)
- [OpenAI — Using GPT-5.2 (model names)](https://platform.openai.com/docs/guides/latest-model)
- [OpenAI — Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs)
