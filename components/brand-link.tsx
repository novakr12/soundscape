"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Logo, { Wordmark } from "./logo";

export default function BrandLink() {
  const pathname = usePathname();
  const [clicks, setClicks] = useState(0);

  return (
    <Link
      href="/"
      className="brand"
      aria-current={pathname === "/" ? "page" : undefined}
      onClick={() => setClicks((count) => count + 1)}
    >
      <span key={clicks} className={clicks > 0 ? "animated" : undefined}>
        <Logo />
      </span>
      <Wordmark />
    </Link>
  );
}
