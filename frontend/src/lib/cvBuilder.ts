export interface Entry {
  id?: string;
  [key: string]: string | string[] | undefined;
}

export interface CVData {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
  summary: string;
  photo: string;
  experience: Entry[];
  education: Entry[];
  skills: Entry[];
  projects: Entry[];
  publications: Entry[];
  honors: Entry[];
  patents: Entry[];
  talks: Entry[];
}

export interface DesignSettings {
  primaryColor: string;
  fontFamily: string;
}

export interface CoverLetterDraft {
  targetRole: string;
  company: string;
  hiringManager: string;
  jobDescription: string;
  tone: string;
  letter: string;
  source: "" | "ai" | "template";
}

export type RepeatableSection =
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "publications"
  | "honors"
  | "patents"
  | "talks";

export type SyncStatus = "saved" | "saving" | "syncing" | "error";

export const DEFAULT_CV_DATA: CVData = {
  name: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  website: "",
  linkedin: "",
  github: "",
  summary: "",
  photo: "",
  experience: [],
  education: [],
  skills: [],
  projects: [],
  publications: [],
  honors: [],
  patents: [],
  talks: [],
};

export const DEFAULT_DESIGN_SETTINGS: DesignSettings = {
  primaryColor: "#004F90",
  fontFamily: "Source Sans 3",
};

export const DEFAULT_COVER_LETTER_DRAFT: CoverLetterDraft = {
  targetRole: "",
  company: "",
  hiringManager: "",
  jobDescription: "",
  tone: "professional",
  letter: "",
  source: "",
};

export const IMPORTED_CV_STORAGE_KEY = "purecv:import:v1";

export const REPEATABLE_SECTIONS: RepeatableSection[] = [
  "experience",
  "education",
  "skills",
  "projects",
  "publications",
  "honors",
  "patents",
  "talks",
];

export const isFilled = (value: unknown): boolean => {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(isFilled);
  return Boolean(value);
};

export const getStringList = (value: string | string[] | undefined): string[] => {
  return Array.isArray(value) ? value : [];
};

export const getString = (value: string | string[] | undefined): string => {
  return typeof value === "string" ? value : "";
};

export const getEmptyEntry = (section: RepeatableSection): Entry => {
  const entries: Record<RepeatableSection, Entry> = {
    experience: {
      id: "",
      company: "",
      position: "",
      start_date: "",
      end_date: "",
      location: "",
      summary: "",
      highlights: [],
    },
    education: {
      id: "",
      institution: "",
      degree: "",
      area: "",
      start_date: "",
      end_date: "",
      location: "",
      summary: "",
      highlights: [],
    },
    skills: { id: "", label: "", details: "" },
    projects: {
      id: "",
      name: "",
      start_date: "",
      end_date: "",
      location: "",
      url: "",
      summary: "",
      highlights: [],
    },
    publications: {
      id: "",
      title: "",
      authors: "",
      journal: "",
      date: "",
      doi: "",
      url: "",
      summary: "",
    },
    honors: { id: "", bullet: "" },
    patents: { id: "", number: "" },
    talks: { id: "", reversed_number: "" },
  };

  return { ...entries[section] };
};

const toStringValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const toStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => toStringValue(item).trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|[•◦▪▸►✓✔]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeEntry = (section: RepeatableSection, value: unknown): Entry => {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const entry = getEmptyEntry(section);

  Object.keys(entry).forEach((key) => {
    if (key === "highlights") {
      entry[key] = toStringList(source[key]);
    } else {
      entry[key] = toStringValue(source[key]);
    }
  });

  return entry;
};

export const normalizeCVData = (value: Partial<CVData> | unknown): CVData => {
  const source = value && typeof value === "object" ? (value as Partial<CVData>) : {};
  const nextData: CVData = {
    ...DEFAULT_CV_DATA,
    ...source,
    name: toStringValue(source.name),
    headline: toStringValue(source.headline),
    email: toStringValue(source.email),
    phone: toStringValue(source.phone),
    location: toStringValue(source.location),
    website: toStringValue(source.website),
    linkedin: toStringValue(source.linkedin),
    github: toStringValue(source.github),
    summary: toStringValue(source.summary),
    photo: toStringValue(source.photo),
    experience: [],
    education: [],
    skills: [],
    projects: [],
    publications: [],
    honors: [],
    patents: [],
    talks: [],
  };

  REPEATABLE_SECTIONS.forEach((section) => {
    const list = Array.isArray(source[section]) ? source[section] : [];
    nextData[section] = list.map((entry) => normalizeEntry(section, entry));
  });

  return nextData;
};

