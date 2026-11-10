import { Logo } from "@/components/ui/Logo";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center relative px-4">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] bg-violet/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="relative w-full max-w-md">
        <Link href="/" className="flex justify-center mb-8"><Logo /></Link>
        {children}
      </div>
    </div>
  );
}
