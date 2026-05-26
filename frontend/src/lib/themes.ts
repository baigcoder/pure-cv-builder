import type { CVData, Entry } from "@/lib/cvBuilder";

export type SectionOrderType = "standard" | "academic" | "tech" | "entry_level" | "portfolio" | "early_tech" | "recruiter";

export interface ThemeMeta {
  id: string;
  name: string;
  renderTheme: string;
  image: string;
  previewImage: string;
  description: string;
  bestFor: string;
  sectionOrderType: SectionOrderType;
  tags: string[];
  atsScore: number;
  atsRationale: string;
  recommendedFor: string[];
}

export const THEME_SECTION_ORDER: Record<SectionOrderType, string[]> = {
  standard: ["profile", "education", "experience", "projects", "publications", "honors", "skills", "patents", "talks", "design"],
  academic: ["profile", "education", "publications", "talks", "projects", "experience", "honors", "skills", "patents", "design"],
  tech: ["profile", "skills", "experience", "projects", "education", "publications", "patents", "honors", "talks", "design"],
  entry_level: ["profile", "education", "projects", "skills", "experience", "honors", "publications", "patents", "talks", "design"],
  portfolio: ["profile", "projects", "experience", "skills", "education", "publications", "honors", "patents", "talks", "design"],
  early_tech: ["profile", "education", "experience", "projects", "skills", "honors", "publications", "patents", "talks", "design"],
  recruiter: ["profile", "experience", "education", "skills", "projects", "honors", "publications", "patents", "talks", "design"],
};

export const THEME_DATA: ThemeMeta[] = [
  {
    id: "jake",
    name: "Jake ATS",
    renderTheme: "sb2nov",
    image: "/theme-jake.png",
    previewImage: "/theme-jake.png",
    description: "Dense single-column engineering format modeled for parser-safe applications.",
    bestFor: "Software engineers, students, new grads, project-heavy profiles",
    sectionOrderType: "early_tech",
    tags: ["Best ATS", "Tech"],
    atsScore: 98,
    atsRationale: "Single-column, rule-separated sections, standard headings, and compact text hierarchy.",
    recommendedFor: ["software", "engineering", "student", "new grad", "projects"],
  },
  {
    id: "sheets",
    name: "Sheets Recruiter ATS",
    renderTheme: "engineeringresumes",
    image: "/theme-sheets.png",
    previewImage: "/theme-sheets.png",
    description: "Recruiter-first work history layout with conservative ATS-safe formatting.",
    bestFor: "Experienced professionals, recruiters, operations, career pivots",
    sectionOrderType: "recruiter",
    tags: ["Best ATS", "Recruiter"],
    atsScore: 96,
    atsRationale: "Work-first flow, plain typography, standard bullets, and no decorative parser risks.",
    recommendedFor: ["experienced", "work history", "recruiter", "operations", "career pivot"],
  },
  {
    id: "classic",
    name: "Classic Professional",
    renderTheme: "classic",
    image: "/theme-classic.png",
    previewImage: "/theme-classic.png",
    description: "Traditional professional layout with refined typography.",
    bestFor: "Corporate, finance, legal, operations",
    sectionOrderType: "standard",
    tags: ["ATS-Friendly", "Formal"],
    atsScore: 88,
    atsRationale: "Clean conventional structure with readable headings and restrained styling.",
    recommendedFor: ["corporate", "finance", "legal", "operations"],
  },
  {
    id: "moderncv",
    name: "Modern Minimal",
    renderTheme: "moderncv",
    image: "/theme-moderncv.png",
    previewImage: "/theme-moderncv.png",
    description: "Modern structure with a clean, confident hierarchy.",
    bestFor: "Product, design, marketing, startups",
    sectionOrderType: "standard",
    tags: ["Modern", "Creative"],
    atsScore: 82,
    atsRationale: "Readable and structured, best when a role allows subtle visual polish.",
    recommendedFor: ["product", "design", "marketing", "startup"],
  },
  {
    id: "sb2nov",
    name: "Sb2nov ATS Classic",
    renderTheme: "sb2nov",
    image: "/theme-sb2nov.png",
    previewImage: "/theme-sb2nov.png",
    description: "Compact ATS-safe single-column format inspired by popular LaTeX resumes.",
    bestFor: "Engineering, academia, research, graduate applications",
    sectionOrderType: "academic",
    tags: ["ATS-Safe", "Dense"],
    atsScore: 94,
    atsRationale: "Full-width rules, simple contact row, standard section labels, and dense text flow.",
    recommendedFor: ["academic", "research", "graduate", "software"],
  },
  {
    id: "engineeringresumes",
    name: "Engineering ATS",
    renderTheme: "engineeringresumes",
    image: "/theme-engineeringresumes.png",
    previewImage: "/theme-engineeringresumes.png",
    description: "Engineering layout with strong scanability and work-first density.",
    bestFor: "Software, engineering, DevOps, data",
    sectionOrderType: "tech",
    tags: ["ATS-Safe", "Technical"],
    atsScore: 93,
    atsRationale: "Plain text, strong section rules, no icons, and compact engineering entries.",
    recommendedFor: ["software", "engineering", "devops", "data"],
  },
  {
    id: "engineeringclassic",
    name: "Entry Level ATS",
    renderTheme: "engineeringclassic",
    image: "/theme-engineeringclassic.png",
    previewImage: "/theme-engineeringclassic.png",
    description: "Education-first format for early-career candidates.",
    bestFor: "Students, fresh graduates, career changers",
    sectionOrderType: "entry_level",
    tags: ["Early Career", "ATS"],
    atsScore: 90,
    atsRationale: "Education-first order with straightforward section flow for early-career profiles.",
    recommendedFor: ["student", "new grad", "career changer", "education"],
  },
  {
    id: "ember",
    name: "Ember",
    renderTheme: "ember",
    image: "/theme-ember.png",
    previewImage: "/theme-ember.png",
    description: "Warm editorial styling with crisp professional spacing.",
    bestFor: "Consulting, creative leadership, business roles",
    sectionOrderType: "standard",
    tags: ["Editorial", "Warm"],
    atsScore: 76,
    atsRationale: "Professional but more editorial; use when visual tone matters more than maximum parser simplicity.",
    recommendedFor: ["consulting", "creative", "leadership", "business"],
  },
  {
    id: "harvard",
    name: "Harvard",
    renderTheme: "harvard",
    image: "/theme-harvard.png",
    previewImage: "/theme-harvard.png",
    description: "Classic academic presentation with compact detail.",
    bestFor: "Academic, policy, research, fellowships",
    sectionOrderType: "academic",
    tags: ["Academic", "Classic"],
    atsScore: 86,
    atsRationale: "Academic-friendly structure with conservative typography and traditional headings.",
    recommendedFor: ["academic", "policy", "research", "fellowship"],
  },
  {
    id: "ink",
    name: "Ink",
    renderTheme: "ink",
    image: "/theme-ink.png",
    previewImage: "/theme-ink.png",
    description: "High-contrast format with a strong editorial feel.",
    bestFor: "Leadership, writing, strategy, creative roles",
    sectionOrderType: "portfolio",
    tags: ["Bold", "Readable"],
    atsScore: 74,
    atsRationale: "Readable but intentionally stylized; best for human-led review flows.",
    recommendedFor: ["leadership", "writing", "strategy", "creative"],
  },
  {
    id: "opal",
    name: "Opal",
    renderTheme: "opal",
    image: "/theme-opal.png",
    previewImage: "/theme-opal.png",
    description: "Polished modern layout with refined visual rhythm.",
    bestFor: "Senior professionals, product, technology",
    sectionOrderType: "standard",
    tags: ["Polished", "Modern"],
    atsScore: 80,
    atsRationale: "Polished and readable, with more visual styling than the strict ATS presets.",
    recommendedFor: ["senior", "product", "technology", "management"],
  },
];

