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

export const Logo = ({ width = 24, height = 24, logoColor = "#111827", iconColor = "#F8FAFC" }) => (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" rx="6" fill={logoColor} />
        <path d="M6.75 18L12 6L17.25 18" stroke={iconColor} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.15 13.35H14.85" stroke="#38BDF8" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
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
