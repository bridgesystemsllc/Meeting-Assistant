export type AttendeeChip = {
  initial: string;
  background: string;
  src: string | null;
};

export type SummaryCard = {
  badge: 'LIVE ANALYSIS';
  titlePrefix: 'Meeting ';
  titleAccent: 'Summary';
  attendeesLabel: 'ATTENDEES';
  attendees: AttendeeChip[];
  extraCount: '+2';
  summary: string;
  summaryHighlight: 'semantic search';
  actionItemsLabel: 'ACTION ITEMS';
  actionItems: [string, string, string];
  efficiencyLabel: 'AI EFFICIENCY';
  efficiencyValue: '88%';
  efficiencyIllustrative: true;
  synthesizing: 'Synthesizing...';
};

export type CallPanel = {
  caption: string;
  speaker: 'ALEX RIVERA (SPEAKING)';
  recordingChip: 'Recording · [PRODUCT NAME] Notetaker';
  controls: ['Monitor', 'Mic', 'Video', 'Phone'];
};

export type Participant = {
  name: string;
  initial: string;
  src: string | null;
};

export type ParticipantsPanel = {
  people: [Participant, Participant, Participant];
  extraBadge: '12+';
  sentimentLabel: 'SENTIMENT';
  sentimentValue: 'Positive';
  sentimentIllustrative: true;
};

export type HeroContent = {
  productName: '[PRODUCT NAME]';
  nav: { label: string; href: string }[];
  socialProof: { icon: 'Sparkles'; text: '[PLACEHOLDER: Best AI notetaker platform.]'; illustrative: true };
  h1: ['[PRODUCT NAME] the future', 'of meeting notes'];
  subtitle: 'Capture, organize, and share your meeting insights in seconds—from any call platform with advanced semantic intelligence.';
  pageTitle: '[PRODUCT NAME] — The future of meeting notes';
  navCta: { label: 'Start for Free'; href: string };
  primaryCta: { label: 'Try [PRODUCT NAME] for Free →'; href: string };
  secondaryCta: { label: 'Download app'; href: string };
  showDownloadCta: false;
  video: { src: string | null; poster: string };
  mockup: { summary: SummaryCard; call: CallPanel; participants: ParticipantsPanel };
  illustrativeCaption: 'Illustrative product preview. Sample data.';
};

export const heroContent: HeroContent = {
  productName: '[PRODUCT NAME]',
  nav: [
    { label: 'Company', href: '#company' },
    { label: 'Features', href: '#features' },
    { label: 'Integrations', href: '#integrations' },
    { label: 'Pages', href: '#pages' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Article', href: '#article' },
  ],
  socialProof: {
    icon: 'Sparkles',
    text: '[PLACEHOLDER: Best AI notetaker platform.]',
    illustrative: true,
  },
  h1: ['[PRODUCT NAME] the future', 'of meeting notes'],
  subtitle:
    'Capture, organize, and share your meeting insights in seconds—from any call platform with advanced semantic intelligence.',
  pageTitle: '[PRODUCT NAME] — The future of meeting notes',
  navCta: { label: 'Start for Free', href: '#waitlist' },
  primaryCta: { label: 'Try [PRODUCT NAME] for Free →', href: '#waitlist' },
  secondaryCta: { label: 'Download app', href: '#' },
  showDownloadCta: false,
  video: { src: null, poster: '/media/hero/poster.webp' },
  mockup: {
    summary: {
      badge: 'LIVE ANALYSIS',
      titlePrefix: 'Meeting ',
      titleAccent: 'Summary',
      attendeesLabel: 'ATTENDEES',
      attendees: [
        { initial: 'S', background: '#fecbcb', src: null },
        { initial: 'J', background: '#bedafe', src: null },
        { initial: 'A', background: '#baf7d0', src: null },
        { initial: 'M', background: '#fef08a', src: null },
      ],
      extraCount: '+2',
      summary: 'Reviewing the Q3 roadmap and finalizing the semantic search integration strategy.',
      summaryHighlight: 'semantic search',
      actionItemsLabel: 'ACTION ITEMS',
      actionItems: [
        'Update pricing tiers in dashboard',
        'Confirm Slack integration tests',
        'Draft release notes for v1.2',
      ],
      efficiencyLabel: 'AI EFFICIENCY',
      efficiencyValue: '88%',
      efficiencyIllustrative: true,
      synthesizing: 'Synthesizing...',
    },
    call: {
      caption:
        'I think the semantic indexing approach will significantly reduce our response times for the larger datasets...',
      speaker: 'ALEX RIVERA (SPEAKING)',
      recordingChip: 'Recording · [PRODUCT NAME] Notetaker',
      controls: ['Monitor', 'Mic', 'Video', 'Phone'],
    },
    participants: {
      people: [
        { name: 'Gustavo Franci', initial: 'G', src: null },
        { name: 'Jely Miya', initial: 'J', src: null },
        { name: 'Ruben Herwitz', initial: 'R', src: null },
      ],
      extraBadge: '12+',
      sentimentLabel: 'SENTIMENT',
      sentimentValue: 'Positive',
      sentimentIllustrative: true,
    },
  },
  illustrativeCaption: 'Illustrative product preview. Sample data.',
};
