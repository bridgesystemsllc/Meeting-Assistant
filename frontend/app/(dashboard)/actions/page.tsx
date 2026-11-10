"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { ActionItemRow } from "@/components/dashboard/ActionItemRow";
import { ALL_ACTION_ITEMS } from "@/lib/mock-data";

const filters = ["All", "Mine", "High Priority", "Overdue"] as const;
type Filter = (typeof filters)[number];

function groupByDue(items: typeof ALL_ACTION_ITEMS) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
  const groups: Record<string, typeof ALL_ACTION_ITEMS> = { Overdue: [], Today: [], "This Week": [], Later: [], "No Date": [] };
  items.forEach((item) => {
    if (item.completed) return;
    if (!item.due_date) { groups["No Date"].push(item); }
    else {
      const due = new Date(item.due_date);
      if (due < today) groups["Overdue"].push(item);
      else if (due.toDateString() === today.toDateString()) groups["Today"].push(item);
      else if (due <= endOfWeek) groups["This Week"].push(item);
      else groups["Later"].push(item);
    }
  });
  return groups;
}

export default function ActionItemsPage() {
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  let filtered = ALL_ACTION_ITEMS;
  if (activeFilter === "High Priority") filtered = filtered.filter((i) => i.priority === "high");
  if (activeFilter === "Overdue") filtered = filtered.filter((i) => i.due_date && new Date(i.due_date) < new Date() && !i.completed);
  if (search) filtered = filtered.filter((i) => i.task.toLowerCase().includes(search.toLowerCase()) || i.owner.toLowerCase().includes(search.toLowerCase()));
  const groups = groupByDue(filtered);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Action Items</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actions..." className="bg-elevated border border-border-subtle rounded-md pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet w-full sm:w-64" />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {filters.map((f) => (
          <button key={f} onClick={() => setActiveFilter(f)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${activeFilter === f ? "bg-violet text-white" : "bg-elevated text-text-secondary hover:text-text-primary"}`}>{f}</button>
        ))}
      </div>
      <div className="space-y-8">
        {Object.entries(groups).map(([group, items]) => items.length > 0 && (
          <div key={group}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className={`text-sm font-semibold uppercase tracking-wide ${group === "Overdue" ? "text-negative" : "text-text-secondary"}`}>{group}</h2>
              <span className="text-xs bg-elevated text-text-muted px-2 py-0.5 rounded-full">{items.length}</span>
            </div>
            <div className="space-y-2">{items.map((item) => <ActionItemRow key={item.id} item={item} />)}</div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <div className="text-center py-20"><p className="text-text-muted text-sm">{search ? "No action items match your search." : "No action items yet. Join a meeting to get started."}</p></div>}
    </div>
  );
}
