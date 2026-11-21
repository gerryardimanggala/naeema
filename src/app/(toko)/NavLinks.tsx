"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Menu toko di baris kedua header. Di HP menu turun ke baris berikutnya, jadi semua tetap terlihat. */
export default function NavLinks({ links }: { links: [string, string][] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={`whitespace-nowrap rounded-md px-2.5 py-1.5 ${
            active(href) ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
