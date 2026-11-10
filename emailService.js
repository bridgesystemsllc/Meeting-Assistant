/**
 * Email Notification Service
 * Sends beautifully formatted meeting notes to participants
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const emailService = {
  /**
   * Sends meeting notes email to all recipients
   */
  sendMeetingNotes: async ({ meeting, transcript, analysis, recipients }) => {
    try {
      const subject = `📋 Meeting Notes: ${meeting.title || 'Your Meeting'}`;
      const html = emailService.buildEmailHtml({ meeting, transcript, analysis });
      const text = emailService.buildEmailText({ meeting, transcript, analysis });

      const sendPromises = recipients.map(email =>
        transporter.sendMail({
          from: `Meeting Assistant <${process.env.FROM_EMAIL}>`,
          to: email,
          subject,
          html,
          text
        })
      );

      await Promise.all(sendPromises);
      logger.info('Meeting notes emails sent', { meetingId: meeting.id, recipients: recipients.length });
      return true;
    } catch (err) {
      logger.error('Failed to send meeting notes email', { meetingId: meeting.id, error: err.message });
      throw err;
    }
  },

  buildEmailHtml: ({ meeting, transcript, analysis }) => {
    const duration = meeting.duration_seconds 
      ? `${Math.round(meeting.duration_seconds / 60)} min` 
      : 'Unknown';

    const actionItemsHtml = analysis.action_items?.length > 0
      ? analysis.action_items.map(item => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${item.task}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#666">${item.owner}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#666">${item.due_date || '—'}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">
              <span style="background:${item.priority === 'high' ? '#fee2e2' : item.priority === 'medium' ? '#fef3c7' : '#dcfce7'};
                           color:${item.priority === 'high' ? '#b91c1c' : item.priority === 'medium' ? '#92400e' : '#166534'};
                           padding:2px 8px;border-radius:9999px;font-size:12px">${item.priority}</span>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="4" style="padding:12px;color:#999;text-align:center">No action items identified</td></tr>';

    const decisionsHtml = analysis.key_decisions?.map(d => 
      `<li style="margin-bottom:8px"><strong>${d.decision}</strong>${d.owner ? ` — <span style="color:#666">Owner: ${d.owner}</span>` : ''}</li>`
    ).join('') || '<li style="color:#999">No decisions recorded</li>';

    const sentimentEmoji = {
      positive: '😊',
      negative: '😟', 
      neutral: '😐',
      mixed: '🤔'
    }[analysis.meeting_metrics?.overall_sentiment] || '📊';

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f8f9fa">
  <div style="max-width:680px;margin:0 auto;padding:20px">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border-radius:12px;padding:32px;margin-bottom:20px">
      <div style="color:#818cf8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Meeting Notes</div>
      <h1 style="color:#fff;margin:0 0 16px 0;font-size:24px">${meeting.title || 'Meeting Summary'}</h1>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <span style="color:#94a3b8;font-size:14px">📅 ${new Date(meeting.started_at || Date.now()).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        <span style="color:#94a3b8;font-size:14px">⏱ ${duration}</span>
        <span style="color:#94a3b8;font-size:14px">${sentimentEmoji} ${analysis.meeting_metrics?.overall_sentiment || 'neutral'} sentiment</span>
      </div>
    </div>

    <!-- Summary -->
    <div style="background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#1e293b">📝 Executive Summary</h2>
      <p style="margin:0;color:#475569;line-height:1.6">${analysis.summary}</p>
    </div>

    <!-- Action Items -->
    <div style="background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <h2 style="margin:0 0 16px 0;font-size:16px;color:#1e293b">✅ Action Items</h2>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;font-weight:600">TASK</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;font-weight:600">OWNER</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;font-weight:600">DUE DATE</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;font-weight:600">PRIORITY</th>
          </tr>
        </thead>
        <tbody>${actionItemsHtml}</tbody>
      </table>
    </div>

    <!-- Key Decisions -->
    <div style="background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#1e293b">🎯 Key Decisions</h2>
      <ul style="margin:0;padding-left:20px;color:#475569;line-height:1.8">${decisionsHtml}</ul>
    </div>

    <!-- Risks -->
    ${analysis.risks_and_blockers?.length > 0 ? `
    <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:12px;padding:24px;margin-bottom:16px">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#dc2626">⚠️ Risks & Blockers</h2>
      <ul style="margin:0;padding-left:20px;color:#7f1d1d;line-height:1.8">
        ${analysis.risks_and_blockers.map(r => `<li><strong>${r.risk}</strong> (${r.severity} severity)</li>`).join('')}
      </ul>
    </div>` : ''}

    <!-- Speaker Stats -->
    ${transcript.speakers?.length > 0 ? `
    <div style="background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <h2 style="margin:0 0 16px 0;font-size:16px;color:#1e293b">🎙 Talk Time</h2>
      ${transcript.speakers.map(s => `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:14px;color:#374151">${s.name || `Speaker ${s.id}`}</span>
            <span style="font-size:14px;color:#6b7280">${s.talk_time_pct}%</span>
          </div>
          <div style="background:#f1f5f9;border-radius:4px;height:8px">
            <div style="background:#6366f1;border-radius:4px;height:8px;width:${s.talk_time_pct}%"></div>
          </div>
        </div>`).join('')}
    </div>` : ''}

    <!-- Footer -->
    <div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px">
      Generated by Meeting Assistant • Powered by AI
    </div>
  </div>
</body>
</html>`;
  },

  buildEmailText: ({ meeting, analysis }) => {
    const lines = [
      `MEETING NOTES: ${meeting.title || 'Meeting'}`,
      '='.repeat(50),
      '',
      'SUMMARY',
      analysis.summary,
      '',
      'ACTION ITEMS',
      ...( analysis.action_items?.map((item, i) => 
        `${i+1}. ${item.task} — Owner: ${item.owner} | Due: ${item.due_date || 'TBD'} | Priority: ${item.priority}`
      ) || ['No action items']),
      '',
      'KEY DECISIONS',
      ...( analysis.key_decisions?.map((d, i) => `${i+1}. ${d.decision}`) || ['No decisions']),
    ];
    return lines.join('\n');
  }
};

module.exports = emailService;
