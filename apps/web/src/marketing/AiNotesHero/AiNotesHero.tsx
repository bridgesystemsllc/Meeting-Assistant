import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles, Monitor, Mic, Video, Phone, User, FileText, Brain } from 'lucide-react';
import { heroContent, type AttendeeChip } from './heroContent';
import styles from './AiNotesHero.module.css';
import '../../styles/font-tokens.css';

const ALLOWED_ICONS = { Sparkles, Monitor, Mic, Video, Phone, User, FileText, Brain } as const;

function IllustrativeTag() {
  return <span className={styles.illustrative}>Illustrative</span>;
}

function InitialsAvatar({ initial, background, src, className }: AttendeeChip & { className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  if (showImage && src) {
    return (
      <img
        src={src}
        alt=""
        className={`${styles.avatarImg} ${className ?? ''}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={`${styles.avatar} ${className ?? ''}`} style={{ backgroundColor: background }}>
      {initial}
    </span>
  );
}

function highlightSummary(text: string, highlight: string) {
  const idx = text.indexOf(highlight);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className={styles.highlight}>{highlight}</span>
      {text.slice(idx + highlight.length)}
    </>
  );
}

function ControlIcon({ name }: { name: (typeof heroContent.mockup.call.controls)[number] }) {
  const Icon = ALLOWED_ICONS[name];
  const isEnd = name === 'Phone';
  return (
    <span className={isEnd ? styles.endCall : styles.control} aria-hidden="true">
      <Icon className={isEnd ? styles.phoneIcon : undefined} size={16} />
    </span>
  );
}

export function AiNotesHero() {
  const reduceMotion = useReducedMotion();
  const [videoError, setVideoError] = useState(false);
  const { video, mockup, showDownloadCta, secondaryCta } = heroContent;

  useEffect(() => {
    const previous = document.title;
    document.title = heroContent.pageTitle;
    return () => {
      document.title = previous;
    };
  }, []);

  const playVideo = Boolean(video.src) && !reduceMotion && !videoError;

  return (
    <section
      id="ai-notes-hero"
      data-testid="ai-notes-hero"
      className={styles.hero}
      aria-label="[PRODUCT NAME] product preview"
    >
      <div className={styles.videoLayer} data-testid="hero-video-layer" aria-hidden="true">
        <img className={styles.poster} src={video.poster} alt="" />
        {playVideo && video.src ? (
          <video
            className={styles.video}
            src={video.src}
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
            onError={() => setVideoError(true)}
          />
        ) : null}
        <div className={styles.overlay} />
      </div>

      <div className={styles.navWrap}>
        <nav className={styles.nav} data-testid="hero-nav" aria-label="Marketing">
          <a className={styles.wordmark} href="/">
            {heroContent.productName}
          </a>
          <ul className={styles.navLinks}>
            {heroContent.nav.map((item) => (
              <li key={item.label}>
                <a href={item.href}>
                  {item.label}
                  {item.label === 'Pages' ? <span className={styles.caret} aria-hidden="true" /> : null}
                </a>
              </li>
            ))}
          </ul>
          <a className={styles.navCta} href={heroContent.navCta.href}>
            {heroContent.navCta.label}
          </a>
        </nav>
      </div>

      <div className={styles.inner}>
        <div className={styles.socialPill}>
          <Sparkles size={14} aria-hidden="true" />
          <span>{heroContent.socialProof.text}</span>
          {heroContent.socialProof.illustrative ? <IllustrativeTag /> : null}
        </div>

        <h1 className={styles.headline}>
          <span>{heroContent.h1[0]}</span>
          <span>{heroContent.h1[1]}</span>
        </h1>

        <p className={styles.subtitle}>{heroContent.subtitle}</p>

        <motion.a
          data-testid="hero-primary-cta"
          className={styles.primaryCta}
          href={heroContent.primaryCta.href}
          whileHover={reduceMotion ? undefined : { y: -2 }}
        >
          {heroContent.primaryCta.label}
        </motion.a>

        {showDownloadCta ? (
          <a href={secondaryCta.href}>{secondaryCta.label}</a>
        ) : null}

        <div className={styles.panels}>
          <motion.article
            className={styles.panel}
            data-testid="hero-panel-summary"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : 0 }}
          >
            <div className={styles.badge}>
              <span className={styles.pulse} />
              {mockup.summary.badge}
            </div>
            <div className={styles.panelTitle}>
              <FileText size={18} aria-hidden="true" />
              <span>
                {mockup.summary.titlePrefix}
                <span className={styles.titleAccent}>{mockup.summary.titleAccent}</span>
              </span>
            </div>
            <div className={styles.label}>{mockup.summary.attendeesLabel}</div>
            <div className={styles.avatars}>
              {mockup.summary.attendees.map((person) => (
                <InitialsAvatar key={person.initial} {...person} />
              ))}
              <span className={`${styles.avatar} ${styles.extra}`}>{mockup.summary.extraCount}</span>
            </div>
            <p className={styles.summaryText}>
              {highlightSummary(mockup.summary.summary, mockup.summary.summaryHighlight)}
            </p>
            <div className={styles.label}>{mockup.summary.actionItemsLabel}</div>
            <ul className={styles.actionList}>
              {mockup.summary.actionItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className={styles.efficiencyRow}>
              <span>
                <Brain size={14} aria-hidden="true" /> {mockup.summary.efficiencyLabel}{' '}
                {mockup.summary.efficiencyValue}
                {mockup.summary.efficiencyIllustrative ? <IllustrativeTag /> : null}
              </span>
            </div>
            <div className={styles.bar}>
              <span className={styles.barFill} />
            </div>
            <span className={styles.chip}>{mockup.summary.synthesizing}</span>
          </motion.article>

          <motion.article
            className={styles.panel}
            data-testid="hero-panel-call"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : 0.08 }}
          >
            <div className={styles.callStage}>
              <span className={styles.recordingChip}>{mockup.call.recordingChip}</span>
              <p className={styles.caption}>{mockup.call.caption}</p>
              <div className={styles.speaker}>{mockup.call.speaker}</div>
            </div>
            <div className={styles.controls} aria-hidden="true">
              {mockup.call.controls.map((name) => (
                <ControlIcon key={name} name={name} />
              ))}
            </div>
          </motion.article>

          <motion.article
            className={styles.panel}
            data-testid="hero-panel-participants"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : 0.16 }}
          >
            <div className={styles.label}>
              <User size={14} aria-hidden="true" /> Participants
            </div>
            {mockup.participants.people.map((person) => (
              <div className={styles.personRow} key={person.name}>
                <InitialsAvatar
                  initial={person.initial}
                  background="#bedafe"
                  src={person.src}
                />
                <span>{person.name}</span>
              </div>
            ))}
            <span className={styles.extraBadge}>{mockup.participants.extraBadge}</span>
            <div className={styles.sentiment} data-testid="hero-sentiment">
              <div className={styles.label}>{mockup.participants.sentimentLabel}</div>
              <p className={styles.sentimentValue}>
                {mockup.participants.sentimentValue}
                {mockup.participants.sentimentIllustrative ? <IllustrativeTag /> : null}
              </p>
            </div>
          </motion.article>
        </div>

        <p className={styles.captionNote}>{heroContent.illustrativeCaption}</p>
      </div>
    </section>
  );
}
