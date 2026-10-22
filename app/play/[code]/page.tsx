"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Countdown, OPTION_STYLES, Shape, Spinner, TRUE_FALSE_STYLES } from "@/components/ui";
import { ApiError, api, playerIdKey, post, readStorage, usePoll, useServerNow, writeStorage } from "@/lib/client";
import type { PlayerView } from "@/lib/game";
import type { AnswerValue } from "@/lib/quiz";

export default function Play() {
  const { code } = useParams<{ code: string }>();
  const [playerId, setPlayerId] = useState<string | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setPlayerId(readStorage(playerIdKey(code))), [code]);

  if (playerId === undefined) return <Center><Spinner /></Center>;
  if (!playerId) {
    return (
      <Join
        code={code}
        notice={notice}
        onJoined={(id) => {
          writeStorage(playerIdKey(code), id);
          setNotice(null);
          setPlayerId(id);
        }}
      />
    );
  }
  return (
    <Session
      key={playerId}
      code={code}
      playerId={playerId}
      onRemoved={(wasPlaying) => {
        writeStorage(playerIdKey(code), null);
        setNotice(wasPlaying ? "You were removed from the game." : null);
        setPlayerId(null);
      }}
    />
  );
}

function Session({ code, playerId, onRemoved }: { code: string; playerId: string; onRemoved: (wasPlaying: boolean) => void }) {
  const { data, error, clockOffset, refresh } = usePoll<PlayerView>(
    () => api<PlayerView>(`/api/games/${code}/player?pid=${encodeURIComponent(playerId)}`),
    (d) => (d?.phase === "question" ? 700 : 1200),
  );

  // The host removed us, or the stored id is from an older game: rejoin.
  const removed = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (removed) onRemoved(data !== null);
  }, [removed, data, onRemoved]);

  if (error instanceof ApiError && error.status === 404) {
    return (
      <Center>
        <div className="card stack">
          <h2>Game not found</h2>
          <p>{error.message}</p>
          <Link href="/" className="btn btn-dark">Back</Link>
        </div>
      </Center>
    );
  }
  if (!data || removed) {
    return <Center>{error && !removed ? <p className="error">{error.message}</p> : <Spinner />}</Center>;
  }
  return <Game code={code} playerId={playerId} data={data} clockOffset={clockOffset} refresh={refresh} />;
}

