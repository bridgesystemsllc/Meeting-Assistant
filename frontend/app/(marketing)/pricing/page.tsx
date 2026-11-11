"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Check, Shield, Users, Headphones, Zap, Lock, BarChart3 } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Starter",
    subtitle: "Pilot teams",
    blurb: "For evaluating the product with your admin.",
    meetings: "Pilot meeting volume, set by your admin",
    features: ["AI meeting notes", "Action items & decisions", "Full transcripts", "Email delivery", "1 user"],
    cta: "Join the waitlist",
    ctaStyle: "btn-outline",
    badge: null as string | null,
  },
  {
    name: "Pro",
    subtitle: "For growing teams",
    blurb: "Team sharing, analytics, and integrations. Seat limits are set by your admin.",
    meetings: "Seat-limited meetings",
    features: ["Everything in Starter", "Team sharing & collaboration", "Analytics dashboard", "Slack & email integrations", "Priority transcription", "Up to 10 users"],
    cta: "Join the waitlist",
    ctaStyle: "btn-violet",
    badge: "Most Popular",
  },
  {
    name: "Enterprise",
    subtitle: "For organizations",
    blurb: "Dedicated setup, SSO, and admin controls. Contact us for a pilot.",
    meetings: "Admin-provisioned",
    features: ["Everything in Pro", "Dedicated setup & onboarding", "Priority support", "Custom integrations", "SSO / SAML", "Admin dashboard", "SLA guarantee"],
    cta: "Contact us",
    ctaStyle: "btn-cyan-outline",
    badge: null,
  },
];

const faqs = [
  { q: "How do we get access?", a: "Tenants are created by an admin. There is no self-serve signup. Join the waitlist and we will provision a workspace." },
  { q: "Can I change plans later?", a: "Yes. Plan changes are handled by your admin. Nothing in this product displays or stores commercial amounts." },
  { q: "How does the bot appear in meetings?", a: "The bot joins as a named participant ('Meeting Recorder'). All attendees can see it. No hidden recording." },
  { q: "What platforms are supported?", a: "Zoom, Google Meet, and Microsoft Teams. Webex support is coming soon." },
  { q: "Is my data secure?", a: "Yes. Recordings are not stored by us. Transcripts are encrypted at rest and in transit. Enterprise plans include custom data retention policies." },
  { q: "Can we add more seats on Enterprise?", a: "Yes. Contact us for larger teams. Seat limits are enforced in-product; commercial terms live outside the app." },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-6">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4">Plans for every team</h1>
            <p className="text-text-secondary text-lg">Seat counts and commercial terms live outside the product.</p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          {plans.map((plan, i) => (
            <ScrollReveal key={plan.name} delay={i * 0.1}>
              <div className={`relative card p-8 flex flex-col h-full ${plan.badge ? "border-violet" : ""}`}>
                {plan.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet text-white text-xs font-semibold px-3 py-1 rounded-full">{plan.badge}</span>}
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-text-muted text-sm mb-4">{plan.subtitle}</p>
                <div className="mb-6">
                  <p className="text-lg font-semibold">{plan.blurb}</p>
                  <p className="text-text-secondary text-sm mt-1">{plan.meetings}</p>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-text-secondary">
                      <Check className="w-4 h-4 text-positive shrink-0 mt-0.5" />{f}
                    </li>
                  ))}
                </ul>
                <Link href="#waitlist" className={`${plan.ctaStyle} text-center w-full`}>{plan.cta}</Link>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal>
          <div className="card-elevated p-12 mb-24">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold mb-3">Built for organizations that run on meetings</h2>
              <p className="text-text-secondary max-w-xl mx-auto">Enterprise-grade features for teams that need security, control, and scale.</p>
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
                  <f.icon className="w-5 h-5 text-violet shrink-0" /><span className="text-sm">{f.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-4">
              <Link href="#waitlist" className="btn-violet">Talk to us</Link>
              <Link href="#waitlist" className="btn-outline">Join the waitlist</Link>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <div key={i} className="border border-border-subtle rounded-md overflow-hidden">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between p-5 text-left hover:bg-elevated transition-colors" aria-expanded={openFaq === i}>
                    <span className="font-medium">{faq.q}</span>
                    <span className="text-text-muted text-xl">{openFaq === i ? "\u2212" : "+"}</span>
                  </button>
                  {openFaq === i && <div className="px-5 pb-5 text-text-secondary text-sm leading-relaxed">{faq.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}
