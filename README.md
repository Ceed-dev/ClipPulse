# ClipPulse — Specification (Short-Video Trend Collector)

**Document version:** 2.0<br>
**Last updated:** 2026-02-02<br>
**Status:** Final (implementation-ready)

## 1. Overview

ClipPulse is an internal tool that collects and aggregates information from short vertical videos and posts on **Instagram** and **X (Twitter)**, then outputs the results into a single Google Spreadsheet per run, with one row per post and one column per metric.

The tool is designed for on-demand usage: data is fetched each time a human runs a query, not on a schedule.

> **Note:** TikTok collection is currently disabled. The TikTok code is preserved for potential future use.

## 2. Purpose

Convert short-video and social media trends into structured, numeric, analyzable data so that the team can use the resulting dataset as reference material when forming hypotheses for later testing.

Manual browsing and manual metric collection is possible but inefficient; ClipPulse automates the workflow to improve speed and consistency.

## 3. Core requirements (confirmed)

### 3.1 What we collect

**Target data:**
- Posts on Instagram
- Tweets/posts on X (Twitter)
- Video-related data associated with those posts
- Metrics are retrieved only via official APIs.

### 3.2 How the tool is used

A human gives instructions in natural language, e.g.:
- "Find 50 posts about skincare trends"
- "Collect 30 tweets about AI from @elonmusk"
- "Instagram posts about fashion, 100 posts"
- "#minimalism #lifestyle from both platforms"

The system interprets instructions, decides API parameters, and retrieves data.

### 3.3 Execution model

- No scheduled crawling.
- Runs are triggered by human interaction only.
- Each execution creates one brand-new Spreadsheet containing:
  - Tab 1: Instagram
  - Tab 2: X (Twitter)

### 3.4 Output format

- Each post = one row
- Each metric = one column
- Include a Drive URL per row that points to the stored "artifact" in Drive
- Include an additional memo column per row for exceptions/notes

## 4. Best-practice decisions (final)

### 4.1 Platform choice

**Google Apps Script (GAS) + Web App** is the primary platform.

**Reasons:**
- No separate server hosting required
- Native integration with Google Sheets and Drive
- Secure access control via Google accounts
- Fast iteration and simple operations for an internal tool

### 4.2 TikTok API choice (DISABLED)

- **Primary:** TikTok Research API (best match for public-content research use cases)
- **Fallback:** TikTok Display API (only when Research API is unavailable and a connected user context is acceptable)

### 4.3 X (Twitter) API choice

**TwitterAPI.io Advanced Search API** is used for X collection.

**Endpoint:** `https://api.twitterapi.io/twitter/tweet/advanced_search`

**Features:**
- Full search query support (keywords, hashtags, from:user, date ranges, language filters)
- Two query types: Latest (recent tweets) and Top (popular tweets)
- Cursor-based pagination for large result sets
- Rich tweet data including engagement metrics and author information

### 4.4 Video/Post storage choice

- **Preferred:** Store the actual video file in Drive when it is feasible via official API-returned URLs and Apps Script limits.
- **Allowed fallback (approved):** If downloading the video file is not feasible, store a Drive "watch artifact" that contains a link to watch the content (so a human can click through and watch).

This preserves the requirement: Drive URL exists and the content is watchable via that link.

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
- One spreadsheet per run, two tabs: Instagram and X

### 5.3 External APIs

- Instagram Graph API (Instagram API with Facebook Login; professional accounts)
- TwitterAPI.io Advanced Search API (for X/Twitter data collection)
- TikTok Research API (disabled; code preserved for future use)
- TikTok Display API (disabled; code preserved for future use)

### 5.4 AI/LLM

**OpenAI GPT-4o via Chat Completions API**
- Model: `gpt-4o` (configurable via `OPENAI_MODEL` Script Property)

**Used for:**
- Parsing the user's natural-language instruction into a structured plan
- Deciding query strategy and parameters within allowed official API capabilities
- Determining target platforms (Instagram, X, or both) from user instruction
- Generating fallback strategies if insufficient results are retrieved
- Producing short, consistent "memo" notes when fields are missing or errors occur

**Why this choice:**
- Highest accuracy / strongest instruction-following among available options
- Supports structured outputs to reduce parsing errors

### 5.5 Auth & secrets management

Store secrets in Apps Script Script Properties (never in client-side code):
- OpenAI API key
- X API key (TwitterAPI.io)
- TikTok client key/secret (disabled)
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

**Data fields toggle:**
- Collapsible sections showing data fields for each platform:
  - Instagram: 23 data fields
  - X (Twitter): 28 data fields
