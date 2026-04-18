import React from 'react';

interface CorporateHeaderProps {
  /** Product/project name displayed in header */
  productName: string;
  /** Short product acronym for the logo badge (1-3 chars) */
  productAcronym?: string;
  /** Navigation items for this project */
  navItems?: { href: string; label: string }[];
  /** Currently active path for highlighting nav */
  activePath?: string;
  /** Right-side content (auth buttons, etc.) — render prop */
  rightContent?: React.ReactNode;
  /** Light or dark theme */
  theme?: 'light' | 'dark';
  /** Link component override for framework compatibility (Next.js Link, etc.) */
  LinkComponent?: React.ElementType;
}

export function CorporateHeader({
  productName,
  productAcronym,
  navItems = [],
  activePath,
  rightContent,
  theme = 'dark',
  LinkComponent = 'a',
}: CorporateHeaderProps) {
  const isDark = theme === 'dark';
  const acronym = productAcronym || productName.slice(0, 2).toUpperCase();
  const Link = LinkComponent;

  return (
    <>
      {/* Desktop header */}
      <header
        className={`border-b sticky top-0 z-50 ${
          isDark
            ? 'border-slate-800 bg-slate-950/80 backdrop-blur-xl'
            : 'border-slate-200 bg-white/80 backdrop-blur-xl'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo + branding */}
            <Link href="/" className="flex items-center gap-3 group no-underline">
              <div className="w-8 h-8 bg-[#22c55e] rounded-lg flex items-center justify-center text-white font-bold text-sm group-hover:bg-[#4ade80] transition-colors">
                {acronym}
              </div>
              <div className="flex items-center">
                <span
                  className={`font-semibold text-lg ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {productName}
                </span>
                <span
                  className={`text-xs ml-2 hidden sm:inline ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  by Corporate AI Solutions
                </span>
              </div>
            </Link>

            {/* Desktop nav */}
            {navItems.length > 0 && (
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 rounded-lg text-sm transition-colors duration-200 no-underline ${
                      activePath === item.href
                        ? isDark
                          ? 'text-white bg-slate-800'
                          : 'text-slate-900 bg-slate-100'
                        : isDark
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}

            {/* Right side content */}
            {rightContent && (
              <div className="flex items-center gap-3">{rightContent}</div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      {navItems.length > 0 && (
        <nav
          className={`md:hidden border-b px-4 py-2 flex gap-1 overflow-x-auto ${
            isDark
              ? 'border-slate-800 bg-slate-900'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap text-sm px-3 py-1.5 rounded-lg no-underline ${
                activePath === item.href
                  ? isDark
                    ? 'text-white bg-slate-800'
                    : 'text-slate-900 bg-slate-200'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
