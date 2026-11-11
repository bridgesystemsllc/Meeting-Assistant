# Meeting Assistant Frontend — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a premium, dark-themed SaaS frontend for Meeting Assistant with marketing, auth, pricing, and dashboard pages.

**Architecture:** Next.js App Router with route groups for marketing, auth, and dashboard. Tailwind CSS for styling with custom design tokens. Framer Motion for scroll animations and micro-interactions. Mock data initially, API integration later.

**Tech Stack:** Next.js 14+, Tailwind CSS 3.4+, Framer Motion, Recharts, Lucide React, TypeScript

---

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `frontend/` (via create-next-app)

**Step 1: Create the Next.js project**

```bash
cd "/Volumes/Extreme SSD/Code_Projects_Bridge LLC/Read AI "
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```

**Step 2: Install dependencies**

```bash
cd "/Volumes/Extreme SSD/Code_Projects_Bridge LLC/Read AI /frontend"
npm install framer-motion recharts lucide-react react-hot-toast
npm install -D @tailwindcss/typography
```

**Step 3: Verify it runs**

```bash
npm run dev
```
Expected: App running on localhost:3000

**Step 4: Commit**

```bash
git add .
git commit -m "feat: scaffold Next.js frontend with dependencies"
```

---

### Task 2: Design System — Tailwind Config + Global CSS

**Files:**
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/app/globals.css`

**Step 1: Update tailwind.config.ts with design tokens**

Replace the entire file with:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0A0A0F",
        surface: "#12121A",
        elevated: "#1A1A28",
        "border-subtle": "#2A2A3D",
        "text-primary": "#F0F0F5",
        "text-secondary": "#8888A0",
        "text-muted": "#555570",
        violet: {
          DEFAULT: "#7C5CFC",
          hover: "#6B4AEB",
        },
        cyan: {
          DEFAULT: "#00D4FF",
        },
        positive: "#34D399",
        negative: "#F87171",
        warning: "#FBBF24",
        neutral: "#94A3B8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
        elevated: "0 8px 32px rgba(0,0,0,0.4)",
        "glow-violet": "0 0 24px rgba(124,92,252,0.3)",
        "glow-cyan": "0 0 24px rgba(0,212,255,0.2)",
      },
      borderRadius: {
        sm: "6px",
        md: "12px",
        lg: "16px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
```

**Step 2: Update globals.css**

Replace with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap");

@layer base {
  body {
    @apply bg-primary text-text-primary antialiased;
  }

  * {
    @apply border-border-subtle;
  }
}

@layer components {
  .btn-violet {
    @apply bg-violet hover:bg-violet-hover text-white font-semibold px-6 py-3 rounded-md transition-all duration-200 hover:shadow-glow-violet;
  }

  .btn-outline {
    @apply border border-border-subtle text-text-primary font-semibold px-6 py-3 rounded-md transition-all duration-200 hover:bg-elevated;
  }

  .btn-cyan-outline {
    @apply border border-cyan text-cyan font-semibold px-6 py-3 rounded-md transition-all duration-200 hover:bg-cyan/10;
  }

  .card {
    @apply bg-surface border border-border-subtle rounded-md shadow-card;
  }

  .card-elevated {
    @apply bg-elevated border border-border-subtle rounded-lg shadow-elevated;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

:focus-visible {
  @apply outline-2 outline-offset-2 outline-violet;
}
```

**Step 3: Verify styles load**

```bash
npm run dev
```
Expected: Dark background, fonts loading

**Step 4: Commit**

```bash
git add frontend/tailwind.config.ts frontend/app/globals.css
git commit -m "feat: add design system tokens and global styles"
```

---

### Task 3: Root Layout + Shared Components

**Files:**
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/components/ui/Logo.tsx`
- Create: `frontend/components/ui/Badge.tsx`
- Create: `frontend/components/ui/ScrollReveal.tsx`
- Create: `frontend/lib/mock-data.ts`

**Step 1: Update root layout**

```tsx
// frontend/app/layout.tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Meeting Assistant — AI-Powered Meeting Notes",
  description: "AI joins your meetings, records every word, and delivers structured notes with action items, decisions, and risks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

**Step 2: Create Logo component**

```tsx
// frontend/components/ui/Logo.tsx
export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-8 h-8 rounded-md bg-violet flex items-center justify-center">
        <span className="text-white font-bold text-sm">M</span>
      </div>
      <span className="text-text-primary font-bold text-lg tracking-tight">
        Meeting Assistant
      </span>
    </div>
  );
}
```

**Step 3: Create Badge component**

```tsx
// frontend/components/ui/Badge.tsx
const variants = {
  positive: "bg-positive/15 text-positive",
  negative: "bg-negative/15 text-negative",
  warning: "bg-warning/15 text-warning",
  neutral: "bg-neutral/15 text-neutral",
  violet: "bg-violet/15 text-violet",
  cyan: "bg-cyan/15 text-cyan",
  recording: "bg-cyan/15 text-cyan",
} as const;

type BadgeVariant = keyof typeof variants;

