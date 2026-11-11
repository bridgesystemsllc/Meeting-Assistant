/**
 * Consent Status Component
 * Displays consent status and events for a meeting
 */
import { useState, useEffect } from 'react';

interface ConsentEvent {
  id: string;
  eventType: string;
  eventSource: string | null;
  actorName: string | null;
  createdAt: string;
}

interface ConsentStatusData {
  status: 'pending' | 'granted' | 'denied';
  deniedAt: string | null;
  deniedReason: string | null;
  events: ConsentEvent[];
}

interface Props {
  meetingId: string;
  tenantId: string;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'granted':
      return 'bg-green-100 text-green-800';
    case 'denied':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
}

function getEventTypeLabel(eventType: string): string {
  switch (eventType) {
    case 'consent_granted':
      return 'Consent Granted';
    case 'consent_denied_by_host':
      return 'Denied by Host';
    case 'consent_denied_by_keyword':
      return 'Stop Keyword Triggered';
    case 'bot_removed_by_host':
      return 'Bot Removed by Host';
    case 'recording_permission_denied':
      return 'Recording Permission Denied';
    default:
      return eventType;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export function ConsentStatus({ meetingId, tenantId }: Props) {
  const [data, setData] = useState<ConsentStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConsentStatus() {
      try {
        const response = await fetch(`/api/consent/meeting/${meetingId}`, {
          headers: {
            'x-tenant-id': tenantId,
          },
        });
        if (!response.ok) {
          if (response.status === 404) {
            setData(null);
            return;
          }
          throw new Error('Failed to fetch consent status');
        }
        const statusData = await response.json() as ConsentStatusData;
        setData(statusData);
      } catch {
        setError('Failed to load consent status');
      } finally {
        setLoading(false);
      }
    }

    fetchConsentStatus();
  }, [meetingId, tenantId]);

  if (loading) {
    return (
      <div className="animate-pulse bg-gray-100 rounded p-4">
        Loading consent status...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 text-sm">{error}</div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b">
        <h3 className="text-sm font-medium text-gray-900">Consent Status</h3>
      </div>
      
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(data.status)}`}>
            {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
          </span>
          
          {data.status === 'denied' && data.deniedReason && (
            <span className="text-sm text-gray-600">
              — {data.deniedReason}
            </span>
          )}
        </div>

        {data.status === 'denied' && data.deniedAt && (
          <div className="text-sm text-gray-500">
            Denied at {formatDate(data.deniedAt)}
          </div>
        )}

        {data.status === 'denied' && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
            <strong>No data stored.</strong> All transcript, analysis, and email data has been deleted due to consent denial.
          </div>
        )}

        {data.events.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Consent Events
            </h4>
            <ul className="space-y-2">
              {data.events.map(event => (
                <li key={event.id} className="text-sm border-l-2 border-gray-200 pl-3 py-1">
                  <div className="font-medium text-gray-900">
                    {getEventTypeLabel(event.eventType)}
                  </div>
                  <div className="text-gray-500 text-xs">
                    {formatDate(event.createdAt)}
                    {event.actorName && ` by ${event.actorName}`}
                    {event.eventSource && ` (${event.eventSource})`}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConsentStatus;
