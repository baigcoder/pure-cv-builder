/** Pure helpers that infer cover-letter context (role, country, skills) from a CV. */
import { CVData, getString, getStringList } from "@/lib/cvBuilder";

const COUNTRY_HINTS = [
    "Pakistan",
    "India",
    "United States",
    "USA",
    "Canada",
    "United Kingdom",
    "UK",
    "United Arab Emirates",
    "UAE",
    "Germany",
    "France",
    "Australia",
    "Saudi Arabia",
];

export const inferCountryFromLocation = (location: string): string => {
    const normalizedLocation = location.trim();
    if (!normalizedLocation) return "";
    const directMatch = COUNTRY_HINTS.find(country =>
        new RegExp(`\\b${country.replace(/\s+/g, "\\s+")}\\b`, "i").test(normalizedLocation)
    );
    if (directMatch) return directMatch;
    const parts = normalizedLocation.split(",").map(part => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : "";
};

const SKILL_CATEGORY_LABELS = new Set([
    "backend",
    "cloud",
    "databases",
    "devops",
    "frameworks",
    "frontend",
    "languages",
    "programming languages",
    "soft skills",
    "technical skills",
    "technologies",
    "tools",
]);

const cleanAutoText = (value: string): string => (
    value
        .replace(/\s*\|\s*live demo\b.*$/i, "")
        .replace(/\b(live demo|source code|github)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
);

const cleanAutoRole = (value: string): string => (
    cleanAutoText(value)
        .replace(/\s*\((project|contract|internship|remote)\)\s*/gi, " ")
        .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b.*$/i, "")
        .replace(/\s+/g, " ")
        .trim()
);

export const inferTargetRole = (cvData: CVData, currentRole: string): string => {
    const current = cleanAutoRole(currentRole);
    if (current) return current;
    const headline = cleanAutoRole(cvData.headline);
    if (headline) return headline;
    const firstExperience = cvData.experience.find(entry => getString(entry.position).trim());
    if (firstExperience) return cleanAutoRole(getString(firstExperience.position)) || "Professional";
    const firstProject = cvData.projects.find(entry => getString(entry.summary).trim());
    if (firstProject) return cleanAutoRole(getString(firstProject.summary)) || "Professional";
    return "Professional";
};

export const getAutoSkillTerms = (cvData: CVData): string[] => {
    const terms = cvData.skills.flatMap(entry => {
        const label = getString(entry.label);
        const details = getString(entry.details);
        const parts = details.split(/[,;/|]/);
        if (label && !SKILL_CATEGORY_LABELS.has(label.trim().toLowerCase())) {
            parts.unshift(label);
        }
        return parts;
    });
    return Array.from(new Set(terms.map(term => cleanAutoText(term)).filter(Boolean))).slice(0, 14);
};

export const buildAutoCoverLetterContext = (cvData: CVData, targetRole: string): string => {
    const country = inferCountryFromLocation(cvData.location);
    const skills = getAutoSkillTerms(cvData);
    const experience = cvData.experience
        .slice(0, 3)
        .map(entry => {
            const role = getString(entry.position);
            const company = getString(entry.company);
            const highlights = getStringList(entry.highlights).slice(0, 2).join("; ");
            return [role && company ? `${role} at ${company}` : role || company, highlights].filter(Boolean).join(": ");
        })
        .filter(Boolean);
    const projects = cvData.projects
        .slice(0, 2)
        .map(entry => {
            const summary = [getString(entry.name), getString(entry.summary)].filter(Boolean).join(": ");
            const liveLink = getString(entry.url);
            return [summary, liveLink ? `Live demo: ${liveLink}` : ""].filter(Boolean).join(" - ");
        })
        .filter(Boolean);
    const education = cvData.education
        .slice(0, 2)
        .map(entry => [getString(entry.degree), getString(entry.area), getString(entry.institution)].filter(Boolean).join(", "))
        .filter(Boolean);

    return [
        `Target role: ${targetRole}.`,
        cvData.location ? `Candidate location: ${cvData.location}.` : "",
        country ? `Country or market context: ${country}.` : "",
        cvData.summary ? `Professional summary: ${cvData.summary}` : "",
        skills.length ? `Key skills to emphasize: ${skills.join(", ")}.` : "",
        experience.length ? `Relevant experience: ${experience.join(" | ")}.` : "",
        projects.length ? `Relevant projects: ${projects.join(" | ")}.` : "",
        education.length ? `Education context: ${education.join(" | ")}.` : "",
        "Write a strong one-page cover letter for hiring teams. Match the candidate's location, skills, and edited live CV data. Keep it specific, confident, ATS-readable, and plain text.",
    ].filter(Boolean).join("\n");
};
