// Quiz config parsing and answer checking. Shared by client (live validation
// in the host editor) and server (authoritative scoring).

export type ChoiceQuestion = {
  type: "choice";
  question: string;
  options: string[]; // 2-4 options
  answer: number; // index into options
  time: number; // seconds
};

export type TrueFalseQuestion = {
  type: "truefalse";
  question: string;
  answer: boolean;
  time: number;
};

export type TextQuestion = {
  type: "text";
  question: string;
  answer: string[]; // any of these is accepted (case/accent/punctuation-insensitive)
  time: number;
};

export type Question = ChoiceQuestion | TrueFalseQuestion | TextQuestion;

export type Quiz = {
  title: string;
  questions: Question[];
};

/** Question as sent to players while it is open (no answer included). */
export type PublicQuestion =
  | { type: "choice"; question: string; options: string[]; time: number }
  | { type: "truefalse"; question: string; time: number }
  | { type: "text"; question: string; time: number };

export const LANGUAGES = {
  en: { name: "English", true: "True", false: "False" },
  de: { name: "Deutsch", true: "Richtig", false: "Falsch" },
  fr: { name: "Français", true: "Vrai", false: "Faux" },
  it: { name: "Italiano", true: "Vero", false: "Falso" },
  es: { name: "Español", true: "Verdadero", false: "Falso" },
} as const;

export type Language = keyof typeof LANGUAGES;

export function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && Object.hasOwn(LANGUAGES, v);
}

/** Labels for the right-or-wrong buttons in the game's language. */
export function trueFalseLabel(value: boolean, lang: Language = "en"): string {
  const l = LANGUAGES[lang] ?? LANGUAGES.en;
  return value ? l.true : l.false;
}

export const DEFAULT_TIME = 20;
export const MAX_QUESTIONS = 100;

export const SAMPLE_CONFIG = `title: Friday Fun Quiz

? What is the capital of Australia?
- Sydney
* Canberra
- Melbourne
- Perth

? The Great Wall of China is visible from space with the naked eye.
= false

? Which planet is the largest in our solar system?
time: 15
= Jupiter

? How many legs does a spider have?
- 6
* 8
- 10
- 12

? Water boils at 100 °C at sea level.
= true
`;

export class QuizParseError extends Error {}

/**
 * Parses a quiz config. Two formats are accepted:
 *
 * 1. The simple text format (see SAMPLE_CONFIG):
 *      title: My quiz        (optional, first line)
 *      ? Question text       starts a question
 *      time: 30              optional per-question time limit in seconds
 *      - wrong option        multiple choice option
 *      * right option        multiple choice correct option (exactly one)
 *      = true | false        right-or-wrong question
 *      = Paris | Paris City  free-text question, "|" separates accepted answers
 *    Lines starting with # are comments.
 *
 * 2. JSON: { "title": "...", "questions": [ ... ] } using the Question shape
 *    above (time is optional).
 */
export function parseQuiz(input: string): Quiz {
  const text = input.trim();
  if (!text) throw new QuizParseError("The config is empty.");
  const quiz = text.startsWith("{") || text.startsWith("[") ? parseJson(text) : parseText(text);
  if (quiz.questions.length === 0) throw new QuizParseError("Add at least one question (a line starting with ?).");
  if (quiz.questions.length > MAX_QUESTIONS) throw new QuizParseError(`At most ${MAX_QUESTIONS} questions are supported.`);
  return quiz;
}

