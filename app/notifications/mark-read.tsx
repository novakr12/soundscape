"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { markNotificationsRead } from "./actions";

export default function MarkRead() {
  const router = useRouter();
  useEffect(() => {
    markNotificationsRead().then(() => router.refresh());
  }, [router]);
  return null;
}
