"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Calendar, BarChart3, Settings, Plus, LogOut } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const navItems = [
  { href: "/actions", label: "Action Items", icon: CheckSquare },
  { href: "/meetings", label: "Meetings", icon: Calendar },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ onJoinMeeting }: { onJoinMeeting: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    return pathname.startsWith(href);
  };

  return (
    <>
      <aside className="hidden lg:flex w-60 h-screen fixed left-0 top-0 flex-col bg-surface border-r border-border-subtle z-40">
        <div className="p-6"><Logo /></div>
        <div className="px-4 mb-4">
          <button onClick={onJoinMeeting} className="btn-violet w-full flex items-center justify-center gap-2 text-sm py-2.5">
            <Plus className="w-4 h-4" />Join Meeting
          </button>
        </div>
        <nav className="flex-1 px-2">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors mb-1 ${isActive(item.href) ? "bg-elevated text-text-primary border-l-2 border-violet" : "text-text-secondary hover:text-text-primary hover:bg-elevated/50"}`}>
              <item.icon className="w-5 h-5" />{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-border-subtle">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-violet/20 flex items-center justify-center text-violet text-sm font-bold">J</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">Jane Smith</p>
              <p className="text-xs text-text-muted truncate">Enterprise</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-2 text-text-muted hover:text-text-primary text-sm transition-colors">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      </aside>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border-subtle z-40 flex">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs ${isActive(item.href) ? "text-violet" : "text-text-muted"}`}>
            <item.icon className="w-5 h-5" />{item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
