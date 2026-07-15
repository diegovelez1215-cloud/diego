import { useEffect, useState, type RefObject } from 'react';

export function BracketPositionDots({ scrollerRef, rounds }: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  rounds: readonly string[];
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof IntersectionObserver === 'undefined') return;
    const columns = [...scroller.querySelectorAll<HTMLElement>('[data-bracket-index]')];
    const observer = new IntersectionObserver(() => {
      const rootLeft = scroller.getBoundingClientRect().left;
      let nearest = 0;
      let distance = Number.POSITIVE_INFINITY;
      columns.forEach((column, index) => {
        const nextDistance = Math.abs(column.getBoundingClientRect().left - rootLeft);
        if (nextDistance < distance) {
          distance = nextDistance;
          nearest = index;
        }
      });
      setActive(nearest);
    }, { root: scroller, threshold: [0.25, 0.5, 0.75] });
    columns.forEach((column) => observer.observe(column));
    return () => observer.disconnect();
  }, [rounds, scrollerRef]);

  const label = `${rounds[active] || rounds[0]}, ${active + 1} of ${rounds.length}`;
  return (
    <div className="v2-bracket-position" role="status" aria-live="polite" aria-label={label}>
      <span className="v2-visually-hidden">{label}</span>
      {rounds.map((round, index) => <span key={round} aria-hidden="true" data-active={index === active ? 'true' : 'false'} />)}
    </div>
  );
}
