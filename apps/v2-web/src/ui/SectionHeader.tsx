import type { ReactNode } from 'react';

export function SectionHeader({ eyebrow, title, description, action, level = 2 }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className={`v2-section-header${level === 1 ? ' v2-section-header--route' : ''}`}>
      <div>
        {eyebrow ? <p className="v2-eyebrow">{eyebrow}</p> : null}
        <Heading>{title}</Heading>
        {description ? <p className="v2-section-description">{description}</p> : null}
      </div>
      {action ? <div className="v2-section-action">{action}</div> : null}
    </div>
  );
}
