import type { Metadata, Viewport } from "next";
import "./globals.css";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ToastProvider";
import PWARegistration from "@/components/PWARegistration";

export const metadata: Metadata = {
  title: "ApplyForge | ATS Application Workspace",
  description: "Build ATS-ready CVs, import resume PDFs, optimize live content, and draft tailored cover letters in one industrial application workspace.",
  keywords: ["ATS CV builder", "resume optimizer", "cover letter generator", "RenderCV editor", "job application workspace"],
  manifest: "/manifest.webmanifest",
  applicationName: "ApplyForge",
  openGraph: {
    title: "ApplyForge | ATS Application Workspace",
    description: "A focused workspace for ATS CVs, PDF import, AI enhancement, and cover letters.",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    title: "ApplyForge",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111827",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <PWARegistration />
        <ErrorBoundary>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
