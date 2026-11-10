import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { Meeting } from "@/lib/mock-data";

const platformDot: Record<string, string> = { zoom: "bg-blue-500", google_meet: "bg-positive", teams: "bg-violet" };
const platformLabel: Record<string, string> = { zoom: "Zoom", google_meet: "Google Meet", teams: "Teams" };
const statusVariant: Record<string, "positive" | "cyan" | "warning" | "negative"> = { completed: "positive", recording: "cyan", processing: "warning", failed: "negative" };

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function MeetingCard({ meeting }: { meeting: Meeting }) {
  return (
    <Link href={`/meetings/${meeting.id}`}>
      <div className="card p-5 transition-all hover:bg-elevated hover:shadow-elevated cursor-pointer">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${platformDot[meeting.platform]}`} />
            <div>
              <h3 className="font-semibold text-text-primary">{meeting.title}</h3>
              <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                <span>{platformLabel[meeting.platform]}</span>
                <span>{new Date(meeting.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                <span>{formatDuration(meeting.duration_seconds)}</span>
              </div>
            </div>
          </div>
          <Badge variant={statusVariant[meeting.status]} pulse={meeting.status === "recording"}>{meeting.status}</Badge>
        </div>
        {meeting.summary && <p className="text-sm text-text-secondary line-clamp-2 mb-3">{meeting.summary}</p>}
        {meeting.status === "completed" && (
          <div className="flex items-center gap-4 text-xs text-text-muted">
            {meeting.action_items.length > 0 && <span className="text-violet font-medium">{meeting.action_items.length} action items</span>}
            {meeting.key_decisions.length > 0 && <span>{meeting.key_decisions.length} decisions</span>}
            {meeting.engagement_score && <span>{meeting.engagement_score}% engagement</span>}
            {meeting.meeting_sentiment && <Badge variant={meeting.meeting_sentiment === "positive" ? "positive" : meeting.meeting_sentiment === "negative" ? "negative" : "neutral"}>{meeting.meeting_sentiment}</Badge>}
          </div>
        )}
      </div>
    </Link>
  );
}
