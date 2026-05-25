export type SectionOrderType = "standard" | "academic" | "tech" | "entry_level" | "portfolio";

export interface ThemeMeta {
  id: string;
  name: string;
  image: string;
  previewImage: string;
  description: string;
  bestFor: string;
  sectionOrderType: SectionOrderType;
  tags: string[];
}

export const THEME_SECTION_ORDER: Record<SectionOrderType, string[]> = {
  standard: ["profile", "education", "experience", "projects", "publications", "honors", "skills", "patents", "talks", "design"],
  academic: ["profile", "education", "publications", "talks", "projects", "experience", "honors", "skills", "patents", "design"],
  tech: ["profile", "skills", "experience", "projects", "education", "publications", "patents", "honors", "talks", "design"],
  entry_level: ["profile", "education", "projects", "skills", "experience", "honors", "publications", "patents", "talks", "design"],
  portfolio: ["profile", "projects", "experience", "skills", "education", "publications", "honors", "patents", "talks", "design"],
};

export const THEME_DATA: ThemeMeta[] = [
  {
    id: "classic",
    name: "Classic Professional",
    image: "/theme-classic.png",
    previewImage: "/theme-classic.png",
    description: "Traditional professional layout with refined typography.",
    bestFor: "Corporate, finance, legal, operations",
    sectionOrderType: "standard",
    tags: ["ATS-Friendly", "Formal"],
  },
  {
    id: "moderncv",
    name: "Modern Minimal",
    image: "/theme-moderncv.png",
    previewImage: "/theme-moderncv.png",
    description: "Modern structure with a clean, confident hierarchy.",
    bestFor: "Product, design, marketing, startups",
    sectionOrderType: "standard",
    tags: ["Modern", "Creative"],
  },
  {
    id: "sb2nov",
    name: "Academic Focus",
    image: "/theme-sb2nov.png",
    previewImage: "/theme-sb2nov.png",
    description: "Research-oriented layout optimized for dense detail.",
    bestFor: "Academia, research, graduate applications",
    sectionOrderType: "academic",
    tags: ["Academic", "Detailed"],
  },
  {
    id: "engineeringresumes",
    name: "Technical Precision",
    image: "/theme-engineeringresumes.png",
    previewImage: "/theme-engineeringresumes.png",
    description: "Engineering layout with strong scanability.",
    bestFor: "Software, engineering, DevOps, data",
    sectionOrderType: "tech",
    tags: ["Tech-Focused", "Clean"],
  },
  {
    id: "engineeringclassic",
    name: "Entry Level",
    image: "/theme-engineeringclassic.png",
    previewImage: "/theme-engineeringclassic.png",
    description: "Education-first format for early-career candidates.",
    bestFor: "Students, fresh graduates, career changers",
    sectionOrderType: "entry_level",
    tags: ["Early Career", "Structured"],
  },
  {
    id: "ember",
    name: "Ember",
    image: "/theme-ember.png",
    previewImage: "/theme-ember.png",
    description: "Warm editorial styling with crisp professional spacing.",
    bestFor: "Consulting, creative leadership, business roles",
    sectionOrderType: "standard",
    tags: ["Editorial", "Warm"],
  },
  {
    id: "harvard",
    name: "Harvard",
    image: "/theme-harvard.png",
    previewImage: "/theme-harvard.png",
    description: "Classic academic presentation with compact detail.",
    bestFor: "Academic, policy, research, fellowships",
    sectionOrderType: "academic",
    tags: ["Academic", "Classic"],
  },
  {
    id: "ink",
    name: "Ink",
    image: "/theme-ink.png",
    previewImage: "/theme-ink.png",
    description: "High-contrast format with a strong editorial feel.",
    bestFor: "Leadership, writing, strategy, creative roles",
    sectionOrderType: "portfolio",
    tags: ["Bold", "Readable"],
  },
  {
    id: "opal",
    name: "Opal",
    image: "/theme-opal.png",
    previewImage: "/theme-opal.png",
    description: "Polished modern layout with refined visual rhythm.",
    bestFor: "Senior professionals, product, technology",
    sectionOrderType: "standard",
    tags: ["Polished", "Modern"],
  },
];

export const getTheme = (themeId: string): ThemeMeta => {
  return THEME_DATA.find((theme) => theme.id === themeId) || THEME_DATA[0];
};

export const getSectionIdsForTheme = (themeId: string): string[] => {
  return THEME_SECTION_ORDER[getTheme(themeId).sectionOrderType];
};

export const getDownloadSectionOrder = (themeId: string): string[] => {
  return getSectionIdsForTheme(themeId).filter((section) => section !== "profile" && section !== "design");
};
