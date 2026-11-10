"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Link2, Headphones, Mail } from "lucide-react";

const steps = [
  { icon: Link2, title: "Paste your meeting link", description: "Drop your Zoom, Google Meet, or Teams link. That's it." },
  { icon: Headphones, title: "Our AI joins and listens", description: "A bot joins your meeting, records audio, and transcribes with speaker labels." },
  { icon: Mail, title: "Get notes in your inbox", description: "Structured notes with action items, decisions, and risks — delivered in minutes." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-32 bg-surface">
      <div className="max-w-7xl mx-auto px-6">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-violet font-semibold text-sm uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Three steps. Zero effort.</h2>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <ScrollReveal key={step.title} delay={i * 0.15}>
              <div className="group relative bg-elevated border border-border-subtle rounded-2xl p-8 transition-all duration-300 hover:shadow-glow-violet hover:border-violet/30">
                <span className="absolute top-6 right-6 text-text-muted/20 text-6xl font-black">{i + 1}</span>
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
