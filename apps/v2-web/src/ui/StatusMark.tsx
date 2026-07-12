export type StatusTone = 'verified' | 'live' | 'stale' | 'unavailable' | 'error' | 'neutral' | 'pending';

export function StatusMark({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={`v2-status-mark v2-status-mark--${tone}`}><span className="v2-status-dot" aria-hidden="true" />{children}</span>;
}
