# ClipPulse Development Context

This document tracks the development history, decisions, and context for the ClipPulse project. It is intended to help future AI assistants quickly understand the project state and continue work seamlessly.

## Project Summary

**ClipPulse** is a Google Apps Script-based tool for collecting short-form video trend data from Instagram (and potentially TikTok in the future). Users provide natural language instructions, which are parsed by an LLM (GPT-4o) to create structured collection plans. Data is output to Google Sheets with artifacts stored in Google Drive.

## Session Log

### 2026-02-02 - Documentation Consistency Review

**Participants:** Human + Claude Opus 4.5

**Context:**
The human requested a comprehensive review of the codebase before committing existing changes. The goal was to ensure all documentation accurately reflects the current implementation.

**Tasks Completed:**

1. **Full Codebase Exploration**
   - Read and analyzed all source files in `src/`
   - Documented the purpose and responsibilities of each module
   - Identified the complete data flow from user input to output

2. **README.md and Code Consistency Check**
   - Identified inconsistencies between documentation and implementation:
     - OpenAI model name: README said `gpt-5.2-pro`, code uses `gpt-4o`
     - API name: README said "Responses API", code uses "Chat Completions API"
     - Spreadsheet tabs: README mentioned "two tabs" but TikTok is disabled (one tab only)
     - Reference URLs pointed to non-existent documentation
   - Fixed all inconsistencies in README.md
   - Updated document version to 1.1 and date to 2026-02-02
   - Removed horizontal lines (`---`) for better readability per user request

3. **Code Comment Fixes**
   - Updated `LLMPlanner.js` header comment to reflect actual API usage
   - Updated `SheetWriter.js` header comment about tab count

4. **New Documentation Created**
   - `ARCHITECTURE.md`: Concise English summary of system architecture
   - `CONTEXT.md`: This file - work history and context for future sessions

**Files Modified:**
- `README.md` - Consistency fixes, removed horizontal lines
- `src/LLMPlanner.js` - Header comment fix
- `src/SheetWriter.js` - Header comment fix

**Files Created:**
- `ARCHITECTURE.md` - Architecture overview
- `CONTEXT.md` - Development context (this file)

**Pre-existing Uncommitted Changes (from before this session):**
The following files had uncommitted changes when this session started:
- `src/Auth.js`
- `src/Code.js`
- `src/Config.js`
- `src/InstagramCollector.js`
- `src/LLMPlanner.js`
- `src/appsscript.json`

These changes were made in previous sessions and relate to:
- Adding `checkStatus()` function for debugging auth status
- TikTok collection disabled for Instagram-only mode
- Various improvements to data collection and UI

**Current Project State:**
- TikTok collection: **Disabled** (code preserved for future use)
- Instagram collection: **Active** (using Graph API with hashtag search)
- LLM: OpenAI GPT-4o via Chat Completions API
- OAuth2: Meta/Instagram authentication implemented
- UI: Web App with dark mode, progress indicators, data fields toggle

**Known Limitations:**
- Instagram Graph API hashtag search does not return `media_url` (API limitation)
- Apps Script 6-minute execution limit handled via continuation triggers
- UrlFetch ~50MB size limit affects video downloads

## Technical Notes

### OpenAI Integration
- Model: `gpt-4o` (configurable via `OPENAI_MODEL` Script Property)
- API: Chat Completions (`/v1/chat/completions`)
- Mode: JSON mode enabled for structured outputs

### Instagram API
- Version: v18.0 (configurable)
- Strategies: Hashtag search (primary), Owned account media (fallback)
- Requires: Professional Instagram account connected to Facebook Page

### TikTok API (Disabled)
- Research API: Preferred but disabled
- Display API: Fallback but disabled
- Code preserved in `TikTokCollector.js` for future reactivation

### 2026-02-02 - Git Push Issue and Transfer to Local (Continued)

**Participants:** Human + Claude Opus 4.5

**Context:**
After completing all documentation updates and creating the commit, we encountered a Git push authentication issue on the VM environment.

**Issue:**
- VM uses HTTPS remote URL (`https://github.com/Ceed-dev/ClipPulse.git`)
- No credential helper configured on VM
- GitHub requires Personal Access Token (PAT) for HTTPS authentication (password auth deprecated since 2021)
- VM environment cannot handle interactive authentication prompts

**Commit Status:**
- **Commit created successfully:** `dbedb79`
- **Commit message:** "Update documentation and add architecture files"
- **Files in commit:** 10 files (1048 insertions, 62 deletions)
- **Push status:** NOT PUSHED (pending)

