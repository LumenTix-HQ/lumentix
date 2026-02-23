"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const Navbar = () => {
  const pathname = usePathname();

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Events", href: "/events" },
    { name: "Create", href: "/create" },
    { name: "Profile", href: "/profile" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center p-4">
      <div className="flex items-center space-x-8 px-6 py-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-lg transition-all hover:border-white/40">
        {navLinks.map((link) => (
          <Link
            key={link.name}
            href={link.href}
            className={`text-sm font-medium transition-colors hover:text-white ${
              pathname === link.href ? "text-white" : "text-gray-400"
            }`}
          >
            {link.name}
          </Link>
        ))}
      </div>
    </nav>
  );
};

export default Navbar;
