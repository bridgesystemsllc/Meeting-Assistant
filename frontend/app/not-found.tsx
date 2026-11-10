import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-7xl font-black text-violet mb-4">404</p>
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-text-secondary mb-8">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/" className="btn-violet">Go Home</Link>
      </div>
    </div>
  );
}