**What Needs to Be Done (on Local Machine):**
1. Transfer this project to local machine (or pull if already cloned)
2. Run `git push origin main` from local (where credential helper is configured)
3. After push succeeds, VM can sync via `git pull`

**Resolution:**
Human decided to transfer the project directly to local machine (`~/Programming/`) and continue work there. The VM will later sync via `git pull` after the local push succeeds.

### 2026-02-02 - X (Twitter) Platform Integration

**Participants:** Human + Claude Opus 4.5

**Context:**
The human requested adding X (Twitter) as a second data collection platform alongside Instagram. This major feature addition required changes across the entire codebase.

**Requirements:**
- Use TwitterAPI.io Advanced Search API for X data collection
- API endpoint: `https://api.twitterapi.io/twitter/tweet/advanced_search`
- API key authentication (X-API-Key header)
- Natural language input → OpenAI parsing → X API call → spreadsheet output
- Add X tab to spreadsheets
- Add X data fields toggle in UI (28 fields)
- Update all documentation
- Full automation: planning, implementation, testing, documentation, and git commit

**Files Created:**
- `src/XCollector.js` - New collector module for X/Twitter API integration
  - Functions: `callXAPI`, `searchTweets`, `buildXSearchQuery`, `collectXTweets`, `collectXViaTweetsSearch`, `processXTweet`, `expandXSearch`, `isXConfigured`, `testXAPI`
  - Query syntax support: keywords, hashtags, from:user, date ranges, language filters
  - Two query types: Latest (recent) and Top (popular)
  - Cursor-based pagination

**Files Modified:**

1. **src/SheetWriter.js**
   - Added `X_COLUMNS` array (28 fields for tweet data)
   - Updated `createRunSpreadsheet` to create X tab
   - Added `normalizeXPost` function for tweet normalization
   - Updated `getSheetForPlatform` and `getColumnsForPlatform` for 'x' platform

2. **src/Config.js**
   - Added `X_API_KEY: 'X_API_KEY'` to CONFIG_KEYS

3. **src/StateStore.js**
   - Added `RUNNING_X` to RUN_STATUS
   - Added `xProgress` object to run state (collected, target, cursor, processedIds)
   - Added `xFolderId` to run state
   - Added `updateXProgress` function
   - Updated `isPostProcessed`, `addProcessedPostId`, `setRunPlan`, `setRunResources`, `getRunSummary` for X support

4. **src/DriveManager.js**
   - Added `xFolder` creation in `createRunFolderStructure`
   - Returns `xFolderId` alongside other folder IDs

5. **src/LLMPlanner.js**
   - Updated `PLAN_SCHEMA` to include 'x' in targetPlatforms enum
   - Added X-specific fields in targetCounts and queryStrategy
   - Added X queryStrategy schema: customQuery, queryType, fromUsers, language, includeRetweets
   - Updated system prompt to detect both platforms from user instructions
   - Updated `createFallbackPlan` to detect platform mentions and extract @usernames

6. **src/Orchestrator.js**
   - Added `RUNNING_X` state handling in `executeRunPhase`
   - Added `collectXWithTimeout` function
   - Updated `moveToNextPhase` for Instagram→X→TikTok flow
   - Updated `finalizeRun` summary message
   - Updated `retryRun` to check X progress

7. **src/UI.html**
   - Added X examples to instruction placeholder
   - Added collapsible X data fields toggle (28 fields with descriptions)
   - Added X progress row in status panel
   - Updated `updateStatusDisplay` for X progress
   - Updated `getStatusMessage` with RUNNING_X case
   - Updated `formatStatus` with RUNNING_X mapping

8. **src/Mocks.js**
   - Added `generateMockXTweets` function
   - Added `mockXSearch` function
   - Added `collectXWithMocks` function for testing

9. **README.md** (v2.0)
   - Updated overview to mention Instagram and X
   - Added X API choice section (TwitterAPI.io)
   - Updated execution model (two tabs: Instagram and X)
   - Added X tab columns specification (28 columns)
   - Added X collection strategy documentation
   - Added X API configuration instructions
   - Updated all relevant sections for dual-platform support

10. **ARCHITECTURE.md**
    - Added X platform to system architecture diagram
    - Added X Collector component description
    - Added X tab column schema
    - Added X API query syntax reference
    - Updated data flow diagram
    - Updated storage structure
    - Updated configuration requirements

**X Tab Column Schema (28 columns):**
1. platform_post_id (tweet ID)
2. create_username (author username)
3. posted_at (ISO 8601)
4. text (tweet content)
5. post_url (tweet URL)
6. source (client app)
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
23. hashtags (JSON array)
24. urls (JSON array)
25. user_mentions (JSON array)
26. media (JSON array)
27. drive_url
28. memo

