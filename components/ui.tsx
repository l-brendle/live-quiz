"use client";

import type { CSSProperties, ReactNode } from "react";

export const OPTION_STYLES = [
  { color: "var(--opt-a)", mark: "star" },
  { color: "var(--opt-b)", mark: "heart" },
  { color: "var(--opt-c)", mark: "moon" },
  { color: "var(--opt-d)", mark: "bolt" },
] as const;

/** Styles for the two right-or-wrong buttons: [true, false]. */
export const TRUE_FALSE_STYLES = [
  { color: "var(--opt-d)", mark: "check" },
  { color: "var(--opt-b)", mark: "cross" },
] as const;

const ICONS: Record<string, ReactNode> = {
  star: <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />,
  heart: <path d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 3 5 6.6 5c2.1 0 3.5 1.1 4.4 2.5.9-1.4 2.3-2.5 4.4-2.5C19 5 21 8.6 19.6 11.8 17.5 16.4 12 21 12 21z" />,
  moon: <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z" />,
  bolt: <path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z" />,
  check: <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />,
  cross: <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />,
};

/** Round badge with the option's symbol, shown on answer tiles. */
export function Badge({ mark, size = 40 }: { mark: string; size?: number }) {
  return (
    <span className="badge" style={{ width: size, height: size } as CSSProperties} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor">
        {ICONS[mark]}
      </svg>
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
