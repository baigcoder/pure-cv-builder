import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PURE | Professional CV Builder",
  description: "Create stunning, ATS-optimized CVs with precision and minimalist elegance. Free professional resume templates.",
  keywords: ["CV builder", "resume builder", "professional CV", "ATS resume", "free CV maker"],
  authors: [{ name: "PURE" }],
  openGraph: {
    title: "PURE | Professional CV Builder",
    description: "Create stunning, ATS-optimized CVs with precision and elegance.",
    type: "website",
  },
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#1e3a5f" />
      </head>
      <body>{children}</body>
    </html>
  );
}
