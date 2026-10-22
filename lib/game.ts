import { randomBytes, randomInt } from "node:crypto";
import { getStore } from "./store";
import {
  AnswerValue,
  PublicQuestion,
  Question,
  Quiz,
  correctAnswerLabel,
  isCorrect,
  isValidAnswer,
  normalizeText,
  toPublicQuestion,
} from "./quiz";

// Server-side game logic. Game state is split across several keys so that
// concurrent player writes (joins, answers) never race with each other or
// with the host: only the host ever rewrites the main state document, and
// per-player data lives in hash fields written atomically.

const TTL = 60 * 60 * 12; // games live for 12 hours
const ANSWER_GRACE_MS = 1000; // network latency allowance after the timer ends

type StoredPhase = "lobby" | "question" | "finished";
export type Phase = StoredPhase | "reveal";

type GameState = {
  code: string;
  hostToken: string;
  quiz: Quiz;
  phase: StoredPhase;
  index: number; // current question index (-1 in lobby)
  startedAt: number; // when the current question opened (server ms)
  endsAt: number; // when the current question closes (server ms)
  createdAt: number;
};

type Player = { name: string; joinedAt: number };
type Answer = { value: AnswerValue; ms: number; correct: boolean };

export type LeaderboardEntry = {
  id: string;
  name: string;
  correct: number;
  timeMs: number; // total time spent on correctly answered questions
  rank: number;
};

const k = {
  state: (c: string) => `quiz:${c}:state`,
  players: (c: string) => `quiz:${c}:players`,
  names: (c: string) => `quiz:${c}:names`,
  answers: (c: string, i: number) => `quiz:${c}:answers:${i}`,
  correct: (c: string) => `quiz:${c}:correct`,
  time: (c: string) => `quiz:${c}:time`,
  closed: (c: string, i: number) => `quiz:${c}:closed:${i}`,
};

export class GameError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const store = () => getStore();

export function isPersistentStore() {
  return store().persistent;
}

async function loadState(code: string): Promise<GameState> {
  const state = await store().get<GameState>(k.state(code));
  if (!state) throw new GameError("Game not found. Check the code or ask the host for a new one.", 404);
  return state;
}

async function saveState(state: GameState) {
  await store().set(k.state(state.code), state, { ttl: TTL });
}

async function isClosed(state: GameState): Promise<boolean> {
  if (state.phase !== "question") return false;
  return (await store().get(k.closed(state.code, state.index))) !== null;
}

function derivePhase(state: GameState, closed: boolean, now: number): Phase {
  if (state.phase === "question" && (closed || now >= state.endsAt)) return "reveal";
  return state.phase;
}

async function hsetWithTtl(key: string, field: string, value: unknown) {
  await store().hset(key, field, value);
  await store().expire(key, TTL);
}

// ---------------------------------------------------------------------------
// Host actions

export async function createGame(quiz: Quiz): Promise<{ code: string; hostToken: string }> {
  const hostToken = randomBytes(18).toString("base64url");
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(randomInt(100000, 1000000));
    const state: GameState = {
      code,
      hostToken,
      quiz,
      phase: "lobby",
      index: -1,
      startedAt: 0,
      endsAt: 0,
      createdAt: Date.now(),
    };
    if (await store().set(k.state(code), state, { ttl: TTL, nx: true })) return { code, hostToken };
  }
  throw new GameError("Could not allocate a game code, please try again.", 503);
}

async function loadHostState(code: string, token: string | null): Promise<GameState> {
  const state = await loadState(code);
  if (!token || token !== state.hostToken) throw new GameError("Not authorized to host this game.", 403);
  return state;
}

export type ControlAction =
  | { action: "start" }
  | { action: "next"; index: number }
  | { action: "skip"; index: number }
  | { action: "end" }
  | { action: "kick"; playerId: string };

