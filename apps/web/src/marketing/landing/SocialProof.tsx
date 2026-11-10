import styles from './landing.module.css';

export function SocialProof() {
  return (
    <section className={`${styles.section} ${styles.proof}`} aria-label="Supported platforms">
      <p>
        Built for operations and revenue teams that run on Zoom, Google Meet, and Microsoft Teams.
      </p>
    </section>
  );
}