export function Badge({
  children,
  variant = "neutral",
  pulse = false,
  className = "",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${variants[variant]} ${className}`}
    >
      {pulse && (
        <span className={`w-1.5 h-1.5 rounded-full bg-current animate-pulse-slow`} />
      )}
      {children}
    </span>
  );
}
```

**Step 4: Create ScrollReveal component**

```tsx
// frontend/components/ui/ScrollReveal.tsx
"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

export function ScrollReveal({
  children,
  delay = 0,
  direction = "up",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  className?: string;
}) {
  const offsets = {
    up: { y: 40 },
    down: { y: -40 },
    left: { x: 40 },
    right: { x: -40 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...offsets[direction] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

**Step 5: Create mock data file**

```ts
// frontend/lib/mock-data.ts
export type ActionItem = {
  id: string;
  task: string;
  owner: string;
  priority: "high" | "medium" | "low";
  due_date: string | null;
  completed: boolean;
  meeting_id: string;
  meeting_title: string;
};

export type Speaker = {
  id: string;
  name: string;
  talk_time_pct: number;
};

export type Meeting = {
  id: string;
  title: string;
  platform: "zoom" | "google_meet" | "teams";
  started_at: string;
  duration_seconds: number;
  status: "completed" | "recording" | "processing" | "failed";
  summary: string | null;
  meeting_sentiment: "positive" | "negative" | "neutral" | "mixed" | null;
  engagement_score: number | null;
  action_items: ActionItem[];
  key_decisions: { decision: string; owner: string }[];
  speakers: Speaker[];
  risks: { risk: string; severity: "high" | "medium" | "low" }[];
  topics: { topic: string; time_spent_pct: number; sentiment: string }[];
  questions_unresolved: { question: string; raised_by: string }[];
};

export const MOCK_MEETINGS: Meeting[] = [
  {
    id: "1",
    title: "Q2 Revenue Planning",
    platform: "google_meet",
    started_at: "2026-02-28T14:00:00Z",
    duration_seconds: 3600,
    status: "completed",
    summary:
      "Discussed Q2 revenue targets and identified three key growth levers: enterprise upsell, new market expansion into LATAM, and product-led growth initiatives. Team aligned on 25% QoQ target.",
    meeting_sentiment: "positive",
    engagement_score: 82,
    action_items: [
      { id: "a1", task: "Create LATAM market entry deck", owner: "Sarah", priority: "high", due_date: "2026-03-07", completed: false, meeting_id: "1", meeting_title: "Q2 Revenue Planning" },
      { id: "a2", task: "Define enterprise upsell criteria", owner: "Marcus", priority: "high", due_date: "2026-03-05", completed: false, meeting_id: "1", meeting_title: "Q2 Revenue Planning" },
      { id: "a3", task: "Pull PLG conversion metrics", owner: "Dev", priority: "medium", due_date: "2026-03-10", completed: false, meeting_id: "1", meeting_title: "Q2 Revenue Planning" },
    ],
    key_decisions: [
      { decision: "Prioritize enterprise tier over SMB for Q2", owner: "Leadership" },
      { decision: "Allocate $50K for LATAM pilot campaign", owner: "Finance" },
    ],
    speakers: [
      { id: "A", name: "Alex", talk_time_pct: 38 },
      { id: "B", name: "Sarah", talk_time_pct: 29 },
      { id: "C", name: "Marcus", talk_time_pct: 22 },
      { id: "D", name: "Dev", talk_time_pct: 11 },
    ],
    risks: [{ risk: "LATAM compliance requirements unclear", severity: "medium" }],
    topics: [
      { topic: "Revenue Targets", time_spent_pct: 35, sentiment: "positive" },
      { topic: "LATAM Expansion", time_spent_pct: 30, sentiment: "positive" },
      { topic: "PLG Strategy", time_spent_pct: 20, sentiment: "neutral" },
      { topic: "Team Capacity", time_spent_pct: 15, sentiment: "negative" },
    ],
    questions_unresolved: [
      { question: "What are the specific LATAM compliance requirements?", raised_by: "Marcus" },
    ],
  },
  {
    id: "2",
    title: "Engineering Sprint Review",
    platform: "zoom",
    started_at: "2026-03-01T10:00:00Z",
    duration_seconds: 2700,
    status: "completed",
    summary:
      "Sprint 24 review covered 8 of 10 planned tickets. Two tickets slipped due to API integration complexity. Team velocity is 34 story points, down from 40 last sprint.",
    meeting_sentiment: "neutral",
    engagement_score: 71,
    action_items: [
      { id: "a4", task: "Resolve Stripe API breaking change", owner: "Jared", priority: "high", due_date: "2026-03-03", completed: false, meeting_id: "2", meeting_title: "Engineering Sprint Review" },
      { id: "a5", task: "Document new auth flow", owner: "Chase", priority: "medium", due_date: "2026-03-06", completed: true, meeting_id: "2", meeting_title: "Engineering Sprint Review" },
    ],
    key_decisions: [{ decision: "Dedicate 20% of next sprint to tech debt", owner: "Jared" }],
    speakers: [
      { id: "A", name: "Jared", talk_time_pct: 45 },
      { id: "B", name: "Chase", talk_time_pct: 35 },
      { id: "C", name: "Alex", talk_time_pct: 20 },
    ],
    risks: [{ risk: "Sprint velocity declining for 3rd consecutive sprint", severity: "high" }],
    topics: [
      { topic: "Sprint Velocity", time_spent_pct: 40, sentiment: "negative" },
      { topic: "Completed Tickets", time_spent_pct: 35, sentiment: "positive" },
      { topic: "Next Sprint Planning", time_spent_pct: 25, sentiment: "neutral" },
    ],
    questions_unresolved: [],
  },
  {
    id: "3",
    title: "Lumen & Vale Onboarding Call",
    platform: "zoom",
    started_at: "2026-03-02T09:00:00Z",
    duration_seconds: 5400,
    status: "recording",
    summary: null,
    meeting_sentiment: null,
    engagement_score: null,
    action_items: [],
    key_decisions: [],
    speakers: [],
    risks: [],
    topics: [],
    questions_unresolved: [],
  },
];

export const ALL_ACTION_ITEMS: ActionItem[] = MOCK_MEETINGS.flatMap(
  (m) => m.action_items
);
```

**Step 6: Commit**

```bash
git add frontend/app/layout.tsx frontend/components/ frontend/lib/
git commit -m "feat: add root layout, shared UI components, and mock data"
```

---

### Task 4: Marketing Layout + Landing Page — Hero + Social Proof

**Files:**
- Create: `frontend/app/(marketing)/layout.tsx`
- Create: `frontend/app/(marketing)/page.tsx`
- Create: `frontend/components/marketing/Navbar.tsx`
- Create: `frontend/components/marketing/Hero.tsx`
- Create: `frontend/components/marketing/SocialProof.tsx`
- Create: `frontend/components/marketing/Footer.tsx`

**Step 1: Create marketing layout with Navbar**

```tsx
// frontend/app/(marketing)/layout.tsx
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  );
}
```

```tsx
// frontend/components/marketing/Navbar.tsx
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function Navbar() {
  return (
    <header className="fixed top-0 w-full z-50 bg-primary/80 backdrop-blur-xl border-b border-border-subtle">
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <Link href="#features" className="text-text-secondary hover:text-text-primary text-sm transition-colors">
            Features
          </Link>
          <Link href="#how-it-works" className="text-text-secondary hover:text-text-primary text-sm transition-colors">
            How It Works
          </Link>
          <Link href="/pricing" className="text-text-secondary hover:text-text-primary text-sm transition-colors">
            Pricing
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors">
            Sign In
          </Link>
          <Link href="/signup" className="btn-violet text-sm px-4 py-2">
            Start Free Trial
          </Link>
        </div>
      </nav>
    </header>
  );
}
```

**Step 2: Create Hero section**

```tsx
// frontend/components/marketing/Hero.tsx
"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-violet/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <p className="text-violet font-semibold text-sm uppercase tracking-widest mb-6">
            AI-Powered Meeting Intelligence
          </p>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.9] mb-8">
            Every meeting.
            <br />
            <span className="text-violet">Every action item.</span>
            <br />
            Handled.
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="text-text-secondary text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          AI joins your meetings, records every word, and delivers structured
          notes with action items, decisions, and risks — before you finish
          your coffee.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
        >
          <Link href="/signup" className="btn-violet text-base px-8 py-4">
            Start Free Trial
          </Link>
          <button className="btn-cyan-outline text-base px-8 py-4">
            Watch Demo
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex items-center justify-center gap-6 text-text-muted text-sm"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Zoom
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-positive" /> Google Meet
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet" /> Microsoft Teams
          </span>
        </motion.div>

        {/* Product mockup */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
          className="mt-20 relative"
        >
          <div className="absolute inset-0 bg-violet/5 rounded-2xl blur-3xl" />
          <div className="relative bg-surface border border-border-subtle rounded-2xl p-2 shadow-elevated">
            <div className="bg-elevated rounded-xl h-[300px] md:h-[500px] flex items-center justify-center text-text-muted">
              <p className="text-sm">Product Screenshot Placeholder</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
```

**Step 3: Create SocialProof section**

```tsx
// frontend/components/marketing/SocialProof.tsx
"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { useEffect, useRef, useState } from "react";

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 2000;
          const start = performance.now();
          const animate = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="text-3xl md:text-4xl font-black text-text-primary">
      {count.toLocaleString()}{suffix}
    </span>
  );
}

