"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /setup (the old single-tenant "create the one admin" bootstrap wizard) is
// replaced entirely by /register, which creates a new Company + its first
// Admin together - see src/app/(auth)/register/page.tsx and
// src/app/api/register/route.ts. Kept as a redirect for old bookmarks/links.
export default function SetupRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/register");
  }, [router]);
  return null;
}
