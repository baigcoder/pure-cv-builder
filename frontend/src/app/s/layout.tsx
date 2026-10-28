import type { Metadata } from "next";

// Shared CVs are personal documents: keep them out of search results.
export const metadata: Metadata = {
  title: "Shared CV | Folio",
  robots: { index: false, follow: false },
};

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
