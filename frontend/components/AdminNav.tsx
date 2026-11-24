"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_LINKS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
] as const;

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-8 flex items-center gap-2" aria-label="Admin sections">
      {ADMIN_LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              active
                ? "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}