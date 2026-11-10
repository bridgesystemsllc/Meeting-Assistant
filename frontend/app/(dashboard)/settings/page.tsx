"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [name, setName] = useState("Jane Smith");
  const [email, setEmail] = useState("jane@example.com");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [slackNotifs, setSlackNotifs] = useState(false);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">Profile</h2>
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-violet/20 flex items-center justify-center text-violet text-2xl font-bold">J</div>
            <button className="btn-outline text-sm py-2">Change avatar</button>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-violet" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-violet" />
          </div>
          <button className="btn-violet text-sm">Save Changes</button>
        </div>
      </section>
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">Notifications</h2>
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium text-text-primary">Email notifications</p><p className="text-xs text-text-muted">Receive meeting notes via email</p></div>
            <button onClick={() => setEmailNotifs(!emailNotifs)} className={`relative w-11 h-6 rounded-full transition-colors ${emailNotifs ? "bg-violet" : "bg-elevated"}`} role="switch" aria-checked={emailNotifs}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${emailNotifs ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium text-text-primary">Slack notifications</p><p className="text-xs text-text-muted">Post meeting notes to Slack</p></div>
            <button onClick={() => setSlackNotifs(!slackNotifs)} className={`relative w-11 h-6 rounded-full transition-colors ${slackNotifs ? "bg-violet" : "bg-elevated"}`} role="switch" aria-checked={slackNotifs}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${slackNotifs ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">Plan &amp; Billing</h2>
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div><p className="text-sm font-medium text-text-primary">Enterprise Plan</p><p className="text-xs text-text-muted">$600/mo &middot; Up to 20 users</p></div>
            <span className="bg-violet/15 text-violet text-xs font-semibold px-3 py-1 rounded-full">Active</span>
          </div>
          <button className="btn-outline text-sm">Manage Billing</button>
        </div>
      </section>
    </div>
  );
}
