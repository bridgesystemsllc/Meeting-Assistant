export function SeatsFooter({ seatsUsed, seatLimit }: { seatsUsed: number; seatLimit: number }) {
  return (
    <p data-testid="seats-footer" className="mt-6 text-sm text-[var(--color-muted)]">
      Seats: {seatsUsed} of {seatLimit} used
    </p>
  );
}
