// United 2026 — celebration engine. Pure visual dopamine for Play's peak
// moments: perfect gauntlets, clutch wins, medals, sealed calls. One fixed
// overlay, CSS-driven particles, auto-cleaned. It stores nothing, fetches
// nothing, and never touches official truth. Reduced motion = silence.

const GOLD = ['#d4ab55', '#ecd7a2', '#f2f6ff', '#a3bdf8'];

function motionAllowed() {
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

/** Fire a celebration burst.
    kind: 'seal' (small, at a point) | 'win' (mid) | 'trophy' (full ceremony)
    opts: { x, y (viewport px — defaults to center), colors: [] } */
export function celebrate(kind = 'win', opts = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  if (!motionAllowed() || document.hidden) return false;
  if (document.querySelectorAll('.fx-layer').length >= 2) return false; // no stacking spam

  const colors = Array.isArray(opts.colors) && opts.colors.length ? opts.colors : GOLD;
  const count = kind === 'trophy' ? 44 : kind === 'win' ? 30 : 16;
  const spread = kind === 'seal' ? 120 : 240;
  const x = Number.isFinite(opts.x) ? opts.x : window.innerWidth / 2;
  const y = Number.isFinite(opts.y) ? opts.y : window.innerHeight * (kind === 'seal' ? 0.55 : 0.4);

  const layer = document.createElement('div');
  layer.className = `fx-layer fx-${kind}`;
  layer.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const power = spread * (0.45 + Math.random() * 0.55);
    const drift = (Math.random() - 0.5) * 60;
    p.className = `fx-p ${Math.random() < 0.3 ? 'fx-spark' : 'fx-bit'}`;
    p.style.setProperty('--fx-x', `${Math.cos(angle) * power + drift}px`);
    p.style.setProperty('--fx-y', `${Math.sin(angle) * power * 0.8 - spread * 0.35}px`);
    p.style.setProperty('--fx-r', `${Math.round((Math.random() - 0.5) * 540)}deg`);
    p.style.setProperty('--fx-d', `${Math.round(700 + Math.random() * 500)}ms`);
    p.style.setProperty('--fx-c', colors[i % colors.length]);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    layer.appendChild(p);
  }
  if (kind === 'trophy') {
    const glow = document.createElement('b');
    glow.className = 'fx-glow';
    glow.style.left = `${x}px`;
    glow.style.top = `${y}px`;
    layer.appendChild(glow);
  }

  document.body.appendChild(layer);
  window.setTimeout(() => { layer.remove(); }, 1500);
  return true;
}

/** Celebrate from a tapped element — burst rises from the control itself. */
export function celebrateFrom(el, kind = 'seal', opts = {}) {
  if (typeof document === 'undefined' || !el || !el.getBoundingClientRect) {
    return celebrate(kind, opts);
  }
  const r = el.getBoundingClientRect();
  return celebrate(kind, { ...opts, x: r.left + r.width / 2, y: r.top + r.height / 2 });
}
