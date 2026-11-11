import { Link2, Headphones, Mail } from 'lucide-react';
import styles from './landing.module.css';

const steps = [
  {
    icon: Link2,
    title: 'Paste your meeting link',
    description: "Drop your Zoom, Google Meet, or Teams link. That's it.",
  },
  {
    icon: Headphones,
    title: 'Our AI joins and listens',
    description: 'A bot joins your meeting, records audio, and transcribes with speaker labels.',
  },
  {
    icon: Mail,
    title: 'Get notes in your inbox',
    description: 'Structured notes with action items, decisions, and risks — delivered in minutes.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className={styles.section}>
      <p className={styles.kicker}>How it works</p>
      <h2 className={styles.title}>Three steps. Zero effort.</h2>
      <div className={styles.steps}>
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <article className={styles.step} key={step.title}>
              <Icon size={22} aria-hidden="true" />
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
