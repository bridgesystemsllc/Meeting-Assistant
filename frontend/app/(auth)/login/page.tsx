"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold text-center mb-2">Welcome back</h1>
      <p className="text-text-secondary text-sm text-center mb-8">Sign in to your account</p>
      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet" />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary">Password</label>
            <Link href="/forgot-password" className="text-xs text-violet hover:text-violet-hover">Forgot password?</Link>
          </div>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet" />
        </div>
        <button type="submit" className="btn-violet w-full">Sign In</button>
      </form>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-subtle" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-surface px-3 text-text-muted">or continue with</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button className="btn-outline text-sm py-2.5">Google</button>
        <button className="btn-outline text-sm py-2.5">Microsoft</button>
      </div>
      <p className="text-center text-sm text-text-muted mt-6">Don&apos;t have an account?{" "}<Link href="/signup" className="text-violet hover:text-violet-hover font-medium">Start free trial</Link></p>
    </div>
  );
}
