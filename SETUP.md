# ClipPulse Setup Guide

This guide walks you through setting up ClipPulse for the first time.

## Prerequisites

- Google account with access to Google Drive and Google Sheets
- Node.js installed (for clasp)
- clasp CLI installed (`npm install -g @google/clasp`)

## Step 1: Create Apps Script Project

1. Login to clasp:
   ```bash
   clasp login
   ```

2. Create a new Apps Script project:
   ```bash
   cd /path/to/ClipPulse
   clasp create --title "ClipPulse" --type webapp --rootDir ./src
   ```

3. This will create a `.clasp.json` file with your script ID.

## Step 2: Push Code to Apps Script

```bash
clasp push
```

## Step 3: Configure Script Properties

Open the Apps Script editor:
```bash
clasp open
```

Then go to **Project Settings > Script Properties** and add the following:

### Required Properties

| Key | Description |
|-----|-------------|
| `CLIPPULSE_ROOT_FOLDER_ID` | Google Drive folder ID for storing artifacts (leave empty, will be auto-created) |
| `OPENAI_API_KEY` | Your OpenAI API key |

### Instagram / Meta (required)

| Key | Description |
|-----|-------------|
| `META_APP_ID` | Meta (Facebook) App ID |
| `META_APP_SECRET` | Meta App Secret |

### Optional Properties

| Key | Default | Description |
|-----|---------|-------------|
| `OPENAI_MODEL` | `gpt-5.2-pro` | OpenAI model to use |
| `META_GRAPH_API_VERSION` | `v18.0` | Instagram Graph API version |
| `MAX_POSTS_PER_PLATFORM_DEFAULT` | `30` | Default posts to collect |
| `BATCH_SIZE` | `15` | Posts per batch |
| `MAX_RETRIES` | `3` | Max API retry attempts |
| `RETRY_BACKOFF_MS` | `1000` | Initial retry delay |
| `USE_MOCKS` | `false` | Enable mock mode for testing |

## Step 4: Initialize the Application

In the Apps Script editor, run the `initialize` function:

1. Open the script editor (`clasp open`)
2. Select `Code.gs`
3. Select `initialize` from the function dropdown
4. Click Run

This will:
- Create the root `ClipPulse` folder in Drive
- Validate your configuration

## Step 5: Setup OAuth (for Instagram)

If using Instagram:

1. Run the `setupAuth` function to get OAuth URLs
2. Visit the Meta OAuth URL in your browser
3. Authorize the application
4. The callback will automatically store your tokens

## Step 6: Deploy as Web App

1. In Apps Script editor, go to **Deploy > New deployment**
2. Select **Web app** as the type
3. Set:
   - Description: "ClipPulse v1.0"
   - Execute as: "User deploying the web app"
   - Who has access: "Anyone with a Google account" (or your preference)
4. Click **Deploy**
5. Copy the Web App URL

## Step 7: Test the Application

### Mock Mode Testing

To test without real API calls:

1. Set `USE_MOCKS` to `true` in Script Properties
2. Run `runMockTest` function
3. Check the generated spreadsheet

### Health Check

Run the `healthCheck` function to verify all services are working.

## Troubleshooting

### "Missing configuration" errors

Make sure all required Script Properties are set correctly.

### OAuth errors

1. Ensure your Meta app has the correct permissions
2. Try running `resetMetaAuth()` and re-authorizing

### Drive errors

1. Make sure the script has Drive permissions
2. Check the root folder exists and is accessible

## API Credentials Needed

### OpenAI

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy and save as `OPENAI_API_KEY`

### Meta (Instagram) Graph API

1. Go to https://developers.facebook.com/
2. Create a new app (Business type)
3. Add the Instagram Graph API product
4. Configure OAuth redirect URL:
   - Get your script's redirect URL by running `getMetaAuthorizationUrl()`
   - Add it to your Meta app's OAuth settings
5. Get your App ID and App Secret

### Instagram Professional Account

The Instagram Graph API requires a professional (Business or Creator) Instagram account connected to a Facebook Page:

1. Convert your Instagram account to Professional
2. Connect it to a Facebook Page you manage
3. Use that Facebook Page for the API access
