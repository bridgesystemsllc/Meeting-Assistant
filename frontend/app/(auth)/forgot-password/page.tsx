"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="card p-8 text-center">
        <div className="text-4xl mb-4">&#x2709;</div>
        <h1 className="text-2xl font-bold mb-2">Check your email</h1>
        <p className="text-text-secondary text-sm mb-6">We sent a password reset link to <strong className="text-text-primary">{email}</strong></p>
        <Link href="/login" className="text-violet hover:text-violet-hover text-sm font-medium">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold text-center mb-2">Reset your password</h1>
      <p className="text-text-secondary text-sm text-center mb-8">Enter your email and we&apos;ll send you a reset link.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (email) setSent(true); }} className="space-y-4">
        <div>
          <label htmlFor="reset-email" className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
          <input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet" />
        </div>
        <button type="submit" className="btn-violet w-full">Send Reset Link</button>
      </form>
      <p className="text-center text-sm text-text-muted mt-6"><Link href="/login" className="text-violet hover:text-violet-hover font-medium">Back to sign in</Link></p>
    </div>
  );
}
