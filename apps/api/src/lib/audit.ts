/**
 * Audit hook. P2-4 replaces the body with an append-only audit_log write.
 * Callers (meeting delete, later membership/settings) must go through this.
 */

import { logger } from './logger.js';

export interface AuditEvent {
  tenantId: string;
  actorUserId: string;
  action: string;
  target: string;
  meta?: Record<string, unknown>;
}

export async function recordAudit(event: AuditEvent): Promise<void> {
  logger.info(
    { tenant_id: event.tenantId, actor: event.actorUserId, action: event.action, target: event.target },
    'audit'
  );
}