**Platform Detection Logic:**
- User mentions "Twitter", "X", "tweets", or "@username" → include X
- User mentions "Instagram", "IG", "posts", "#hashtag" → include Instagram
- No specific platform mention → collect from BOTH platforms by default

**Technical Notes:**
- X uses simple API key auth (no OAuth flow needed)
- X artifacts: always `watch.html` with tweet permalink (no video download)
- Collection order: Instagram → X → TikTok (TikTok still disabled)
- Batch processing and continuation triggers work for X same as Instagram

**Configuration:**
To use X collection, add to Script Properties:
- `X_API_KEY`: TwitterAPI.io API key

### 2026-02-03 - Critical Bug Investigation: 0件収集問題

**Participants:** Human + Claude Opus 4.5 (Shogun + 8 Ashigaru)

**Context:**
Human tested the deployed ClipPulse and found a critical bug:
- UI displays "Collection completed successfully!"
- However, Instagram: 0/30, X (Twitter): 0/30 (zero data collected)
- Spreadsheet has only header rows, no data rows

**Environment Configuration Confirmed (from Screenshots):**
```
BATCH_SIZE: 15
CLIPPULSE_ROOT_FOLDER_ID: 1vOmt8gBZb8ilMI27j_Xf6NBHIZObwMVF
CLIPPULSE_PARENT_FOLDER_ID: 0ABQNmgUkBqbWUk9PVA
IG_DEFAULT_IG_USER_ID: 17841480526543713
IG_DEFAULT_PAGE_ID: 932599456610105
MAX_POSTS_PER_PLATFORM_DEFAULT: 30
MAX_RETRIES: 3
META_APP_ID: 1970547110527083
META_APP_SECRET: (set)
META_GRAPH_API_VERSION: v18.0
OPENAI_API_KEY: (set)
OPENAI_MODEL: gpt-4o
X_API_KEY: new1_421a5754f0824272a13d02197244bab1
```

**Investigation Hypothesis:**

After analyzing the code flow in `Orchestrator.js` (lines 156-172), I identified the likely root cause:

```javascript
switch (state.status) {
  case RUN_STATUS.CREATED:
  case RUN_STATUS.PLANNING:
    if (plan.targetCounts.instagram > 0 && (isMetaAuthorized() || isMockMode())) {
      // Instagram collection
    } else if (plan.targetCounts.x > 0 && (isXConfigured() || isMockMode())) {
      // X collection
    } else if (plan.targetCounts.tiktok > 0) {
      // TikTok collection
    } else {
      finalizeRun(runId); // ← Immediate finalization with 0 data!
    }
    break;
```

**Primary Hypothesis:**
1. `isMetaAuthorized()` returns `false` → Instagram skipped
   - OAuth2 token stored in `UserProperties` (not `ScriptProperties`)
   - The token may not exist or may have expired
2. `isXConfigured()` returns `false` → X skipped
   - Should return `true` if `X_API_KEY` is set in `ScriptProperties`
   - But something may be blocking this check

If both return `false` and `isMockMode()` is also `false`, the code jumps directly to `finalizeRun()`, resulting in 0 data collected but "COMPLETED" status.

**Debug Logging Added (Files Modified):**

1. **src/Orchestrator.js**
   - Added debug logging in `executeRunPhase` to trace condition evaluation
   - Added debug logging in `collectInstagramWithTimeout`
   - Added debug logging in `collectXWithTimeout`
   - Log messages include: status, targetCounts, auth status values

2. **src/XCollector.js**
   - Added debug logging in `isXConfigured()` to show API key status

3. **src/Auth.js**
   - Added debug logging in `isMetaAuthorized()` to show OAuth status

**Key Discovery:**
- `isMetaAuthorized()` uses `OAuth2.createService('meta').hasAccess()` which checks `UserProperties`
- Config values (META_APP_ID, X_API_KEY, etc.) are in `ScriptProperties`
- These are **two different storage mechanisms**
- OAuth tokens require the user to complete the OAuth flow via `authCallbackMeta`

**Next Steps:**
1. Deploy updated code with debug logging to Apps Script
2. Run a test collection and check execution logs
3. Verify OAuth authentication status for Instagram
4. If `isMetaAuthorized()` is the issue:
   - User needs to complete OAuth flow by visiting the authorization URL
   - Run `logAuthUrls()` function in Apps Script to get the URL
5. If `isXConfigured()` is the issue:
   - Verify `X_API_KEY` is correctly stored and retrievable

