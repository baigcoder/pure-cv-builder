import { entryContentValues, type CVData, type DesignSettings, type Entry } from "@/lib/cvBuilder";

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
  /** Trending presets set their own font and accent colour when chosen. */
  defaults?: { fontFamily: string; primaryColor: string };
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
    id: "folio",
    name: "Folio",
    renderTheme: "folio",
    image: "/theme-folio.png",
    previewImage: "/theme-folio.png",
    description: "Folio's signature: a classic serif name over a clean sans body, with hairline rules.",
    bestFor: "Almost any role; a confident, modern default",
    sectionOrderType: "recruiter",
    tags: ["Signature", "ATS-Safe"],
    atsScore: 96,
    atsRationale: "Single column, standard headings and plain-text contact details.",
    recommendedFor: ["software", "product", "design", "marketing", "operations", "finance"],
    defaults: { fontFamily: "Source Sans 3", primaryColor: "#C2410C" },
  },
  {
    id: "atelier",
    name: "Atelier",
    renderTheme: "atelier",
    image: "/theme-atelier.png",
    previewImage: "/theme-atelier.png",
    description: "Quiet, airy and monochrome, with small section labels and no rules.",
    bestFor: "Design, product, architecture and creative roles",
    sectionOrderType: "portfolio",
    tags: ["Signature", "Minimal"],
    atsScore: 95,
    atsRationale: "Rule-free single column with standard section names.",
    recommendedFor: ["design", "product", "creative", "architecture", "ux"],
    defaults: { fontFamily: "Open Sauce Sans", primaryColor: "#1A1814" },
  },
  {
    id: "signal",
    name: "Signal",
    renderTheme: "signal",
    image: "/theme-signal.png",
    previewImage: "/theme-signal.png",
    description: "A bold name, heavy section rules and an accent-coloured headline.",
    bestFor: "Sales, marketing, leadership and customer-facing roles",
    sectionOrderType: "recruiter",
    tags: ["Signature", "Bold"],
    atsScore: 94,
    atsRationale: "Decorative weight only; content stays single-column with standard headings.",
    recommendedFor: ["sales", "marketing", "leadership", "growth", "consulting"],
    defaults: { fontFamily: "Source Sans 3", primaryColor: "#C2410C" },
  },
  {
    id: "scholar",
    name: "Scholar",
    renderTheme: "scholar",
    image: "/theme-scholar.png",
    previewImage: "/theme-scholar.png",
    description: "A bookish all-serif layout with small capitals, made for long academic records.",
    bestFor: "Academia, research, PhD and fellowship applications",
    sectionOrderType: "academic",
    tags: ["Signature", "Academic"],
    atsScore: 91,
    atsRationale: "Conventional single-column academic structure with standard headings.",
    recommendedFor: ["academic", "research", "phd", "fellowship", "science"],
    defaults: { fontFamily: "XCharter", primaryColor: "#1A1814" },
  },
  {
    id: "modern",
    name: "Modern Minimal",
    renderTheme: "modern",
    image: "/theme-modern.png",
    previewImage: "/theme-modern.png",
    description: "Clean sans-serif layout with airy spacing and hairline section rules.",
    bestFor: "Tech, product, design and most modern roles",
    sectionOrderType: "standard",
    tags: ["Modern", "ATS-Safe"],
    atsScore: 95,
    atsRationale: "Single column, standard headings, plain text links and no decorative elements.",
    recommendedFor: ["software", "product", "design", "marketing", "startup"],
    defaults: { fontFamily: "Open Sauce Sans", primaryColor: "#2563EB" },
  },
  {
    id: "executive",
    name: "Executive Serif",
    renderTheme: "executive",
    image: "/theme-executive.png",
    previewImage: "/theme-executive.png",
    description: "Refined serif typography with a centred header for senior roles.",
    bestFor: "Leadership, finance, legal, consulting",
    sectionOrderType: "recruiter",
    tags: ["Modern", "Senior"],
    atsScore: 92,
    atsRationale: "Conventional single-column flow; serif type parses as plain text.",
    recommendedFor: ["senior", "director", "executive", "finance", "legal", "consulting"],
    defaults: { fontFamily: "EB Garamond", primaryColor: "#1A365D" },
  },
  {
    id: "bold",
    name: "Bold Accent",
    renderTheme: "bold",
    image: "/theme-bold.png",
    previewImage: "/theme-bold.png",
    description: "Confident geometric type with a strong accent colour and accent rules.",
    bestFor: "Marketing, sales, creative and customer-facing roles",
    sectionOrderType: "standard",
    tags: ["Modern", "Bold"],
    atsScore: 93,
    atsRationale: "Colour is decorative only; structure stays single-column with standard headings.",
    recommendedFor: ["marketing", "sales", "creative", "brand", "growth"],
    defaults: { fontFamily: "Poppins", primaryColor: "#0D9488" },
  },
  {
    id: "startup",
    name: "Clean Startup",
    renderTheme: "startup",
    image: "/theme-startup.png",
    previewImage: "/theme-startup.png",
    description: "Lightweight, rule-free layout that lets project work stand out.",
    bestFor: "Startups, engineers with strong projects, early-career builders",
    sectionOrderType: "portfolio",
    tags: ["Modern", "Projects"],
    atsScore: 94,
    atsRationale: "No tables or lines to confuse parsers; clear headings and spacing.",
    recommendedFor: ["startup", "projects", "engineering", "new grad"],
    defaults: { fontFamily: "Raleway", primaryColor: "#0F766E" },
  },
  {
    id: "elegant",
    name: "Elegant Classic",
    renderTheme: "elegant",
    image: "/theme-elegant.png",
    previewImage: "/theme-elegant.png",
    description: "Timeless book-style serif with small-caps headings.",
    bestFor: "Academia, research, publishing and policy",
    sectionOrderType: "academic",
    tags: ["Modern", "Serif"],
    atsScore: 90,
    atsRationale: "Readable single column; small caps render as regular text for parsers.",
    recommendedFor: ["academic", "research", "publishing", "policy", "writing"],
    defaults: { fontFamily: "Libertinus Serif", primaryColor: "#334155" },
  },
  {
    id: "compact",
    name: "Compact One-Page",
    renderTheme: "compact",
    image: "/theme-compact.png",
    previewImage: "/theme-compact.png",
    description: "Tight spacing and smaller type to fit a full career on one page.",
    bestFor: "Experienced candidates who need everything on one page",
    sectionOrderType: "recruiter",
    tags: ["Modern", "One page"],
    atsScore: 95,
    atsRationale: "Dense but strictly single-column with standard section names.",
    recommendedFor: ["experienced", "one page", "engineering", "operations"],
    defaults: { fontFamily: "Lato", primaryColor: "#111827" },
  },
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

/** Design a template renders with: a preset's font and colour, unless it's the CV's current template. */
export const getTemplateDesign = (themeId: string, designSettings: DesignSettings, activeThemeId?: string): DesignSettings => {
  const defaults = getTheme(themeId).defaults;
  return defaults && themeId !== activeThemeId ? { ...designSettings, ...defaults } : designSettings;
};

export const getSectionIdsForTheme = (themeId: string): string[] => {
  return THEME_SECTION_ORDER[getTheme(themeId).sectionOrderType];
};

export const getDownloadSectionOrder = (themeId: string): string[] => {
  return getSectionIdsForTheme(themeId).filter((section) => section !== "profile" && section !== "design");
};

const hasEntryText = (entry: Entry | undefined): boolean => {
  if (!entry) return false;
  return entryContentValues(entry).some((value) => {
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
    return getTheme("scholar");
  }

  if (completeWork.length >= 2) {
    return getTheme("folio");
  }

  if (projectCount >= 1 || educationCount >= 1 || /student|graduate|intern|junior|software|developer|engineer/.test(text)) {
    return getTheme("jake");
  }

  if (/product|manager|lead|strategy|operations|consulting|sales|marketing/.test(text)) {
    return getTheme("signal");
  }

  return getTheme("jake");
};
