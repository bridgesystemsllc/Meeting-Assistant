/**
 * Consent settings: bot display name, notices, and stop keywords.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SettingsNav } from '../../components/SettingsNav';

interface ConsentSettingsData {
  botDisplayName: string;
  preJoinNotice: string;
  inCallNotice: string;
  stopKeywords: string[];
  hasCustomSettings: boolean;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export function ConsentSettingsPage() {
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [botDisplayName, setBotDisplayName] = useState('');
  const [preJoinNotice, setPreJoinNotice] = useState('');
  const [inCallNotice, setInCallNotice] = useState('');
  const [stopKeywords, setStopKeywords] = useState('');

  const load = useCallback(async () => {
    setLoadingState('loading');
    try {
      const response = await fetch('/api/v1/consent/settings', { credentials: 'include' });
      const data = (await response.json().catch(() => ({}))) as ConsentSettingsData & {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(data?.error?.message || 'Unable to load consent settings.');
      }
      setBotDisplayName(data.botDisplayName ?? '');
      setPreJoinNotice(data.preJoinNotice ?? '');
      setInCallNotice(data.inCallNotice ?? '');
      setStopKeywords((data.stopKeywords ?? []).join(', '));
      setError(null);
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
    const body = (await response.json().catch(() => ({}))) as ValidationResult & {
      error?: { message?: string };
    };
    if (!response.ok) {
      return { valid: false, error: body.error?.message || 'Unable to validate bot name.' };
    }
    return { valid: body.valid, error: body.error };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setValidationError(null);

    if (botDisplayName) {
      const validation = await validateBotName(botDisplayName);
      if (!validation.valid) {
        setValidationError(validation.error || 'Invalid bot name');
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
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
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
        Set the bot name, in-meeting notices, and the phrases that stop recording.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
          {error}
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
          <div>
            <label htmlFor="bot-display-name" className="block text-sm font-medium text-[var(--color-fg)]">
              Bot display name
            </label>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              Must include a disclosure word such as Notetaker, Recorder, Recording, Transcript, or AI
              Notes.
            </p>
            <input
              id="bot-display-name"
              type="text"
              value={botDisplayName}
              onChange={(event) => setBotDisplayName(event.target.value)}
              className={fieldClass}
              autoComplete="off"
            />
            {validationError && (
              <p role="alert" className="mt-1 text-sm text-[var(--color-danger)]">
                {validationError}
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
            />
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      )}
    </div>
  );
}
