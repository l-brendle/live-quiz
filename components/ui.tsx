"use client";

import type { CSSProperties, ReactNode } from "react";

export const OPTION_STYLES = [
  { color: "var(--opt-a)", mark: "A" },
  { color: "var(--opt-b)", mark: "B" },
  { color: "var(--opt-c)", mark: "C" },
  { color: "var(--opt-d)", mark: "D" },
] as const;

/** Styles for the two right-or-wrong buttons: [true, false]. */
export const TRUE_FALSE_STYLES = [
  { color: "var(--opt-d)", mark: "✓" },
  { color: "var(--opt-b)", mark: "✗" },
] as const;

/** Round badge with the option letter (or check/cross) shown on answer tiles. */
export function Badge({ mark, size = 40 }: { mark: string; size?: number }) {
  return (
    <span className="badge" style={{ width: size, height: size, fontSize: size * 0.5 } as CSSProperties} aria-hidden>
      {mark}
    </span>
  );
}

export function Tile({
  color,
  mark,
  children,
  dim,
  correct,
  onClick,
  disabled,
  extra,
}: {
  color: string;
  mark: string;
  children: ReactNode;
  dim?: boolean;
  correct?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  extra?: ReactNode;
}) {
  const className = `tile${dim ? " tile-dim" : ""}${onClick ? " tile-button" : ""}`;
  const content = (
    <>
      <Badge mark={mark} />
      <span className="tile-text">{children}</span>
      {correct && <span className="tile-check" aria-label="correct">✓</span>}
      {extra}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className} style={{ background: color }} onClick={onClick} disabled={disabled}>
        {content}
      </button>
    );
  }
  return (
    <div className={className} style={{ background: color }}>
      {content}
    </div>
  );
}

export function Countdown({ endsAt, startedAt, now }: { endsAt: number; startedAt: number; now: number }) {
  const remaining = Math.max(0, endsAt - now);
  const total = Math.max(1, endsAt - startedAt);
  const pct = Math.min(1, remaining / total);
  return (
    <div className="countdown" role="timer" aria-label={`${Math.ceil(remaining / 1000)} seconds left`}>
      <svg viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="16" className="countdown-track" />
        <circle
          cx="18"
          cy="18"
          r="16"
          className="countdown-bar"
          strokeDasharray={`${pct * 100.53} 100.53`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span>{Math.ceil(remaining / 1000)}</span>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}
