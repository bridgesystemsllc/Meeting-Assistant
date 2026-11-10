/**
 * AI Analysis Service (powered by Claude)
 * Takes a transcript and produces comprehensive meeting intelligence:
 * - Executive summary
 * - Action items with owners
 * - Key decisions
 * - Topics & sentiment
 * - Risks & blockers
 * - Next meeting agenda suggestions
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

const analysisService = {
  /**
   * Main analysis function - runs full meeting intelligence pipeline
   * @param {Object} transcript - Formatted transcript from transcriptionService
   * @param {Object} meetingMeta - Meeting metadata (title, attendees, etc.)
   * @returns {Object} Structured meeting analysis
   */
  analyzeMeeting: async (transcript, meetingMeta = {}) => {
    try {
      logger.info('Starting AI meeting analysis', { 
        wordCount: transcript.word_count,
        speakers: transcript.speakers?.length 
      });

      // Prepare the transcript text (truncate if too long)
      const transcriptText = analysisService.prepareTranscriptForAnalysis(transcript);

      const systemPrompt = `You are an expert meeting analyst and executive assistant. 
Your job is to analyze meeting transcripts and extract structured, actionable intelligence.
Be precise, concise, and business-focused. 
Always respond with valid JSON only - no markdown, no preamble, just the JSON object.`;

      const userPrompt = `Analyze this meeting transcript and return a comprehensive JSON analysis.

MEETING DETAILS:
Title: ${meetingMeta.title || 'Unknown Meeting'}
Date: ${meetingMeta.date || 'Unknown'}
Duration: ${Math.round((transcript.duration_ms || 0) / 60000)} minutes
Attendees/Speakers: ${transcript.speakers?.map(s => s.name || s.id).join(', ') || 'Unknown'}

AUTO-DETECTED TOPICS:
${transcript.chapters?.map(c => `- ${c.title}: ${c.summary}`).join('\n') || 'None detected'}

FULL TRANSCRIPT:
${transcriptText}

Return ONLY a JSON object with this exact structure:
{
  "summary": "3-5 sentence executive summary of what was discussed and decided",
  
  "key_decisions": [
    {
      "decision": "The actual decision made",
      "owner": "Person responsible (or 'Team' if group)",
      "context": "Why this decision was made"
    }
  ],
  
  "action_items": [
    {
      "task": "Specific actionable task",
      "owner": "Person assigned (speaker label or name)",
      "due_date": "Mentioned due date or 'Not specified'",
      "priority": "high | medium | low",
      "context": "Brief context for why this task exists"
    }
  ],
  
  "topics_discussed": [
    {
      "topic": "Topic name",
      "summary": "What was said about this topic",
      "sentiment": "positive | negative | neutral",
      "time_spent_pct": 25
    }
  ],
  
  "questions_unresolved": [
    {
      "question": "Question that was raised but not answered",
      "raised_by": "Speaker who asked"
    }
  ],
  
  "risks_and_blockers": [
    {
      "risk": "Description of risk or blocker",
      "severity": "high | medium | low",
      "owner": "Who owns resolving this"
    }
  ],
  
  "meeting_metrics": {
    "overall_sentiment": "positive | negative | neutral | mixed",
    "meeting_effectiveness": "high | medium | low",
    "meeting_effectiveness_reason": "Why you rated it this way",
    "engagement_score": 75,
    "dominant_speaker": "Speaker ID who talked most",
    "key_highlights": ["Top 3-5 memorable quotes or moments"]
  },
  
  "next_meeting_suggestions": {
    "recommended_agenda": [
      "Follow up on action items from today",
      "Review progress on [specific item]"
    ],
    "participants_needed": ["Same team", "Add: finance team"],
    "suggested_duration_minutes": 30
  },
  
  "follow_up_email_draft": "Subject: [Meeting Title] - Key Takeaways\\n\\nHi team,\\n\\nThank you for joining today's meeting. Here are the key takeaways:\\n\\n[Summary]\\n\\nAction Items:\\n[List]\\n\\nNext Steps:\\n[List]\\n\\nBest regards"
}`;

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt
      });

      const rawText = response.content[0].text;
      
      // Parse and validate the JSON response
      const analysis = analysisService.parseAndValidateResponse(rawText);
      
      logger.info('AI analysis completed', {
        actionItems: analysis.action_items?.length,
        decisions: analysis.key_decisions?.length,
        sentiment: analysis.meeting_metrics?.overall_sentiment
      });

      return {
        ...analysis,
        raw_ai_response: rawText,
        model_used: MODEL,
        analyzed_at: new Date().toISOString()
      };

    } catch (err) {
      logger.error('AI analysis failed', { error: err.message });
      throw new Error(`Meeting analysis failed: ${err.message}`);
    }
  },

  /**
   * Prepares transcript text for the AI prompt
   * Handles token limits by truncating if necessary
   */
  prepareTranscriptForAnalysis: (transcript) => {
    const MAX_CHARS = 60000; // ~15k tokens, leaving room for prompt + response
    
    const text = transcript.formatted_transcript || transcript.full_text || '';
    
    if (text.length <= MAX_CHARS) {
      return text;
    }

    // If too long, take first 40% and last 60% (beginnings and ends tend to have decisions/action items)
    const firstPart = text.substring(0, MAX_CHARS * 0.4);
    const lastPart = text.substring(text.length - (MAX_CHARS * 0.6));
    
    return `${firstPart}\n\n[... transcript truncated for length ...]\n\n${lastPart}`;
  },

  /**
   * Parses AI JSON response with fallback handling
   */
  parseAndValidateResponse: (rawText) => {
    try {
      // Strip any accidental markdown fences
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      
      const parsed = JSON.parse(cleaned);
      
      // Ensure required fields exist with defaults
      return {
        summary: parsed.summary || 'Summary not available',
        key_decisions: parsed.key_decisions || [],
        action_items: parsed.action_items || [],
        topics_discussed: parsed.topics_discussed || [],
        questions_unresolved: parsed.questions_unresolved || [],
        risks_and_blockers: parsed.risks_and_blockers || [],
        meeting_metrics: parsed.meeting_metrics || {
          overall_sentiment: 'neutral',
          engagement_score: 50,
          meeting_effectiveness: 'medium'
        },
        next_meeting_suggestions: parsed.next_meeting_suggestions || {},
        follow_up_email_draft: parsed.follow_up_email_draft || ''
      };
    } catch (parseErr) {
      logger.error('Failed to parse AI JSON response', { 
        error: parseErr.message,
        rawText: rawText.substring(0, 500) 
      });
      
      // Return minimal valid structure
      return {
        summary: 'Analysis could not be parsed. Please review the raw transcript.',
        key_decisions: [],
        action_items: [],
        topics_discussed: [],
        questions_unresolved: [],
        risks_and_blockers: [],
        meeting_metrics: { overall_sentiment: 'neutral', engagement_score: 50 },
        next_meeting_suggestions: {},
        follow_up_email_draft: '',
        parse_error: parseErr.message
      };
    }
  }
};

module.exports = analysisService;
