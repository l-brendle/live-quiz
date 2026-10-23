"use client";

import type { CSSProperties, ReactNode } from "react";

export const OPTION_STYLES = [
  { color: "var(--red)", shape: "triangle" },
  { color: "var(--blue)", shape: "diamond" },
  { color: "var(--yellow)", shape: "circle" },
  { color: "var(--green)", shape: "square" },
] as const;

/** Styles for the two right-or-wrong buttons: [true, false]. */
export const TRUE_FALSE_STYLES = [
  { color: "var(--blue)", shape: "diamond" },
  { color: "var(--red)", shape: "triangle" },
] as const;

export function Shape({ shape, size = 28 }: { shape: string; size?: number }) {
  const s = { width: size, height: size, flex: "none" } as CSSProperties;
  const fill = "#fff";
  switch (shape) {
    case "triangle":
      return (
        <svg viewBox="0 0 32 32" style={s} aria-hidden>
          <path d="M16 3 30 28H2z" fill={fill} />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 32 32" style={s} aria-hidden>
          <path d="M16 1 31 16 16 31 1 16z" fill={fill} />
        </svg>
      );
    case "circle":
      return (
        <svg viewBox="0 0 32 32" style={s} aria-hidden>
          <circle cx="16" cy="16" r="14" fill={fill} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 32 32" style={s} aria-hidden>
          <rect x="3" y="3" width="26" height="26" fill={fill} />
        </svg>
      );
  }
}

export function Tile({
  color,
  shape,
  children,
  dim,
  correct,
  onClick,
  disabled,
  extra,
}: {
  color: string;
  shape: string;
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
      <Shape shape={shape} />
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
