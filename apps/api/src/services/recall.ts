/**
 * Recall.ai Service
 * Handles meeting bot creation, transcript retrieval, and media deletion
 * Docs: https://docs.recall.ai
 */

import { logger } from '../lib/logger.js';

const RECALL_BASE_URL = process.env.RECALL_API_URL || 'https://us-west-2.recall.ai/api/v1';

interface RecallBotConfig {
  meetingUrl: string;
  botName: string;
  meetingId: string;
  tenantId: string;
}

interface RecallBot {
  id: string;
  status_changes: Array<{ code: string; created_at: string }>;
  metadata?: Record<string, string>;
}

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

  const response = await fetch(`${RECALL_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return response;
}

export const recallService = {
  /**
   * Creates a bot and sends it to join a meeting
   */
  async createBot(config: RecallBotConfig): Promise<RecallBot> {
    const { meetingUrl, botName, meetingId, tenantId } = config;

    logger.info({ meetingUrl: meetingUrl.substring(0, 50), meetingId }, 'Creating Recall bot');

    // P1-5: Use recallai_streaming for multi-language support (not meeting_captions which is English-only)
    const payload = {
      meeting_url: meetingUrl,
      bot_name: botName,
      recording_config: {
        transcript: {
          provider: {
            recallai_streaming: {
              language_code: 'auto', // Auto-detect language
            },
          },
        },
      },
      metadata: {
        internal_meeting_id: meetingId,
        tenant_id: tenantId,
      },
    };

    const response = await recallFetch('/bot', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ error, status: response.status }, 'Failed to create Recall bot');
      throw new Error(`Failed to create bot: ${error}`);
    }

    const bot = await response.json() as RecallBot;
    logger.info({ botId: bot.id, meetingId }, 'Recall bot created');

    return bot;
  },

  /**
   * Gets bot status
   */
  async getBotStatus(botId: string): Promise<RecallBot> {
    const response = await recallFetch(`/bot/${botId}`);

    if (!response.ok) {
      throw new Error(`Failed to get bot status: ${response.status}`);
    }

    return response.json() as Promise<RecallBot>;
  },

  /**
   * Gets transcript from Recall (using built-in transcription)
   */
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

  /**
   * Deletes media (audio/video) from Recall
   * MUST be called after transcript is retrieved, before marking meeting completed
   * This implements transcript-only mode (no stored audio)
   */
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

  /**
   * Sends in-call chat message (for consent notice)
   */
  async sendChatMessage(botId: string, message: string): Promise<boolean> {
    const response = await recallFetch(`/bot/${botId}/send_chat_message/`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });

    return response.ok;
  },

  /**
   * Removes bot from meeting
   */
  async removeBot(botId: string): Promise<void> {
    const response = await recallFetch(`/bot/${botId}`, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to remove bot: ${response.status}`);
    }

    logger.info({ botId }, 'Bot removed from meeting');
  },

  /**
   * Leave meeting (alias for removeBot, used by consent handler)
   */
  async leaveMeeting(botId: string): Promise<void> {
    return this.removeBot(botId);
  },

  /**
   * Delete recording from Recall (for consent denial cleanup)
   */
  async deleteRecording(botId: string): Promise<void> {
    logger.info({ botId }, 'Deleting Recall recording');

    const response = await recallFetch(`/bot/${botId}/delete_media/`, {
      method: 'POST',
    });

    if (!response.ok && response.status !== 404 && response.status !== 400) {
      throw new Error(`Failed to delete recording: ${response.status}`);
    }

    logger.info({ botId }, 'Recall recording deleted');
  },

  /**
   * Delete transcript from Recall (for consent denial cleanup)
   */
  async deleteTranscript(botId: string): Promise<void> {
    logger.info({ botId }, 'Deleting Recall transcript');

    const response = await recallFetch(`/bot/${botId}/delete_transcript/`, {
      method: 'POST',
    });

    if (!response.ok && response.status !== 404 && response.status !== 400) {
      throw new Error(`Failed to delete transcript: ${response.status}`);
    }

    logger.info({ botId }, 'Recall transcript deleted');
  },

  /**
   * Formats Recall transcript to our internal format
   */
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
