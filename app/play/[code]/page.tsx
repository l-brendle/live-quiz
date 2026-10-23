"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Countdown, OPTION_STYLES, Shape, Spinner, TRUE_FALSE_STYLES } from "@/components/ui";
import { ApiError, api, playerIdKey, post, readStorage, usePoll, useServerNow, writeStorage } from "@/lib/client";
import type { PlayerView } from "@/lib/game";
import { type Messages, t } from "@/lib/i18n";
import { type AnswerValue, type Language, trueFalseLabel } from "@/lib/quiz";

const BOARD_DELAY_MS = 2000;

export default function Play() {
  const { code } = useParams<{ code: string }>();
  const [playerId, setPlayerId] = useState<string | null | undefined>(undefined);
  const [wasRemoved, setWasRemoved] = useState(false);
  // The game's language, known before joining so the join screen is translated.
  const [info, setInfo] = useState<{ lang: Language } | ApiError | null>(null);

  useEffect(() => setPlayerId(readStorage(playerIdKey(code))), [code]);
  useEffect(() => {
    api<{ lang: Language }>(`/api/games/${code}`)
      .then(setInfo)
      .catch((e) => setInfo(e instanceof ApiError ? e : null));
  }, [code]);

  const lang = info && !(info instanceof ApiError) ? info.lang : undefined;
  const m = t(lang);
  useEffect(() => {
    if (lang) document.documentElement.lang = lang;
  }, [lang]);

  if (info instanceof ApiError && info.status === 404) return <NotFound m={m} />;
  if (playerId === undefined || (!playerId && info === null)) return <Center><Spinner /></Center>;
  if (!playerId) {
    return (
      <Join
        code={code}
        m={m}
        notice={wasRemoved ? m.removed : null}
        onJoined={(id) => {
          writeStorage(playerIdKey(code), id);
          setWasRemoved(false);
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
      m={m}
      onRemoved={(wasPlaying) => {
        writeStorage(playerIdKey(code), null);
        setWasRemoved(wasPlaying);
        setPlayerId(null);
      }}
    />
  );
}

function Session({
  code,
  playerId,
  m,
  onRemoved,
}: {
  code: string;
  playerId: string;
  m: Messages;
  onRemoved: (wasPlaying: boolean) => void;
}) {
  const { data, error, clockOffset, refresh } = usePoll<PlayerView>(
    () => api<PlayerView>(`/api/games/${code}/player?pid=${encodeURIComponent(playerId)}`),
    (d) => (d?.phase === "question" ? 700 : 1200),
  );

  // The host removed us, or the stored id is from an older game: rejoin.
  const removed = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (removed) onRemoved(data !== null);
  }, [removed, data, onRemoved]);

  if (error instanceof ApiError && error.status === 404) return <NotFound m={m} />;
  if (!data || removed) {
    return <Center>{error && !removed ? <p className="error">{error.message}</p> : <Spinner />}</Center>;
  }
  return <Game code={code} playerId={playerId} data={data} m={t(data.lang)} clockOffset={clockOffset} refresh={refresh} />;
}

function Join({
  code,
  m,
  notice,
  onJoined,
}: {
  code: string;
  m: Messages;
  notice: string | null;
  onJoined: (id: string) => void;
}) {
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
        <p className="muted center">
          {m.gamePin} {code}
        </p>
        <input
          className="input input-big"
          placeholder={m.nickname}
          value={name}
          maxLength={20}
          autoFocus
          autoComplete="off"
          enterKeyHint="go"
          onChange={(e) => setName(e.target.value)}
          aria-label={m.nickname}
        />
        <button className="btn btn-dark" disabled={busy || !name.trim()}>
          {busy ? m.joining : m.okGo}
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
  m,
  clockOffset,
  refresh,
}: {
  code: string;
  playerId: string;
  data: PlayerView;
  m: Messages;
  clockOffset: number;
  refresh: () => void;
}) {
  const now = useServerNow(clockOffset);
  // Optimistic local answer so the UI locks immediately on tap.
  const [sent, setSent] = useState<{ index: number; value: AnswerValue } | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  // Index of the revealed question whose ranking is showing. The ranking
  // replaces the right/wrong screen 2 s after the reveal and stays until the
  // host moves on, which changes the phase or index.
  const [boardFor, setBoardFor] = useState<number | null>(null);
  const revealIndex = data.phase === "reveal" ? data.index : null;
  useEffect(() => {
    if (revealIndex === null) return;
    const t = setTimeout(() => setBoardFor(revealIndex), BOARD_DELAY_MS);
    return () => clearTimeout(t);
  }, [revealIndex]);

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
        <h2>{m.youreIn}</h2>
        <p>{m.seeNickname}</p>
        <Spinner />
        <p className="muted">{m.waitingForHost}</p>
      </Screen>
    );
  }

  if (data.phase === "finished") {
    const s = data.standing!;
    return (
      <Screen header={header}>
        <div className="big-emoji">{s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : "🎉"}</div>
        <h2>{m.finishedRank(s.rank, s.players)}</h2>
        <p>{m.correctOfTotal(s.correct, data.total)}</p>
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
          {m.done}
        </Link>
      </Screen>
    );
  }

  if (data.phase === "reveal" && boardFor === data.index && data.leaderboard) {
    const s = data.standing;
    const inTop = data.leaderboard.some((e) => e.id === playerId);
    return (
      <Screen header={header}>
        <h2>{m.ranking}</h2>
        <ol className="player-board">
          {data.leaderboard.map((e) => (
            <li key={e.id} className={e.id === playerId ? "me" : undefined}>
              <span className="lb-rank">{e.rank}</span>
              <span className="lb-name">{e.name}</span>
              <span className="lb-score">{e.correct} ✓</span>
            </li>
          ))}
        </ol>
        {s && !inTop && (
          <p className="standing">
            {m.standing(s.rank, s.players, s.correct)}
          </p>
        )}
        <p className="muted">{m.waitingNext}</p>
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
        <h2>{r?.correct ? m.correct : didAnswer ? m.notQuite : m.timesUp}</h2>
        {!r?.correct && r && (
          <p>
            {m.answer} <strong>{r.label}</strong>
          </p>
        )}
        {s && (
          <p className="standing">
            {m.standing(s.rank, s.players, s.correct)}
          </p>
        )}
        <p className="muted">{m.waitingNext}</p>
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
          <h2>{m.answerLocked}</h2>
          <p className="muted">{m.letsSee}</p>
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
                  <span>{trueFalseLabel(i === 0, data.lang)}</span>
                </button>
              ))}
            </div>
          )}
          {q.type === "text" && <TextAnswer m={m} onSubmit={answer} />}
          {answerError && <p className="error">{answerError}</p>}
        </div>
      )}
    </main>
  );
}

function TextAnswer({ m, onSubmit }: { m: Messages; onSubmit: (v: string) => void }) {
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
        placeholder={m.typeAnswer}
        value={value}
        maxLength={200}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        enterKeyHint="send"
        onChange={(e) => setValue(e.target.value)}
        aria-label={m.typeAnswer}
      />
      <button className="btn btn-dark" disabled={!value.trim()}>
        {m.submit}
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

function NotFound({ m }: { m: Messages }) {
  return (
    <Center>
      <div className="card stack">
        <h2>{m.gameNotFound}</h2>
        <p>{m.gameNotFoundHint}</p>
        <Link href="/" className="btn btn-dark">
          {m.back}
        </Link>
      </div>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="center-page">{children}</main>;
}
