"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { ActionItem } from "@/lib/mock-data";

const priorityVariant = {
  high: "negative" as const,
  medium: "warning" as const,
  low: "positive" as const,
};

export function ActionItemRow({ item }: { item: ActionItem }) {
  const [completed, setCompleted] = useState(item.completed);
  const isOverdue = item.due_date && new Date(item.due_date) < new Date() && !completed;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-md bg-surface border border-border-subtle transition-all hover:bg-elevated ${completed ? "opacity-50" : ""}`}>
      <button onClick={() => setCompleted(!completed)} className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 transition-all ${completed ? "bg-violet border-violet" : "border-text-muted hover:border-violet"}`} aria-label={completed ? "Mark incomplete" : "Mark complete"}>
        {completed && <svg viewBox="0 0 12 12" className="w-3 h-3 text-white mx-auto"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${completed ? "line-through text-text-muted" : "text-text-primary"}`}>{item.task}</p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-xs text-text-secondary">{item.owner}</span>
          <Link href={`/meetings/${item.meeting_id}`} className="text-xs text-cyan hover:underline">{item.meeting_title}</Link>
          <Badge variant={priorityVariant[item.priority]}>{item.priority}</Badge>
          {item.due_date && (
            <span className={`text-xs ${isOverdue ? "text-negative font-medium" : "text-text-muted"}`}>
              {isOverdue ? "Overdue: " : "Due: "}{new Date(item.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