export function SocialProof() {
  return (
    <section className="py-24 border-y border-border-subtle">
      <div className="max-w-7xl mx-auto px-6">
        {/* Company logos placeholder */}
        <ScrollReveal>
          <p className="text-center text-text-muted text-sm uppercase tracking-widest mb-12">
            Trusted by teams at
          </p>
          <div className="flex items-center justify-center gap-12 mb-20 flex-wrap">
            {["Acme Corp", "TechFlow", "Nexus AI", "Quantum", "Velocity"].map((name) => (
              <span key={name} className="text-text-muted/40 font-bold text-xl tracking-tight">
                {name}
              </span>
            ))}
          </div>
        </ScrollReveal>

        {/* Stat counters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          {[
            { target: 10000, suffix: "+", label: "Meetings Processed" },
            { target: 50000, suffix: "+", label: "Action Items Captured" },
            { target: 98, suffix: "%", label: "Transcription Accuracy" },
          ].map((stat, i) => (
            <ScrollReveal key={stat.label} delay={i * 0.1}>
              <div>
                <AnimatedCounter target={stat.target} suffix={stat.suffix} />
                <p className="text-text-secondary text-sm mt-2">{stat.label}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 4: Create Footer**

```tsx
// frontend/components/marketing/Footer.tsx
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const links = {
  Product: ["Features", "Pricing", "Integrations", "Changelog"],
  Company: ["About", "Blog", "Careers", "Contact"],
  Resources: ["Documentation", "API Reference", "Status", "Support"],
  Legal: ["Privacy Policy", "Terms of Service", "Security"],
};

export function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-surface">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="text-text-muted text-sm mt-4 leading-relaxed">
              AI-powered meeting notes for teams that move fast.
            </p>
          </div>
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-text-primary font-semibold text-sm mb-4">{category}</h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item}>
                    <Link href="#" className="text-text-muted text-sm hover:text-text-primary transition-colors">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border-subtle mt-12 pt-8 text-center text-text-muted text-sm">
          &copy; {new Date().getFullYear()} Meeting Assistant. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
```

**Step 5: Assemble landing page**

```tsx
// frontend/app/(marketing)/page.tsx
import { Hero } from "@/components/marketing/Hero";
import { SocialProof } from "@/components/marketing/SocialProof";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <SocialProof />
    </>
  );
}
```

**Step 6: Verify and commit**

```bash
npm run dev
# Check localhost:3000 — hero, social proof, navbar, footer visible
git add .
git commit -m "feat: add marketing layout, hero, social proof, navbar, footer"
```

---

### Task 5: Landing Page — Features + How It Works + Final CTA

**Files:**
- Create: `frontend/components/marketing/Features.tsx`
- Create: `frontend/components/marketing/HowItWorks.tsx`
- Create: `frontend/components/marketing/FinalCTA.tsx`
- Modify: `frontend/app/(marketing)/page.tsx`

**Step 1: Create Features section**

```tsx
// frontend/components/marketing/Features.tsx
"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Bot, FileText, BarChart3 } from "lucide-react";

const features = [
  {
    tagline: "Your AI meeting teammate",
    title: "Never miss a word",
    description: "Paste your meeting link. Our bot joins, records, transcribes, and identifies every speaker — silently in the background.",
    bullets: [
      "Bot joins in one click — paste your meeting link",
      "Records, transcribes, identifies every speaker",
      "Works silently in the background",
    ],
    icon: Bot,
    direction: "left" as const,
  },
  {
    tagline: "From chaos to clarity in minutes",
    title: "Structured intelligence, not raw transcripts",
    description: "Every meeting produces an executive summary, action items with owners and deadlines, key decisions, risks, and unresolved questions.",
    bullets: [
      "Executive summary in 3 sentences",
      "Action items with owners and deadlines",
      "Key decisions, risks, and unresolved questions",
    ],
    icon: FileText,
    direction: "right" as const,
  },
  {
    tagline: "Built for teams that move fast",
    title: "Track meeting effectiveness across your organization",
    description: "Engagement scores, talk-time breakdowns, sentiment trends, and meeting analytics give you visibility into how your team communicates.",
    bullets: [
      "Engagement and sentiment scoring",
      "Speaker talk-time distribution",
      "Meeting effectiveness trends over time",
    ],
    icon: BarChart3,
    direction: "left" as const,
  },
];

export function Features() {
  return (
    <section id="features" className="py-32">
      <div className="max-w-7xl mx-auto px-6 space-y-32">
        {features.map((feature, i) => (
          <div
            key={feature.tagline}
            className={`flex flex-col lg:flex-row items-center gap-16 ${
              i % 2 === 1 ? "lg:flex-row-reverse" : ""
            }`}
          >
            {/* Visual */}
            <ScrollReveal direction={feature.direction} className="flex-1 w-full">
              <div className="bg-surface border border-border-subtle rounded-2xl p-2 shadow-elevated">
                <div className="bg-elevated rounded-xl h-[280px] md:h-[380px] flex items-center justify-center">
                  <feature.icon className="w-16 h-16 text-violet/30" />
                </div>
              </div>
            </ScrollReveal>

            {/* Text */}
            <ScrollReveal
              direction={feature.direction === "left" ? "right" : "left"}
              delay={0.15}
              className="flex-1"
            >
              <p className="text-violet font-semibold text-sm uppercase tracking-widest mb-3">
                {feature.tagline}
              </p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                {feature.title}
              </h2>
              <p className="text-text-secondary text-lg leading-relaxed mb-6">
                {feature.description}
              </p>
              <ul className="space-y-3">
                {feature.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3 text-text-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet mt-2 shrink-0" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </ScrollReveal>
          </div>
        ))}
      </div>
    </section>
  );
}
```

**Step 2: Create HowItWorks section**

```tsx
// frontend/components/marketing/HowItWorks.tsx
"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Link2, Headphones, Mail } from "lucide-react";

