import type { CoverLetterDraft } from "@/lib/cvBuilder";

export type LetterLength = CoverLetterDraft["length"];

/** Target word ranges; they match the ranges the AI prompt asks for. */
export const LETTER_LENGTHS: Record<LetterLength, { label: string; min: number; max: number }> = {
  short: { label: "Short", min: 150, max: 220 },
  standard: { label: "Standard", min: 250, max: 350 },
  detailed: { label: "Detailed", min: 350, max: 450 },
};

export interface LetterCheckItem {
  id: string;
  label: string;
  status: "pass" | "warn";
  detail: string;
}

export interface LetterKeyword {
  term: string;
  found: boolean;
}

const STOP_WORDS = new Set(
  (
    "a about above across after again all also am an and any are as at be because been before being below between both but by can could " +
    "did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its " +
    "just me more most my no nor not now of off on once only or other our ours out over own same she should so some such than that the " +
    "their them then there these they this those through to too under until up very was we were what when where which while who whom why " +
    "will with would you your yours able across ability etc e.g including within without per via using use used new work working job role " +
    "team teams company candidate candidates position opportunity responsibilities requirements required preferred qualifications " +
    "experience years year plus strong excellent good great skills skill knowledge understanding help join looking ideal must nice well " +
    "based day days time environment across ensure make makes like part across apply benefits salary equal employer"
  ).split(/\s+/),
);

const CLICHES = [
  "to whom it may concern",
  "i am writing to",
  "passionate",
  "team player",
  "hard-working",
  "hardworking",
  "go-getter",
  "think outside the box",
  "detail-oriented",
  "self-starter",
  "great fit",
  "perfect fit",
  "dynamic",
  "synergy",
];

/** The job ad's most distinctive terms: frequent words plus capitalised names and tools. */
export function extractJobKeywords(jobDescription: string, limit = 12): string[] {
  const scores = new Map<string, number>();
  const display = new Map<string, string>();
  const tokens = jobDescription.match(/[A-Za-z][A-Za-z0-9+#./-]*[A-Za-z0-9+#]|[A-Za-z]{2,}/g) || [];
  tokens.forEach((raw, index) => {
    const term = raw.replace(/[./-]+$/, "");
    const key = term.toLowerCase();
    if (key.length < 3 && !/[+#]/.test(key)) return;
    if (STOP_WORDS.has(key)) return;
    const previous = index > 0 ? tokens[index - 1] : ".";
    // Capitalised mid-sentence words are usually tools, products or names.
    const capitalised = /^[A-Z]/.test(term) && !/[.!?:]$/.test(previous);
    scores.set(key, (scores.get(key) || 0) + 1 + (capitalised ? 1 : 0) + (/[+#.]/.test(term) ? 1 : 0));
    if (!display.has(key) || capitalised) display.set(key, term);
  });
  return [...scores.entries()]
    .filter(([, score]) => score >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => display.get(key) || key);
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const containsTerm = (text: string, term: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegExp(term.toLowerCase())}($|[^a-z0-9])`).test(text);

/** Quick, local checks that tell the writer what would make the letter stronger. */
export function checkLetter(draft: CoverLetterDraft): { items: LetterCheckItem[]; keywords: LetterKeyword[]; words: number } {
  const letter = draft.letter.trim();
  const lower = letter.toLowerCase();
  const words = letter ? letter.split(/\s+/).length : 0;
  const range = LETTER_LENGTHS[draft.length] || LETTER_LENGTHS.standard;
  // The job title and company name repeat throughout an ad but aren't skills.
  const ownWords = new Set(`${draft.targetRole} ${draft.company}`.toLowerCase().split(/[^a-z0-9+#]+/));
  const keywords = extractJobKeywords(draft.jobDescription, 20)
    .filter((term) => !ownWords.has(term.toLowerCase()))
    .slice(0, 12)
    .map((term) => ({ term, found: containsTerm(lower, term) }));
  const items: LetterCheckItem[] = [];

  const lengthOk = words >= range.min * 0.85 && words <= range.max * 1.15;
  items.push({
    id: "length",
    label: "Length",
    status: lengthOk ? "pass" : "warn",
    detail: lengthOk
      ? `${words} words, right for a ${range.label.toLowerCase()} letter.`
      : words < range.min
        ? `${words} words. Aim for ${range.min}-${range.max}.`
        : `${words} words. Trim to about ${range.max} so it stays on one page.`,
  });

  if (keywords.length > 0) {
    const found = keywords.filter((keyword) => keyword.found).length;
    const enough = found >= Math.ceil(keywords.length / 2);
    items.push({
      id: "keywords",
      label: "Job keywords",
      status: enough ? "pass" : "warn",
      detail: enough
        ? `Uses ${found} of ${keywords.length} key terms from the job ad.`
        : `Only ${found} of ${keywords.length} key terms. Work in the missing ones where they're true for you.`,
    });
  }

  const company = draft.company.trim();
  if (company) {
    const named = containsTerm(lower, company);
    items.push({
      id: "company",
      label: "Mentions the company",
      status: named ? "pass" : "warn",
      detail: named ? `Names ${company}.` : `Mention ${company} and why you want to work there.`,
    });
  }

  const greeting = lower.split("\n")[0] || "";
  const personal = draft.hiringManager.trim() && !/hiring (team|manager)/.test(draft.hiringManager.toLowerCase());
  const addressed = personal ? greeting.includes(draft.hiringManager.trim().toLowerCase().split(/\s+/).pop() || "") : false;
  items.push({
    id: "greeting",
    label: "Personal greeting",
    status: addressed ? "pass" : "warn",
    detail: addressed
      ? "Addressed to a named person."
      : personal
        ? `Greet ${draft.hiringManager.trim()} by name.`
        : "Find the hiring manager's name if you can; it gets more replies.",
  });

  const hasNumbers = /\d/.test(letter.split("\n").slice(1).join(" "));
  items.push({
    id: "results",
    label: "Shows results",
    status: hasNumbers ? "pass" : "warn",
    detail: hasNumbers ? "Includes concrete numbers." : "Add a measurable result, such as a percentage, time saved or team size.",
  });

  const cliches = CLICHES.filter((phrase) => lower.includes(phrase));
  items.push({
    id: "cliches",
    label: "Fresh wording",
    status: cliches.length ? "warn" : "pass",
    detail: cliches.length ? `Replace: ${cliches.map((phrase) => `"${phrase}"`).join(", ")}.` : "No stock phrases found.",
  });

  const paragraphs = letter.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const opening = (paragraphs[1] || "").toLowerCase();
  const weakOpening = /^(i am writing|i am applying|i'm writing|i'm applying|my name is|i would like to apply)/.test(opening);
  items.push({
    id: "opening",
    label: "Strong opening",
    status: weakOpening ? "warn" : "pass",
    detail: weakOpening ? "Open with your strongest reason you fit, not \"I am writing to apply\"." : "Opens with substance.",
  });

  return { items, keywords, words };
}
