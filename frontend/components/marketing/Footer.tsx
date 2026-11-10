import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const links = {
  Product: ["Features", "Pricing", "Integrations", "Changelog"],
  Company: ["About", "Blog", "Careers", "Contact"],
  Resources: ["Documentation", "API Reference", "Status", "Support"],
  Legal: ["Privacy Policy", "Terms of Service", "Security"],
};

export function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-surface">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="text-text-muted text-sm mt-4 leading-relaxed">AI-powered meeting notes for teams that move fast.</p>
          </div>
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-text-primary font-semibold text-sm mb-4">{category}</h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item}>
                    <Link href="#" className="text-text-muted text-sm hover:text-text-primary transition-colors">{item}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border-subtle mt-12 pt-8 text-center text-text-muted text-sm">
          &copy; {new Date().getFullYear()} Meeting Assistant. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
