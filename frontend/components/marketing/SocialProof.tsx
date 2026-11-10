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
        <ScrollReveal>
          <p className="text-center text-text-muted text-sm uppercase tracking-widest mb-12">Trusted by teams at</p>
          <div className="flex items-center justify-center gap-12 mb-20 flex-wrap">
            {["Acme Corp", "TechFlow", "Nexus AI", "Quantum", "Velocity"].map((name) => (
              <span key={name} className="text-text-muted/40 font-bold text-xl tracking-tight">{name}</span>
            ))}
          </div>
        </ScrollReveal>
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