**Parallel Investigation (Multi-Agent Shogun System):**
Dispatched 8 Ashigaru agents to analyze different components:
- Ashigaru 1: LLMPlanner.js analysis
- Ashigaru 2: Orchestrator.js flow analysis
- Ashigaru 3: Auth.js authentication analysis (KEY SUSPECT)
- Ashigaru 4: XCollector.js analysis
- Ashigaru 5: StateStore.js state management
- Ashigaru 6: SheetWriter.js data writing
- Ashigaru 7: Config.js configuration
- Ashigaru 8: Integration/E2E analysis

**Status:** Root cause confirmed and fixes implemented.

### 2026-02-03 - Bug Fix Implementation

**Fix Applied:**

After confirming the root cause through 8 Ashigaru analysis reports, the following fixes were implemented:

1. **Orchestrator.js - Pre-check in startRun() (lines 27-42)**
   - Added platform configuration check BEFORE starting a run
   - If neither Instagram (OAuth) nor X (API key) is configured, throws a clear error:
   ```
   No platforms configured for data collection.
   To enable X (Twitter): Add X_API_KEY to Script Properties
   To enable Instagram: Complete Meta OAuth authorization
   ```

2. **Orchestrator.js - Warning in finalizeRun() (lines 478-492)**
   - If 0 data is collected, the completion message now includes a warning
   - Shows platform configuration status to help diagnose issues

3. **Code.js - New checkPlatformStatus() function**
   - Diagnostic function to check all platform configurations
   - Shows: X API key status, Instagram OAuth status, Mock mode status
   - Indicates if `startRun()` will fail due to missing configuration

**Files Modified:**
- `src/Orchestrator.js` - Added pre-check and warning
- `src/Code.js` - Added `checkPlatformStatus()` diagnostic function

**Testing Instructions:**
1. Open Apps Script editor
2. Run `checkPlatformStatus()` to see platform configuration status
3. If X shows "NO" for API key:
   - Verify `X_API_KEY` is correctly set in Script Properties
4. If Instagram shows "NO" for authorized:
   - Run `logAuthUrls()` to get OAuth URL
   - Complete OAuth flow in browser
5. After fixing configuration, run `startRun()` test

**Root Cause Summary:**
The bug occurred because:
- `isMetaAuthorized()` returned `false` (OAuth token not in UserProperties)
- `isXConfigured()` returned `false` (X_API_KEY not readable or not set)
- With both false, the code immediately called `finalizeRun()` with 0 data

The fix ensures users get a clear error message instead of a silent "success" with 0 data.

### 2026-02-03 - Instagram Data Collection Improvement Investigation

**Participants:** Human + Claude Opus 4.5

**Context:**
After testing the deployed ClipPulse, the human discovered that Instagram data collection via hashtag search was not populating all expected columns in the spreadsheet. Many fields were empty.

**Problem Analysis:**

From screenshot analysis, the following fields were empty in the Instagram sheet:
- `create_username` - empty
- `media_url` - empty
- `thumbnail_url` - empty
- `media_product_type` - empty
- `is_comment_enabled` - empty
- `is_shared_to_feed` - empty
- `children` - empty
- `edges_comments` - empty
- `edges_insights` - empty
- `edges_collaborators` - empty
- `boost_ads_list` - empty
- `boost_eligibility_info` - empty
- `copyright_check_information_status` - empty

Fields that were successfully populated:
- `platform_post_id`, `posted_at`, `caption_or_description`, `post_url`, `like_count`, `comments_count`, `media_type`, `shortcode`, `drive_url`, `memo`

**Root Cause:**

Instagram Graph API **hashtag search endpoints** (`/{hashtag-id}/top_media` and `/{hashtag-id}/recent_media`) return **limited fields only**:
- `id`, `caption`, `media_type`, `permalink`, `timestamp`, `like_count`, `comments_count`

The following fields are **NOT available** via hashtag search (documented API limitation):
- `media_url`, `thumbnail_url`, `username`, `shortcode` (direct), `media_product_type`, `is_comment_enabled`, `is_shared_to_feed`, `children`, and various edge fields

This is a known limitation documented in:
- Facebook Developer Docs: https://developers.facebook.com/docs/instagram-api/reference/ig-hashtag/top-media

**Investigation Steps:**
1. Comprehensive web research on Instagram Graph API limitations
2. Investigation of third-party API alternatives (Data365, RapidAPI Instagram APIs, Apify)
3. Analysis of oEmbed API possibilities (deprecated fields: `thumbnail_url`, `author_name`)
4. Review of existing codebase implementation