function Join({ code, notice, onJoined }: { code: string; notice: string | null; onJoined: (id: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);
  return (
    <main className="center-page">
      <h1 className="logo">Live Quiz</h1>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const res = await post<{ playerId: string }>(`/api/games/${code}/join`, { name });
            onJoined(res.playerId);
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <p className="muted center">Game PIN {code}</p>
        <input
          className="input input-big"
          placeholder="Nickname"
          value={name}
          maxLength={20}
          autoFocus
          autoComplete="off"
          enterKeyHint="go"
          onChange={(e) => setName(e.target.value)}
          aria-label="Nickname"
        />
        <button className="btn btn-dark" disabled={busy || !name.trim()}>
          {busy ? "Joining…" : "OK, go!"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}

function Game({
  code,
  playerId,
  data,
  clockOffset,
  refresh,
}: {
  code: string;
  playerId: string;
  data: PlayerView;
  clockOffset: number;
  refresh: () => void;
}) {
  const now = useServerNow(clockOffset);
  // Optimistic local answer so the UI locks immediately on tap.
  const [sent, setSent] = useState<{ index: number; value: AnswerValue } | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const answer = async (value: AnswerValue) => {
    if (sent?.index === data.index) return;
    setSent({ index: data.index, value });
    setAnswerError(null);
    try {
      await post(`/api/games/${code}/answer`, { playerId, index: data.index, value });
    } catch (e) {
      setAnswerError((e as Error).message);
      if (!(e instanceof ApiError && e.status === 409)) setSent(null);
    } finally {
      refresh();
    }
  };

  const answered = data.myAnswer !== null || sent?.index === data.index;
  const header = (
    <header className="play-header">
      <span>{data.name}</span>
      {data.phase !== "lobby" && data.phase !== "finished" && (
        <span>
          {data.index + 1} / {data.total}
        </span>
      )}
    </header>
  );

  if (data.phase === "lobby") {
    return (
      <Screen header={header}>
        <h2>You&apos;re in!</h2>
        <p>See your nickname on screen?</p>
        <Spinner />
        <p className="muted">Waiting for the host to start…</p>
      </Screen>
    );
  }

  if (data.phase === "finished") {
    const s = data.standing!;
    return (
      <Screen header={header}>
        <div className="big-emoji">{s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : "🎉"}</div>
        <h2>
          You finished #{s.rank} of {s.players}
        </h2>
        <p>
          {s.correct} of {data.total} correct
        </p>
        {data.podium && data.podium.length > 0 && (
          <ol className="mini-podium">
            {data.podium.map((e) => (
              <li key={e.id}>
                <span>{e.rank}.</span> {e.name} <small>{e.correct} ✓</small>
              </li>
            ))}
          </ol>
        )}
        <Link href="/" className="btn btn-dark">
          Done
        </Link>
      </Screen>
    );
  }

  if (data.phase === "reveal") {
    const r = data.result;
    const s = data.standing;
    const didAnswer = data.myAnswer !== null;
    return (
      <Screen header={header} className={r?.correct ? "result-right" : "result-wrong"}>
        <div className="big-emoji">{r?.correct ? "✅" : didAnswer ? "❌" : "⌛"}</div>
        <h2>{r?.correct ? "Correct!" : didAnswer ? "Not quite" : "Time's up"}</h2>
        {!r?.correct && r && (
          <p>
            Answer: <strong>{r.label}</strong>
          </p>
        )}
        {s && (
          <p className="standing">
            You&apos;re <strong>#{s.rank}</strong> of {s.players} · {s.correct} correct
          </p>
        )}
        <p className="muted">Waiting for the next question…</p>
      </Screen>
    );
  }

  const q = data.question!;
  return (
    <main className="play">
      {header}
      <div className="play-question">
        <Countdown endsAt={data.endsAt} startedAt={data.startedAt} now={now} />
        <h2>{q.question}</h2>
      </div>
      {answered ? (
        <div className="screen-body">
          <Spinner />
          <h2>Answer locked in</h2>
          <p className="muted">Let&apos;s see if you got it…</p>
          {answerError && <p className="error">{answerError}</p>}
        </div>
      ) : (
        <div className="play-answers">
          {q.type === "choice" && (
            <div className="answer-grid">
              {q.options.map((opt, i) => (
                <button
                  key={i}
                  className="answer-btn"
                  style={{ background: OPTION_STYLES[i].color }}
                  onClick={() => answer(i)}
                >
                  <Shape shape={OPTION_STYLES[i].shape} size={36} />
                  <span>{opt}</span>
                </button>
              ))}
            </div>
          )}
          {q.type === "truefalse" && (
            <div className="answer-grid answer-grid-2">
              {TRUE_FALSE_STYLES.map((s, i) => (
                <button key={i} className="answer-btn" style={{ background: s.color }} onClick={() => answer(i === 0)}>
                  <Shape shape={s.shape} size={36} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}
          {q.type === "text" && <TextAnswer onSubmit={answer} />}
          {answerError && <p className="error">{answerError}</p>}
        </div>
      )}
    </main>
  );
}

function TextAnswer({ onSubmit }: { onSubmit: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="text-answer"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <input
        className="input input-big"
        placeholder="Type your answer"
        value={value}
        maxLength={200}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        enterKeyHint="send"
        onChange={(e) => setValue(e.target.value)}
        aria-label="Your answer"
      />
      <button className="btn btn-dark" disabled={!value.trim()}>
        Submit
      </button>
    </form>
  );
}

function Screen({ header, children, className }: { header: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <main className={`play ${className ?? ""}`}>
      {header}
      <div className="screen-body">{children}</div>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="center-page">{children}</main>;
}
