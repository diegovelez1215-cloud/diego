import type { ReactNode } from 'react';

export function StatePanel({ kind, eyebrow, title, description, action, compact = false, headingLevel = 2 }: {
  kind: 'loading' | 'stale' | 'unavailable' | 'error' | 'empty' | 'not-found' | 'neutral';
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section className={`v2-state-panel v2-state-panel--${kind}${compact ? ' v2-state-panel--compact' : ''}`} data-state={kind} role={kind === 'error' ? 'alert' : kind === 'loading' ? 'status' : undefined}>
      <p className="v2-eyebrow">{eyebrow}</p>
      <Heading>{title}</Heading>
      <p>{description}</p>
      {action ? <div className="v2-state-action">{action}</div> : null}
    </section>
  );
}