export async function control(code: string, token: string | null, cmd: ControlAction) {
  const state = await loadHostState(code, token);
  const now = Date.now();
  const openQuestion = (index: number) => {
    const q = state.quiz.questions[index];
    state.phase = "question";
    state.index = index;
    state.startedAt = now;
    state.endsAt = now + q.time * 1000;
  };

  switch (cmd.action) {
    case "start":
      if (state.phase !== "lobby") throw new GameError("The game has already started.");
      openQuestion(0);
      break;
    case "next":
      // The index guards against double clicks skipping a question.
      if (state.phase !== "question" || cmd.index !== state.index) return;
      if (state.index + 1 < state.quiz.questions.length) openQuestion(state.index + 1);
      else state.phase = "finished";
      break;
    case "skip":
      if (state.phase === "question" && cmd.index === state.index) {
        await store().set(k.closed(code, state.index), 1, { ttl: TTL });
      }
      return;
    case "end":
      state.phase = "finished";
      break;
    case "kick": {
      const player = await store().hget<Player>(k.players(code), cmd.playerId);
      if (!player) return;
      await store().hdel(k.players(code), cmd.playerId);
      await store().hdel(k.names(code), normalizeText(player.name));
      return;
    }
    default:
      throw new GameError("Unknown action.");
  }
  await saveState(state);
}

export type HostView = {
  code: string;
  title: string;
  phase: Phase;
  index: number;
  total: number;
  question: PublicQuestion | null;
  /** Only present once the question is revealed. */
  reveal: { answer: number | boolean | null; label: string; distribution: number[] | null; correctCount: number } | null;
  startedAt: number;
  endsAt: number;
  now: number;
  answerCount: number;
  players: { id: string; name: string }[];
  leaderboard: LeaderboardEntry[];
  persistent: boolean;
};

export async function hostView(code: string, token: string | null): Promise<HostView> {
  const state = await loadHostState(code, token);
  const now = Date.now();
  const s = store();
  const inQuestion = state.phase === "question";
  const [closed, players, answers, correct, time] = await Promise.all([
    isClosed(state),
    s.hgetall<Player>(k.players(code)),
    inQuestion ? s.hgetall<Answer>(k.answers(code, state.index)) : Promise.resolve({} as Record<string, Answer>),
    s.hgetall<number>(k.correct(code)),
    s.hgetall<number>(k.time(code)),
  ]);
  const phase = derivePhase(state, closed, now);
  const question = state.index >= 0 && state.phase !== "finished" ? state.quiz.questions[state.index] : null;

  let reveal: HostView["reveal"] = null;
  if (phase === "reveal" && question) {
    const list = Object.values(answers);
    reveal = {
      answer: question.type === "text" ? null : question.answer,
      label: correctAnswerLabel(question),
      distribution: distribution(question, list),
      correctCount: list.filter((a) => a.correct).length,
    };
  }

  return {
    code,
    title: state.quiz.title,
    phase,
    index: state.index,
    total: state.quiz.questions.length,
    question: question ? toPublicQuestion(question) : null,
    reveal,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    now,
    answerCount: Object.keys(answers).length,
    players: Object.entries(players)
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
      .map(([id, p]) => ({ id, name: p.name })),
    leaderboard: leaderboard(players, correct, time),
    persistent: s.persistent,
  };
}

function distribution(q: Question, answers: Answer[]): number[] | null {
  if (q.type === "choice") {
    const counts = q.options.map(() => 0);
    for (const a of answers) if (typeof a.value === "number") counts[a.value]++;
    return counts;
  }
  if (q.type === "truefalse") {
    const counts = [0, 0]; // [true, false]
    for (const a of answers) counts[a.value === true ? 0 : 1]++;
    return counts;
  }
  return null;
}

export function leaderboard(
  players: Record<string, Player>,
  correct: Record<string, number>,
  time: Record<string, number>,
): LeaderboardEntry[] {
  const rows = Object.entries(players).map(([id, p]) => ({
    id,
    name: p.name,
    joinedAt: p.joinedAt,
    correct: Number(correct[id]) || 0,
    timeMs: Number(time[id]) || 0,
  }));
  // More correct answers first; on a tie, the faster player wins.
  rows.sort((a, b) => b.correct - a.correct || a.timeMs - b.timeMs || a.joinedAt - b.joinedAt);
  let rank = 0;
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.correct !== r.correct || prev.timeMs !== r.timeMs) rank = i + 1;
    return { id: r.id, name: r.name, correct: r.correct, timeMs: r.timeMs, rank };
  });
}

// ---------------------------------------------------------------------------
// Player actions

