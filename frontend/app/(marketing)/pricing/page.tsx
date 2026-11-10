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
    badge: null as string | null,
    note: "No credit card required",
  },
  {
    name: "Pro",
    subtitle: "For growing teams",
    monthlyPrice: 29,
    annualPrice: 23,
    priceLabel: "/user/mo",
    meetings: "Unlimited meetings",
    features: ["Everything in Starter", "Team sharing & collaboration", "Analytics dashboard", "Slack & email integrations", "Priority transcription", "Up to 10 users"],
    cta: "Get Started",
    ctaStyle: "btn-violet",
    badge: "Most Popular",
    note: null as string | null,
  },
  {
    name: "Enterprise",
    subtitle: "For organizations",
    monthlyPrice: 600,
    annualPrice: 480,
    priceLabel: "/mo (up to 20 users)",
    meetings: "Unlimited meetings",
    features: ["Everything in Pro", "Dedicated setup & onboarding", "Priority support", "Custom integrations", "SSO / SAML", "Admin dashboard", "SLA guarantee"],
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
        <ScrollReveal>
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4">Simple pricing for every team</h1>
            <p className="text-text-secondary text-lg">Start free. Scale when you&apos;re ready.</p>
            <div className="flex items-center justify-center gap-3 mt-8">
              <span className={`text-sm font-medium ${!annual ? "text-text-primary" : "text-text-muted"}`}>Monthly</span>
              <button onClick={() => setAnnual(!annual)} className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-violet" : "bg-elevated"}`} aria-label="Toggle annual pricing">
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${annual ? "translate-x-7" : "translate-x-1"}`} />
              </button>
              <span className={`text-sm font-medium ${annual ? "text-text-primary" : "text-text-muted"}`}>Annual</span>
              {annual && <span className="bg-positive/15 text-positive text-xs font-semibold px-2 py-0.5 rounded-full">Save 20%</span>}
            </div>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          {plans.map((plan, i) => (
            <ScrollReveal key={plan.name} delay={i * 0.1}>
              <div className={`relative card p-8 flex flex-col h-full ${plan.badge ? "border-violet shadow-glow-violet" : ""}`}>
                {plan.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet text-white text-xs font-semibold px-3 py-1 rounded-full">{plan.badge}</span>}
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-text-muted text-sm mb-4">{plan.subtitle}</p>
                <div className="mb-6">
                  {plan.monthlyPrice === 0 ? (
                    <p className="text-3xl font-black">{plan.priceLabel}</p>
                  ) : (
                    <p className="text-3xl font-black">${annual ? plan.annualPrice : plan.monthlyPrice}<span className="text-base font-normal text-text-secondary">{plan.priceLabel}</span></p>
                  )}
                  <p className="text-text-secondary text-sm mt-1">{plan.meetings}</p>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-text-secondary">
                      <Check className="w-4 h-4 text-positive shrink-0 mt-0.5" />{f}
                    </li>
                  ))}
                </ul>
                <Link href={plan.name === "Enterprise" ? "#contact" : "/signup"} className={`${plan.ctaStyle} text-center w-full`}>{plan.cta}</Link>
                {plan.note && <p className="text-text-muted text-xs text-center mt-3">{plan.note}</p>}
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
              <Link href="#contact" className="btn-violet">Talk to Sales</Link>
              <Link href="#contact" className="btn-outline">Book a Demo</Link>
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
