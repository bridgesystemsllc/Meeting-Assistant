"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Bot, FileText, BarChart3 } from "lucide-react";

const features = [
  {
    tagline: "Your AI meeting teammate",
    title: "Never miss a word",
    description: "Paste your meeting link. Our bot joins, records, transcribes, and identifies every speaker — silently in the background.",
    bullets: ["Bot joins in one click — paste your meeting link", "Records, transcribes, identifies every speaker", "Works silently in the background"],
    icon: Bot,
    direction: "left" as const,
  },
  {
    tagline: "From chaos to clarity in minutes",
    title: "Structured intelligence, not raw transcripts",
    description: "Every meeting produces an executive summary, action items with owners and deadlines, key decisions, risks, and unresolved questions.",
    bullets: ["Executive summary in 3 sentences", "Action items with owners and deadlines", "Key decisions, risks, and unresolved questions"],
    icon: FileText,
    direction: "right" as const,
  },
  {
    tagline: "Built for teams that move fast",
    title: "Track meeting effectiveness across your organization",
    description: "Engagement scores, talk-time breakdowns, sentiment trends, and meeting analytics give you visibility into how your team communicates.",
    bullets: ["Engagement and sentiment scoring", "Speaker talk-time distribution", "Meeting effectiveness trends over time"],
    icon: BarChart3,
    direction: "left" as const,
  },
];

export function Features() {
  return (
    <section id="features" className="py-32">
      <div className="max-w-7xl mx-auto px-6 space-y-32">
        {features.map((feature, i) => (
          <div key={feature.tagline} className={`flex flex-col lg:flex-row items-center gap-16 ${i % 2 === 1 ? "lg:flex-row-reverse" : ""}`}>
            <ScrollReveal direction={feature.direction} className="flex-1 w-full">
              <div className="bg-surface border border-border-subtle rounded-2xl p-2 shadow-elevated">
                <div className="bg-elevated rounded-xl h-[280px] md:h-[380px] flex items-center justify-center">
                  <feature.icon className="w-16 h-16 text-violet/30" />
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal direction={feature.direction === "left" ? "right" : "left"} delay={0.15} className="flex-1">
              <p className="text-violet font-semibold text-sm uppercase tracking-widest mb-3">{feature.tagline}</p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">{feature.title}</h2>
              <p className="text-text-secondary text-lg leading-relaxed mb-6">{feature.description}</p>
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
