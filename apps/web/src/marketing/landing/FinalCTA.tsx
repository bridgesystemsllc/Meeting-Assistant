import styles from './landing.module.css';

export function FinalCTA() {
  return (
    <section id="waitlist" className={`${styles.section} ${styles.waitlist}`}>
      <h2>Join the waitlist</h2>
      <p>
        Access is invite-only. Tenants are provisioned by an admin — there is no self-serve signup
        in v1.
      </p>
      <a className={styles.primary} href="#waitlist">
        Request access
      </a>
    </section>
  );
}
