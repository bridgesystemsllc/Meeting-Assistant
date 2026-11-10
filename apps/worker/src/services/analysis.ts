/**
 * AI Analysis Service for Worker
 * P2-4: Chunk-and-merge for long transcripts, model in config, tool-use structured output
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  MeetingAnalysisSchema, 
  type MeetingAnalysis,
  getBrandVoiceHook,
} from '@meeting-assistant/shared';
import { logger } from '../lib/logger.js';

// P2-4: Move model to config
const MODEL = process.env.ANALYSIS_MODEL || 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const CHUNK_SIZE = 30000; // Characters per chunk
const MAX_CHUNKS = 4;

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

interface ChunkAnalysis {
  summary: string;
  key_decisions: Array<{ decision: string; owner: string | null; context?: string }>;
  action_items: Array<{ task: string; owner: string; due_date: string | null; priority: 'high' | 'medium' | 'low'; context?: string }>;
  topics: Array<{ topic: string; summary: string; sentiment: 'positive' | 'negative' | 'neutral'; time_spent_pct?: number }>;
  questions: Array<{ question: string; raised_by: string }>;
  risks: Array<{ risk: string; severity: 'high' | 'medium' | 'low'; owner: string | null }>;
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
 * P2-4: Chunk-and-merge instead of middle-drop truncation
 * Split transcript into chunks with overlap for context continuity
 */
function chunkTranscript(fullText: string): string[] {
  if (fullText.length <= CHUNK_SIZE) {
    return [fullText];
  }

  const chunks: string[] = [];
  const overlapSize = Math.floor(CHUNK_SIZE * 0.1); // 10% overlap
  let position = 0;

  while (position < fullText.length && chunks.length < MAX_CHUNKS) {
    const end = Math.min(position + CHUNK_SIZE, fullText.length);
    
    // Try to break at a newline for cleaner splits
    let actualEnd = end;
    if (end < fullText.length) {
      const newlinePos = fullText.lastIndexOf('\n', end);
      if (newlinePos > position + CHUNK_SIZE * 0.5) {
        actualEnd = newlinePos + 1;
      }
    }
    
    chunks.push(fullText.substring(position, actualEnd));
    position = actualEnd - overlapSize;
  }

  logger.info({ totalLength: fullText.length, chunks: chunks.length }, 'Transcript chunked');
  return chunks;
}

/**
 * P2-4: Tool-use structured output schema
 */
const analysisToolSchema: Anthropic.Messages.Tool = {
  name: 'record_meeting_analysis',
  description: 'Record the structured analysis of a meeting transcript',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: '3-5 sentence executive summary of the meeting',
      },
      key_decisions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            decision: { type: 'string' },
            owner: { type: 'string', nullable: true },
            context: { type: 'string' },
          },
          required: ['decision', 'context'],
        },
      },
      action_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            task: { type: 'string' },
            owner: { type: 'string' },
            due_date: { type: 'string', nullable: true },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            context: { type: 'string' },
          },
          required: ['task', 'owner', 'priority'],
        },
      },
      topics_discussed: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            summary: { type: 'string' },
            sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
            time_spent_pct: { type: 'number' },
          },
          required: ['topic', 'summary', 'sentiment'],
        },
      },
      questions_unresolved: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            raised_by: { type: 'string' },
          },
          required: ['question', 'raised_by'],
        },
      },
      risks_and_blockers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            risk: { type: 'string' },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            owner: { type: 'string', nullable: true },
          },
          required: ['risk', 'severity'],
        },
      },
      meeting_metrics: {
        type: 'object',
        properties: {
          overall_sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral', 'mixed'] },
          meeting_effectiveness: { type: 'string', enum: ['high', 'medium', 'low'] },
          engagement_score: { type: 'number', minimum: 0, maximum: 100 },
          dominant_speaker: { type: 'string', nullable: true },
        },
        required: ['overall_sentiment', 'meeting_effectiveness', 'engagement_score'],
      },
      next_meeting_suggestions: {
        type: 'object',
        properties: {
          recommended_agenda: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    required: ['summary', 'key_decisions', 'action_items', 'topics_discussed', 'meeting_metrics'],
  },
};

/**
 * Analyze a single chunk using tool-use
 */
