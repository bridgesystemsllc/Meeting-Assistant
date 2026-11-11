/**
 * Recall.ai Service for Worker
 * Handles transcript retrieval and media deletion
 */

import { logger } from '../lib/logger.js';

const RECALL_BASE_URL = process.env.RECALL_API_URL || 'https://us-west-2.recall.ai/api/v1';

interface RecallTranscriptWord {
  text: string;
  start_time: number;
  end_time: number;
  confidence: number;
}

interface RecallTranscriptSegment {
  speaker: string;
  speaker_id: number;
  words: RecallTranscriptWord[];
  language?: string;
}

export interface RecallTranscript {
  segments: RecallTranscriptSegment[];
  language?: string;
}

async function recallFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const apiKey = process.env.RECALL_API_KEY;
  if (!apiKey) {
    throw new Error('RECALL_API_KEY not configured');
  }

  return fetch(`${RECALL_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

export const recallService = {
  async getTranscript(botId: string): Promise<RecallTranscript | null> {
    const response = await recallFetch(`/bot/${botId}/transcript`);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get transcript: ${response.status}`);
    }

    return response.json() as Promise<RecallTranscript>;
  },

  async deleteMedia(botId: string): Promise<boolean> {
    logger.info({ botId }, 'Deleting Recall media');

    const response = await recallFetch(`/bot/${botId}/delete_media/`, {
      method: 'POST',
    });

    if (!response.ok) {
      if (response.status === 400) {
        logger.warn({ botId }, 'Media delete failed - bot may still be in progress');
        return false;
      }
      if (response.status === 409) {
        logger.info({ botId }, 'Media deletion already in progress');
        return true;
      }
      throw new Error(`Failed to delete media: ${response.status}`);
    }

    logger.info({ botId }, 'Recall media deleted');
    return true;
  },

  formatTranscript(recallTranscript: RecallTranscript): {
    fullText: string;
    speakers: Array<{ id: string; name: string; word_count: number; duration_ms: number; talk_time_pct: number }>;
    rawTranscript: RecallTranscriptSegment[];
    wordCount: number;
    language: string | null;
  } {
    const segments = recallTranscript.segments || [];
    
    const speakerStats: Record<number, { words: number; duration: number }> = {};
    let totalDuration = 0;

    for (const segment of segments) {
      if (!speakerStats[segment.speaker_id]) {
        speakerStats[segment.speaker_id] = { words: 0, duration: 0 };
      }
      const wordCount = segment.words.length;
      const duration = segment.words.length > 0 
        ? segment.words[segment.words.length - 1].end_time - segment.words[0].start_time
        : 0;
      
      speakerStats[segment.speaker_id].words += wordCount;
      speakerStats[segment.speaker_id].duration += duration;
      totalDuration += duration;
    }

    const speakers = Object.entries(speakerStats).map(([id, stats]) => ({
      id: `Speaker ${id}`,
      name: `Speaker ${id}`,
      word_count: stats.words,
      duration_ms: Math.round(stats.duration * 1000),
      talk_time_pct: totalDuration > 0 
        ? Math.round((stats.duration / totalDuration) * 100)
        : 0,
    }));

    const lines = segments.map(seg => {
      const startTime = seg.words[0]?.start_time || 0;
      const minutes = Math.floor(startTime / 60);
      const seconds = Math.floor(startTime % 60);
      const timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      const text = seg.words.map(w => w.text).join(' ');
      return `[${timestamp}] Speaker ${seg.speaker_id}: ${text}`;
    });

    const wordCount = segments.reduce((sum, seg) => sum + seg.words.length, 0);
    const detectedLanguage = segments.find(s => s.language)?.language || recallTranscript.language || null;

    return {
      fullText: lines.join('\n'),
      speakers,
      rawTranscript: segments,
      wordCount,
      language: detectedLanguage,
    };
  },
};