export const hasRenderableEntry = (section: RepeatableSection, entry: Entry): boolean => {
  if (section === "experience") return isFilled(entry.company) && isFilled(entry.position);
  if (section === "education") return isFilled(entry.institution) && isFilled(entry.area);
  if (section === "skills") return isFilled(entry.label) && isFilled(entry.details);
  if (section === "projects") return isFilled(entry.name);
  if (section === "publications") return isFilled(entry.title) && isFilled(entry.authors);
  if (section === "honors") return isFilled(entry.bullet);
  if (section === "patents") return isFilled(entry.number);
  if (section === "talks") return isFilled(entry.reversed_number);
  return false;
};

export const toRenderableCVData = (cvData: CVData): CVData => {
  const nextData: CVData = { ...cvData };
  REPEATABLE_SECTIONS.forEach((section) => {
    nextData[section] = cvData[section]
      .filter((entry) => hasRenderableEntry(section, entry))
      .map((entry) => {
        const entryToSend = { ...entry };
        delete entryToSend.id;
        return entryToSend;
      });
  });
  return nextData;
};

export const hasRenderableContent = (renderableData: CVData): boolean => {
  return Boolean(
    renderableData.name.trim() ||
      renderableData.headline.trim() ||
      renderableData.email.trim() ||
      renderableData.phone.trim() ||
      renderableData.location.trim() ||
      renderableData.website.trim() ||
      renderableData.linkedin.trim() ||
      renderableData.github.trim() ||
      renderableData.summary.trim() ||
      REPEATABLE_SECTIONS.some((section) => renderableData[section].length > 0),
  );
};

export const countWords = (text: string): number => {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
};

const entryText = (entry: Entry): string => {
  return Object.values(entry)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string")
    .join(" ");
};

const MARKET_KEYWORDS = [
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "Express",
  "REST",
  "API",
  "PostgreSQL",
  "MongoDB",
  "Prisma",
  "Redis",
  "Docker",
  "CI/CD",
  "Tailwind",
  "LLM",
  "RAG",
  "OpenAI",
  "FastAPI",
];

export const getSectionWordCount = (cvData: CVData, sectionId: string): number => {
  if (sectionId === "profile") {
    return countWords(cvData.summary) + countWords(cvData.headline);
  }
  if (sectionId === "design" || !REPEATABLE_SECTIONS.includes(sectionId as RepeatableSection)) {
    return 0;
  }

  return cvData[sectionId as RepeatableSection].reduce((total, item) => {
    return total + countWords(entryText(item));
  }, 0);
};

export const calculateSectionProgress = (cvData: CVData, sectionId: string): number => {
  if (sectionId === "profile") {
    const fields = ["name", "email", "phone", "location", "summary", "headline"];
    const filled = fields.filter((field) => Boolean((cvData[field as keyof CVData] as string)?.trim())).length;
    return Math.floor((filled / fields.length) * 100);
  }
  if (sectionId === "design") return 100;
  if (!REPEATABLE_SECTIONS.includes(sectionId as RepeatableSection)) return 0;

  const section = sectionId as RepeatableSection;
  const list = cvData[section];
  if (!list || list.length === 0) return 0;
  if (list.some((entry) => hasRenderableEntry(section, entry))) return 100;
  if (list.some((entry) => Object.values(entry).some(isFilled))) return 50;
  return 0;
};