- Displays field name, type, and description for each column

**Status / log view:**
- Shows:
  - Run status badge with spinner (PLANNING / RUNNING_INSTAGRAM / RUNNING_X / FINALIZING / COMPLETED / FAILED)
  - Live status message describing current operation
  - Progress counts with animated progress bars for each platform (Instagram collected, X collected)
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
          x/
          tiktok/
  manifests/
```

### 8.2 Naming conventions

**Run ID:**
- Format: `YYYYMMDD_HHMMSS_<8charHash>`

**Post artifact folder:**
- TikTok: `tiktok/<platform_post_id>/`
- Instagram: `instagram/<platform_post_id>/`
- X: `x/<platform_post_id>/`

**Files inside each post folder:**
- `raw.json` (raw API response for that post)
- `video.mp4` (only if downloaded, for video content)
- `watch.html` (fallback "watch artifact" containing link to view the post)
- `thumbnail.jpg` (optional, if available and feasible)

### 8.3 What "drive_url" means in the sheet

The `drive_url` column contains a reference URL for each post, with platform-specific behavior:

**Instagram:**
- If `video.mp4` exists in Drive → `drive_url` = Google Drive URL to `video.mp4`
- Else → `drive_url` = Google Drive URL to `watch.html`

**X (Twitter):**
- `drive_url` = Direct URL to the tweet on X (e.g., `https://x.com/username/status/123456`)
- Note: Raw JSON and watch.html are still archived in Drive, but the spreadsheet shows the direct tweet URL for easy access

## 9. Spreadsheet output specification

### 9.1 Spreadsheet creation rules

- Each execution creates one new spreadsheet
- It contains two tabs: Instagram and X (TikTok tab is disabled)
- Each tab has:
  - Header row (row 1)
  - Data rows starting at row 2
- Columns are fixed and must not change across runs

### 9.2 Shared columns (both tabs)

These columns appear first in both tabs, in this order:
1. `platform_post_id`
2. `create_username`
3. `posted_at` (ISO 8601 UTC)

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

| Column | Name | Type | Description |
|--------|------|------|-------------|
| 1 | platform_post_id | string | Unique Instagram media ID |
| 2 | create_username | string | Username of the post creator |
| 3 | posted_at | string | Post timestamp in ISO 8601 UTC format |
| 4 | caption_or_description | string | Post caption text |
| 5 | post_url | string | Shareable permalink URL |
| 6 | like_count | number | Number of likes on the post |
| 7 | comments_count | number | Number of comments on the post |
| 8 | media_type | string | IMAGE / VIDEO / CAROUSEL_ALBUM |
| 9 | media_url | string | Direct URL to the media file (may be ephemeral) |
| 10 | thumbnail_url | string | Thumbnail image URL for videos |
| 11 | shortcode | string | Short code extracted from permalink URL |
| 12 | media_product_type | string | FEED / REELS / STORY / AD |
| 13 | is_comment_enabled | boolean | Whether comments are enabled on the post |
| 14 | is_shared_to_feed | boolean | Whether Reel is shared to feed |
| 15 | children | string | JSON string with carousel children info |
| 16 | edges_comments | string | ⚠️ **NOT AVAILABLE** - Comment details (requires separate API) |
| 17 | edges_insights | string | ⚠️ **NOT AVAILABLE** - Own posts only (impressions, reach, etc.) |
| 18 | edges_collaborators | string | ⚠️ **NOT AVAILABLE** - Collaborator list not publicly accessible |
| 19 | boost_ads_list | string | ⚠️ **NOT AVAILABLE** - Own posts only (advertising data) |
| 20 | boost_eligibility_info | string | ⚠️ **NOT AVAILABLE** - Own posts only (boost eligibility) |
| 21 | copyright_check_information_status | string | ⚠️ **NOT AVAILABLE** - Own posts only (copyright status) |
| 22 | drive_url | string | Google Drive URL to video.mp4 or watch.html |
| 23 | memo | string | Notes on missing fields or errors |

> **Note:** Fields marked "⚠️ NOT AVAILABLE" cannot be retrieved for other users' posts due to Instagram API restrictions. These fields will always be empty for hashtag search results. See section 10.3 for details.

### 9.5 X (Twitter) tab columns (full order)