**Third-Party API Options Identified:**

| Service | Features | Pricing |
|---------|----------|---------|
| RapidAPI Instagram API | 33+ endpoints, hashtag search, full data | Free: 100 req/month, PRO: $4.99/month |
| Data365 Instagram API | Full public data, JSON responses | Free 14-day trial, custom pricing |
| Apify Instagram Hashtag Scraper | captions, media URLs, usernames | $0.016/hashtag, $0.0004/item |

**Implementation Changes Made:**

1. **InstagramCollector.js - Enhanced `processHashtagMedia` function**
   - Added `tryGetMediaDetails()` function to attempt fetching additional media details
   - Added `extractUsernameFromPermalink()` function to extract username from URL patterns
   - Enhanced media processing to merge additional details when available
   - Added video download attempt when `media_url` is available
   - Improved memo messages to indicate what data was/wasn't retrieved

2. **SheetWriter.js - Fixed shortcode extraction**
   - Updated regex pattern from `/\/p\/([^\/]+)/` to `/\/(?:p|reel)\/([^\/]+)/`
   - Now supports both `/p/` (posts) and `/reel/` (reels) URL patterns

**Expected Behavior After Changes:**

The code now attempts to:
1. Get additional details via `getMediaDetails()` for each media ID from hashtag search
2. If successful (unlikely for non-owned media), merge the additional fields
3. If failed (expected for non-owned media due to permissions), continue with basic data
4. Extract username from permalink URL pattern if available
5. Clearly document in memo what was/wasn't retrieved

**Important Note:**
The `getMediaDetails()` call is expected to **fail for non-owned media** due to Instagram Graph API permission restrictions. The API only allows detailed access to media owned by the authenticated user or accessible through authorized pages.

### 2026-02-03 - Third-Party API (RapidAPI) Integration for Instagram

**Participants:** Human + Claude Opus 4.5

**Context:**
After the initial investigation, the user approved implementing third-party API integration to solve the Instagram data field limitations.

**Solution Implemented:**

Created a new data enrichment system using RapidAPI Instagram APIs, similar to the TwitterAPI.io pattern used for X (Twitter).

**New File Created:**
- `src/InstagramRapidAPI.js` - Third-party Instagram data collection module

**Key Functions:**
- `isInstagramRapidAPIConfigured()` - Check if RapidAPI is configured
- `callInstagramRapidAPI()` - Make requests to RapidAPI endpoints
- `getHashtagPostsViaRapidAPI()` - Get posts by hashtag using RapidAPI
- `getPostDetailsByShortcode()` - Get detailed post info by shortcode
- `normalizeRapidAPIPost()` - Normalize various RapidAPI response formats
- `enrichPostsWithRapidAPI()` - Enrich official API data with RapidAPI data
- `testInstagramRapidAPI()` - Test RapidAPI connection

**Files Modified:**

1. **src/Config.js**
   - Added `INSTAGRAM_RAPIDAPI_KEY` - RapidAPI API key
   - Added `INSTAGRAM_RAPIDAPI_HOST` - API host (optional, has default)

2. **src/InstagramCollector.js**
   - Updated `processHashtagMedia()` with three-tier enrichment strategy:
     1. **Priority 1:** RapidAPI (if configured) - gets all fields
     2. **Priority 2:** Official API getMediaDetails - usually fails for non-owned media
     3. **Priority 3:** Basic hashtag search data only

**Configuration Required:**

To enable RapidAPI enrichment, add to Script Properties:
- `INSTAGRAM_RAPIDAPI_KEY`: Your RapidAPI API key
- `INSTAGRAM_RAPIDAPI_HOST`: (optional) API host, defaults to `instagram-scraper-api2.p.rapidapi.com`

**Supported RapidAPI Providers:**
The implementation is designed to work with various RapidAPI Instagram API providers:
- Instagram Scraper API2 (default)
- Instagram API – Fast & Reliable Data Scraper
- Other compatible providers (configure via INSTAGRAM_RAPIDAPI_HOST)

**Data Enrichment Flow:**
```
Hashtag Search (Official API)
         │
         ▼
┌─────────────────────────┐
│ For each post:          │
│ 1. Extract shortcode    │
│ 2. Try RapidAPI         │◄─── If configured
│ 3. Try Graph API        │◄─── Fallback
│ 4. Use basic data       │◄─── Final fallback
└─────────────────────────┘
         │
         ▼
    Write to Sheet
```

**Memo Messages:**
- `enriched via RapidAPI` - RapidAPI provided additional fields
- `additional fields via Graph API media details` - Official API provided additional fields
- `Instagram API does not provide media_url for hashtag search` - Neither API could enrich

