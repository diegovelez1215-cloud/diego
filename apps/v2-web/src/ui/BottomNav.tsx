import type { MouseEvent } from 'react';
import { primaryDestinations, type PrimaryPath } from './AppShell';

function NavIcon({ name }: { name: typeof primaryDestinations[number]['icon'] }) {
  if (name === 'matchday') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16M7 4v3.5M17 4v3.5M5 11h5v4H5zM14 11h5M14 15h5M5 19h14" /></svg>;
  if (name === 'tournament') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0V4ZM5 6H3v1a4 4 0 0 0 4 4M19 6h2v1a4 4 0 0 1-4 4M12 13v4M8 20h8M9 17h6" /></svg>;
  if (name === 'play') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17.5V9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v8.5a2 2 0 0 1-3.5 1.3L13.8 17h-3.6l-1.7 1.8A2 2 0 0 1 5 17.5ZM8 10h4M10 8v4M16.5 9.5h.01M15 12h.01" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.6-4 2.8-6 6.5-6s5.9 2 6.5 6" /></svg>;
}

export function BottomNav({ currentPath, onNavigate }: { currentPath: PrimaryPath | null; onNavigate: (path: string) => void }) {
  function activate(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(path);
  }

  return (
    <nav className="v2-primary-nav" aria-label="Primary navigation">
      <div className="v2-primary-nav__inner">
        {primaryDestinations.map((item) => {
          const selected = currentPath === item.path;
          return (
            <a
              className="v2-nav-link"
              href={item.path}
              key={item.path}
              aria-current={selected ? 'page' : undefined}
              data-selected={selected ? 'true' : 'false'}
              onClick={(event) => activate(event, item.path)}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
