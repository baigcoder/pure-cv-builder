import {
    Award,
    BookOpen,
    BriefcaseBusiness,
    FileBadge,
    GraduationCap,
    Mic,
    Palette,
    Rocket,
    ScrollText,
    UserRound,
} from "lucide-react";

/** Folio mark: a page with a folded corner and a vermilion rule. */
export const Logo = ({ width = 24, height = 24, logoColor = "var(--brand-solid)", iconColor = "var(--bg)" }) => (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M4.5 2h11L20 6.5V22H4.5z" fill={logoColor} />
        <path d="M15.5 2v4.5H20" fill={iconColor} fillOpacity="0.35" />
        <rect x="7.5" y="11" width="9" height="1.8" fill="#D9480F" />
        <rect x="7.5" y="15" width="6" height="1.8" fill={iconColor} fillOpacity="0.55" />
    </svg>
);

/** Mark plus the serif wordmark. */
export const Wordmark = ({ size = 24 }: { size?: number }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.35 }}>
        <Logo width={size} height={size} />
        <span style={{ fontFamily: "var(--font-display)", fontSize: size * 1.05, lineHeight: 1, color: "var(--text)" }}>
            Folio<span style={{ color: "var(--accent)" }}>.</span>
        </span>
    </span>
);

const iconProps = { size: 18, strokeWidth: 2 };

export const Icons = {
    profile: () => <UserRound {...iconProps} />,
    experience: () => <BriefcaseBusiness {...iconProps} />,
    education: () => <GraduationCap {...iconProps} />,
    skills: () => <ScrollText {...iconProps} />,
    projects: () => <Rocket {...iconProps} />,
    publications: () => <BookOpen {...iconProps} />,
    honors: () => <Award {...iconProps} />,
    patents: () => <FileBadge {...iconProps} />,
    talks: () => <Mic {...iconProps} />,
    design: () => <Palette {...iconProps} />,
};
