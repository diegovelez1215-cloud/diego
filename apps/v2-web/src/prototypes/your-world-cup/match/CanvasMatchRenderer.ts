import type { Tactics } from '../campaign/contracts';

export type Point = Readonly<{ x: number; y: number }>;
export type RendererTeam = Readonly<{ id: string; name: string; code: string; color: string; rating: number }>;
export type MatchPresentationSource = Readonly<{ seed: number; home: RendererTeam; away: RendererTeam; tactics: Tactics }>;
export type MatchHitTarget = Readonly<{ id: string; teamId: string; label: string; point: Point }>;
export type MatchSemantic = Readonly<{
  phase: 'playing' | 'take-control' | 'returning' | 'full-time'; minute: number; second: number; homeGoals: number; awayGoals: number;
  headline: string; controlReady: boolean; openTargets: readonly MatchHitTarget[]; shotReady: boolean; event: string;
}>;

type Player = { id: string; teamId: string; label: string; shirt: number; prev: Point; current: Point; target: Point; velocity: Point; facing: number; role: 'gk' | 'def' | 'mid' | 'att'; active: boolean };
type Ball = { prev: Point; current: Point; velocity: Point; height: number; owner: string | null; flight: 'owned' | 'pass' | 'shot' | 'net' };
type Camera = { prev: Point; current: Point; target: Point; zoom: number; targetZoom: number };
type QueuedInput = { type: 'pass'; target: string } | { type: 'shoot'; zone: 'left' | 'center' | 'right' } | null;
type PerformanceMetrics = { frames: number; frameIntervals: number[]; updateDurations: number[]; renderDurations: number[]; semanticCommits: number; dpr: number; canvas: { width: number; height: number } };