export const getTheme = (themeId: string): ThemeMeta => {
  return THEME_DATA.find((theme) => theme.id === themeId) || THEME_DATA.find((theme) => theme.id === "classic") || THEME_DATA[0];
};

export const getRenderThemeId = (themeId: string): string => {
  return getTheme(themeId).renderTheme;
};

export const getSectionIdsForTheme = (themeId: string): string[] => {
  return THEME_SECTION_ORDER[getTheme(themeId).sectionOrderType];
};

export const getDownloadSectionOrder = (themeId: string): string[] => {
  return getSectionIdsForTheme(themeId).filter((section) => section !== "profile" && section !== "design");
};

const hasEntryText = (entry: Entry | undefined): boolean => {
  if (!entry) return false;
  return Object.values(entry).some((value) => {
    if (Array.isArray(value)) return value.some((item) => String(item || "").trim());
    return String(value || "").trim();
  });
};

const profileText = (cvData: CVData): string => {
  return [
    cvData.headline,
    cvData.summary,
    ...cvData.skills.map((entry) => `${entry.label || ""} ${entry.details || ""}`),
    ...cvData.projects.map((entry) => `${entry.name || ""} ${entry.summary || ""} ${(entry.highlights || []).toString()}`),
    ...cvData.experience.map((entry) => `${entry.position || ""} ${entry.company || ""} ${entry.summary || ""}`),
  ].join(" ").toLowerCase();
};

export const recommendTemplate = (cvData: CVData): ThemeMeta => {
  const completeWork = cvData.experience.filter((entry) => entry.company && entry.position);
  const educationCount = cvData.education.filter((entry) => entry.institution || entry.area).length;
  const projectCount = cvData.projects.filter((entry) => hasEntryText(entry)).length;
  const publicationCount = cvData.publications.filter((entry) => hasEntryText(entry)).length;
  const text = profileText(cvData);

  if (publicationCount >= 2 || /research|publication|fellowship|phd|thesis|laboratory/.test(text)) {
    return getTheme("sb2nov");
  }

  if (completeWork.length >= 2) {
    return getTheme("sheets");
  }

  if (projectCount >= 1 || educationCount >= 1 || /student|graduate|intern|junior|software|developer|engineer/.test(text)) {
    return getTheme("jake");
  }

  if (/product|manager|lead|strategy|operations|consulting/.test(text)) {
    return getTheme("classic");
  }

  return getTheme("jake");
};

export const getTemplateFitScore = (themeId: string, cvData: CVData): { score: number; tip: string } => {
  const theme = getTheme(themeId);
  const recommended = recommendTemplate(cvData);
  const text = profileText(cvData);
  const hasResearch = cvData.publications.some(hasEntryText) || /research|publication|fellowship|phd/.test(text);
  const hasWorkDepth = cvData.experience.filter((entry) => entry.company && entry.position).length >= 2;
  const hasProjectDepth = cvData.projects.some(hasEntryText);
  let score = theme.atsScore;

  if (theme.id === recommended.id) score += 2;
  if (theme.sectionOrderType === "academic" && !hasResearch) score -= 4;
  if (theme.sectionOrderType === "recruiter" && !hasWorkDepth) score -= 3;
  if (theme.sectionOrderType === "early_tech" && (hasProjectDepth || !hasWorkDepth)) score += 1;
  if (theme.atsScore < 85 && recommended.atsScore >= 94) score -= 3;

  return {
    score: Math.max(60, Math.min(100, Math.round(score))),
    tip: theme.id === recommended.id ? "Best ATS match for this CV content." : theme.atsRationale,
  };
};