const steps = [
  {
    icon: Link2,
    title: "Paste your meeting link",
    description: "Drop your Zoom, Google Meet, or Teams link. That's it.",
  },
  {
    icon: Headphones,
    title: "Our AI joins and listens",
    description: "A bot joins your meeting, records audio, and transcribes with speaker labels.",
  },
  {
    icon: Mail,
    title: "Get notes in your inbox",
    description: "Structured notes with action items, decisions, and risks — delivered in minutes.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-32 bg-surface">
      <div className="max-w-7xl mx-auto px-6">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-violet font-semibold text-sm uppercase tracking-widest mb-3">
              How It Works
            </p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
              Three steps. Zero effort.
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <ScrollReveal key={step.title} delay={i * 0.15}>
              <div className="group relative bg-elevated border border-border-subtle rounded-2xl p-8 transition-all duration-300 hover:shadow-glow-violet hover:border-violet/30">
                <span className="absolute top-6 right-6 text-text-muted/20 text-6xl font-black">
                  {i + 1}
                </span>
                <div className="w-12 h-12 rounded-xl bg-violet/10 flex items-center justify-center mb-6">
                  <step.icon className="w-6 h-6 text-violet" />
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-text-secondary leading-relaxed">{step.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 3: Create FinalCTA section**

```tsx
// frontend/components/marketing/FinalCTA.tsx
"use client";

import Link from "next/link";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

export function FinalCTA() {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary via-violet/5 to-primary pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-violet/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-6 text-center">
        <ScrollReveal>
          <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">
            Stop losing track of
            <br />
            <span className="text-violet">what matters.</span>
          </h2>
          <p className="text-text-secondary text-lg mb-10">
            No credit card required. 5 free meetings included.
          </p>
          <Link href="/signup" className="btn-violet text-lg px-10 py-5 inline-block">
            Start Your Free Trial
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}
```

**Step 4: Update landing page to include all sections**

```tsx
// frontend/app/(marketing)/page.tsx
import { Hero } from "@/components/marketing/Hero";
import { SocialProof } from "@/components/marketing/SocialProof";
import { Features } from "@/components/marketing/Features";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { FinalCTA } from "@/components/marketing/FinalCTA";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <FinalCTA />
    </>
  );
}
```

**Step 5: Verify and commit**

```bash
npm run dev
git add .
git commit -m "feat: add features, how-it-works, and final CTA sections"
```

---

### Task 6: Pricing Page

**Files:**
- Create: `frontend/app/(marketing)/pricing/page.tsx`

**Step 1: Create pricing page**

```tsx
// frontend/app/(marketing)/pricing/page.tsx
"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Check, Shield, Users, Headphones, Zap, Lock, BarChart3 } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Starter",
    subtitle: "Free Trial",
    monthlyPrice: 0,
    annualPrice: 0,
    priceLabel: "Free for 14 days",
    meetings: "5 meetings total",
    features: ["AI meeting notes", "Action items & decisions", "Full transcripts", "Email delivery", "1 user"],
    cta: "Start Free Trial",
    ctaStyle: "btn-outline",
    badge: null,
    note: "No credit card required",
  },
  {
    name: "Pro",
    subtitle: "For growing teams",
    monthlyPrice: 29,
    annualPrice: 23,
    priceLabel: "/user/mo",
    meetings: "Unlimited meetings",
    features: [
      "Everything in Starter",
      "Team sharing & collaboration",
      "Analytics dashboard",
      "Slack & email integrations",
      "Priority transcription",
      "Up to 10 users",
    ],
    cta: "Get Started",
    ctaStyle: "btn-violet",
    badge: "Most Popular",
    note: null,
  },
  {
    name: "Enterprise",
    subtitle: "For organizations",
    monthlyPrice: 600,
    annualPrice: 480,
    priceLabel: "/mo (up to 20 users)",
    meetings: "Unlimited meetings",
    features: [
      "Everything in Pro",
      "Dedicated setup & onboarding",
      "Priority support",
      "Custom integrations",
      "SSO / SAML",
      "Admin dashboard",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
    ctaStyle: "btn-cyan-outline",
    badge: null,
    note: "Setup fee applies",
  },
];

const faqs = [
  { q: "What happens after my free trial?", a: "After 14 days or 5 meetings (whichever comes first), you can upgrade to Pro or Enterprise. Your data is preserved." },
  { q: "Can I change plans later?", a: "Yes. Upgrade or downgrade anytime. Changes take effect on your next billing cycle." },
  { q: "How does the bot appear in meetings?", a: "The bot joins as a named participant ('Meeting Recorder'). All attendees can see it. No hidden recording." },
  { q: "What platforms are supported?", a: "Zoom, Google Meet, and Microsoft Teams. Webex support is coming soon." },
  { q: "Is my data secure?", a: "Yes. All recordings and transcripts are encrypted at rest and in transit. We are SOC 2 compliant. Enterprise plans include custom data retention policies." },
  { q: "Can I add more than 20 users on Enterprise?", a: "Yes. Contact sales for volume pricing for teams larger than 20." },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <ScrollReveal>
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4">
              Simple pricing for every team
            </h1>
            <p className="text-text-secondary text-lg">
              Start free. Scale when you&apos;re ready.
            </p>

            {/* Toggle */}
            <div className="flex items-center justify-center gap-3 mt-8">
              <span className={`text-sm font-medium ${!annual ? "text-text-primary" : "text-text-muted"}`}>
                Monthly
              </span>
              <button
                onClick={() => setAnnual(!annual)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  annual ? "bg-violet" : "bg-elevated"
                }`}
                aria-label="Toggle annual pricing"
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    annual ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
              <span className={`text-sm font-medium ${annual ? "text-text-primary" : "text-text-muted"}`}>
                Annual
              </span>
              {annual && (
                <span className="bg-positive/15 text-positive text-xs font-semibold px-2 py-0.5 rounded-full">
                  Save 20%
                </span>
              )}
            </div>
          </div>
        </ScrollReveal>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          {plans.map((plan, i) => (
            <ScrollReveal key={plan.name} delay={i * 0.1}>
              <div
                className={`relative card p-8 flex flex-col h-full ${
                  plan.badge ? "border-violet shadow-glow-violet" : ""
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                )}

                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-text-muted text-sm mb-4">{plan.subtitle}</p>

                <div className="mb-6">
                  {plan.monthlyPrice === 0 ? (
                    <p className="text-3xl font-black">{plan.priceLabel}</p>
                  ) : (
                    <p className="text-3xl font-black">
                      ${annual ? plan.annualPrice : plan.monthlyPrice}
                      <span className="text-base font-normal text-text-secondary">
                        {plan.priceLabel}
                      </span>
                    </p>
                  )}
                  <p className="text-text-secondary text-sm mt-1">{plan.meetings}</p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-text-secondary">
                      <Check className="w-4 h-4 text-positive shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link href={plan.name === "Enterprise" ? "#contact" : "/signup"} className={`${plan.ctaStyle} text-center w-full`}>
                  {plan.cta}
                </Link>
                {plan.note && (
                  <p className="text-text-muted text-xs text-center mt-3">{plan.note}</p>
                )}
              </div>
            </ScrollReveal>
          ))}
        </div>

        {/* Enterprise Section */}
        <ScrollReveal>
          <div className="card-elevated p-12 mb-24">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold mb-3">
                Built for organizations that run on meetings
              </h2>
              <p className="text-text-secondary max-w-xl mx-auto">
                Enterprise-grade features for teams that need security, control, and scale.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-10">
              {[
                { icon: Lock, label: "SSO / SAML" },
                { icon: Users, label: "Dedicated onboarding" },
                { icon: Zap, label: "Custom integrations" },
                { icon: Shield, label: "SLA guarantee" },
                { icon: BarChart3, label: "Admin dashboard" },
                { icon: Headphones, label: "Priority support" },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-3 text-text-secondary">
                  <f.icon className="w-5 h-5 text-violet shrink-0" />
                  <span className="text-sm">{f.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-4">
              <Link href="#contact" className="btn-violet">Talk to Sales</Link>
              <Link href="#contact" className="btn-outline">Book a Demo</Link>
            </div>
          </div>
        </ScrollReveal>

        {/* FAQ */}
        <ScrollReveal>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-10">
              Frequently asked questions
            </h2>
            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <div key={i} className="border border-border-subtle rounded-md overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-elevated transition-colors"
                    aria-expanded={openFaq === i}
                  >
                    <span className="font-medium">{faq.q}</span>
                    <span className="text-text-muted text-xl">{openFaq === i ? "−" : "+"}</span>
                  </button>
                  {openFaq === i && (
                    <div className="px-5 pb-5 text-text-secondary text-sm leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}
```

**Step 2: Verify and commit**

```bash
npm run dev
# Check localhost:3000/pricing
git add .
git commit -m "feat: add pricing page with plans, enterprise section, FAQ"
```

---

### Task 7: Auth Pages (Login, Signup, Forgot Password)

**Files:**
- Create: `frontend/app/(auth)/layout.tsx`
- Create: `frontend/app/(auth)/login/page.tsx`
- Create: `frontend/app/(auth)/signup/page.tsx`
- Create: `frontend/app/(auth)/forgot-password/page.tsx`

**Step 1: Create auth layout**

```tsx
// frontend/app/(auth)/layout.tsx
import { Logo } from "@/components/ui/Logo";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center relative px-4">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] bg-violet/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="relative w-full max-w-md">
        <Link href="/" className="flex justify-center mb-8">
          <Logo />
        </Link>
        {children}
      </div>
    </div>
  );
}
```

**Step 2: Create login page**

```tsx
// frontend/app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold text-center mb-2">Welcome back</h1>
      <p className="text-text-secondary text-sm text-center mb-8">
        Sign in to your account
      </p>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet"
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-violet hover:text-violet-hover">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet"
          />
        </div>
        <button type="submit" className="btn-violet w-full">
          Sign In
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface px-3 text-text-muted">or continue with</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="btn-outline text-sm py-2.5">Google</button>
        <button className="btn-outline text-sm py-2.5">Microsoft</button>
      </div>

      <p className="text-center text-sm text-text-muted mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-violet hover:text-violet-hover font-medium">
          Start free trial
        </Link>
      </p>
    </div>
  );
}
```

**Step 3: Create signup page**

```tsx
// frontend/app/(auth)/signup/page.tsx
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
      <p className="text-text-secondary text-sm text-center mb-8">
        5 free meetings. No credit card required.
      </p>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-1.5">
            Full name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet"
          />
        </div>
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-text-secondary mb-1.5">
            Work email
          </label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet"
          />
        </div>
        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-text-secondary mb-1.5">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
            className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet"
          />
          {password.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${strengthColors[strength]}`}
                  style={{ width: `${(strength / 3) * 100}%` }}
                />
              </div>
              <span className="text-xs text-text-muted">{strengthLabels[strength]}</span>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="company" className="block text-sm font-medium text-text-secondary mb-1.5">
            Company name <span className="text-text-muted">(optional)</span>
          </label>
          <input
            id="company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Corp"
            className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet"
          />
        </div>
        <button type="submit" className="btn-violet w-full">
          Create Account
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface px-3 text-text-muted">or continue with</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="btn-outline text-sm py-2.5">Google</button>
        <button className="btn-outline text-sm py-2.5">Microsoft</button>
      </div>

      <p className="text-center text-sm text-text-muted mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-violet hover:text-violet-hover font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
```

**Step 4: Create forgot-password page**

```tsx
// frontend/app/(auth)/forgot-password/page.tsx
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
        <p className="text-text-secondary text-sm mb-6">
          We sent a password reset link to <strong className="text-text-primary">{email}</strong>
        </p>
        <Link href="/login" className="text-violet hover:text-violet-hover text-sm font-medium">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold text-center mb-2">Reset your password</h1>
      <p className="text-text-secondary text-sm text-center mb-8">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email) setSent(true);
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="reset-email" className="block text-sm font-medium text-text-secondary mb-1.5">
            Email
          </label>
          <input
            id="reset-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet"
          />
        </div>
        <button type="submit" className="btn-violet w-full">
          Send Reset Link
        </button>
      </form>

      <p className="text-center text-sm text-text-muted mt-6">
        <Link href="/login" className="text-violet hover:text-violet-hover font-medium">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
```

**Step 5: Verify and commit**

```bash
npm run dev
# Check /login, /signup, /forgot-password
git add .
git commit -m "feat: add auth pages (login, signup, forgot-password)"
```

---

### Task 8: Dashboard Layout + Sidebar

**Files:**
- Create: `frontend/app/(dashboard)/layout.tsx`
- Create: `frontend/components/dashboard/Sidebar.tsx`
- Create: `frontend/components/dashboard/JoinMeetingModal.tsx`

**Step 1: Create Sidebar**

```tsx
// frontend/components/dashboard/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Calendar, BarChart3, Settings, Plus, LogOut } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const navItems = [
  { href: "/", label: "Action Items", icon: CheckSquare },
  { href: "/meetings", label: "Meetings", icon: Calendar },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ onJoinMeeting }: { onJoinMeeting: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 h-screen fixed left-0 top-0 flex-col bg-surface border-r border-border-subtle z-40">
        <div className="p-6">
          <Logo />
        </div>

        <div className="px-4 mb-4">
          <button
            onClick={onJoinMeeting}
            className="btn-violet w-full flex items-center justify-center gap-2 text-sm py-2.5"
          >
            <Plus className="w-4 h-4" />
            Join Meeting
          </button>
        </div>

        <nav className="flex-1 px-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors mb-1 ${
                isActive(item.href)
                  ? "bg-elevated text-text-primary border-l-2 border-violet"
                  : "text-text-secondary hover:text-text-primary hover:bg-elevated/50"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border-subtle">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-violet/20 flex items-center justify-center text-violet text-sm font-bold">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">Ahmad</p>
              <p className="text-xs text-text-muted truncate">Enterprise</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-2 text-text-muted hover:text-text-primary text-sm transition-colors">
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border-subtle z-40 flex">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs ${
              isActive(item.href) ? "text-violet" : "text-text-muted"
            }`}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
```

**Step 2: Create JoinMeetingModal**

```tsx
// frontend/components/dashboard/JoinMeetingModal.tsx
"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

function detectPlatform(url: string) {
  if (url.includes("zoom.us")) return "Zoom";
  if (url.includes("meet.google.com")) return "Google Meet";
  if (url.includes("teams.microsoft.com")) return "Teams";
  return null;
}

export function JoinMeetingModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const platform = detectPlatform(url);

  useEffect(() => {
    if (!isOpen) {
      setUrl("");
      setTitle("");
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    // TODO: POST /api/meetings/join
    await new Promise((r) => setTimeout(r, 1500));
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative card-elevated p-8 w-full max-w-md">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold mb-2">Join a Meeting</h2>
        <p className="text-text-secondary text-sm mb-6">
          Paste your meeting link and our bot will join, record, and generate AI notes.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="meeting-url" className="block text-sm font-medium text-text-secondary mb-1.5">
              Meeting URL
            </label>
            <input
              id="meeting-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://zoom.us/j/... or meet.google.com/..."
              required
              className="w-full bg-primary border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet"
            />
            {platform && (
              <p className="text-xs text-positive mt-1.5">Detected: {platform}</p>
            )}
          </div>
          <div>
            <label htmlFor="meeting-title" className="block text-sm font-medium text-text-secondary mb-1.5">
              Title <span className="text-text-muted">(optional)</span>
            </label>
            <input
              id="meeting-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q2 Planning Meeting"
              className="w-full bg-primary border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet"
            />
          </div>

          <div className="bg-violet/5 border border-violet/20 rounded-md p-3 text-xs text-text-secondary">
            Supports Zoom, Google Meet &amp; Microsoft Teams
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-outline flex-1 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={!url || loading} className="btn-violet flex-1 text-sm disabled:opacity-50">
              {loading ? "Deploying Bot..." : "Send Bot"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 3: Create dashboard layout**

```tsx
// frontend/app/(dashboard)/layout.tsx
"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { JoinMeetingModal } from "@/components/dashboard/JoinMeetingModal";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [showJoinModal, setShowJoinModal] = useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar onJoinMeeting={() => setShowJoinModal(true)} />
      <main className="lg:ml-60 pb-20 lg:pb-0">
        <div className="max-w-6xl mx-auto p-6">{children}</div>
      </main>
      <JoinMeetingModal isOpen={showJoinModal} onClose={() => setShowJoinModal(false)} />
    </div>
  );
}
```

**Step 4: Verify and commit**

```bash
npm run dev
# Check localhost:3000 — should show sidebar + empty main area
git add .
git commit -m "feat: add dashboard layout, sidebar, join meeting modal"
```

---

### Task 9: Action Items Page (Dashboard Home)

**Files:**
- Create: `frontend/app/(dashboard)/page.tsx`
- Create: `frontend/components/dashboard/ActionItemRow.tsx`

**Step 1: Create ActionItemRow component**

```tsx
// frontend/components/dashboard/ActionItemRow.tsx
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
    <div
      className={`flex items-start gap-3 p-4 rounded-md bg-surface border border-border-subtle transition-all hover:bg-elevated ${
        completed ? "opacity-50" : ""
      }`}
    >
      <button
        onClick={() => setCompleted(!completed)}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 transition-all ${
          completed ? "bg-violet border-violet" : "border-text-muted hover:border-violet"
        }`}
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
      >
        {completed && (
          <svg viewBox="0 0 12 12" className="w-3 h-3 text-white mx-auto">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${completed ? "line-through text-text-muted" : "text-text-primary"}`}>
          {item.task}
        </p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-xs text-text-secondary">
            {item.owner}
          </span>
          <Link
            href={`/meetings/${item.meeting_id}`}
            className="text-xs text-cyan hover:underline"
          >
            {item.meeting_title}
          </Link>
          <Badge variant={priorityVariant[item.priority]}>{item.priority}</Badge>
          {item.due_date && (
            <span className={`text-xs ${isOverdue ? "text-negative font-medium" : "text-text-muted"}`}>
              {isOverdue ? "Overdue: " : "Due: "}
              {new Date(item.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create action items page**

```tsx
// frontend/app/(dashboard)/page.tsx
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

  const groups: Record<string, typeof ALL_ACTION_ITEMS> = {
    Overdue: [],
    Today: [],
    "This Week": [],
    Later: [],
    "No Date": [],
  };

  items.forEach((item) => {
    if (item.completed) return;
    if (!item.due_date) {
      groups["No Date"].push(item);
    } else {
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
  if (activeFilter === "Overdue")
    filtered = filtered.filter(
      (i) => i.due_date && new Date(i.due_date) < new Date() && !i.completed
    );
  if (search)
    filtered = filtered.filter(
      (i) =>
        i.task.toLowerCase().includes(search.toLowerCase()) ||
        i.owner.toLowerCase().includes(search.toLowerCase())
    );

  const groups = groupByDue(filtered);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Action Items</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions..."
            className="bg-elevated border border-border-subtle rounded-md pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet w-full sm:w-64"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              activeFilter === f
                ? "bg-violet text-white"
                : "bg-elevated text-text-secondary hover:text-text-primary"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Grouped items */}
      <div className="space-y-8">
        {Object.entries(groups).map(
          ([group, items]) =>
            items.length > 0 && (
              <div key={group}>
                <div className="flex items-center gap-2 mb-3">
                  <h2
                    className={`text-sm font-semibold uppercase tracking-wide ${
                      group === "Overdue" ? "text-negative" : "text-text-secondary"
                    }`}
                  >
                    {group}
                  </h2>
                  <span className="text-xs bg-elevated text-text-muted px-2 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <ActionItemRow key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )
        )}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20">
          <p className="text-text-muted text-sm">
            {search ? "No action items match your search." : "No action items yet. Join a meeting to get started."}
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Verify and commit**

```bash
npm run dev
# Check localhost:3000 — action items grouped by due date
git add .
git commit -m "feat: add action items page with filters, search, grouping"
```

---

### Task 10: Meetings List Page

**Files:**
- Create: `frontend/app/(dashboard)/meetings/page.tsx`
- Create: `frontend/components/dashboard/MeetingCard.tsx`

**Step 1: Create MeetingCard**

```tsx
// frontend/components/dashboard/MeetingCard.tsx
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { Meeting } from "@/lib/mock-data";

const platformDot: Record<string, string> = {
  zoom: "bg-blue-500",
  google_meet: "bg-positive",
  teams: "bg-violet",
};

const platformLabel: Record<string, string> = {
  zoom: "Zoom",
  google_meet: "Google Meet",
  teams: "Teams",
};

const statusVariant: Record<string, "positive" | "cyan" | "warning" | "negative"> = {
  completed: "positive",
  recording: "cyan",
  processing: "warning",
  failed: "negative",
};

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
                <span>
                  {new Date(meeting.started_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span>{formatDuration(meeting.duration_seconds)}</span>
              </div>
            </div>
          </div>
          <Badge
            variant={statusVariant[meeting.status]}
            pulse={meeting.status === "recording"}
          >
            {meeting.status}
          </Badge>
        </div>

        {meeting.summary && (
          <p className="text-sm text-text-secondary line-clamp-2 mb-3">{meeting.summary}</p>
        )}

        {meeting.status === "completed" && (
          <div className="flex items-center gap-4 text-xs text-text-muted">
            {meeting.action_items.length > 0 && (
              <span className="text-violet font-medium">
                {meeting.action_items.length} action items
              </span>
            )}
            {meeting.key_decisions.length > 0 && (
              <span>{meeting.key_decisions.length} decisions</span>
            )}
            {meeting.engagement_score && <span>{meeting.engagement_score}% engagement</span>}
            {meeting.meeting_sentiment && (
              <Badge variant={meeting.meeting_sentiment === "positive" ? "positive" : meeting.meeting_sentiment === "negative" ? "negative" : "neutral"}>
                {meeting.meeting_sentiment}
              </Badge>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
```

**Step 2: Create meetings list page**

```tsx
// frontend/app/(dashboard)/meetings/page.tsx
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
  if (activeFilter === "In Progress")
    filtered = filtered.filter((m) => m.status === "recording" || m.status === "processing");
  if (activeFilter === "Failed") filtered = filtered.filter((m) => m.status === "failed");
  if (search)
    filtered = filtered.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Meetings</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings..."
            className="bg-elevated border border-border-subtle rounded-md pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet w-full sm:w-64"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {statusFilters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              activeFilter === f
                ? "bg-violet text-white"
                : "bg-elevated text-text-secondary hover:text-text-primary"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((meeting) => (
          <MeetingCard key={meeting.id} meeting={meeting} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20">
          <p className="text-text-muted text-sm">No meetings found.</p>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Verify and commit**

```bash
npm run dev
# Check localhost:3000/meetings
git add .
git commit -m "feat: add meetings list page with filters and search"
```

---

### Task 11: Meeting Detail Page

**Files:**
- Create: `frontend/app/(dashboard)/meetings/[id]/page.tsx`

**Step 1: Create meeting detail page**

This is a large component. Create the file with all 4 tabs (Summary, Actions, Transcript, Analytics):

```tsx
// frontend/app/(dashboard)/meetings/[id]/page.tsx
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Share2, Download, Mail } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ActionItemRow } from "@/components/dashboard/ActionItemRow";
import { MOCK_MEETINGS } from "@/lib/mock-data";

const tabs = ["Summary", "Action Items", "Transcript", "Analytics"] as const;

const MOCK_TRANSCRIPT = `[00:00] Speaker A: Good morning everyone, thanks for joining the Q2 planning session.
[00:15] Speaker B: I've prepared the revenue analysis. We're currently tracking at 18% above Q1.
[00:45] Speaker A: That's great news. Let's talk about where we want to be by end of Q2.
[01:20] Speaker C: I think LATAM is a huge opportunity we've been sleeping on.
[02:10] Speaker B: Agreed. I'd propose we allocate budget for a pilot campaign.
[03:00] Speaker A: Let's make a decision on that today. Marcus, can you define the enterprise upsell criteria by Thursday?
[03:15] Speaker C: Absolutely, I'll have that ready.
[04:30] Speaker B: Sarah, can you build the LATAM market entry deck for the board?
[05:00] Speaker A: Perfect. Let's circle back on PLG metrics next week.`;

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function MeetingDetailPage() {
  const params = useParams();
  const meeting = MOCK_MEETINGS.find((m) => m.id === params.id);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Summary");

  if (!meeting) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">Meeting not found.</p>
        <Link href="/meetings" className="text-violet text-sm mt-2 inline-block">
          Back to meetings
        </Link>
      </div>
    );
  }

  if (meeting.status === "recording") {
    return (
      <div className="text-center py-32">
        <div className="w-4 h-4 rounded-full bg-negative animate-pulse-slow mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Meeting In Progress</h2>
        <p className="text-text-secondary text-sm">
          Bot is recording. Notes will be generated when the meeting ends.
        </p>
      </div>
    );
  }

  const sentimentVariant = meeting.meeting_sentiment === "positive" ? "positive" : meeting.meeting_sentiment === "negative" ? "negative" : "neutral";
  const topicSentimentVariant = (s: string) => s === "positive" ? "positive" : s === "negative" ? "negative" : "neutral";

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/meetings" className="flex items-center gap-1 text-text-muted hover:text-text-primary text-sm mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to meetings
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-2">{meeting.title}</h1>
            <div className="flex items-center gap-3 text-sm text-text-muted flex-wrap">
              <span>
                {new Date(meeting.started_at).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <span>{formatDuration(meeting.duration_seconds)}</span>
              <Badge variant={sentimentVariant}>{meeting.meeting_sentiment}</Badge>
              {meeting.engagement_score && (
                <span className="text-violet font-medium">{meeting.engagement_score}% engagement</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-outline text-sm py-2 px-3 flex items-center gap-1.5">
              <Share2 className="w-4 h-4" /> Share
            </button>
            <button className="btn-outline text-sm py-2 px-3 flex items-center gap-1.5">
              <Download className="w-4 h-4" /> Export
            </button>
            <button className="btn-outline text-sm py-2 px-3 flex items-center gap-1.5">
              <Mail className="w-4 h-4" /> Email
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-subtle mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-violet text-violet"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Summary" && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Executive Summary
            </h3>
            <p className="text-text-primary leading-relaxed">{meeting.summary}</p>
          </div>

          {meeting.key_decisions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
                Key Decisions
              </h3>
              <div className="space-y-2">
                {meeting.key_decisions.map((d, i) => (
                  <div key={i} className="card p-4 flex items-start gap-3">
                    <span className="text-violet mt-0.5">&#x2192;</span>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{d.decision}</p>
                      <p className="text-xs text-text-muted mt-1">Owner: {d.owner}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {meeting.topics.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
                Topics Discussed
              </h3>
              <div className="flex flex-wrap gap-2">
                {meeting.topics.map((t, i) => (
                  <div key={i} className={`px-3 py-2 rounded-md border text-sm ${
                    t.sentiment === "positive" ? "bg-positive/5 border-positive/20 text-positive" :
                    t.sentiment === "negative" ? "bg-negative/5 border-negative/20 text-negative" :
                    "bg-neutral/5 border-neutral/20 text-neutral"
                  }`}>
                    <span className="font-medium">{t.topic}</span>
                    <span className="text-xs opacity-70 ml-2">{t.time_spent_pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {meeting.risks.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-negative uppercase tracking-wide mb-3">
                Risks &amp; Blockers
              </h3>
              <div className="space-y-2">
                {meeting.risks.map((r, i) => (
                  <div key={i} className="bg-negative/5 border border-negative/20 rounded-md p-4">
                    <p className="text-sm font-medium text-text-primary">{r.risk}</p>
                    <Badge variant={r.severity === "high" ? "negative" : r.severity === "medium" ? "warning" : "positive"} className="mt-2">
                      {r.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {meeting.questions_unresolved.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-warning uppercase tracking-wide mb-3">
                Unresolved Questions
              </h3>
              <div className="space-y-2">
                {meeting.questions_unresolved.map((q, i) => (
                  <div key={i} className="bg-warning/5 border border-warning/20 rounded-md p-4">
                    <p className="text-sm text-text-primary">{q.question}</p>
                    <p className="text-xs text-text-muted mt-1">Raised by: {q.raised_by}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "Action Items" && (
        <div className="space-y-2">
          {meeting.action_items.length > 0 ? (
            meeting.action_items.map((item) => (
              <ActionItemRow key={item.id} item={item} />
            ))
          ) : (
            <p className="text-text-muted text-sm text-center py-12">
              No action items identified.
            </p>
          )}
        </div>
      )}

      {activeTab === "Transcript" && (
        <div>
          <div className="bg-surface border border-border-subtle rounded-md p-6 font-mono text-sm text-text-secondary leading-loose whitespace-pre-wrap max-h-[600px] overflow-y-auto">
            {MOCK_TRANSCRIPT}
          </div>
        </div>
      )}

      {activeTab === "Analytics" && (
        <div className="space-y-6">
          {meeting.speakers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">
                Talk Time Distribution
              </h3>
              {meeting.speakers.map((s) => (
                <div key={s.id} className="mb-4">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-text-primary font-medium">{s.name}</span>
                    <span className="text-text-muted">{s.talk_time_pct}%</span>
                  </div>
                  <div className="h-2.5 bg-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet rounded-full transition-all"
                      style={{ width: `${s.talk_time_pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Duration", value: formatDuration(meeting.duration_seconds), color: "text-text-primary" },
              { label: "Engagement", value: `${meeting.engagement_score}%`, color: "text-violet" },
              { label: "Action Items", value: String(meeting.action_items.length), color: "text-positive" },
              { label: "Decisions", value: String(meeting.key_decisions.length), color: "text-warning" },
            ].map((stat) => (
              <div key={stat.label} className="card p-5 text-center">
                <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-text-muted mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify and commit**

```bash
npm run dev
# Check localhost:3000/meetings/1 — all 4 tabs
git add .
git commit -m "feat: add meeting detail page with summary, actions, transcript, analytics tabs"
```

---

### Task 12: Analytics Page

**Files:**
- Create: `frontend/app/(dashboard)/analytics/page.tsx`

**Step 1: Create analytics page**

```tsx
// frontend/app/(dashboard)/analytics/page.tsx
"use client";

import { MOCK_MEETINGS } from "@/lib/mock-data";

export default function AnalyticsPage() {
  const completed = MOCK_MEETINGS.filter((m) => m.status === "completed");
  const totalActions = completed.reduce((sum, m) => sum + m.action_items.length, 0);
  const completedActions = completed.reduce(
    (sum, m) => sum + m.action_items.filter((a) => a.completed).length,
    0
  );
  const avgEngagement = completed.length
    ? Math.round(
        completed.reduce((sum, m) => sum + (m.engagement_score || 0), 0) / completed.length
      )
    : 0;
  const avgDuration = completed.length
    ? Math.round(
        completed.reduce((sum, m) => sum + m.duration_seconds, 0) / completed.length / 60
      )
    : 0;

  const stats = [
    { label: "Meetings This Month", value: String(completed.length), color: "text-text-primary" },
    { label: "Action Items", value: `${completedActions}/${totalActions}`, sub: "completed", color: "text-violet" },
    { label: "Avg Engagement", value: `${avgEngagement}%`, color: "text-positive" },
    { label: "Avg Duration", value: `${avgDuration}m`, color: "text-cyan" },
  ];

  // Aggregate speakers across meetings
  const speakerMap: Record<string, number> = {};
  completed.forEach((m) =>
    m.speakers.forEach((s) => {
      speakerMap[s.name] = (speakerMap[s.name] || 0) + s.talk_time_pct;
    })
  );
  const topSpeakers = Object.entries(speakerMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);
  const maxTalk = topSpeakers[0]?.[1] || 1;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5 text-center">
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-text-muted mt-1">{stat.label}</p>
            {stat.sub && <p className="text-xs text-text-muted">{stat.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top speakers */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">
            Top Speakers by Talk Time
          </h3>
          {topSpeakers.map(([name, pct]) => (
            <div key={name} className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-text-primary font-medium">{name}</span>
                <span className="text-text-muted">{pct}%</span>
              </div>
              <div className="h-2.5 bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet rounded-full"
                  style={{ width: `${(pct / maxTalk) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Sentiment breakdown */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">
            Meeting Sentiment
          </h3>
          <div className="space-y-3">
            {completed.map((m) => (
              <div key={m.id} className="flex items-center justify-between">
                <span className="text-sm text-text-primary">{m.title}</span>
                <span
                  className={`text-sm font-medium ${
                    m.meeting_sentiment === "positive"
                      ? "text-positive"
                      : m.meeting_sentiment === "negative"
                      ? "text-negative"
                      : "text-neutral"
                  }`}
                >
                  {m.meeting_sentiment}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify and commit**

```bash
npm run dev
# Check localhost:3000/analytics
git add .
git commit -m "feat: add analytics page with stats, speaker breakdown, sentiment"
```

---

### Task 13: Settings Page

**Files:**
- Create: `frontend/app/(dashboard)/settings/page.tsx`

**Step 1: Create settings page**

```tsx
// frontend/app/(dashboard)/settings/page.tsx
"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [name, setName] = useState("Jane Smith");
  const [email, setEmail] = useState("ahmad@bridgesystems.co");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [slackNotifs, setSlackNotifs] = useState(false);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      {/* Profile */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">
          Profile
        </h2>
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-violet/20 flex items-center justify-center text-violet text-2xl font-bold">
              A
            </div>
            <button className="btn-outline text-sm py-2">Change avatar</button>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-violet"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-violet"
            />
          </div>
          <button className="btn-violet text-sm">Save Changes</button>
        </div>
      </section>

      {/* Notifications */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">
          Notifications
        </h2>
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Email notifications</p>
              <p className="text-xs text-text-muted">Receive meeting notes via email</p>
            </div>
            <button
              onClick={() => setEmailNotifs(!emailNotifs)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                emailNotifs ? "bg-violet" : "bg-elevated"
              }`}
              role="switch"
              aria-checked={emailNotifs}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  emailNotifs ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Slack notifications</p>
              <p className="text-xs text-text-muted">Post meeting notes to Slack</p>
            </div>
            <button
              onClick={() => setSlackNotifs(!slackNotifs)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                slackNotifs ? "bg-violet" : "bg-elevated"
              }`}
              role="switch"
              aria-checked={slackNotifs}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  slackNotifs ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Plan */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">
          Plan &amp; Billing
        </h2>
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Enterprise Plan</p>
              <p className="text-xs text-text-muted">$600/mo &middot; Up to 20 users</p>
            </div>
            <span className="bg-violet/15 text-violet text-xs font-semibold px-3 py-1 rounded-full">
              Active
            </span>
          </div>
          <button className="btn-outline text-sm">Manage Billing</button>
        </div>
      </section>
    </div>
  );
}
```

**Step 2: Verify and commit**

```bash
npm run dev
# Check localhost:3000/settings
git add .
git commit -m "feat: add settings page with profile, notifications, billing"
```

---

### Task 14: Final Polish — 404 Page + Metadata

**Files:**
- Create: `frontend/app/not-found.tsx`
- Verify all pages render without errors

**Step 1: Create 404 page**

```tsx
// frontend/app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-7xl font-black text-violet mb-4">404</p>
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-text-secondary mb-8">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link href="/" className="btn-violet">
          Go Home
        </Link>
      </div>
    </div>
  );
}
```

**Step 2: Run full build to verify no errors**

```bash
cd "/Volumes/Extreme SSD/Code_Projects_Bridge LLC/Read AI /frontend"
npm run build
```
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add 404 page, verify full build"
```

---

## Task Summary

| Task | What | Est. |
|---|---|---|
| 1 | Scaffold Next.js + install deps | 3 min |
| 2 | Design system (Tailwind + globals) | 5 min |
| 3 | Root layout + shared components + mock data | 5 min |
| 4 | Marketing layout + Hero + Social Proof + Footer | 10 min |
| 5 | Features + How It Works + Final CTA | 8 min |
| 6 | Pricing page | 8 min |
| 7 | Auth pages (login, signup, forgot-password) | 8 min |
| 8 | Dashboard layout + Sidebar + Join Modal | 8 min |
| 9 | Action Items page | 8 min |
| 10 | Meetings list page | 5 min |
| 11 | Meeting detail page (4 tabs) | 10 min |
| 12 | Analytics page | 5 min |
| 13 | Settings page | 5 min |
| 14 | 404 + build verification | 3 min |

**Total: 14 tasks**