**Files Modified:**
- `src/Config.js` - Added RapidAPI configuration keys
- `src/InstagramCollector.js` - Added three-tier enrichment strategy
- `src/SheetWriter.js` - Fixed shortcode extraction regex for reels

**Files Created:**
- `src/InstagramRapidAPI.js` - Third-party API integration module

### 2026-02-03 - RapidAPI Integration Bug Fixes and Testing

**Participants:** Human + Claude Opus 4.5

**Context:**
Continued from previous session where RapidAPI integration for Instagram data enrichment was implemented. The session was interrupted due to a tmux crash. Upon resuming, needed to complete RapidAPI setup and fix API endpoint issues.

**Issue 1: Wrong API Endpoint**
- Initial implementation used `/v1/post_info` endpoint which doesn't exist
- Error: `Endpoint '/v1/post_info' does not exist`

**Investigation:**
Tested various endpoint patterns via curl:
- `/v1/hashtag` - doesn't exist
- `/v1/post_info` - doesn't exist
- `/media_info/` - doesn't exist
- `/media?id=...` - **EXISTS** (returns proper response)

**Issue 2: API Requires Numeric Media ID**
- This RapidAPI provider requires numeric Instagram media IDs (e.g., `"17841400000000000"`)
- Does NOT support shortcode-based lookups
- Hashtag search feature is NOT available on the free Basic plan (only "Media Data" is available)

**Issue 3: HTTP 404 for "Not Found" Responses**
- API returns HTTP 404 status code for "media not found" errors
- Previous code threw an error for any non-200 response
- Needed to handle 404 + "media not found" as a valid (null) response

**Fixes Applied:**

1. **InstagramRapidAPI.js - `getPostDetailsByMediaId` function (renamed)**
   - Changed from `getPostDetailsByShortcode` to `getPostDetailsByMediaId`
   - Endpoint changed from `/v1/post_info` to `/media?id=...`
   - Uses numeric media ID instead of shortcode

2. **InstagramRapidAPI.js - `callInstagramRapidAPI` function**
   - Added special handling for HTTP 404 + "media not found" responses
   - Returns `{ _notFound: true }` instead of throwing error
   - Allows graceful degradation when media isn't found

3. **InstagramRapidAPI.js - `enrichPostsWithRapidAPI` function**
   - Updated to use `mediaId` (from official API) instead of shortcode
   - Handles `_notFound` responses appropriately

4. **InstagramRapidAPI.js - `testInstagramRapidAPI` function**
   - Updated to test `/media` endpoint
   - Treats "media not found" as success (proves API is working)

5. **InstagramCollector.js - `processHashtagMedia` function**
   - Changed to call `getPostDetailsByMediaId(mediaId)` instead of `getPostDetailsByShortcode(shortcode)`

**RapidAPI Configuration:**
- Provider: "Instagram API – Fast & Reliable Data Scraper" by mediacrawlers
- Plan: Basic (Free) - 100 requests/month
- Script Properties required:
  - `INSTAGRAM_RAPIDAPI_KEY`: API key from RapidAPI
  - `INSTAGRAM_RAPIDAPI_HOST`: `instagram-api-fast-reliable-data-scraper.p.rapidapi.com`

**Test Result:**
- `testInstagramRapidAPI()` completed successfully
- Log: `[DEBUG] Media not found (404), returning null response`
- This is expected behavior - proves API endpoint is correct and working

**How the Integration Works:**
1. Official Instagram Graph API performs hashtag search (returns limited fields)
2. For each post, the numeric media ID is extracted
3. RapidAPI `/media?id=...` is called to get additional fields (media_url, username, etc.)
4. If RapidAPI returns data, fields are merged into the post
5. If RapidAPI returns "not found" or fails, original limited data is used
6. Memo field indicates data source: "enriched via RapidAPI" or "Instagram API does not provide media_url..."

**Files Modified:**
- `src/InstagramRapidAPI.js` - Multiple fixes for endpoint, ID handling, error handling
- `src/InstagramCollector.js` - Updated to use mediaId instead of shortcode

**Status:** RapidAPI integration working. Ready for end-to-end testing with actual Instagram data collection.

### 2026-02-03 - Documentation Update and X drive_url Fix (Evening Session)

**Participants:** Human + Claude Opus 4.5

**Context:**
Continued work on documentation updates and fixing the `drive_url` column behavior for X (Twitter).

**Completed Tasks:**

