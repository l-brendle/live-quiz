import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_CONFIG, isCorrect, parseQuiz } from "./quiz.ts";

test("parses the sample config", () => {
  const quiz = parseQuiz(SAMPLE_CONFIG);
  assert.equal(quiz.title, "Friday Fun Quiz");
  assert.deepEqual(
    quiz.questions.map((q) => q.type),
    ["choice", "truefalse", "text", "choice", "truefalse"],
  );
  const [first, second, third] = quiz.questions;
  assert.equal(first.type === "choice" && first.answer, 1);
  assert.equal(second.type === "truefalse" && second.answer, false);
  assert.equal(third.time, 15);
});

test("reports helpful errors", () => {
  assert.throws(() => parseQuiz("? Q\n- a\n- b"), /exactly one/);
  assert.throws(() => parseQuiz("? Q\n* a\n- b\n- c\n- d\n- e"), /2 to 4/);
  assert.throws(() => parseQuiz("- a"), /Line 1/);
  assert.throws(() => parseQuiz("? Q"), /add options/);
  assert.throws(() => parseQuiz("title: x"), /at least one/);
});

test("accepts JSON", () => {
  const quiz = parseQuiz(
    JSON.stringify({
      title: "J",
      questions: [
        { type: "choice", question: "A?", options: ["x", "y"], answer: 1, time: 10 },
        { type: "truefalse", question: "B?", answer: true },
        { type: "text", question: "C?", answer: ["Köln", "Cologne"] },
      ],
    }),
  );
  assert.equal(quiz.questions.length, 3);
  assert.equal(quiz.questions[1].time, 20);
});

test("free text matching ignores case, accents and punctuation", () => {
  const q = parseQuiz("? City?\n= Köln | Cologne").questions[0];
  assert.ok(isCorrect(q, "koln"));
  assert.ok(isCorrect(q, "  COLOGNE! "));
  assert.ok(!isCorrect(q, "Berlin"));
  assert.ok(!isCorrect(q, ""));
});
