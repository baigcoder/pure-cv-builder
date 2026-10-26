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
      <Link href="/login" className="btn btn-secondary">
        <LogIn size={16} />
        Sign in
      </Link>
    );
  }

  return (
    <>
      {showDashboardLink && (
        <Link href="/dashboard" className="btn btn-secondary">
          <LayoutGrid size={16} />
          My CVs
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
        Sign out
      </button>
    </>
  );
}
