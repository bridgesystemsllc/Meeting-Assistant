import { AiNotesHero } from '../AiNotesHero';
import { Features } from './Features';
import { FinalCTA } from './FinalCTA';
import { Hero } from './Hero';
import { HowItWorks } from './HowItWorks';
import { SocialProof } from './SocialProof';
import styles from './landing.module.css';
import '../../styles/font-tokens.css';

export function LandingPage() {
  return (
    <div className={styles.page}>
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <FinalCTA />
      <AiNotesHero />
    </div>
  );
}
