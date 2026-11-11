/**
 * Consent Settings Page
 * Configure bot display name, consent notices, and stop keywords
 */
import { useState, useEffect, useCallback, type FormEvent } from 'react';

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

export function ConsentSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [botDisplayName, setBotDisplayName] = useState('');
  const [preJoinNotice, setPreJoinNotice] = useState('');
  const [inCallNotice, setInCallNotice] = useState('');
  const [stopKeywords, setStopKeywords] = useState('');

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/consent/settings', {
        headers: {
          'x-tenant-id': getTenantId(),
        },
      });
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json() as ConsentSettingsData;
      setBotDisplayName(data.botDisplayName);
      setPreJoinNotice(data.preJoinNotice);
      setInCallNotice(data.inCallNotice);
      setStopKeywords(data.stopKeywords.join(', '));
    } catch {
      setError('Failed to load consent settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function validateBotName(name: string): Promise<ValidationResult> {
    const response = await fetch('/api/consent/validate-bot-name', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ botName: name }),
    });
    return response.json();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setValidationError(null);

    // Validate bot name before saving
    if (botDisplayName) {
      const validation = await validateBotName(botDisplayName);
      if (!validation.valid) {
        setValidationError(validation.error || 'Invalid bot name');
        return;
      }
    }

    setSaving(true);
    try {
      const keywords = stopKeywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const response = await fetch('/api/consent/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getTenantId(),
        },
        body: JSON.stringify({
          botDisplayName: botDisplayName || null,
          preJoinNotice: preJoinNotice || null,
          inCallNotice: inCallNotice || null,
          stopKeywords: keywords.length > 0 ? keywords : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function getTenantId(): string {
    return localStorage.getItem('tenantId') || '00000000-0000-0000-0000-000000000001';
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Consent Settings</h1>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
            Settings saved successfully
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="botDisplayName" className="block text-sm font-medium text-gray-700 mb-1">
              Bot Display Name
            </label>
            <input
              type="text"
              id="botDisplayName"
              value={botDisplayName}
              onChange={e => setBotDisplayName(e.target.value)}
              placeholder="Meeting Notetaker (recording transcript)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Name shown to meeting participants. Must include a disclosure keyword like "Notetaker", "Recorder", or "Recording".
            </p>
            {validationError && (
              <p className="mt-1 text-sm text-red-600">{validationError}</p>
            )}
          </div>

          <div>
            <label htmlFor="preJoinNotice" className="block text-sm font-medium text-gray-700 mb-1">
              Pre-Join Notice
            </label>
            <textarea
              id="preJoinNotice"
              value={preJoinNotice}
              onChange={e => setPreJoinNotice(e.target.value)}
              rows={3}
              placeholder="This meeting will be recorded and transcribed..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Shown before scheduling and posted to meeting chat before transcription starts.
            </p>
          </div>

          <div>
            <label htmlFor="inCallNotice" className="block text-sm font-medium text-gray-700 mb-1">
              In-Call Notice
            </label>
            <textarea
              id="inCallNotice"
              value={inCallNotice}
              onChange={e => setInCallNotice(e.target.value)}
              rows={2}
              placeholder="Recording in progress. Type 'stop recording' to end."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Posted to meeting chat when the bot joins.
            </p>
          </div>

          <div>
            <label htmlFor="stopKeywords" className="block text-sm font-medium text-gray-700 mb-1">
              Stop Keywords
            </label>
            <input
              type="text"
              id="stopKeywords"
              value={stopKeywords}
              onChange={e => setStopKeywords(e.target.value)}
              placeholder="stop recording, stop transcription, leave meeting"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Comma-separated keywords. When typed in chat, the bot leaves immediately and no data is stored.
            </p>
          </div>

          <div className="pt-4 border-t">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>

        <div className="mt-8 p-4 bg-gray-50 rounded-md">
          <h2 className="text-lg font-medium text-gray-900 mb-2">How Consent Works</h2>
          <ul className="text-sm text-gray-600 space-y-2">
            <li>• The bot joins with the display name you configure, clearly indicating it records.</li>
            <li>• The pre-join notice is posted to chat before transcription begins.</li>
            <li>• Any participant can type a stop keyword to make the bot leave immediately.</li>
            <li>• When consent is denied, all data is deleted and nothing is stored.</li>
          </ul>
        </div>
      </div>
  );
}

export default ConsentSettings;
