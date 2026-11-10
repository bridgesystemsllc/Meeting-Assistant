/**
 * Recall.ai Service
 * Handles creating and managing meeting bots that join, record, and stream meetings.
 * Supports: Zoom, Google Meet, Microsoft Teams
 * Docs: https://docs.recall.ai
 */

const axios = require('axios');
const logger = require('../utils/logger');

const RECALL_BASE_URL = 'https://us-west-2.recall.ai/api/v1';

const recallClient = axios.create({
  baseURL: RECALL_BASE_URL,
  headers: {
    'Authorization': `Token ${process.env.RECALL_API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

const recallService = {
  /**
   * Creates a bot and sends it to join a meeting
   * @param {Object} options
   * @param {string} options.meetingUrl - The meeting URL (Zoom/Meet/Teams)
   * @param {string} options.botName - Name displayed in the meeting (e.g., "Meeting Recorder")
   * @param {string} options.meetingId - Internal meeting ID for webhook correlation
   * @returns {Object} Recall bot object
   */
  createBot: async ({ meetingUrl, botName = 'Meeting Notes Bot', meetingId }) => {
    try {
      logger.info('Creating Recall.ai bot', { meetingUrl, meetingId });

      const payload = {
        meeting_url: meetingUrl,
        bot_name: botName,
        
        // Recording configuration
        recording_config: {
          transcript: {
            provider: {
              meeting_captions: {}
            }
          }
        },
        
        // Webhook to notify us of bot events
        // Set this up in Recall dashboard, or pass per-bot:
        real_time_transcription: {
          destination_url: `${process.env.BACKEND_URL}/webhooks/recall/transcription`,
          partial_results: false
        },
        
        // Metadata for correlation
        metadata: {
          internal_meeting_id: meetingId
        }
      };

      const response = await recallClient.post('/bot', payload);
      const bot = response.data;

      logger.info('Recall.ai bot created successfully', { 
        botId: bot.id, 
        meetingId,
        status: bot.status_changes?.[0]?.code 
      });

      return bot;
    } catch (err) {
      const errorDetail = err.response?.data || err.message;
      logger.error('Failed to create Recall.ai bot', { meetingUrl, meetingId, error: errorDetail });
      throw new Error(`Failed to create meeting bot: ${JSON.stringify(errorDetail)}`);
    }
  },

  /**
   * Gets the current status and details of a bot
   * @param {string} botId - Recall.ai bot ID
   */
  getBotStatus: async (botId) => {
    try {
      const response = await recallClient.get(`/bot/${botId}`);
      return response.data;
    } catch (err) {
      logger.error('Failed to get bot status', { botId, error: err.response?.data || err.message });
      throw err;
    }
  },

  /**
   * Gets the recording download URL from a completed bot
   * @param {string} botId - Recall.ai bot ID
   * @returns {string|null} Download URL for the recording
   */
  getRecordingUrl: async (botId) => {
    try {
      const response = await recallClient.get(`/bot/${botId}`);
      const bot = response.data;

      // Extract recording URL from outputs
      const videoUrl = bot.video?.download_url;
      const audioUrl = bot.audio?.download_url;

      if (!videoUrl && !audioUrl) {
        logger.warn('No recording URL found for bot', { botId, botStatus: bot.status });
        return null;
      }

      return audioUrl || videoUrl; // Prefer audio-only (cheaper for transcription)
    } catch (err) {
      logger.error('Failed to get recording URL', { botId, error: err.response?.data || err.message });
      throw err;
    }
  },

  /**
   * Gets transcript from Recall (if using their transcription)
   * We primarily use AssemblyAI, but this is a fallback
   */
  getTranscript: async (botId) => {
    try {
      const response = await recallClient.get(`/bot/${botId}/transcript`);
      return response.data;
    } catch (err) {
      logger.error('Failed to get Recall transcript', { botId, error: err.response?.data || err.message });
      return null;
    }
  },

  /**
   * Removes a bot from a meeting (if called before meeting ends)
   */
  removeBot: async (botId) => {
    try {
      await recallClient.delete(`/bot/${botId}`);
      logger.info('Bot removed from meeting', { botId });
      return true;
    } catch (err) {
      logger.error('Failed to remove bot', { botId, error: err.response?.data || err.message });
      throw err;
    }
  },

  /**
   * Parses a Recall webhook event
   * @param {Object} webhookPayload - Raw webhook body
   * @returns {Object} Parsed event with type and data
   */
  parseWebhookEvent: (webhookPayload) => {
    const { event, data } = webhookPayload;
    
    // Key events we care about:
    // 'bot.status_change' - bot joined, left, failed
    // 'bot.transcript_ready' - transcript available
    // 'bot.recording_ready' - recording download ready

    return {
      eventType: event,
      botId: data?.bot?.id,
      status: data?.bot?.status_changes?.[data.bot.status_changes.length - 1]?.code,
      recordingUrl: data?.recording?.download_url,
      metadata: data?.bot?.metadata
    };
  }
};

module.exports = recallService;
