export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-8 h-8 rounded-md bg-violet flex items-center justify-center">
        <span className="text-white font-bold text-sm">M</span>
      </div>
      <span className="text-text-primary font-bold text-lg tracking-tight">
        Meeting Assistant
      </span>
    </div>
  );
}
