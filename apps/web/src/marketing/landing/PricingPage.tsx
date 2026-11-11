import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './landing.module.css';
import '../../styles/font-tokens.css';

const plans = [
  {
    name: 'Starter',
    subtitle: 'Pilot teams',
    blurb: 'For evaluating the product with your admin.',
    features: ['AI meeting notes', 'Action items & decisions', 'Full transcripts', 'Email delivery'],
    cta: 'Join the waitlist',
  },
  {
    name: 'Pro',
    subtitle: 'For growing teams',
    blurb: 'Team sharing, analytics, and integrations. Seat limits are set by your admin.',
    features: [
      'Everything in Starter',
      'Team sharing & collaboration',
      'Analytics dashboard',
      'Slack & email integrations',
    ],
    cta: 'Join the waitlist',
  },
  {
    name: 'Enterprise',
    subtitle: 'For organizations',
    blurb: 'Dedicated setup, SSO, and admin controls. Contact us for a pilot.',
    features: [
      'Everything in Pro',
      'Dedicated setup & onboarding',
      'Priority support',
      'Custom integrations',
      'SSO / SAML',
      'Admin dashboard',
    ],
    cta: 'Contact us',
  },
];

const faqs = [
  {
    q: 'How do we get access?',
    a: 'Tenants are created by an admin. There is no self-serve signup. Join the waitlist and we will provision a workspace.',
  },
  {
    q: 'Can I change plans later?',
    a: 'Yes. Plan changes are handled by your admin. Nothing in this product displays or stores price points.',
  },
  {
    q: 'How does the bot appear in meetings?',
    a: "The bot joins as a named participant (for example '[PRODUCT NAME] Notetaker'). All attendees can see it. No hidden recording.",
  },
  {
    q: 'What platforms are supported?',
    a: 'Zoom, Google Meet, and Microsoft Teams.',
  },
  {
    q: 'Is my data secure?',
    a: 'Recordings are not stored by us. Transcripts are encrypted in transit and at rest. Retention is tenant-configurable.',
  },
];

export function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className={styles.page}>
      <header className={styles.pricingHeader}>
        <Link to="/">[PRODUCT NAME]</Link>
      </header>
      <section className={styles.section} style={{ textAlign: 'center', paddingBottom: 24 }}>
        <h1 className={styles.title}>Plans for every team</h1>
        <p className={styles.lede}>
          Seat counts and commercial terms live outside the product. Join the waitlist to talk to
          us — no amounts are listed here.
        </p>
      </section>
      <section className={styles.section} style={{ paddingTop: 0 }}>
        <div className={styles.planGrid}>
          {plans.map((plan) => (
            <article className={styles.plan} key={plan.name}>
              <h3>{plan.name}</h3>
              <p>{plan.subtitle}</p>
              <p>{plan.blurb}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <a className={styles.primary} href="#waitlist">
                {plan.cta}
              </a>
            </article>
          ))}
        </div>
        <div className={styles.faq}>
          <h2>Frequently asked questions</h2>
          {faqs.map((faq, index) => (
            <div className={styles.faqItem} key={faq.q}>
              <button
                type="button"
                aria-expanded={openFaq === index}
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
              >
                {faq.q}
              </button>
              {openFaq === index ? <div>{faq.a}</div> : null}
            </div>
          ))}
        </div>
        <p id="waitlist" className={styles.lede} style={{ marginTop: 48 }}>
          Ready when you are. Access is invite-only.
        </p>
      </section>
    </div>
  );
}
