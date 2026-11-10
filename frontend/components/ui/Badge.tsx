const variants = {
  positive: "bg-positive/15 text-positive",
  negative: "bg-negative/15 text-negative",
  warning: "bg-warning/15 text-warning",
  neutral: "bg-neutral/15 text-neutral",
  violet: "bg-violet/15 text-violet",
  cyan: "bg-cyan/15 text-cyan",
  recording: "bg-cyan/15 text-cyan",
} as const;

type BadgeVariant = keyof typeof variants;

export function Badge({
  children,
  variant = "neutral",
  pulse = false,
  className = "",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${variants[variant]} ${className}`}
    >
      {pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-slow" />
      )}
      {children}
    </span>
  );
}
