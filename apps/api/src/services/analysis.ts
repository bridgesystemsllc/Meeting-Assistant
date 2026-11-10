/**
 * AI Analysis Service (Claude)
 * Generates meeting summaries, action items, and insights
 * 
 * In tests, Claude is mocked - no live API keys used
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  MeetingAnalysisSchema, 
  type MeetingAnalysis,
  getBrandVoiceHook,
} from '@meeting-assistant/shared';
import { logger } from '../lib/logger.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

interface TranscriptInput {
  fullText: string;
  speakers: Array<{ id: string; name: string; word_count: number; talk_time_pct: number }>;
  wordCount: number;
  language: string | null;
}

interface MeetingMeta {
  title: string;
  date?: string;
  platform: string;
  tenantId: string;
}

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/**
 * Prepares transcript text, truncating if too long
 */
function prepareTranscriptForAnalysis(fullText: string): string {
  const MAX_CHARS = 60000;
  
  if (fullText.length <= MAX_CHARS) {
    return fullText;
  }

  const firstPart = fullText.substring(0, MAX_CHARS * 0.4);
  const lastPart = fullText.substring(fullText.length - (MAX_CHARS * 0.6));
  
  return `${firstPart}\n\n[... transcript truncated ...]\n\n${lastPart}`;
}

/**
 * Builds the analysis prompt
 * If the transcript has a detected language, instructs Claude to respond in that language
 */
function buildPrompt(transcript: TranscriptInput, meta: MeetingMeta): string {
  const languageInstruction = transcript.language && transcript.language !== 'en'
    ? `\nIMPORTANT: The transcript is in ${transcript.language}. Write your summary and action items in ${transcript.language}.`
    : '';

  return `Analyze this meeting transcript and return a comprehensive JSON analysis.${languageInstruction}

MEETING DETAILS:
Title: ${meta.title}
Date: ${meta.date || 'Unknown'}
Platform: ${meta.platform}
Speakers: ${transcript.speakers.map(s => s.name).join(', ')}

TRANSCRIPT:
${prepareTranscriptForAnalysis(transcript.fullText)}

Return ONLY a valid JSON object with this structure:
{
  "summary": "3-5 sentence executive summary",
  "key_decisions": [{"decision": "...", "owner": "...", "context": "..."}],
  "action_items": [{"task": "...", "owner": "...", "due_date": null, "priority": "high|medium|low", "context": "..."}],
  "topics_discussed": [{"topic": "...", "summary": "...", "sentiment": "positive|negative|neutral", "time_spent_pct": 25}],
  "questions_unresolved": [{"question": "...", "raised_by": "..."}],
  "risks_and_blockers": [{"risk": "...", "severity": "high|medium|low", "owner": null}],
  "meeting_metrics": {
    "overall_sentiment": "positive|negative|neutral|mixed",
    "meeting_effectiveness": "high|medium|low",
    "engagement_score": 75,
    "dominant_speaker": "Speaker 1"
  },
  "next_meeting_suggestions": {
    "recommended_agenda": ["item 1", "item 2"]
  }
}`;
}

/**
 * Parses Claude's response, handling JSON extraction and validation
 */
function parseResponse(rawText: string): MeetingAnalysis {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned);
  
  return MeetingAnalysisSchema.parse(parsed);
}

/**
 * Main analysis function
 */
export async function analyzeMeeting(
  transcript: TranscriptInput,
  meta: MeetingMeta
): Promise<{ analysis: MeetingAnalysis; rawResponse: string; model: string }> {
  logger.info({ 
    wordCount: transcript.wordCount, 
    speakers: transcript.speakers.length,
    language: transcript.language,
  }, 'Starting AI analysis');

  const client = getAnthropicClient();
  const prompt = buildPrompt(transcript, meta);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
    system: `You are an expert meeting analyst. Respond with valid JSON only - no markdown, no preamble.`,
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  
  let analysis: MeetingAnalysis;
  try {
    analysis = parseResponse(rawText);
  } catch (parseError) {
    logger.error({ parseError, rawText: rawText.substring(0, 500) }, 'Failed to parse AI response');
    
    analysis = {
      summary: 'Analysis could not be parsed. Please review the transcript.',
      key_decisions: [],
      action_items: [],
      topics_discussed: [],
      questions_unresolved: [],
      risks_and_blockers: [],
      meeting_metrics: {
        overall_sentiment: 'neutral',
        meeting_effectiveness: 'medium',
        engagement_score: 50,
        dominant_speaker: null,
      },
    };
  }

  const brandHook = getBrandVoiceHook();
  const brandVoice = await brandHook.getBrandVoice(meta.tenantId);
  if (brandVoice) {
    analysis = brandHook.formatAnalysis(analysis, brandVoice);
  }

  logger.info({
    actionItems: analysis.action_items.length,
    decisions: analysis.key_decisions.length,
    sentiment: analysis.meeting_metrics.overall_sentiment,
  }, 'AI analysis completed');

  return {
    analysis,
    rawResponse: rawText,
    model: MODEL,
  };
}

/**
 * For testing: allows injecting a mock client
 */
export function setAnthropicClient(client: Anthropic | null): void {
  anthropicClient = client;
}