const STEP = 1 / 30;
const PITCH = { w: 100, h: 140 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const hash = (text: string) => [...text].reduce((total, char) => Math.imul(total ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);

function formation(team: RendererTeam, direction: 1 | -1): Player[] {
  const anchors: readonly [number, number, Player['role'], string][] = [
    [50, 9, 'gk', 'GK'], [15, 27, 'def', 'LB'], [38, 24, 'def', 'LCB'], [62, 24, 'def', 'RCB'], [85, 27, 'def', 'RB'],
    [50, 43, 'mid', 'DM'], [31, 57, 'mid', 'LCM'], [69, 57, 'mid', 'RCM'], [15, 79, 'att', 'LW'], [50, 89, 'att', 'ST'], [85, 79, 'att', 'RW'],
  ];
  return anchors.map(([x, y, role, label], index) => {
    const point = { x, y: direction === 1 ? y : PITCH.h - y };
    return { id: `${team.id}-${index}`, teamId: team.id, label, shirt: index + 1, prev: { ...point }, current: { ...point }, target: { ...point }, velocity: { x: 0, y: 0 }, facing: direction === 1 ? 0 : Math.PI, role, active: false };
  });
}

/** Canvas-only match presentation. It owns the active simulation and has exactly one rAF loop. */
export class CanvasMatchRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private source: MatchPresentationSource | null = null;
  private players: Player[] = [];
  private ball: Ball = { prev: { x: 50, y: 70 }, current: { x: 50, y: 70 }, velocity: { x: 0, y: 0 }, height: 0, owner: null, flight: 'owned' };
  private camera: Camera = { prev: { x: 50, y: 70 }, current: { x: 50, y: 70 }, target: { x: 50, y: 70 }, zoom: 1, targetZoom: 1 };
  private running = false; private raf = 0; private last = 0; private accumulator = 0; private virtualSeconds = 0; private speed: 1 | 2 | 4 = 1;
  private reducedMotion = false; private phase: MatchSemantic['phase'] = 'playing'; private queuedInput: QueuedInput = null; private controlPasses = 0; private controlDeadline = 0; private controlSeen = false;
  private score = { home: 0, away: 0 }; private lastEmit = -Infinity; private event = 'Kickoff. Both teams settle into shape.'; private onSemantic: ((value: MatchSemantic) => void) | null = null; private onFinish: ((score: { homeGoals: number; awayGoals: number }) => void) | null = null;
  private resizeObserver: ResizeObserver | null = null; private dpr = 1; private pointer = (event: PointerEvent) => this.consumePointer(event);
  private metrics: PerformanceMetrics = { frames: 0, frameIntervals: [], updateDurations: [], renderDurations: [], semanticCommits: 0, dpr: 1, canvas: { width: 0, height: 0 } };

  mount(canvas: HTMLCanvasElement) {
    this.destroy(); this.canvas = canvas; this.ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerup', this.pointer);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas); this.resize(); this.draw(0);
  }
  setMatch(source: MatchPresentationSource) {
    this.source = source; this.players = [...formation(source.home, 1), ...formation(source.away, -1)];
    const owner = this.players.find((player) => player.teamId === source.home.id && player.label === 'DM')!;
    this.ball = { prev: { ...owner.current }, current: { ...owner.current }, velocity: { x: 0, y: 0 }, height: 0, owner: owner.id, flight: 'owned' };
    this.camera = { prev: { x: 50, y: 70 }, current: { x: 50, y: 70 }, target: { x: 50, y: 70 }, zoom: 1, targetZoom: 1 }; this.virtualSeconds = 0; this.score = { home: 0, away: 0 }; this.phase = 'playing'; this.queuedInput = null; this.controlPasses = 0; this.controlSeen = false; this.event = 'Kickoff. Both teams settle into shape.'; this.emit(true);
  }
  setCallbacks(callbacks: { onSemantic?: (value: MatchSemantic) => void; onFinish?: (score: { homeGoals: number; awayGoals: number }) => void }) { this.onSemantic = callbacks.onSemantic ?? null; this.onFinish = callbacks.onFinish ?? null; }
  start() { if (!this.canvas || !this.source || this.running) return; this.running = true; this.last = performance.now(); (window as typeof window & { __ywcCanvasMetrics?: PerformanceMetrics }).__ywcCanvasMetrics = this.metrics; this.raf = requestAnimationFrame(this.loop); }
  pause() { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  destroy() { this.pause(); this.resizeObserver?.disconnect(); this.resizeObserver = null; this.canvas?.removeEventListener('pointerup', this.pointer); this.canvas = null; this.ctx = null; }
  setSpeed(speed: 1 | 2 | 4) { this.speed = speed; }
  setReducedMotion(value: boolean) { this.reducedMotion = value; if (value) { this.camera.current = { ...this.camera.target }; this.camera.prev = { ...this.camera.target }; this.camera.zoom = this.camera.targetZoom; } }
  requestPass(target: string) { if (this.phase === 'take-control') this.queuedInput = { type: 'pass', target }; }
  requestShot(zone: 'left' | 'center' | 'right') { if (this.phase === 'take-control' && this.controlPasses > 0) this.queuedInput = { type: 'shoot', zone }; }
  hitTest(point: Point): MatchHitTarget | null {
    if (this.phase !== 'take-control' || !this.source) return null;
    const target = this.openTargets().find((candidate) => distance(candidate.point, point) < 7);
    return target ?? null;
  }
  snapshot(): MatchSemantic { return this.semantic(); }
  private loop = (timestamp: number) => {
    if (!this.running) return;
    const interval = timestamp - this.last; const delta = Math.min(.18, Math.max(0, interval / 1000)); this.last = timestamp; this.accumulator += delta; this.record(this.metrics.frameIntervals, interval); this.metrics.frames++;
    const updateStart = performance.now(); while (this.accumulator >= STEP) { this.update(STEP); this.accumulator -= STEP; } this.record(this.metrics.updateDurations, performance.now() - updateStart);
    const renderStart = performance.now(); this.draw(this.accumulator / STEP); this.record(this.metrics.renderDurations, performance.now() - renderStart); this.raf = requestAnimationFrame(this.loop);
  };
  private update(dt: number) {
    if (!this.source) return;
    if (document.visibilityState === 'hidden') { this.last = performance.now(); return; }
    for (const player of this.players) player.prev = { ...player.current };
    this.ball.prev = { ...this.ball.current }; this.camera.prev = { ...this.camera.current };
    if (this.phase === 'take-control') { this.updateControl(dt); this.updateCamera(dt); return; }
    if (this.phase === 'returning') { this.virtualSeconds += dt * 420 * this.speed; if (this.virtualSeconds >= this.controlDeadline) { this.phase = 'playing'; this.event = 'Returning to match. Nigeria restart from the center.'; } this.updateMovement(dt); this.updateCamera(dt); this.emit(); return; }
    if (this.phase === 'full-time') return;
    this.virtualSeconds += dt * 420 * this.speed;
    if (!this.controlSeen && this.virtualSeconds >= 68 * 60 + 14) { this.controlSeen = true; this.phase = 'take-control'; this.event = `${this.source.home.name} attack. Create the chance.`; this.controlDeadline = this.virtualSeconds + 12; this.emit(true); return; }
    this.updateMovement(dt); this.updateCamera(dt);
    const minute = Math.floor(this.virtualSeconds / 60);
    if (minute === 15 && this.score.home + this.score.away === 0 && hash(`${this.source.seed}:early`) % 2 === 0) { this.score.home = 1; this.event = `${this.source.home.code} finish a low cutback. Goal confirmed.`; }
    if (minute === 52 && this.score.home + this.score.away < 2 && hash(`${this.source.seed}:reply`) % 3 === 0) { this.score.away = 1; this.event = `${this.source.away.code} level after a switch and cross.`; }
    if (this.virtualSeconds >= 93 * 60) { this.phase = 'full-time'; this.event = 'Full time. The result is pinned to the campaign wall.'; this.emit(true); this.onFinish?.({ homeGoals: this.score.home, awayGoals: this.score.away }); return; }
    this.emit();
  }
  private updateControl(dt: number) {
    if (this.queuedInput) {
      const input = this.queuedInput; this.queuedInput = null;
      if (input.type === 'pass') {
        const target = this.players.find((player) => player.id === input.target && player.teamId === this.source!.home.id);
        if (target) { this.ball.owner = target.id; this.ball.current = { ...target.current }; this.ball.prev = { ...target.current }; this.controlPasses++; this.event = `${target.label} receives on the move. The lane opens.`; }
      } else {
        const goal = input.zone !== 'center' || hash(`${this.source!.seed}:${this.controlPasses}`) % 2 === 0;
        this.ball.owner = null; this.ball.flight = goal ? 'net' : 'shot'; this.ball.current = { x: input.zone === 'left' ? 42 : input.zone === 'right' ? 58 : 50, y: 3 }; this.ball.prev = { ...this.ball.current };
        if (goal) { do { this.score.home++; } while (this.score.home <= this.score.away); this.event = 'GOAL. The ball crosses the line and settles in the net.'; } else this.event = 'Saved. The keeper holds at the near post.';
        this.phase = 'returning'; this.controlDeadline = this.virtualSeconds + 18; this.emit(true); return;
      }
      this.emit(true);
    }
    this.updateMovement(dt, true); this.updateCamera(dt);
  }
  private updateMovement(dt: number, control = false) {
    if (!this.source) return; const carrier = this.players.find((player) => player.id === this.ball.owner) ?? this.players[5]; const attackDirection = carrier.teamId === this.source.home.id ? 1 : -1;
    for (const player of this.players) {
      const isHome = player.teamId === this.source.home.id; const teamDirection = isHome ? 1 : -1; const baseY = teamDirection === 1 ? player.role === 'gk' ? 9 : player.current.y : player.role === 'gk' ? 131 : player.current.y;
      const compact = carrier.teamId === player.teamId ? .16 : -.11; const lane = (player.shirt % 3 - 1) * 1.5;
      const anchor = this.formationAnchor(player, teamDirection); const target = { x: clamp(anchor.x + (carrier.current.x - 50) * compact + lane, 5, 95), y: clamp(anchor.y + (carrier.current.y - 70) * compact + (player.role === 'att' ? attackDirection * 4 : 0), 5, 135) };
      player.target = target; const dx = target.x - player.current.x; const dy = target.y - player.current.y; const length = Math.max(.001, Math.hypot(dx, dy));
      const max = player.role === 'att' ? 17 : player.role === 'mid' ? 14 : 12; const desired = { x: dx / length * Math.min(max, length * 4), y: dy / length * Math.min(max, length * 4) };
      player.velocity = { x: lerp(player.velocity.x, desired.x, .16), y: lerp(player.velocity.y, desired.y, .16) }; player.current = { x: clamp(player.current.x + player.velocity.x * dt, 3, 97), y: clamp(player.current.y + player.velocity.y * dt, 3, 137) }; player.facing = Math.atan2(player.velocity.y || teamDirection, player.velocity.x || .01);
    }
    if (this.ball.owner) { const owner = this.players.find((player) => player.id === this.ball.owner)!; this.ball.current = { x: owner.current.x + Math.cos(owner.facing) * 1.8, y: owner.current.y + Math.sin(owner.facing) * 1.8 }; this.ball.flight = 'owned'; }
    if (!control && this.virtualSeconds % 27 < 1.4) { const teammate = this.players.filter((player) => player.teamId === carrier.teamId && player.id !== carrier.id).sort((a, b) => distance(a.current, carrier.current) - distance(b.current, carrier.current))[0]; if (teammate) { this.ball.owner = teammate.id; this.event = `${carrier.label} finds ${teammate.label}; the shape moves with the ball.`; } }
  }
  private formationAnchor(player: Player, direction: 1 | -1): Point {
    const rows: Record<Player['role'], number> = { gk: 9, def: 27, mid: 56, att: 88 }; const offsets: Record<number, number> = { 1: 50, 2: 15, 3: 38, 4: 62, 5: 85, 6: 50, 7: 31, 8: 69, 9: 15, 10: 50, 11: 85 };
    const y = rows[player.role]; return { x: offsets[player.shirt] ?? 50, y: direction === 1 ? y : PITCH.h - y };
  }
  private updateCamera(dt: number) { const focus = this.ball.current; this.camera.target = { x: clamp(focus.x, 30, 70), y: clamp(focus.y, 30, 110) }; this.camera.targetZoom = this.phase === 'take-control' ? 1.16 : this.ball.flight === 'net' ? 1.2 : 1; if (this.reducedMotion) { this.camera.current = { ...this.camera.target }; this.camera.zoom = this.camera.targetZoom; return; } this.camera.current = { x: lerp(this.camera.current.x, this.camera.target.x, Math.min(1, dt * 3.8)), y: lerp(this.camera.current.y, this.camera.target.y, Math.min(1, dt * 3.8)) }; this.camera.zoom = lerp(this.camera.zoom, this.camera.targetZoom, Math.min(1, dt * 3.6)); }
  private openTargets() { if (!this.source) return [] as MatchHitTarget[]; const owner = this.players.find((player) => player.id === this.ball.owner); return this.players.filter((player) => player.teamId === this.source!.home.id && player.id !== owner?.id && player.role !== 'gk').slice(0, 4).map((player) => ({ id: player.id, teamId: player.teamId, label: player.label, point: player.current })); }
  private semantic(): MatchSemantic { const minute = Math.min(93, Math.floor(this.virtualSeconds / 60)); const second = Math.min(59, Math.floor(this.virtualSeconds % 60)); return { phase: this.phase, minute, second, homeGoals: this.score.home, awayGoals: this.score.away, headline: this.phase === 'take-control' ? `TAKE CONTROL · ${this.source?.home.code ?? ''} ATTACK` : this.event, controlReady: this.phase === 'take-control', openTargets: this.openTargets(), shotReady: this.phase === 'take-control' && this.controlPasses > 0, event: this.event }; }
  private emit(force = false) { const now = performance.now(); if (force || now - this.lastEmit > 420) { this.lastEmit = now; this.metrics.semanticCommits++; this.onSemantic?.(this.semantic()); } }
  private resize() { if (!this.canvas || !this.ctx) return; const rect = this.canvas.getBoundingClientRect(); this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1)); this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr)); this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr)); this.metrics.dpr = this.dpr; this.metrics.canvas = { width: this.canvas.width, height: this.canvas.height }; this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
  private consumePointer(event: PointerEvent) { if (!this.canvas || this.phase !== 'take-control') return; const rect = this.canvas.getBoundingClientRect(); const scale = Math.min(rect.width / 100, rect.height / 140) * this.camera.zoom; const point = { x: (event.clientX - rect.left - (rect.width / 2 - this.camera.current.x * scale)) / scale, y: (event.clientY - rect.top - (rect.height / 2 - this.camera.current.y * scale)) / scale }; const target = this.hitTest(point); if (target) this.requestPass(target.id); }
  private record(list: number[], value: number) { list.push(value); if (list.length > 240) list.shift(); }
  private draw(alpha: number) {
    const canvas = this.canvas; const ctx = this.ctx; if (!canvas || !ctx) return; const width = canvas.clientWidth; const height = canvas.clientHeight; if (!width || !height) return;
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#07111F'; ctx.fillRect(0, 0, width, height);
    const scale = Math.min(width / 100, height / 140) * this.camera.zoom; const ox = width / 2 - lerp(this.camera.prev.x, this.camera.current.x, alpha) * scale; const oy = height / 2 - lerp(this.camera.prev.y, this.camera.current.y, alpha) * scale;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale); ctx.fillStyle = '#167A53'; ctx.fillRect(0, 0, 100, 140); ctx.strokeStyle = 'rgba(244,241,232,.78)'; ctx.lineWidth = .55; ctx.strokeRect(3, 3, 94, 134); ctx.beginPath(); ctx.moveTo(3, 70); ctx.lineTo(97, 70); ctx.stroke(); ctx.beginPath(); ctx.arc(50, 70, 12, 0, Math.PI * 2); ctx.stroke(); ctx.strokeRect(36, 3, 28, 18); ctx.strokeRect(36, 119, 28, 18); ctx.strokeRect(43, 0, 14, 3); ctx.strokeRect(43, 137, 14, 3);
    for (const player of this.players) { const point = { x: lerp(player.prev.x, player.current.x, alpha), y: lerp(player.prev.y, player.current.y, alpha) }; ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(player.facing); ctx.fillStyle = player.teamId === this.source?.home.id ? this.source.home.color : this.source!.away.color; ctx.globalAlpha = this.phase === 'take-control' && player.teamId !== this.source?.home.id ? .38 : 1; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#F4F1E8'; ctx.font = '2.3px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(player.shirt), 0, .1); if (this.phase === 'take-control' && player.teamId === this.source?.home.id && player.role !== 'gk') { ctx.strokeStyle = 'rgba(244,241,232,.78)'; ctx.lineWidth = .5; ctx.beginPath(); ctx.arc(0, 0, 4.1, 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); }
    const ball = { x: lerp(this.ball.prev.x, this.ball.current.x, alpha), y: lerp(this.ball.prev.y, this.ball.current.y, alpha) }; ctx.fillStyle = '#F4F1E8'; ctx.beginPath(); ctx.arc(ball.x, ball.y - this.ball.height, 1.25, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}