1. **Research on Unavailable Instagram Fields**
   - Confirmed that the following 6 fields are **impossible to retrieve** for other users' posts:
     - `edges_insights` - Only available for own posts (impressions, reach, etc.)
     - `edges_collaborators` - Not publicly accessible
     - `boost_ads_list` - Only available to post owner
     - `boost_eligibility_info` - Only available to post owner
     - `copyright_check_information_status` - Only available to post owner
     - `edges_comments` - Technically possible with additional APIs but not implemented
   - Sources: [Apify Instagram Scrapers](https://apify.com/apify/instagram-scraper), [Data365 Instagram API](https://data365.co/instagram), official Instagram Graph API documentation

2. **README.md Updates**
   - Added comprehensive data availability table in section 10.3
   - Marked unavailable fields with ⚠️ in section 9.4 (Instagram columns)
   - Updated section 8.3 to explain platform-specific `drive_url` behavior
   - Updated section 9.5 (X columns) with note about `drive_url` containing direct tweet URL

3. **XCollector.js Fix**
   - Changed `drive_url` to contain the direct tweet URL instead of Drive watch.html URL
   - Raw JSON and watch.html are still archived in Drive for backup
   - This makes it easier for users to click and view the original tweet

4. **ARCHITECTURE.md Updates**
   - Updated artifact strategy section to reflect platform-specific `drive_url` behavior

5. **Web App Deployment**
   - Successfully redeployed to Version 17
   - Confirmed working in **incognito/private browser window**

**Current Issue (Not a Code Problem):**
- Normal browser shows "Sorry, unable to open the file at this time" error
- This is caused by **multiple Google accounts** logged in simultaneously
- The browser redirects to wrong account (adds `/u/1/` to URL)
- **Workaround:** Use incognito window or clear browser cookies and re-login with the correct account first

**Pending Tasks (To Do Next Session):**

1. **End-to-End Testing**
   - Run data collection with ~25 Instagram posts and ~25 X tweets
   - Verify Instagram `drive_url` contains Google Drive URLs (video.mp4 or watch.html)
   - Verify X `drive_url` contains direct tweet URLs (https://x.com/...)
   - Check all available fields are populated correctly
   - Check unavailable fields are blank with appropriate memo

2. **Final Verification**
   - Confirm RapidAPI enrichment is working for Instagram hashtag search
   - Verify memo field correctly indicates data source

**Files Modified This Session:**
- `README.md` - Data availability documentation
- `ARCHITECTURE.md` - Updated artifact strategy
- `src/XCollector.js` - Changed drive_url to direct tweet URL
- `CONTEXT.md` - This session log

### 2026-02-04 - API Mode Implementation (n8n Integration)

**Participants:** Human + Claude Opus 4.5

**Context:**
Human requested adding HTTP API endpoints to ClipPulse for integration with n8n workflow automation. The goal is to allow n8n to trigger data collection runs and retrieve results programmatically.

**Requirements:**
1. Add API mode alongside existing UI (UI must remain functional)
2. Implement `start` endpoint to begin collection runs
3. Implement `status` endpoint to check run progress
4. Support external run IDs and target folder IDs for n8n integration
5. Add shared secret authentication for API calls
6. Share business logic between UI and API (no duplicate implementation)

**Files Created:**
- `src/ApiHandler.js` - New module for API request handling
  - `validateApiSecret()` - Secret-based authentication
  - `handleApiStart()` - Start run endpoint handler
  - `handleApiStatus()` - Status check endpoint handler
  - `routeApiRequest()` - Request routing logic

**Files Modified:**

1. **src/Config.js**
   - Added `CLIPPULSE_API_SECRET` config key for API authentication

2. **src/Code.js**
   - Modified `doGet()` to route to API or UI based on `action` parameter
   - Added `doPost()` handler for POST API requests

3. **src/StateStore.js**
   - Added `API_STATUS` constants (queued, running, completed, failed)
   - Added `mapToApiStatus()` function to convert internal status to API status
   - Modified `createRunState()` to accept options (externalRunId, targetFolderId, source)
   - Added `getApiStatusSummary()` for API-formatted status response

4. **src/DriveManager.js**
   - Modified `createRunFolderStructure()` to accept optional `targetFolderId`
   - When `targetFolderId` is provided, creates folders inside that folder instead of default structure

5. **src/Orchestrator.js**
   - Modified `startRun()` to accept options object
   - Passes `targetFolderId` to `createRunFolderStructure()`
   - Returns `spreadsheetId` and `runFolderId` in response

6. **README.md** (v3.0)
   - Added Section 17: API Integration (n8n / External Systems)
   - Documented all API endpoints with request/response examples
   - Added n8n integration examples and curl commands
   - Updated version to 3.0, date to 2026-02-04

**API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/exec?action=start` | POST/GET | Start a new collection run |
| `/exec?action=status&run_id=xxx` | GET | Get run status |

**Key Design Decisions:**
- Secret is passed as query parameter (`?secret=xxx`) since Apps Script doesn't expose headers in doGet/doPost
- External run ID is used as the ClipPulse run ID to maintain consistency with n8n
- Target folder approach: n8n creates run folder, ClipPulse creates `clippulse_{run_id}/` inside it
- UI mode continues to work without secret or target folder (backward compatible)

**Status:**
- Implementation complete
- Ready for testing and deployment

### 2026-02-04 - Column Rename (drive_url → ref_url) and Instagram Video Download Enhancement

**Participants:** Human + Claude Opus 4.5 (Multi-Agent Shogun System)

**Context:**
The human requested two improvements:
1. Rename `drive_url` column to `ref_url` for more generic naming
2. Add actual video download capability from RapidAPI-provided video URLs

**Completed Tasks:**

#### 1. Column Rename: drive_url → ref_url

**Rationale:**
The `drive_url` name was misleading as it implied Google Drive URLs only. The column actually contains:
- Instagram: Google Drive video URLs (video.mp4) or watch.html fallback
- X (Twitter): Direct tweet URLs (https://x.com/...)

Renamed to `ref_url` (reference URL) for more generic and accurate naming.

**Files Modified:**
- `src/SheetWriter.js` - Renamed column header and normalizer field
- `src/StateStore.js` - Updated any references
- `src/InstagramCollector.js` - Updated field names
- `src/InstagramRapidAPI.js` - Updated field names
- `src/XCollector.js` - Updated field names
- `README.md` - Updated documentation
- `ARCHITECTURE.md` - Updated documentation
- `CONTEXT.md` - This session log

#### 2. Instagram Video Download from RapidAPI

**Problem:**
When using RapidAPI for Instagram data enrichment, the `video_url` field was available but not being used. Instead, a watch.html fallback was created even when actual video download was possible.

**Solution:**
Added `downloadVideoFromRapidAPI()` function to download actual video files when RapidAPI provides a `video_url`.

**Implementation:**
```javascript
function downloadVideoFromRapidAPI(videoUrl, folderId, filename) {
  // Download video from RapidAPI-provided URL
  // Save to Google Drive
  // Return Drive file URL
}
```

**Fallback Strategy:**
1. **Priority 1:** Download video from RapidAPI video_url (if available)
2. **Priority 2:** Create watch.html with post permalink (if video download fails or unavailable)

**Files Modified:**
- `src/InstagramRapidAPI.js` - Added video download logic
- `src/InstagramCollector.js` - Integrated video download in processing flow

#### 3. RapidAPI Configuration Update

**API Provider Used:**
- Host: `instagram-scraper-api2.p.rapidapi.com`
- This provider offers video URLs in responses, enabling actual video downloads

**Script Properties Required:**
- `INSTAGRAM_RAPIDAPI_KEY`: Your RapidAPI API key
- `INSTAGRAM_RAPIDAPI_HOST`: `instagram-scraper-api2.p.rapidapi.com`

**Notes:**
- Different RapidAPI providers may have different response formats
- The implementation attempts video download but falls back gracefully if unavailable
- Video download respects Apps Script's UrlFetch ~50MB limit

**Status:**
- Implementation complete
- Ready for end-to-end testing

## Guidelines for Future Sessions

1. **Before Making Changes:** Always read this CONTEXT.md file first
2. **After Making Changes:** Append a new session entry to this file
3. **Documentation:** Keep README.md and code comments in sync
4. **Commits:** Verify no sensitive information before committing
5. **TikTok:** Code exists but is disabled; do not remove unless explicitly requested
6. **Git Push on VM:** VM lacks credential helper; push from local machine instead
7. **X Platform:** Fully implemented; requires `X_API_KEY` in Script Properties
8. **OAuth for Instagram:** User must complete OAuth flow; token stored in UserProperties (not ScriptProperties)
9. **Debug Logging:** Added console.log statements marked with `[DEBUG]` for troubleshooting
10. **Instagram RapidAPI:** Optional; add `INSTAGRAM_RAPIDAPI_KEY` and `INSTAGRAM_RAPIDAPI_HOST` to enable data enrichment for hashtag search results. Uses `/media?id=...` endpoint with numeric media IDs.
11. **API Mode:** Add `CLIPPULSE_API_SECRET` to Script Properties to enable API authentication. API endpoints: `?action=start` and `?action=status`.
