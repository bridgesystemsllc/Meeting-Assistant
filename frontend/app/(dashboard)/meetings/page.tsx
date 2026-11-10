"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { MeetingCard } from "@/components/dashboard/MeetingCard";
import { MOCK_MEETINGS } from "@/lib/mock-data";

const statusFilters = ["All", "Completed", "In Progress", "Failed"] as const;

export default function MeetingsPage() {
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  let filtered = MOCK_MEETINGS;
  if (activeFilter === "Completed") filtered = filtered.filter((m) => m.status === "completed");
  if (activeFilter === "In Progress") filtered = filtered.filter((m) => m.status === "recording" || m.status === "processing");
  if (activeFilter === "Failed") filtered = filtered.filter((m) => m.status === "failed");
  if (search) filtered = filtered.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Meetings</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search meetings..." className="bg-elevated border border-border-subtle rounded-md pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet w-full sm:w-64" />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {statusFilters.map((f) => (
          <button key={f} onClick={() => setActiveFilter(f)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${activeFilter === f ? "bg-violet text-white" : "bg-elevated text-text-secondary hover:text-text-primary"}`}>{f}</button>
        ))}
      </div>
      <div className="space-y-3">{filtered.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} />)}</div>
      {filtered.length === 0 && <div className="text-center py-20"><p className="text-text-muted text-sm">No meetings found.</p></div>}
    </div>
  );
}
