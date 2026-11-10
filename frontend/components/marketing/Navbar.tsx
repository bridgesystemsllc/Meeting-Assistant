import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function Navbar() {
  return (
    <header className="fixed top-0 w-full z-50 bg-primary/80 backdrop-blur-xl border-b border-border-subtle">
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <Link href="#features" className="text-text-secondary hover:text-text-primary text-sm transition-colors">Features</Link>
          <Link href="#how-it-works" className="text-text-secondary hover:text-text-primary text-sm transition-colors">How It Works</Link>
          <Link href="/pricing" className="text-text-secondary hover:text-text-primary text-sm transition-colors">Pricing</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors">Sign In</Link>
          <Link href="/signup" className="btn-violet text-sm px-4 py-2">Start Free Trial</Link>
        </div>
      </nav>
    </header>
  );
}
