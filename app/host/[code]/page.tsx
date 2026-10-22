"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { Countdown, OPTION_STYLES, Spinner, TRUE_FALSE_STYLES, Tile } from "@/components/ui";
import { ApiError, api, formatSeconds, hostTokenKey, post, readStorage, usePoll, useServerNow } from "@/lib/client";
import type { HostView, LeaderboardEntry } from "@/lib/game";

export default function HostGame() {
  const { code } = useParams<{ code: string }>();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [joinUrl, setJoinUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(readStorage(hostTokenKey(code)));
    setJoinUrl(`${window.location.origin}/play/${code}`);
  }, [code]);

  const { data, error, clockOffset, refresh } = usePoll<HostView>(
    token ? () => api<HostView>(`/api/games/${code}/host`, { token }) : null,
    (d) => (d?.phase === "question" ? 700 : 1200),
  );
  const now = useServerNow(clockOffset);

  const act = async (body: Record<string, unknown>) => {
    if (!token) return;
    setBusy(true);
    try {
      await post(`/api/games/${code}/control`, body, token);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  if (token === undefined) return <Loading />;
  if (token === null || (error instanceof ApiError && error.status === 403)) {
    return (
      <Message title="Not your game">
        This browser didn&apos;t create game {code}. <Link href="/host">Create a new game</Link>.
      </Message>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <Message title="Game not found">
        Game {code} has expired. <Link href="/host">Create a new game</Link>.
      </Message>
    );
  }
  if (!data) return <Loading />;

  const timeUp = data.phase === "question" && now >= data.endsAt;

  return (
    <main className="host">
      <header className="host-header">
        <span className="logo logo-small">{data.title}</span>
        {data.phase !== "lobby" && data.phase !== "finished" && (
          <span className="pill">
            Question {data.index + 1} / {data.total}
          </span>
        )}
        <span className="pill">PIN {code}</span>
        <span className="pill">👤 {data.players.length}</span>
      </header>

      {!data.persistent && (
        <p className="banner">
          No Redis configured: game state lives in memory. Fine for local testing, but on Vercel connect Upstash Redis
          (see README).
        </p>
      )}
      {error && <p className="banner">Connection problem: {error.message}. Retrying…</p>}

      {data.phase === "lobby" && (
        <section className="lobby">
          <div className="lobby-join card">
            <p className="muted">Scan to join or go to</p>
            <p className="join-url">{joinUrl.replace(/^https?:\/\//, "")}</p>
            {joinUrl && (
              <div className="qr">
                <QRCodeSVG value={joinUrl} size={320} marginSize={2} />
              </div>
            )}
            <p className="pin">
              Game PIN: <strong>{code}</strong>
            </p>
          </div>
          <div className="lobby-players card stack">
            <div className="row spread">
              <h2>{data.players.length === 0 ? "Waiting for players…" : `${data.players.length} players`}</h2>
              <button className="btn btn-primary btn-large" disabled={busy} onClick={() => act({ action: "start" })}>
                Start ▶
              </button>
            </div>
            <ul className="chips">
              {data.players.map((p) => (
                <li key={p.id} className="chip">
                  {p.name}
                  <button
                    className="chip-x"
                    title={`Remove ${p.name}`}
                    onClick={() => confirm(`Remove ${p.name}?`) && act({ action: "kick", playerId: p.id })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {(data.phase === "question" || data.phase === "reveal") && data.question && (
        <section className="game">
          <div className="game-main">
            <h1 className="question-text">{data.question.question}</h1>
            <div className="game-status">
              {data.phase === "question" ? (
                <>
                  <Countdown endsAt={data.endsAt} startedAt={data.startedAt} now={now} />
                  <div className="answer-count">
                    <strong>{data.answerCount}</strong>
                    <span>/ {data.players.length} answers</span>
                  </div>
                  <button
                    className="btn btn-ghost"
                    disabled={busy || timeUp}
                    onClick={() => act({ action: "skip", index: data.index })}
                  >
                    Stop timer
                  </button>
                </>
              ) : (
                <>
                  <div className="answer-count">
                    <strong>{data.reveal?.correctCount ?? 0}</strong>
                    <span>/ {data.answerCount} correct</span>
                  </div>
                  <button
                    className="btn btn-primary btn-large"
                    disabled={busy}
                    onClick={() => act({ action: "next", index: data.index })}
                  >
                    {data.index + 1 < data.total ? "Next question ▶" : "Final results 🏆"}
                  </button>
                </>
              )}
            </div>
            <HostAnswers data={data} />
          </div>
          <aside className="game-side stack">
            <Leaderboard entries={data.leaderboard} limit={10} />
            {joinUrl && (
              <div className="late-join">
                <QRCodeSVG value={joinUrl} size={96} marginSize={1} />
                <span>
                  Join late?
                  <br />
                  PIN <strong>{code}</strong>
                </span>
              </div>
            )}
          </aside>
        </section>
      )}

      {data.phase === "finished" && (
        <section className="finished stack">
          <h1>🏆 Final results</h1>
          <Podium entries={data.leaderboard} />
          <div className="finished-board">
            <Leaderboard entries={data.leaderboard} />
          </div>
          <Link href="/host" className="btn btn-primary">
            New quiz
          </Link>
        </section>
      )}

      {data.phase !== "finished" && data.phase !== "lobby" && (
        <footer className="host-footer">
          <button
            className="btn btn-ghost btn-small"
            onClick={() => confirm("End the game now and show final results?") && act({ action: "end" })}
          >
            End game
          </button>
        </footer>
      )}
    </main>
  );
}

function HostAnswers({ data }: { data: HostView }) {
  const q = data.question!;
  const reveal = data.reveal;
  if (q.type === "text") {
    return (
      <div className="text-reveal">
        {reveal ? (
          <>
            <span className="muted">Correct answer</span>
            <strong>{reveal.label}</strong>
          </>
        ) : (
          <span className="muted">✍️ Players type their answer</span>
        )}
      </div>
    );
  }
  const items =
    q.type === "choice"
      ? q.options.map((label, i) => ({ label, ...OPTION_STYLES[i], value: i as number | boolean }))
      : TRUE_FALSE_STYLES.map((s, i) => ({ ...s, value: i === 0 }));
  return (
    <div className={`tiles ${q.type === "truefalse" ? "tiles-2" : ""}`}>
      {items.map((it, i) => {
        const isRight = reveal ? reveal.answer === it.value : false;
        return (
          <Tile
            key={i}
            color={it.color}
            shape={it.shape}
            dim={!!reveal && !isRight}
            correct={isRight}
            extra={reveal?.distribution && <span className="tile-count">{reveal.distribution[i]}</span>}
          >
            {it.label}
          </Tile>
        );
      })}
    </div>
  );
}

function Leaderboard({ entries, limit }: { entries: LeaderboardEntry[]; limit?: number }) {
  const shown = limit ? entries.slice(0, limit) : entries;
  return (
    <div className="card leaderboard">
      <h2>Ranking</h2>
      {entries.length === 0 && <p className="muted">No players yet</p>}
      <ol>
        {shown.map((e) => (
          <li key={e.id}>
            <span className="lb-rank">{e.rank}</span>
            <span className="lb-name">{e.name}</span>
            <span className="lb-score">
              {e.correct} ✓<small>{e.correct > 0 ? formatSeconds(e.timeMs) : ""}</small>
            </span>
          </li>
        ))}
      </ol>
      {limit && entries.length > limit && <p className="muted">+ {entries.length - limit} more</p>}
    </div>
  );
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const [first, second, third] = entries;
  const place = (e: LeaderboardEntry | undefined, cls: string, medal: string) =>
    e && (
      <div className={`podium-place ${cls}`}>
        <span className="podium-name">{e.name}</span>
        <div className="podium-block">
          <span className="podium-medal">{medal}</span>
          <span>{e.correct} correct</span>
          {e.correct > 0 && <small>{formatSeconds(e.timeMs)}</small>}
        </div>
      </div>
    );
  return (
    <div className="podium">
      {place(second, "second", "🥈")}
      {place(first, "first", "🥇")}
      {place(third, "third", "🥉")}
    </div>
  );
}

function Loading() {
  return (
    <main className="center-page">
      <Spinner />
    </main>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="center-page">
      <div className="card stack">
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </main>
  );
}
