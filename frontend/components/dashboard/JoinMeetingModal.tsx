"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

function detectPlatform(url: string) {
  if (url.includes("zoom.us")) return "Zoom";
  if (url.includes("meet.google.com")) return "Google Meet";
  if (url.includes("teams.microsoft.com")) return "Teams";
  return null;
}

export function JoinMeetingModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const platform = detectPlatform(url);

  useEffect(() => { if (!isOpen) { setUrl(""); setTitle(""); setLoading(false); } }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative card-elevated p-8 w-full max-w-md">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-text-primary" aria-label="Close modal">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold mb-2">Join a Meeting</h2>
        <p className="text-text-secondary text-sm mb-6">Paste your meeting link and our bot will join, record, and generate AI notes.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="meeting-url" className="block text-sm font-medium text-text-secondary mb-1.5">Meeting URL</label>
            <input id="meeting-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://zoom.us/j/... or meet.google.com/..." required className="w-full bg-primary border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet" />
            {platform && <p className="text-xs text-positive mt-1.5">Detected: {platform}</p>}
          </div>
          <div>
            <label htmlFor="meeting-title" className="block text-sm font-medium text-text-secondary mb-1.5">Title <span className="text-text-muted">(optional)</span></label>
            <input id="meeting-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q2 Planning Meeting" className="w-full bg-primary border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet" />
          </div>
          <div className="bg-violet/5 border border-violet/20 rounded-md p-3 text-xs text-text-secondary">Supports Zoom, Google Meet &amp; Microsoft Teams</div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-outline flex-1 text-sm">Cancel</button>
            <button type="submit" disabled={!url || loading} className="btn-violet flex-1 text-sm disabled:opacity-50">{loading ? "Deploying Bot..." : "Send Bot"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
