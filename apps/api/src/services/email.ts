/**
 * Email Service
 * Sends recap emails to meeting owner only (Phase 1)
 */

import nodemailer from 'nodemailer';
import type { MeetingAnalysis } from '@meeting-assistant/shared';
import { logger } from '../lib/logger.js';

interface MeetingInfo {
  id: string;
  title: string;
  started_at: string | null;
  duration_seconds: number | null;
}

interface RecapEmailData {
  meeting: MeetingInfo;
  analysis: MeetingAnalysis;
  ownerEmail: string;
  ownerName: string;
  language?: string | null;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    });
  }
  return transporter;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Unknown duration';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} minutes`;
}

/**
 * Sends recap email to meeting owner only
 */
export async function sendRecapEmail(data: RecapEmailData): Promise<boolean> {
  const { meeting, analysis, ownerEmail, ownerName: _ownerName, language } = data;

  if (!process.env.SMTP_HOST) {
    logger.info({ meetingId: meeting.id }, 'SMTP not configured, skipping recap email');
    return false;
  }

  const subject = `📋 Meeting Notes: ${escapeHtml(meeting.title)}`;
  
  const actionItemsHtml = analysis.action_items.length > 0
    ? analysis.action_items.map(item => `
        <li style="margin-bottom: 8px;">
          <strong>${escapeHtml(item.task)}</strong><br/>
          <span style="color: #666; font-size: 13px;">
            Owner: ${escapeHtml(item.owner)} 
            ${item.due_date ? `| Due: ${escapeHtml(item.due_date)}` : ''}
            | Priority: ${item.priority}
          </span>
        </li>
      `).join('')
    : '<li style="color: #999;">No action items identified</li>';

  const decisionsHtml = analysis.key_decisions.length > 0
    ? analysis.key_decisions.map(d => `
        <li style="margin-bottom: 8px;">
          <strong>${escapeHtml(d.decision)}</strong>
          ${d.owner ? `<br/><span style="color: #666; font-size: 13px;">Owner: ${escapeHtml(d.owner)}</span>` : ''}
        </li>
      `).join('')
    : '<li style="color: #999;">No decisions recorded</li>';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 24px; color: #fff;">
      <h1 style="margin: 0 0 8px 0; font-size: 20px;">${escapeHtml(meeting.title)}</h1>
      <p style="margin: 0; opacity: 0.9; font-size: 14px;">
        ${meeting.started_at ? new Date(meeting.started_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Date unknown'}
        ${meeting.duration_seconds ? ` • ${formatDuration(meeting.duration_seconds)}` : ''}
        ${language ? ` • ${language.toUpperCase()}` : ''}
      </p>
    </div>
    
    <div style="padding: 24px;">
      <h2 style="margin: 0 0 12px 0; font-size: 16px; color: #333;">📝 Summary</h2>
      <p style="margin: 0 0 24px 0; color: #555; line-height: 1.6;">${escapeHtml(analysis.summary)}</p>
      
      <h2 style="margin: 0 0 12px 0; font-size: 16px; color: #333;">✅ Action Items</h2>
      <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #555; line-height: 1.6;">
        ${actionItemsHtml}
      </ul>
      
      <h2 style="margin: 0 0 12px 0; font-size: 16px; color: #333;">🎯 Key Decisions</h2>
      <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #555; line-height: 1.6;">
        ${decisionsHtml}
      </ul>
      
      ${analysis.risks_and_blockers.length > 0 ? `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #dc2626;">⚠️ Risks & Blockers</h3>
        <ul style="margin: 0; padding-left: 20px; color: #991b1b;">
          ${analysis.risks_and_blockers.map(r => `<li>${escapeHtml(r.risk)} (${r.severity})</li>`).join('')}
        </ul>
      </div>
      ` : ''}
    </div>
    
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af;">
      Generated by [PRODUCT NAME] • AI-powered meeting notes
    </div>
  </div>
</body>
</html>
`;

  const text = [
    `MEETING NOTES: ${meeting.title}`,
    '='.repeat(50),
    '',
    'SUMMARY',
    analysis.summary,
    '',
    'ACTION ITEMS',
    ...analysis.action_items.map((item, i) => 
      `${i + 1}. ${item.task} — Owner: ${item.owner} | Due: ${item.due_date || 'TBD'} | Priority: ${item.priority}`
    ),
    '',
    'KEY DECISIONS',
    ...analysis.key_decisions.map((d, i) => `${i + 1}. ${d.decision}`),
    '',
    '---',
    'Generated by [PRODUCT NAME]',
  ].join('\n');

  try {
    const transport = getTransporter();
    
    await transport.sendMail({
      from: `[PRODUCT NAME] <${process.env.FROM_EMAIL || 'noreply@example.com'}>`,
      to: ownerEmail,
      subject,
      html,
      text,
    });

    logger.info({ meetingId: meeting.id, ownerEmail }, 'Recap email sent');
    return true;
  } catch (err) {
    logger.error({ meetingId: meeting.id, err }, 'Failed to send recap email');
    return false;
  }
}

/**
 * For testing: allows injecting a mock transporter
 */
export function setTransporter(t: nodemailer.Transporter | null): void {
  transporter = t;
}
