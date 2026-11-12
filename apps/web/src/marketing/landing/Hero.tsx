import { Link } from 'react-router-dom';
import styles from './landing.module.css';

export function Hero() {
  return (
    <section id="company" className={`${styles.section} ${styles.hero}`}>
      <p className={styles.kicker}>AI-powered meeting intelligence</p>
      <h2 className={styles.title}>
        Every meeting.
        <br />
        Every action item.
        <br />
        Handled.
      </h2>
      <p className={styles.lede}>
        AI joins your meetings, records every word, and delivers structured notes with action
        items, decisions, and risks — before you finish your coffee.
      </p>
      <div className={styles.actions}>
        <a className={styles.primary} href="#waitlist">
          Join the waitlist
        </a>
        <Link className={styles.secondary} to="/pricing">
          View plans
        </Link>
      </div>
      <div className={styles.platforms} id="integrations">
        <span>
          <i className={styles.dot} style={{ background: '#2563eb' }} />
          Zoom
        </span>
        <span>
          <i className={styles.dot} style={{ background: '#16a34a' }} />
          Google Meet
        </span>
        <span>
          <i className={styles.dot} style={{ background: '#5b4b8a' }} />
          Microsoft Teams
        </span>
      </div>
    </section>
  );
}
