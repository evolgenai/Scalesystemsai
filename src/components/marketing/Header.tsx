import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Documentation" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-zinc-950/70 backdrop-blur-md">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"
        aria-label="Main navigation"
      >
        <Link
          href="/"
          className="font-display text-xl font-bold tracking-tight text-white"
        >
          Scale<span className="text-cyan-400">Systems</span>
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm font-medium text-zinc-300 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-cyan-400"
          >
            Dashboard
          </Link>
        </div>

        {/* CSS-only mobile menu toggle (no JS state) */}
        <input
          type="checkbox"
          id="marketing-mobile-menu"
          className="peer hidden"
          aria-hidden="true"
        />
        <label
          htmlFor="marketing-mobile-menu"
          className="cursor-pointer rounded-lg p-2 text-zinc-300 hover:text-white md:hidden"
          aria-label="Toggle navigation menu"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
            />
          </svg>
        </label>

        <div className="absolute inset-x-0 top-full hidden border-b border-white/10 bg-zinc-950/95 backdrop-blur-md peer-checked:block md:hidden">
          <ul className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="mt-1">
              <Link
                href="/dashboard"
                className="block rounded-lg bg-cyan-500 px-3 py-2 text-center text-sm font-semibold text-zinc-950 transition-colors hover:bg-cyan-400"
              >
                Dashboard
              </Link>
            </li>
          </ul>
        </div>
      </nav>
    </header>
  );
}
