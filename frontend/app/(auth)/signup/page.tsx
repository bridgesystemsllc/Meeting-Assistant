"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");

  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const strengthColors = ["", "bg-negative", "bg-warning", "bg-positive"];
  const strengthLabels = ["", "Weak", "Good", "Strong"];

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold text-center mb-2">Start capturing every meeting</h1>
      <p className="text-text-secondary text-sm text-center mb-8">5 free meetings. No credit card required.</p>
      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-1.5">Full name</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet" />
        </div>
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-text-secondary mb-1.5">Work email</label>
          <input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet" />
        </div>
        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-text-secondary mb-1.5">Password</label>
          <input id="signup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet" />
          {password.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${strengthColors[strength]}`} style={{ width: `${(strength / 3) * 100}%` }} />
              </div>
              <span className="text-xs text-text-muted">{strengthLabels[strength]}</span>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="company" className="block text-sm font-medium text-text-secondary mb-1.5">Company name <span className="text-text-muted">(optional)</span></label>
          <input id="company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your company" className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet" />
        </div>
        <button type="submit" className="btn-violet w-full">Create Account</button>
      </form>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-subtle" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-surface px-3 text-text-muted">or continue with</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button className="btn-outline text-sm py-2.5">Google</button>
        <button className="btn-outline text-sm py-2.5">Microsoft</button>
      </div>
      <p className="text-center text-sm text-text-muted mt-6">Already have an account?{" "}<Link href="/login" className="text-violet hover:text-violet-hover font-medium">Sign in</Link></p>
    </div>
  );
}
