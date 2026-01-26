/**
 * LLMPlanner.js
 * Calls OpenAI Responses API to parse user instructions and generate plans
 *
 * Uses GPT-5.2 Pro with structured outputs as specified in section 5.4
 *
 * Functions:
 * - Parse natural language instruction into structured plan
 * - Decide query strategy and parameters
 * - Generate fallback strategies
 * - Produce concise memo notes
 */

/**
 * The structured output schema for the plan
 * Based on specification section 10.2
 */
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    targetPlatforms: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['instagram', 'tiktok']
      },
      description: 'Which platforms to collect from'
    },
    targetCounts: {
      type: 'object',
      properties: {
        instagram: { type: 'integer', description: 'Number of posts to collect from Instagram' },
        tiktok: { type: 'integer', description: 'Number of posts to collect from TikTok' }
      }
    },
    keywords: {
      type: 'array',
      items: { type: 'string' },
      description: 'Keywords extracted from the instruction'
    },
    hashtags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Hashtags to search for (without #)'
    },
    creatorHandles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific creator usernames mentioned'
    },
    timeWindow: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'ISO 8601 date string or null' },
        endDate: { type: 'string', description: 'ISO 8601 date string or null' },
        description: { type: 'string', description: 'Human readable time window description' }
      },
      description: 'Time window for content'
    },
    regionCode: {
      type: 'string',
      description: 'TikTok region code if specified (e.g., US, JP)'
    },
    contentCategory: {
      type: 'string',
      description: 'General category of content (e.g., skincare, fitness, food)'
    },
    queryStrategy: {
      type: 'object',
      properties: {
        tiktok: {
          type: 'object',
          properties: {
            primaryQuery: { type: 'string' },
            useHashtags: { type: 'boolean' },
            useKeywords: { type: 'boolean' },
            isRandom: { type: 'boolean' }
          }
        },
        instagram: {
          type: 'object',
          properties: {
            primaryStrategy: {
              type: 'string',
              enum: ['hashtag', 'account', 'mixed']
            },
            hashtagsToSearch: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  },
  required: ['targetPlatforms', 'targetCounts', 'keywords']
};

/**
 * Call OpenAI Responses API
 * @param {Object} params - API parameters
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userPrompt - User prompt
 * @param {Object} [params.responseFormat] - Optional structured output schema
 * @returns {Object} The API response
 */
function callOpenAI(params) {
  const apiKey = getConfig(CONFIG_KEYS.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const model = getConfig(CONFIG_KEYS.OPENAI_MODEL, CONFIG_DEFAULTS.OPENAI_MODEL);

  const requestBody = {
    model: model,
    input: params.userPrompt,
    instructions: params.systemPrompt
  };

  // Add response format for structured outputs
  if (params.responseFormat) {
    requestBody.text = {
      format: {
        type: 'json_schema',
        json_schema: {
          name: 'plan',
          schema: params.responseFormat,
          strict: true
        }
      }
    };
  }

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseBody = JSON.parse(response.getContentText());

  if (responseCode !== 200) {
    console.error('OpenAI API error:', responseBody);
    throw new Error(`OpenAI API error: ${responseBody.error?.message || 'Unknown error'}`);
  }

  return responseBody;
}

/**
 * Parse user instruction into a structured plan
 * @param {string} instruction - The user's natural language instruction
 * @returns {Object} The structured plan
 */
function parseInstructionToPlan(instruction) {
  const operationalConfig = getOperationalConfig();
  const defaultCount = operationalConfig.maxPostsPerPlatform;

  // In mock mode, use fallback plan without calling OpenAI
  if (isMockMode()) {
    console.log('Mock mode: Using fallback plan');
    return createFallbackPlan(instruction, defaultCount);
  }

  const systemPrompt = `You are a data collection planning assistant for ClipPulse, a tool that collects short-form video data from Instagram and TikTok.

Your task is to parse the user's natural language instruction and create a structured data collection plan.

Guidelines:
1. Extract keywords, hashtags, and any specific creator handles mentioned
2. Determine which platforms to collect from (default: both Instagram and TikTok)
3. Determine target counts (default: ${defaultCount} per platform)
4. Identify any time window preferences (e.g., "last 7 days", "this month")
5. Identify any region preferences for TikTok (e.g., "US region", "Japan")
6. Suggest a query strategy based on the instruction

If the user doesn't specify a count, use ${defaultCount} per platform.
If the user says "only TikTok" or "only Instagram", only include that platform.
If hashtags are mentioned (with or without #), include them in the hashtags array without the # symbol.

Current date: ${new Date().toISOString().split('T')[0]}`;

  const userPrompt = `Please create a collection plan for this instruction:

"${instruction}"

Return a structured JSON plan.`;

  try {
    const response = callOpenAI({
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
      responseFormat: PLAN_SCHEMA
    });

    // Parse the response
    let plan;
    if (response.output && response.output[0] && response.output[0].content) {
      const content = response.output[0].content[0];
      if (content.type === 'text') {
        plan = JSON.parse(content.text);
      }
    } else if (response.choices && response.choices[0]) {
      plan = JSON.parse(response.choices[0].message.content);
    } else {
      throw new Error('Unexpected API response format');
    }

    // Ensure required fields have defaults
    plan.targetPlatforms = plan.targetPlatforms || ['instagram', 'tiktok'];
    plan.targetCounts = plan.targetCounts || {};
    plan.targetCounts.instagram = plan.targetCounts.instagram || defaultCount;
    plan.targetCounts.tiktok = plan.targetCounts.tiktok || defaultCount;
    plan.keywords = plan.keywords || [];
    plan.hashtags = plan.hashtags || [];

    // Filter platforms based on targetPlatforms
    if (!plan.targetPlatforms.includes('instagram')) {
      plan.targetCounts.instagram = 0;
    }
    if (!plan.targetPlatforms.includes('tiktok')) {
      plan.targetCounts.tiktok = 0;
    }

    return plan;

  } catch (e) {
    console.error('Error parsing instruction:', e);
    // Return a basic fallback plan
    return createFallbackPlan(instruction, defaultCount);
  }
}

/**
 * Create a fallback plan when LLM parsing fails
 * @param {string} instruction - The original instruction
 * @param {number} defaultCount - Default count per platform
 * @returns {Object} A basic plan
 */
function createFallbackPlan(instruction, defaultCount) {
  // Extract hashtags (words starting with #)
  const hashtagMatches = instruction.match(/#\w+/g) || [];
  const hashtags = hashtagMatches.map(h => h.substring(1));

  // Extract keywords (simple word extraction)
  const words = instruction.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['find', 'collect', 'get', 'posts', 'videos', 'about', 'from', 'with', 'only'].includes(w));

  // Check for platform-specific instructions
  const lowerInstruction = instruction.toLowerCase();
  const tiktokOnly = lowerInstruction.includes('tiktok only') || lowerInstruction.includes('only tiktok');
  const instagramOnly = lowerInstruction.includes('instagram only') || lowerInstruction.includes('only instagram');

  // Extract count if mentioned
  const countMatch = instruction.match(/(\d+)\s*posts?/i);
  const count = countMatch ? parseInt(countMatch[1]) : defaultCount;

  return {
    targetPlatforms: tiktokOnly ? ['tiktok'] : (instagramOnly ? ['instagram'] : ['instagram', 'tiktok']),
    targetCounts: {
      instagram: instagramOnly || !tiktokOnly ? count : 0,
      tiktok: tiktokOnly || !instagramOnly ? count : 0
    },
    keywords: words.slice(0, 5),
    hashtags: hashtags,
    creatorHandles: [],
    timeWindow: {
      startDate: null,
      endDate: null,
      description: 'recent'
    },
    regionCode: '',
    contentCategory: words[0] || 'general',
    queryStrategy: {
      tiktok: {
        primaryQuery: words.join(' '),
        useHashtags: hashtags.length > 0,
        useKeywords: words.length > 0,
        isRandom: false
      },
      instagram: {
        primaryStrategy: hashtags.length > 0 ? 'hashtag' : 'mixed',
        hashtagsToSearch: hashtags.length > 0 ? hashtags : words.slice(0, 3)
      }
    }
  };
}

/**
 * Generate a fallback query strategy when initial results are insufficient
 * @param {Object} currentPlan - The current plan
 * @param {string} platform - 'instagram' or 'tiktok'
 * @param {number} currentCount - Current number of results
 * @param {number} targetCount - Target number of results
 * @returns {Object} Updated strategy suggestions
 */
function generateFallbackStrategy(currentPlan, platform, currentCount, targetCount) {
  const apiKey = getConfig(CONFIG_KEYS.OPENAI_API_KEY);

  if (!apiKey) {
    // Return basic fallback without LLM
    return {
      expandDateRange: true,
      newDateRange: { days: 30 },
      additionalKeywords: [],
      useRandom: platform === 'tiktok'
    };
  }

  const systemPrompt = `You are helping to expand a search query because the initial results were insufficient.
Current results: ${currentCount} / Target: ${targetCount}
Platform: ${platform}

Suggest ways to get more results.`;

  const userPrompt = `Current plan: ${JSON.stringify(currentPlan, null, 2)}

Suggest modifications to get more results. Return JSON with:
- expandDateRange: boolean
- newDateRange: { days: number }
- additionalKeywords: string[]
- additionalHashtags: string[]
- useRandom: boolean (for TikTok)`;

  try {
    const response = callOpenAI({
      systemPrompt: systemPrompt,
      userPrompt: userPrompt
    });

    const content = response.output?.[0]?.content?.[0]?.text ||
                    response.choices?.[0]?.message?.content;

    // Try to parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

  } catch (e) {
    console.error('Error generating fallback strategy:', e);
  }

  // Default fallback
  return {
    expandDateRange: true,
    newDateRange: { days: 30 },
    additionalKeywords: [],
    useRandom: platform === 'tiktok'
  };
}

/**
 * Generate a memo note for missing or problematic fields
 * @param {string[]} issues - Array of issues to describe
 * @returns {string} A concise memo note (max 300 chars per spec)
 */
function generateMemoNote(issues) {
  if (!issues || issues.length === 0) {
    return '';
  }

  // Simple concatenation, truncated to 300 chars
  const memo = issues.join('; ');
  if (memo.length <= 300) {
    return memo;
  }
  return memo.substring(0, 297) + '...';
}

/**
 * Generate synonyms/related keywords for a term
 * @param {string} keyword - The keyword to expand
 * @returns {string[]} Related keywords
 */
function generateRelatedKeywords(keyword) {
  const apiKey = getConfig(CONFIG_KEYS.OPENAI_API_KEY);

  if (!apiKey) {
    return [];
  }

  try {
    const response = callOpenAI({
      systemPrompt: 'Generate 3-5 related keywords or synonyms. Return only a JSON array of strings.',
      userPrompt: `Keyword: "${keyword}"`
    });

    const content = response.output?.[0]?.content?.[0]?.text ||
                    response.choices?.[0]?.message?.content;

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

  } catch (e) {
    console.error('Error generating related keywords:', e);
  }

  return [];
}