| Column | Name | Type | Description |
|--------|------|------|-------------|
| 1 | platform_post_id | string | Unique tweet ID |
| 2 | create_username | string | Username of the tweet author |
| 3 | posted_at | string | Tweet timestamp |
| 4 | text | string | Tweet text content |
| 5 | post_url | string | URL to the tweet |
| 6 | source | string | Client app used to post the tweet |
| 7 | retweet_count | number | Number of retweets |
| 8 | reply_count | number | Number of replies |
| 9 | like_count | number | Number of likes |
| 10 | quote_count | number | Number of quote tweets |
| 11 | view_count | number | Number of views (impressions) |
| 12 | lang | string | Language code of the tweet |
| 13 | is_reply | boolean | Whether the tweet is a reply |
| 14 | in_reply_to_id | string | ID of the tweet being replied to |
| 15 | conversation_id | string | ID of the conversation thread |
| 16 | author_id | string | Unique ID of the author |
| 17 | author_name | string | Author's username |
| 18 | author_display_name | string | Author's display name |
| 19 | author_followers | number | Author's follower count |
| 20 | author_following | number | Author's following count |
| 21 | author_is_blue_verified | boolean | Whether author has blue verification |
| 22 | author_created_at | string | Author account creation date |
| 23 | hashtags | string | JSON string array of hashtags in the tweet |
| 24 | urls | string | JSON string array of URLs included in the tweet |
| 25 | user_mentions | string | JSON string array of users mentioned in the tweet |
| 26 | media | string | JSON string array of media attachments (images, videos) |
| 27 | drive_url | string | Direct URL to the tweet on X (e.g., `https://x.com/user/status/123`) |
| 28 | memo | string | Notes on missing fields or errors |

> **Note:** For X (Twitter), `drive_url` contains the direct tweet URL for easy access. Raw JSON and watch.html are still archived in Google Drive for backup purposes.

### 9.6 Data encoding rules

- **Arrays/objects** must be stored as JSON strings in a single cell.
- **Timestamps:** Always store `posted_at` as ISO 8601 in UTC.
- **Empty / unavailable values:** Leave blank, and write a short explanation in memo.

## 10. Data retrieval and orchestration

### 10.1 Run lifecycle states

Each run transitions through these states:
1. `CREATED`
2. `PLANNING` (LLM parses instruction into a plan)
3. `RUNNING_INSTAGRAM`
4. `RUNNING_X`
5. `RUNNING_TIKTOK` (skipped - disabled)
6. `FINALIZING`
7. `COMPLETED` or `FAILED`

### 10.2 Run planning (LLM-driven, structured)

**Input:**
- User instruction text

**Output:**
- A structured plan object containing (minimum):
  - target platforms: Instagram, X, or both (default: both)
  - target counts per platform
  - extracted keywords/hashtags/creator handles
  - time window preference (if stated)
  - X query strategy (queryType, fromUsers, language, includeRetweets)
  - region preferences (TikTok; if stated)

**Platform detection:**
- If user mentions "Twitter", "X", "tweets", or "@username" → include X
- If user mentions "Instagram", "IG", "posts", "#hashtag" → include Instagram
- If user doesn't specify a platform → collect from BOTH platforms

**Important:** The plan may influence how to query, but must not change the sheet column schema.

### 10.3 Post selection strategy (AI-driven but constrained)

The system can flexibly decide query parameters, but only within official API capabilities.

#### X (Twitter) - TwitterAPI.io Advanced Search

Use Advanced Search API endpoint:
- **Endpoint:** `https://api.twitterapi.io/twitter/tweet/advanced_search`
- **Method:** GET with `X-API-Key` header

**Build query using:**
- `query` - Combined search query with keywords, hashtags, from:user filters
- `queryType` - "Latest" (recent) or "Top" (popular)
- `cursor` - For pagination

**Query syntax support:**
- Keywords: `"keyword"` or multiple with OR
- Hashtags: `#hashtag`
- User filter: `from:username`
- Date range: `since:YYYY-MM-DD_HH:mm:ss_UTC` and `until:YYYY-MM-DD_HH:mm:ss_UTC`
- Language: `lang:en`
- Exclude retweets: `-is:retweet`

**If insufficient results:**
- Expand date range (e.g., 7 → 21 days)
- Switch queryType from Latest to Top
- Remove restrictive filters

#### TikTok (DISABLED - preserved for future use)

Use Research API video query endpoint with:
- `keyword`, `hashtag_name`, `region_code`, `create_date` range

#### Instagram (Graph API; professional account required)

Use one of these retrieval strategies (chosen by AI):
- **Hashtag-based retrieval** (preferred for trend discovery)
- **Owned-account media retrieval** (fallback)

**Important: Hashtag Search API Limitations**