export async function joinGame(code: string, rawName: string, existingId?: string): Promise<{ playerId: string; name: string }> {
  const state = await loadState(code);
  const s = store();
  const name = rawName.replace(/\s+/g, " ").trim().slice(0, 20);
  if (!name) throw new GameError("Please choose a nickname.");

  // Re-joining with a known id (e.g. after a page reload) keeps the player.
  if (existingId) {
    const existing = await s.hget<Player>(k.players(code), existingId);
    if (existing) return { playerId: existingId, name: existing.name };
  }
  if (state.phase === "finished") throw new GameError("This game has already ended.");

  const playerId = randomBytes(9).toString("base64url");
  const key = normalizeText(name) || name.toLowerCase();
  if (!(await s.hsetnx(k.names(code), key, playerId))) {
    throw new GameError("That nickname is taken, pick another one.", 409);
  }
  await s.expire(k.names(code), TTL);
  await hsetWithTtl(k.players(code), playerId, { name, joinedAt: Date.now() } satisfies Player);
  return { playerId, name };
}

export async function submitAnswer(code: string, playerId: string, index: number, value: unknown) {
  const state = await loadState(code);
  const s = store();
  const now = Date.now();
  if (state.phase !== "question" || state.index !== index) throw new GameError("This question is no longer open.", 409);
  if (now > state.endsAt + ANSWER_GRACE_MS || (await isClosed(state))) {
    throw new GameError("Time's up!", 409);
  }
  const question = state.quiz.questions[index];
  if (!isValidAnswer(question, value)) throw new GameError("Invalid answer.");
  if (!(await s.hget<Player>(k.players(code), playerId))) throw new GameError("Unknown player, please rejoin.", 401);

  const ms = Math.max(0, Math.min(now - state.startedAt, question.time * 1000));
  const correct = isCorrect(question, value);
  const answerKey = k.answers(code, index);
  if (!(await s.hsetnx(answerKey, playerId, { value, ms, correct } satisfies Answer))) {
    throw new GameError("You already answered.", 409);
  }
  await s.expire(answerKey, TTL);
  if (correct) {
    await s.hincrby(k.correct(code), playerId, 1);
    await s.hincrby(k.time(code), playerId, ms);
    await s.expire(k.correct(code), TTL);
    await s.expire(k.time(code), TTL);
  }

  // Close the question early once everyone has answered.
  const [answered, playerCount] = await Promise.all([s.hlen(answerKey), s.hlen(k.players(code))]);
  if (answered >= playerCount) await s.set(k.closed(code, index), 1, { ttl: TTL });
}

export type PlayerView = {
  title: string;
  phase: Phase;
  index: number;
  total: number;
  name: string;
  question: PublicQuestion | null;
  startedAt: number;
  endsAt: number;
  now: number;
  myAnswer: { value: AnswerValue } | null;
  /** Present once the current question is revealed. */
  result: { correct: boolean; label: string } | null;
  /** Present on reveal and at the end. */
  standing: { rank: number; correct: number; players: number; answered: number } | null;
  podium: LeaderboardEntry[] | null;
};

export async function playerView(code: string, playerId: string): Promise<PlayerView> {
  const state = await loadState(code);
  const s = store();
  const now = Date.now();
  const inQuestion = state.phase === "question";
  const [me, closed, myAnswer] = await Promise.all([
    s.hget<Player>(k.players(code), playerId),
    isClosed(state),
    inQuestion ? s.hget<Answer>(k.answers(code, state.index), playerId) : Promise.resolve(null),
  ]);
  if (!me) throw new GameError("You are not part of this game (yet).", 401);
  const phase = derivePhase(state, closed, now);
  const question = state.index >= 0 && state.phase !== "finished" ? state.quiz.questions[state.index] : null;

  let result: PlayerView["result"] = null;
  let standing: PlayerView["standing"] = null;
  let podium: PlayerView["podium"] = null;
  if (phase === "reveal" || phase === "finished") {
    const [players, correct, time] = await Promise.all([
      s.hgetall<Player>(k.players(code)),
      s.hgetall<number>(k.correct(code)),
      s.hgetall<number>(k.time(code)),
    ]);
    const board = leaderboard(players, correct, time);
    const mine = board.find((e) => e.id === playerId);
    standing = {
      rank: mine?.rank ?? board.length,
      correct: mine?.correct ?? 0,
      players: board.length,
      answered: phase === "finished" ? state.quiz.questions.length : state.index + 1,
    };
    if (phase === "finished") podium = board.slice(0, 3);
    if (phase === "reveal" && question) {
      result = { correct: myAnswer?.correct ?? false, label: correctAnswerLabel(question) };
    }
  }

  return {
    title: state.quiz.title,
    phase,
    index: state.index,
    total: state.quiz.questions.length,
    name: me.name,
    question: question ? toPublicQuestion(question) : null,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    now,
    myAnswer: myAnswer ? { value: myAnswer.value } : null,
    result,
    standing,
    podium,
  };
}
