/**
 * Consent settings: bot display name, notices, stop keywords,
 * and the read-only v1 consent policy / transcript-only mode.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SettingsNav } from '../../components/SettingsNav';
import { useAuth } from '../../hooks/useAuth';
import { hasRequiredRole } from '@meeting-assistant/shared';

interface ConsentSettingsData {
  botDisplayName: string;
  preJoinNotice: string;
  inCallNotice: string;
  stopKeywords: string[];
  storeAudio: boolean;
  consentPolicy: string;
  notifyAttendees: boolean;
  hasCustomSettings: boolean;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

interface ApiErrorBody {
  error?: { message?: string; code?: string };
}

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

function policyLabel(policy: string): string {
  if (policy === 'all_party_notice') return 'All-party notice';
  return policy;
}

export function ConsentSettingsPage() {
  const { me } = useAuth();
  const canEdit = hasRequiredRole(me?.role ?? 'member', 'admin');

  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationCode, setValidationCode] = useState<string | null>(null);

  const [botDisplayName, setBotDisplayName] = useState('');
  const [preJoinNotice, setPreJoinNotice] = useState('');
  const [inCallNotice, setInCallNotice] = useState('');
  const [stopKeywords, setStopKeywords] = useState('');
  const [notifyAttendees, setNotifyAttendees] = useState(true);
  const [consentPolicy, setConsentPolicy] = useState('all_party_notice');
  const [storeAudio, setStoreAudio] = useState(false);

  const load = useCallback(async () => {
    setLoadingState('loading');
    try {
      const response = await fetch('/api/v1/consent/settings', { credentials: 'include' });
      const data = (await response.json().catch(() => ({}))) as ConsentSettingsData & ApiErrorBody;
      if (!response.ok) {
        throw new Error(data?.error?.message || 'Unable to load consent settings.');
      }
      setBotDisplayName(data.botDisplayName ?? '');
      setPreJoinNotice(data.preJoinNotice ?? '');
      setInCallNotice(data.inCallNotice ?? '');
      setStopKeywords((data.stopKeywords ?? []).join(', '));
      setNotifyAttendees(data.notifyAttendees !== false);
      setConsentPolicy(data.consentPolicy ?? 'all_party_notice');
      setStoreAudio(data.storeAudio === true);
      setError(null);
      setErrorCode(null);
      setLoadingState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load consent settings.');
      setLoadingState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function validateBotName(name: string): Promise<ValidationResult> {
    const response = await fetch('/api/v1/consent/validate-bot-name', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botName: name }),
    });
    const body = (await response.json().catch(() => ({}))) as ValidationResult & ApiErrorBody;
    if (!response.ok) {
      return {
        valid: false,
        error: body.error?.message || 'Unable to validate bot name.',
        code: body.error?.code,
      };
    }
    return { valid: body.valid, error: body.error, code: body.code };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setErrorCode(null);
    setSuccess(false);
    setValidationError(null);
    setValidationCode(null);

    if (botDisplayName) {
      const validation = await validateBotName(botDisplayName);
      if (!validation.valid) {
        setValidationError(validation.error || 'Invalid bot name');
        setValidationCode(validation.code || 'BOT_NAME_NOT_DISCLOSING');
        return;
      }
    }

    const keywords = stopKeywords
      .split(',')
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);

    setSaving(true);
    try {
      const response = await fetch('/api/v1/consent/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botDisplayName: botDisplayName || null,
          preJoinNotice: preJoinNotice || null,
          inCallNotice: inCallNotice || null,
          stopKeywords: keywords.length > 0 ? keywords : null,
          notifyAttendees,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody & { success?: boolean };
      if (!response.ok) {
        const code = body?.error?.code;
        setErrorCode(code ?? null);
        if (code === 'BOT_NAME_NOT_DISCLOSING') {
          setValidationError(body?.error?.message || 'Bot name must disclose recording.');
          setValidationCode(code);
          return;
        }
        if (response.status === 403) {
          throw new Error(body?.error?.message || 'Only an admin or owner can change consent settings.');
        }
        throw new Error(body?.error?.message || 'Unable to save consent settings.');
      }
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save consent settings.');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    'mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface,white)] px-3 py-2 text-sm text-[var(--color-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <div>
      <SettingsNav />
      <h1 className="text-2xl font-semibold text-[var(--color-fg)]">Consent</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Set how [PRODUCT NAME] discloses recording to attendees. The bot name, notices, and consent
        policy keep the disclosure visible before and during the call.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
          {errorCode ? `${errorCode}: ${error}` : error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-4 text-sm text-[var(--color-success,#34C759)]">
          Settings saved.
        </p>
      )}

      {loadingState === 'loading' && (
        <p className="mt-6 text-sm text-[var(--color-muted)]">Loading consent settings…</p>
      )}

      {loadingState === 'success' && (
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 max-w-xl space-y-5">
          <section
            aria-labelledby="consent-policy-heading"
            className="rounded-lg border border-[var(--color-border)] p-4"
          >
            <h2 id="consent-policy-heading" className="text-sm font-medium text-[var(--color-fg)]">
              Consent policy
            </h2>
            <p className="mt-1 text-sm text-[var(--color-fg)]" data-testid="consent-policy">
              {policyLabel(consentPolicy)}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              v1 treats every meeting as all-party notice. This cannot be changed in the product.
            </p>
          </section>

          <section
            aria-labelledby="store-audio-heading"
            className="rounded-lg border border-[var(--color-border)] p-4"
          >
            <h2 id="store-audio-heading" className="text-sm font-medium text-[var(--color-fg)]">
              Audio storage
            </h2>
            <p className="mt-1 text-sm text-[var(--color-fg)]" data-testid="store-audio">
              Transcript only{storeAudio ? ' (unexpected: audio storage is on)' : ''}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              [PRODUCT NAME] does not store meeting audio. This setting is fixed off and is not
              editable.
            </p>
          </section>

          <div>
            <label htmlFor="bot-display-name" className="block text-sm font-medium text-[var(--color-fg)]">
              Bot display name
            </label>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              Must contain &quot;Notetaker&quot;, &quot;Recorder&quot;, or &quot;AI notes&quot; so the
              name itself discloses recording.
            </p>
            <input
              id="bot-display-name"
              type="text"
              value={botDisplayName}
              onChange={(event) => setBotDisplayName(event.target.value)}
              className={fieldClass}
              autoComplete="off"
              disabled={!canEdit}
            />
            {validationError && (
              <p role="alert" className="mt-1 text-sm text-[var(--color-danger)]" data-testid="bot-name-error">
                {validationCode ? `${validationCode}: ${validationError}` : validationError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="pre-join-notice" className="block text-sm font-medium text-[var(--color-fg)]">
              Pre-join notice
            </label>
            <textarea
              id="pre-join-notice"
              value={preJoinNotice}
              onChange={(event) => setPreJoinNotice(event.target.value)}
              rows={3}
              className={fieldClass}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label htmlFor="in-call-notice" className="block text-sm font-medium text-[var(--color-fg)]">
              In-call notice
            </label>
            <textarea
              id="in-call-notice"
              value={inCallNotice}
              onChange={(event) => setInCallNotice(event.target.value)}
              rows={3}
              className={fieldClass}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label htmlFor="stop-keywords" className="block text-sm font-medium text-[var(--color-fg)]">
              Stop keywords
            </label>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              Comma-separated phrases. If a participant types one, the bot leaves and nothing is stored.
            </p>
            <input
              id="stop-keywords"
              type="text"
              value={stopKeywords}
              onChange={(event) => setStopKeywords(event.target.value)}
              className={fieldClass}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-start gap-2">
            <input
              id="notify-attendees"
              type="checkbox"
              checked={notifyAttendees}
              onChange={(event) => setNotifyAttendees(event.target.checked)}
              disabled={!canEdit}
              className="mt-1"
            />
            <label htmlFor="notify-attendees" className="text-sm text-[var(--color-fg)]">
              Email attendees (or the host) a pre-join notice when a meeting is created
            </label>
          </div>

          <button type="submit" className="btn-primary" disabled={saving || !canEdit}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {!canEdit && (
            <p className="text-xs text-[var(--color-muted)]">
              Only an admin or owner can change consent settings.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