The Instagram Graph API hashtag search endpoints (`/{hashtag-id}/top_media` and `/{hashtag-id}/recent_media`) return **limited fields only**:

| Available via Hashtag Search | NOT Available via Hashtag Search |
|------------------------------|----------------------------------|
| `id` | `media_url` |
| `caption` | `thumbnail_url` |
| `media_type` | `username` |
| `permalink` | `media_product_type` |
| `timestamp` | `is_comment_enabled` |
| `like_count` | `is_shared_to_feed` |
| `comments_count` | `children` (carousel details) |
| | `insights`, `collaborators`, etc. |

The system attempts to retrieve additional details via `getMediaDetails()` but this typically fails for non-owned media due to Instagram API permission restrictions.

**RapidAPI Data Enrichment (Optional)**

When `INSTAGRAM_RAPIDAPI_KEY` is configured, the system uses the RapidAPI "Instagram API – Fast & Reliable Data Scraper" to enrich hashtag search results with additional fields:

| Field | Official API (Hashtag) | With RapidAPI | Status |
|-------|------------------------|---------------|--------|
| platform_post_id | ✅ | ✅ | **Available** |
| create_username | ❌ | ✅ | **Available with RapidAPI** |
| posted_at | ✅ | ✅ | **Available** |
| caption_or_description | ✅ | ✅ | **Available** |
| post_url | ✅ | ✅ | **Available** |
| like_count | ✅ | ✅ | **Available** |
| comments_count | ✅ | ✅ | **Available** |
| media_type | ✅ | ✅ | **Available** |
| media_url | ❌ | ✅ | **Available with RapidAPI** |
| thumbnail_url | ❌ | ✅ | **Available with RapidAPI** |
| shortcode | ❌ (extractable) | ✅ | **Available** |
| media_product_type | ❌ | ✅ | **Available with RapidAPI** |
| is_comment_enabled | ❌ | ✅ | **Available with RapidAPI** |
| is_shared_to_feed | ❌ | ✅ | **Available with RapidAPI** |
| children | ❌ | ✅ | **Available with RapidAPI** |
| edges_comments | ❌ | ❌ | **NOT Available** (requires separate API) |
| edges_insights | ❌ | ❌ | **NOT Available** (own posts only) |
| edges_collaborators | ❌ | ❌ | **NOT Available** (limited access) |
| boost_ads_list | ❌ | ❌ | **NOT Available** (own posts only) |
| boost_eligibility_info | ❌ | ❌ | **NOT Available** (own posts only) |
| copyright_check_information_status | ❌ | ❌ | **NOT Available** (own posts only) |
| drive_url | (generated) | (generated) | **Available** |
| memo | (generated) | (generated) | **Available** |

**Fields That Cannot Be Retrieved (Any Method):**

The following 6 fields are **impossible to retrieve** for other users' posts, regardless of API or scraping method used:

1. **edges_insights** - Impressions, reach, engagement metrics are private data only available for your own posts via Instagram Business API
2. **edges_collaborators** - Full collaborator list is not publicly accessible
3. **boost_ads_list** - Advertising/promotion data is only available to the post owner
4. **boost_eligibility_info** - Boost eligibility is internal Instagram data for post owners only
5. **copyright_check_information_status** - Copyright status is internal Instagram data for post owners only
6. **edges_comments** - Detailed comment data requires separate API calls; not included in current implementation but technically possible with additional scraping APIs (e.g., [Apify Instagram Comment Scraper](https://apify.com/apify/instagram-comment-scraper))

These fields will be left blank in the spreadsheet, with an explanation in the memo column.

**If insufficient results:**
- try multiple hashtags
- broaden to recent media if top media is limited (if available)
- relax filtering constraints

### 10.4 Deduplication rule (within a run)

- Do not write duplicate `platform_post_id` rows within the same tab.
- If duplicates occur from pagination, skip and note in internal logs (not in row memo unless it affects output).

## 11. Video/Post artifact creation rules

### 11.1 TikTok (DISABLED)

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

### 11.3 X (Twitter)

- Always create a post folder in Drive
- Always store `raw.json`
- Create `watch.html` containing:
  - a clickable link to the tweet URL
  - author username for context
- `drive_url` points to `watch.html`

## 12. Memo column rules (per-row)

The memo column is mandatory and must be populated only when needed.

**Allowed memo content (examples):**
- "like_count not returned (missing permission or field unavailable)"
- "video not downloaded (URL too large); stored watch.html instead"
- "insights edge unavailable for this media; left blank"
- "TikTok Research API unavailable; used Display API fallback; many fields missing"
- "Drive artifact creation failed: [error message]"

**Rules:**
- Must be short (target ≤ 300 characters).
- Must describe what happened and what the system did.

## 13. Internal configuration keys (Script Properties)

**Minimum required keys:**
- `CLIPPULSE_ROOT_FOLDER_ID`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4o`)

**X (Twitter) API:**
- `X_API_KEY` (TwitterAPI.io API key)

**Instagram RapidAPI (optional, for data enrichment):**
- `INSTAGRAM_RAPIDAPI_KEY` - RapidAPI API key (enables fetching additional fields like `media_url` and `username` for hashtag search results)
- `INSTAGRAM_RAPIDAPI_HOST` - API host (required; set to `instagram-api-fast-reliable-data-scraper.p.rapidapi.com` for the "Instagram API – Fast & Reliable Data Scraper" provider)

**Note:** The RapidAPI integration uses the `/media?id=...` endpoint which requires numeric Instagram media IDs. The Basic (free) plan includes 100 requests/month and supports "Media Data" lookups.

**TikTok Research API (disabled):**
- `TIKTOK_RESEARCH_CLIENT_KEY`
- `TIKTOK_RESEARCH_CLIENT_SECRET`

**TikTok Display API (disabled):**
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

**X Collector**
- Uses TwitterAPI.io Advanced Search API
- Builds search queries from plan
- Handles pagination with cursors
- Normalizes fields into required schema
- Creates Drive artifacts
- Writes rows to X tab

**TikTok Collector (disabled)**
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
- Calls OpenAI Chat Completions API
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
   - `OPENAI_MODEL` = `gpt-4o` (or leave unset to use default)

### Phase 2 — API credential setup (required)

**X (Twitter) API:**
1. Obtain API key from TwitterAPI.io
2. Store as `X_API_KEY` in Script Properties

**TikTok Research API (optional - currently disabled):**
1. Create/apply for a Research project in TikTok developer portal
2. Obtain `client_key` and `client_secret`
3. Store in Script Properties

**Instagram Graph API:**
1. Create Meta app
2. Configure Instagram Graph API access
3. Ensure you have an Instagram professional account connected to a Facebook Page
4. Store Meta app credentials in Script Properties

### Phase 3 — Authentication flows (required)

**X (Twitter) - No OAuth needed:**
- TwitterAPI.io uses simple API key authentication
- Pass API key in `X-API-Key` header

**TikTok Research token retrieval (client credentials) - disabled:**
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
   - Create spreadsheet with tabs + headers (Instagram, X)
2. Implement run state persistence
3. Implement batch processing + continuation trigger

### Phase 5 — Collectors + normalization (required)

**X collector:**
- Advanced Search API query + pagination
- Build queries from plan keywords/hashtags/users
- Normalize field names into required column schema

**TikTok collector (disabled):**
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
   - running progress (Instagram and X)
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
   - X tab
3. Each collected post occupies exactly one row in the correct tab.
4. Columns match the specified schema exactly (names + order).
5. Each row contains a valid `drive_url` pointing to:
   - an mp4 file OR a watch artifact in Drive
6. When metrics are missing/unavailable:
   - fields are blank
   - memo contains a short explanation
7. The system completes or fails cleanly without exceeding Apps Script runtime limits (by using batching + continuation).

## 17. References (official docs)

- [TwitterAPI.io — API Reference](https://docs.twitterapi.io/api-reference/endpoint/tweet_advanced_search)
- [TikTok Research API — Getting Started](https://developers.tiktok.com/doc/research-api-get-started)
- [TikTok Research API — Video Query (fields list)](https://developers.tiktok.com/doc/research-api-specs-query-videos/)
- [TikTok — Client Access Token Management (client_credentials)](https://developers.tiktok.com/doc/client-access-token-management)
- [TikTok Display API — Video Query overview](https://developers.tiktok.com/doc/tiktok-api-v2-video-query)
- [Apps Script Quotas (runtime, triggers, urlfetch limits)](https://developers.google.com/apps-script/guides/services/quotas)
- [Apps Script OAuth2 Library (googleworkspace/apps-script-oauth2)](https://github.com/googleworkspace/apps-script-oauth2)
- [Instagram Graph API — Overview](https://developers.facebook.com/docs/instagram-api/)
- [Meta for Developers — Access Tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens)
- [OpenAI — Chat Completions API Reference](https://platform.openai.com/docs/api-reference/chat)
- [OpenAI — Models](https://platform.openai.com/docs/models)
- [OpenAI — Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs)
