"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

/** Header links for accounts. Renders nothing when accounts aren't configured. */
export function AccountMenu({ showDashboardLink = true }: { showDashboardLink?: boolean }) {
  const { enabled, loading, user, signOut } = useAuth();
  const router = useRouter();

  if (!enabled || loading) return null;

  if (!user) {
    return (
      <Link href="/login" className="btn btn-secondary" title="Sign in" aria-label="Sign in">
        <LogIn size={16} />
        <span className="btn-label">Sign in</span>
      </Link>
    );
  }

  return (
    <>
      {showDashboardLink && (
        <Link href="/dashboard" className="btn btn-secondary" title="My CVs" aria-label="My CVs">
          <LayoutGrid size={16} />
          <span className="btn-label">My CVs</span>
        </Link>
      )}
      <button
        type="button"
        className="btn btn-secondary"
        aria-label="Sign out"
        title={`Signed in as ${user.email ?? ""}`}
        onClick={async () => {
          await signOut();
          router.push("/");
        }}
      >
        <LogOut size={16} />
        <span className="btn-label">Sign out</span>
      </button>
    </>
  );
}
