import { CVData, normalizeCVData } from "@/lib/cvBuilder";

/** A fictional, complete CV for exploring the editor. Not a real person. */
export const createSampleCV = (): CVData =>
  normalizeCVData({
    name: "Jordan Rivera",
    headline: "Senior Full-Stack Engineer",
    email: "jordan.rivera@example.com",
    phone: "",
    location: "Toronto, Canada",
    website: "jordanrivera.dev",
    linkedin: "jordanrivera",
    github: "jordanrivera",
    summary:
      "Full-stack engineer with 7 years building reliable web products in TypeScript and Python. Led the rebuild of a payments dashboard used by 40k merchants and mentor a team of four engineers.",
    experience: [
      {
        company: "Northwind Payments",
        position: "Senior Software Engineer",
        start_date: "2021-03",
        end_date: "present",
        location: "Toronto, Canada",
        highlights: [
          "Led the rebuild of the merchant dashboard in React and TypeScript, cutting page load time from 4.1s to 1.3s",
          "Designed REST APIs in FastAPI and PostgreSQL serving 2M requests per day",
          "Mentored four engineers and introduced code review guidelines adopted across the org",
        ],
      },
      {
        company: "Brightlane",
        position: "Software Engineer",
        start_date: "2018-06",
        end_date: "2021-02",
        location: "Remote",
        highlights: [
          "Built a real-time inventory sync between Shopify and warehouse systems using Node.js and Redis",
          "Set up CI/CD with GitHub Actions and Docker, reducing release time from days to under an hour",
        ],
      },
    ],
    education: [
      {
        institution: "University of Waterloo",
        area: "Computer Science",
        degree: "BSc",
        start_date: "2014-09",
        end_date: "2018-05",
        location: "Waterloo, Canada",
        highlights: ["Dean's Honours List"],
      },
    ],
    skills: [
      { label: "Languages", details: "TypeScript, Python, SQL, Go" },
      { label: "Frameworks", details: "React, Next.js, Node.js, FastAPI" },
      { label: "Infrastructure", details: "PostgreSQL, Redis, Docker, AWS, GitHub Actions" },
    ],
    projects: [
      {
        name: "OpenInvoice",
        start_date: "2022-01",
        end_date: "present",
        url: "github.com/jordanrivera/openinvoice",
        summary: "Open-source invoicing tool for freelancers.",
        highlights: ["1.2k GitHub stars; PDF generation and Stripe payments"],
      },
    ],
  });
