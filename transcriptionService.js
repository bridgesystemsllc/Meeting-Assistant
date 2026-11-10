/**
 * AssemblyAI Transcription Service
 * Handles audio transcription with speaker diarization (who said what)
 * Docs: https://www.assemblyai.com/docs
 */

const { AssemblyAI } = require('assemblyai');
const logger = require('../utils/logger');

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY
});

const transcriptionService = {
  /**
   * Submits audio for transcription and waits for completion
   * This is the main function - handles the full transcription pipeline
   * @param {string} audioUrl - URL to the audio/video file
   * @returns {Object} Structured transcript with speakers
   */
  transcribeRecording: async (audioUrl) => {
    try {
      logger.info('Submitting audio for transcription', { audioUrl: audioUrl.substring(0, 80) });

      const transcript = await client.transcripts.transcribe({
        audio_url: audioUrl,
        
        // Speaker diarization - identifies WHO is speaking
        speaker_labels: true,
        
        // Auto-chapters - segments the meeting into topics  
        auto_chapters: true,
        
        // Auto-highlights - key phrases and topics
        auto_highlights: true,
        
        // Sentiment analysis per sentence
        sentiment_analysis: true,
        
        // Entity detection (names, orgs, dates mentioned)
        entity_detection: true,
        
        // Language
        language_code: 'en'
      });

      if (transcript.status === 'error') {
        throw new Error(`Transcription failed: ${transcript.error}`);
      }

      logger.info('Transcription completed', { 
        transcriptId: transcript.id,
        wordCount: transcript.words?.length,
        speakers: [...new Set(transcript.utterances?.map(u => u.speaker))].length
      });

      return transcriptionService.formatTranscript(transcript);
    } catch (err) {
      logger.error('Transcription error', { audioUrl, error: err.message });
      throw err;
    }
  },

  /**
   * Formats raw AssemblyAI transcript into our structured format
   */
  formatTranscript: (rawTranscript) => {
    const utterances = rawTranscript.utterances || [];
    const speakers = [...new Set(utterances.map(u => u.speaker))];

    // Build speaker talk-time stats
    const speakerStats = {};
    utterances.forEach(u => {
      if (!speakerStats[u.speaker]) {
        speakerStats[u.speaker] = { words: 0, duration_ms: 0 };
      }
      speakerStats[u.speaker].words += u.words?.length || 0;
      speakerStats[u.speaker].duration_ms += (u.end - u.start);
    });

    const totalDuration = utterances.reduce((sum, u) => sum + (u.end - u.start), 0);

    const speakerList = speakers.map(speakerId => ({
      id: speakerId,
      name: `Speaker ${speakerId}`, // Will be overridden if we can identify from calendar
      word_count: speakerStats[speakerId]?.words || 0,
      duration_ms: speakerStats[speakerId]?.duration_ms || 0,
      talk_time_pct: totalDuration > 0 
        ? Math.round((speakerStats[speakerId]?.duration_ms / totalDuration) * 100) 
        : 0
    }));

    // Build clean readable transcript
    const formattedLines = utterances.map(u => {
      const timestamp = transcriptionService.formatTimestamp(u.start);
      return `[${timestamp}] Speaker ${u.speaker}: ${u.text}`;
    });

    // Build chapters/topics from auto-chapter
    const chapters = (rawTranscript.chapters || []).map(ch => ({
      title: ch.headline,
      summary: ch.summary,
      start_ms: ch.start,
      end_ms: ch.end,
      gist: ch.gist
    }));

    // Sentiment summary
    const sentiments = rawTranscript.sentiment_analysis_results || [];
    const sentimentCounts = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
    sentiments.forEach(s => sentimentCounts[s.sentiment]++);
    const dominantSentiment = Object.entries(sentimentCounts)
      .sort(([,a], [,b]) => b - a)[0][0].toLowerCase();

    return {
      assemblyai_id: rawTranscript.id,
      full_text: rawTranscript.text || '',
      formatted_transcript: formattedLines.join('\n'),
      utterances: utterances.map(u => ({
        speaker: u.speaker,
        text: u.text,
        start_ms: u.start,
        end_ms: u.end,
        confidence: u.confidence
      })),
      speakers: speakerList,
      chapters,
      highlights: rawTranscript.auto_highlights_result?.results?.slice(0, 20) || [],
      entities: rawTranscript.entities || [],
      sentiment: dominantSentiment,
      sentiment_breakdown: sentimentCounts,
      duration_ms: rawTranscript.audio_duration ? rawTranscript.audio_duration * 1000 : 0,
      word_count: rawTranscript.words?.length || 0
    };
  },

  /**
   * Formats milliseconds into MM:SS timestamp
   */
  formatTimestamp: (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
};

module.exports = transcriptionService;
