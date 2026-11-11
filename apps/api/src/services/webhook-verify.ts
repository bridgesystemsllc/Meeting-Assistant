/**
 * Webhook signature verification.
 *
 * Drop-in point for FORGE Phase 1 (PR #3): replace this module with the real
 * Svix/HMAC implementation of the same exports. Until then the default
 * verifyWebhookSignature rejects every payload (fail closed).
 */

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
  id?: string;
}

export type WebhookVerifyHeaders = {
  'svix-id'?: string;
  'svix-timestamp'?: string;
  'svix-signature'?: string;
  'webhook-id'?: string;
  'webhook-timestamp'?: string;
  'webhook-signature'?: string;
};

export type WebhookVerifier = (
  rawBody: string,
  headers: WebhookVerifyHeaders
) => WebhookVerificationResult;

export function requireWebhookSecret(): string {
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('RECALL_WEBHOOK_SECRET is unset');
  }
  return secret;
}

/**
 * Default implementation: reject everything.
 * FORGE PR #3 replaces this function with HMAC verification; keep the signature.
 */
export function verifyWebhookSignature(
  _rawBody: string,
  _headers: WebhookVerifyHeaders,
  _secret: string
): WebhookVerificationResult {
  return { valid: false, error: 'verifier_not_configured' };
}

/**
 * Bind RECALL_WEBHOOK_SECRET (when present) into (rawBody, headers) => result.
 * Missing secret still returns a verifier that rejects, so the route can fail
 * closed without throwing.
 */
export function createWebhookVerifier(): WebhookVerifier {
  try {
    const secret = requireWebhookSecret();
    return (rawBody, headers) => verifyWebhookSignature(rawBody, headers, secret);
  } catch {
    return () => ({ valid: false, error: 'verifier_not_configured' });
  }
}