export const calculateATSScore = (cvData: CVData): { score: number; tips: string[] } => {
  const tips: string[] = [];
  let score = 0;

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cvData.email.trim());
  const phoneDigits = cvData.phone.replace(/\D/g, "").length;
  const contactScore =
    (cvData.name.trim() ? 4 : 0) +
    (emailOk ? 4 : 0) +
    (phoneDigits >= 7 ? 4 : 0) +
    (cvData.location.trim() ? 3 : 0);
  score += contactScore;
  if (!cvData.name.trim()) tips.push("Add your full name");
  if (!emailOk) tips.push("Add a valid email address");
  if (phoneDigits < 7) tips.push("Add a complete phone number");
  if (!cvData.location.trim()) tips.push("Add city and country or region");

  const headlineWords = countWords(cvData.headline);
  if (headlineWords >= 4 && headlineWords <= 14) score += 6;
  else tips.push("Add a concise role-focused headline");

  const summaryWords = countWords(cvData.summary);
  if (summaryWords >= 35 && summaryWords <= 90) score += 15;
  else if (summaryWords >= 18) score += 9;
  else tips.push("Add a 35-90 word professional summary");

  const completeExperience = cvData.experience.filter((entry) => hasRenderableEntry("experience", entry));
  if (completeExperience.length >= 2) score += 14;
  else if (completeExperience.length === 1) score += 9;
  else tips.push("Add at least one complete work experience");

  const experienceWithDates = completeExperience.filter(
    (entry) => getString(entry.start_date).trim() || getString(entry.end_date).trim(),
  );
  if (completeExperience.length && experienceWithDates.length === completeExperience.length) score += 8;
  else if (completeExperience.length) tips.push("Add dates to each work experience");

  const bulletCount = completeExperience.reduce(
    (total, entry) => total + getStringList(entry.highlights).filter(isFilled).length,
    0,
  );
  if (bulletCount >= 6) score += 12;
  else if (bulletCount >= 3) score += 8;
  else tips.push("Add 3-6 achievement bullets across experience");

  const measurableBullets = completeExperience
    .flatMap((entry) => getStringList(entry.highlights))
    .filter((bullet) => /(\d|%|\$|users?|customers?|revenue|latency|cost|time|hours?|days?)/i.test(bullet));
  if (measurableBullets.length >= 2) score += 8;
  else if (bulletCount > 0) tips.push("Add measurable results such as %, money, users, or time saved");

  const hasEducation = cvData.education.some((entry) => hasRenderableEntry("education", entry));
  if (hasEducation) score += 10;
  else tips.push("Add education with institution and field");

  const skillKeywords = cvData.skills
    .filter((entry) => hasRenderableEntry("skills", entry))
    .flatMap((entry) => `${getString(entry.label)},${getString(entry.details)}`.split(/[,;/|]/))
    .map((skill) => skill.trim())
    .filter(Boolean);
  if (skillKeywords.length >= 12) score += 15;
  else if (skillKeywords.length >= 6) score += 10;
  else if (skillKeywords.length >= 3) score += 6;
  else tips.push("Add 6-12 role-specific skills and tools");

  const searchableText = [
    cvData.headline,
    cvData.summary,
    ...cvData.skills.map(entryText),
    ...cvData.projects.map(entryText),
    ...cvData.experience.map(entryText),
  ].join(" ").toLowerCase();
  const marketKeywordHits = MARKET_KEYWORDS.filter((keyword) => searchableText.includes(keyword.toLowerCase()));
  if (marketKeywordHits.length >= 8) score += 7;
  else if (marketKeywordHits.length >= 5) score += 4;
  else tips.push("Add current role keywords such as TypeScript, APIs, databases, cloud, or AI tools");

  const optionalDepth =
    (cvData.projects.some((entry) => hasRenderableEntry("projects", entry)) ? 4 : 0) +
    (cvData.publications.some((entry) => hasRenderableEntry("publications", entry)) ? 2 : 0) +
    (cvData.honors.some((entry) => hasRenderableEntry("honors", entry)) ? 2 : 0);
  score += Math.min(optionalDepth, 8);

  const projectLinks = cvData.projects.filter((entry) => hasRenderableEntry("projects", entry) && getString(entry.url).trim());
  if (projectLinks.length > 0) score += 3;
  else if (cvData.projects.some((entry) => hasRenderableEntry("projects", entry))) tips.push("Add live demo or repository links to key projects");

  const wordCount = ["profile", ...REPEATABLE_SECTIONS].reduce(
    (sum, section) => sum + getSectionWordCount(cvData, section),
    0,
  );
  if (wordCount >= 350 && wordCount <= 800) score += 10;
  else if (wordCount >= 250 && wordCount < 350) score += 6;
  else if (wordCount > 800 && wordCount <= 950) score += 5;
  else tips.push("Aim for 350-800 words for a complete ATS-readable CV");

  return { score: Math.max(0, Math.min(100, Math.round(score))), tips: tips.slice(0, 5) };
};
