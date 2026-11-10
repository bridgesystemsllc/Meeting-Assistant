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
            Stop losing track of<br /><span className="text-violet">what matters.</span>
          </h2>
          <p className="text-text-secondary text-lg mb-10">No credit card required. 5 free meetings included.</p>
          <Link href="/signup" className="btn-violet text-lg px-10 py-5 inline-block">Start Your Free Trial</Link>
        </ScrollReveal>
      </div>
    </section>
  );
}
