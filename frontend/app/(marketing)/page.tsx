import { Hero } from "@/components/marketing/Hero";
import { SocialProof } from "@/components/marketing/SocialProof";
import { Features } from "@/components/marketing/Features";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { FinalCTA } from "@/components/marketing/FinalCTA";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <FinalCTA />
    </>
  );
}