function parseText(text: string): Quiz {
  let title = "Quiz";
  const questions: Question[] = [];

  type Draft = {
    line: number;
    question: string;
    time: number;
    options: string[];
    correct: number[];
    equals: string | null;
  };
  let draft: Draft | null = null;

  const finish = () => {
    if (!draft) return;
    const d = draft;
    const where = `Question on line ${d.line}`;
    if (d.options.length > 0 && d.equals !== null) {
      throw new QuizParseError(`${where}: use either options (- / *) or an answer (=), not both.`);
    }
    if (d.options.length > 0) {
      if (d.options.length < 2 || d.options.length > 4) {
        throw new QuizParseError(`${where}: multiple choice needs 2 to 4 options, found ${d.options.length}.`);
      }
      if (d.correct.length !== 1) {
        throw new QuizParseError(`${where}: mark exactly one option as correct with *, found ${d.correct.length}.`);
      }
      questions.push({ type: "choice", question: d.question, options: d.options, answer: d.correct[0], time: d.time });
    } else if (d.equals !== null) {
      const v = d.equals.trim();
      const lower = v.toLowerCase();
      if (lower === "true" || lower === "false") {
        questions.push({ type: "truefalse", question: d.question, answer: lower === "true", time: d.time });
      } else {
        const answers = v.split("|").map((s) => s.trim()).filter(Boolean);
        if (answers.length === 0) throw new QuizParseError(`${where}: the answer after = is empty.`);
        questions.push({ type: "text", question: d.question, answer: answers, time: d.time });
      }
    } else {
      throw new QuizParseError(`${where}: add options (- wrong / * right) or an answer (= ...).`);
    }
    draft = null;
  };

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const titleMatch = /^title\s*:\s*(.*)$/i.exec(line);
    if (titleMatch && !draft && questions.length === 0) {
      title = titleMatch[1].trim() || title;
      return;
    }
    if (line.startsWith("?")) {
      finish();
      const q = line.slice(1).trim();
      if (!q) throw new QuizParseError(`Line ${lineNo}: question text is empty.`);
      draft = { line: lineNo, question: q, time: DEFAULT_TIME, options: [], correct: [], equals: null };
      return;
    }
    if (!draft) throw new QuizParseError(`Line ${lineNo}: expected a question starting with "?".`);
    const d: Draft = draft;

    const timeMatch = /^time\s*:\s*(\d+)\s*s?$/i.exec(line);
    if (timeMatch) {
      d.time = clampTime(Number(timeMatch[1]));
      return;
    }
    if (line.startsWith("-") || line.startsWith("*")) {
      const opt = line.slice(1).trim();
      if (!opt) throw new QuizParseError(`Line ${lineNo}: option text is empty.`);
      if (line.startsWith("*")) d.correct.push(d.options.length);
      d.options.push(opt);
      return;
    }
    if (line.startsWith("=")) {
      if (d.equals !== null) throw new QuizParseError(`Line ${lineNo}: only one = answer line per question.`);
      d.equals = line.slice(1);
      return;
    }
    throw new QuizParseError(`Line ${lineNo}: don't know what to do with "${line}". Lines should start with ?, -, *, = or time:.`);
  });
  finish();
  return { title, questions };
}

function parseJson(text: string): Quiz {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new QuizParseError(`Invalid JSON: ${(e as Error).message}`);
  }
  const obj = (Array.isArray(data) ? { questions: data } : data) as { title?: unknown; questions?: unknown };
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.questions)) {
    throw new QuizParseError('JSON must be an object with a "questions" array.');
  }
  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "Quiz";
  const questions = obj.questions.map((raw, i): Question => {
    const q = raw as Record<string, unknown>;
    const where = `Question ${i + 1}`;
    const question = typeof q?.question === "string" ? q.question.trim() : "";
    if (!question) throw new QuizParseError(`${where}: "question" text is missing.`);
    const time = q.time === undefined ? DEFAULT_TIME : clampTime(Number(q.time));
    switch (q.type) {
      case "choice": {
        const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : [];
        if (options.length < 2 || options.length > 4 || options.some((o) => !o)) {
          throw new QuizParseError(`${where}: "options" must be 2 to 4 non-empty strings.`);
        }
        const answer = Number(q.answer);
        if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
          throw new QuizParseError(`${where}: "answer" must be the index (0-${options.length - 1}) of the correct option.`);
        }
        return { type: "choice", question, options, answer, time };
      }
      case "truefalse":
        if (typeof q.answer !== "boolean") throw new QuizParseError(`${where}: "answer" must be true or false.`);
        return { type: "truefalse", question, answer: q.answer, time };
      case "text": {
        const answers = (Array.isArray(q.answer) ? q.answer : [q.answer])
          .filter((a) => typeof a === "string" && a.trim())
          .map((a) => (a as string).trim());
        if (answers.length === 0) throw new QuizParseError(`${where}: "answer" must be a string or array of strings.`);
        return { type: "text", question, answer: answers, time };
      }
      default:
        throw new QuizParseError(`${where}: "type" must be "choice", "truefalse" or "text".`);
    }
  });
  return { title, questions };
}

function clampTime(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_TIME;
  return Math.min(300, Math.max(5, Math.round(n)));
}

export function toPublicQuestion(q: Question): PublicQuestion {
  if (q.type === "choice") return { type: q.type, question: q.question, options: q.options, time: q.time };
  return { type: q.type, question: q.question, time: q.time };
}

/** Lowercase, strip accents, punctuation and extra whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type AnswerValue = number | boolean | string;

/** Returns true when the submitted value answers the question correctly. */
export function isCorrect(q: Question, value: AnswerValue): boolean {
  switch (q.type) {
    case "choice":
      return value === q.answer;
    case "truefalse":
      return value === q.answer;
    case "text": {
      if (typeof value !== "string") return false;
      const v = normalizeText(value);
      return v !== "" && q.answer.some((a) => normalizeText(a) === v);
    }
  }
}

/** Validates the shape of a submitted value for the question type. */
export function isValidAnswer(q: Question, value: unknown): value is AnswerValue {
  switch (q.type) {
    case "choice":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < q.options.length;
    case "truefalse":
      return typeof value === "boolean";
    case "text":
      return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
  }
}

/** Human readable correct answer. */
export function correctAnswerLabel(q: Question, lang: Language = "en"): string {
  switch (q.type) {
    case "choice":
      return q.options[q.answer];
    case "truefalse":
      return trueFalseLabel(q.answer, lang);
    case "text":
      return q.answer[0];
  }
}