async function analyzeChunk(
  client: Anthropic,
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  transcript: TranscriptInput,
  meta: MeetingMeta
): Promise<ChunkAnalysis> {
  const languageInstruction = transcript.language && transcript.language !== 'en'
    ? `\nIMPORTANT: The transcript is in ${transcript.language}. Write your analysis in ${transcript.language}.`
    : '';

  const chunkNote = totalChunks > 1
    ? `\n\nNOTE: This is part ${chunkIndex + 1} of ${totalChunks} of a longer transcript.`
    : '';

  const prompt = `Analyze this meeting transcript and use the record_meeting_analysis tool to record your findings.${languageInstruction}${chunkNote}

MEETING DETAILS:
Title: ${meta.title}
Date: ${meta.date || 'Unknown'}
Platform: ${meta.platform}
Speakers: ${transcript.speakers.map(s => s.name).join(', ')}

TRANSCRIPT:
${chunk}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    tools: [analysisToolSchema],
    tool_choice: { type: 'tool', name: 'record_meeting_analysis' },
    messages: [{ role: 'user', content: prompt }],
    system: `You are an expert meeting analyst. Analyze the transcript and use the provided tool to record a structured analysis.`,
  });

  // Extract tool use result
  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUse) {
    throw new Error('No tool use in response');
  }

  const input = toolUse.input as Record<string, unknown>;
  
  return {
    summary: input.summary as string || '',
    key_decisions: (input.key_decisions as ChunkAnalysis['key_decisions']) || [],
    action_items: (input.action_items as ChunkAnalysis['action_items']) || [],
    topics: (input.topics_discussed as ChunkAnalysis['topics']) || [],
    questions: (input.questions_unresolved as ChunkAnalysis['questions']) || [],
    risks: (input.risks_and_blockers as ChunkAnalysis['risks']) || [],
  };
}

/**
 * Merge multiple chunk analyses into a single coherent analysis
 */
async function mergeAnalyses(
  client: Anthropic,
  chunkAnalyses: ChunkAnalysis[],
  transcript: TranscriptInput,
  _meta: MeetingMeta
): Promise<MeetingAnalysis> {
  if (chunkAnalyses.length === 1) {
    // Single chunk - convert directly
    const chunk = chunkAnalyses[0];
    return {
      summary: chunk.summary,
      key_decisions: chunk.key_decisions,
      action_items: chunk.action_items,
      topics_discussed: chunk.topics.map(t => ({ ...t, time_spent_pct: t.time_spent_pct ?? 0 })),
      questions_unresolved: chunk.questions,
      risks_and_blockers: chunk.risks,
      meeting_metrics: {
        overall_sentiment: 'neutral',
        meeting_effectiveness: 'medium',
        engagement_score: 70,
        dominant_speaker: transcript.speakers[0]?.name || null,
      },
      next_meeting_suggestions: { recommended_agenda: [] },
    };
  }

  // Multiple chunks - use AI to merge
  const mergePrompt = `You analyzed a long meeting transcript in ${chunkAnalyses.length} parts. Now merge these analyses into a single coherent analysis using the record_meeting_analysis tool.

CHUNK SUMMARIES:
${chunkAnalyses.map((c, i) => `Part ${i + 1}: ${c.summary}`).join('\n\n')}

ALL KEY DECISIONS:
${JSON.stringify(chunkAnalyses.flatMap(c => c.key_decisions), null, 2)}

ALL ACTION ITEMS:
${JSON.stringify(chunkAnalyses.flatMap(c => c.action_items), null, 2)}

ALL TOPICS:
${JSON.stringify(chunkAnalyses.flatMap(c => c.topics), null, 2)}

ALL QUESTIONS:
${JSON.stringify(chunkAnalyses.flatMap(c => c.questions), null, 2)}

ALL RISKS:
${JSON.stringify(chunkAnalyses.flatMap(c => c.risks), null, 2)}

Create a unified analysis that:
1. Combines the summaries into one cohesive executive summary
2. Deduplicates and prioritizes action items
3. Merges overlapping topics
4. Removes duplicate questions and risks
5. Calculates overall meeting metrics`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    tools: [analysisToolSchema],
    tool_choice: { type: 'tool', name: 'record_meeting_analysis' },
    messages: [{ role: 'user', content: mergePrompt }],
    system: `You are merging multiple partial analyses into one complete meeting analysis. Use the tool to record the merged result.`,
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUse) {
    throw new Error('No tool use in merge response');
  }

  const input = toolUse.input as Record<string, unknown>;
  const metrics = input.meeting_metrics as Record<string, unknown> || {};
  const suggestions = input.next_meeting_suggestions as Record<string, unknown> || {};

  return MeetingAnalysisSchema.parse({
    summary: input.summary,
    key_decisions: input.key_decisions,
    action_items: input.action_items,
    topics_discussed: input.topics_discussed,
    questions_unresolved: input.questions_unresolved,
    risks_and_blockers: input.risks_and_blockers,
    meeting_metrics: {
      overall_sentiment: metrics.overall_sentiment || 'neutral',
      meeting_effectiveness: metrics.meeting_effectiveness || 'medium',
      engagement_score: (metrics.engagement_score as number) || 70,
      dominant_speaker: metrics.dominant_speaker || transcript.speakers[0]?.name || null,
    },
    next_meeting_suggestions: {
      recommended_agenda: (suggestions.recommended_agenda as string[]) || [],
    },
  });
}

export async function analyzeMeeting(
  transcript: TranscriptInput,
  meta: MeetingMeta
): Promise<{ analysis: MeetingAnalysis; rawResponse: string; model: string }> {
  logger.info({ 
    wordCount: transcript.wordCount, 
    speakers: transcript.speakers.length,
    language: transcript.language,
    model: MODEL,
  }, 'Starting AI analysis');

  const client = getAnthropicClient();
  
  // P2-4: Chunk-and-merge for long transcripts
  const chunks = chunkTranscript(transcript.fullText);
  const chunkAnalyses: ChunkAnalysis[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    logger.info({ chunk: i + 1, total: chunks.length }, 'Analyzing chunk');
    const chunkResult = await analyzeChunk(
      client,
      chunks[i],
      i,
      chunks.length,
      transcript,
      meta
    );
    chunkAnalyses.push(chunkResult);
  }

  // Merge chunk analyses
  let analysis = await mergeAnalyses(client, chunkAnalyses, transcript, meta);

  // Apply brand voice if configured
  const brandHook = getBrandVoiceHook();
  const brandVoice = await brandHook.getBrandVoice(meta.tenantId);
  if (brandVoice) {
    analysis = brandHook.formatAnalysis(analysis, brandVoice);
  }

  logger.info({
    actionItems: analysis.action_items.length,
    decisions: analysis.key_decisions.length,
    sentiment: analysis.meeting_metrics.overall_sentiment,
    chunks: chunks.length,
  }, 'AI analysis completed');

  return {
    analysis,
    rawResponse: JSON.stringify(chunkAnalyses),
    model: MODEL,
  };
}

export function setAnthropicClient(client: Anthropic | null): void {
  anthropicClient = client;
}
