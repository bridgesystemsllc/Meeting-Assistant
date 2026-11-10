import { Bot, FileText, BarChart3 } from 'lucide-react';
import styles from './landing.module.css';

const features = [
  {
    tagline: 'Your AI meeting teammate',
    title: 'Never miss a word',
    description:
      'Paste your meeting link. Our bot joins, records, transcribes, and identifies every speaker — silently in the background.',
    bullets: [
      'Bot joins in one click — paste your meeting link',
      'Records, transcribes, identifies every speaker',
      'Works silently in the background',
    ],
    icon: Bot,
  },
  {
    tagline: 'From chaos to clarity in minutes',
    title: 'Structured intelligence, not raw transcripts',
    description:
      'Every meeting produces an executive summary, action items with owners and deadlines, key decisions, risks, and unresolved questions.',
    bullets: [
      'Executive summary in 3 sentences',
      'Action items with owners and deadlines',
      'Key decisions, risks, and unresolved questions',
    ],
    icon: FileText,
  },
  {
    tagline: 'Built for teams that move fast',
    title: 'Track meeting effectiveness across your organization',
    description:
      'Engagement scores, talk-time breakdowns, sentiment trends, and meeting analytics give you visibility into how your team communicates.',
    bullets: [
      'Engagement and sentiment scoring',
      'Speaker talk-time distribution',
      'Meeting effectiveness trends over time',
    ],
    icon: BarChart3,
  },
];

export function Features() {
  return (
    <section id="features" className={styles.section}>
      {features.map((feature) => {
        const Icon = feature.icon;
        return (
          <div className={styles.featureRow} key={feature.title}>
            <div className={styles.featureFrame} aria-hidden="true">
              <Icon size={48} />
            </div>
            <div className={styles.featureCopy}>
              <p className={styles.kicker}>{feature.tagline}</p>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
              <ul>
                {feature.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </section>
  );
}
