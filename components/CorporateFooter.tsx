import React from 'react';

interface CorporateFooterProps {
  productName?: string;
  /** Additional project-specific footer links */
  extraLinks?: { href: string; label: string; external?: boolean }[];
  /** Light or dark theme - defaults to dark */
  theme?: 'light' | 'dark';
}

export function CorporateFooter({ productName, extraLinks = [], theme = 'dark' }: CorporateFooterProps) {
  const isDark = theme === 'dark';

  return (
    <footer
      className={`border-t py-8 mt-auto ${
        isDark
          ? 'border-slate-800 bg-slate-950 text-slate-400'
          : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer content */}
        <div className="flex flex-col gap-6">
          {/* Top row: branding + contact */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[#22c55e] rounded flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <span>
                {productName ? (
                  <>
                    {productName} — Built by{' '}
                    <span className={isDark ? 'text-white font-medium' : 'text-slate-900 font-medium'}>
                      Corporate AI Solutions
                    </span>
                  </>
                ) : (
                  <>
                    Built by{' '}
                    <span className={isDark ? 'text-white font-medium' : 'text-slate-900 font-medium'}>
                      Corporate AI Solutions
                    </span>
                  </>
                )}
              </span>
            </div>

            {/* Contact links */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              <a
                href="https://www.corporateaisolutions.com"
                target="_blank"
                rel="noopener noreferrer"
                className={`hover:${isDark ? 'text-white' : 'text-slate-900'} transition-colors`}
              >
                corporateaisolutions.com
              </a>
              <span className="hidden sm:inline opacity-30">|</span>
              <a
                href="https://www.calendly.com/mcmdennis"
                target="_blank"
                rel="noopener noreferrer"
                className={`hover:${isDark ? 'text-white' : 'text-slate-900'} transition-colors`}
              >
                Book a Call
              </a>
              <span className="hidden sm:inline opacity-30">|</span>
              <a
                href="tel:+61402612471"
                className={`hover:${isDark ? 'text-white' : 'text-slate-900'} transition-colors`}
              >
                +61 402 612 471
              </a>
              <span className="hidden sm:inline opacity-30">|</span>
              <a
                href="mailto:dennis@corporateaisolutions.com"
                className={`hover:${isDark ? 'text-white' : 'text-slate-900'} transition-colors`}
              >
                dennis@corporateaisolutions.com
              </a>
            </div>
          </div>

          {/* Bottom row: project links + copyright */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs opacity-70">
            <div>&copy; {new Date().getFullYear()} Corporate AI Solutions. All rights reserved.</div>
            {extraLinks.length > 0 && (
              <div className="flex gap-4">
                {extraLinks.map((link) =>
                  link.external ? (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`hover:${isDark ? 'text-white' : 'text-slate-900'} transition-colors`}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <a
                      key={link.href}
                      href={link.href}
                      className={`hover:${isDark ? 'text-white' : 'text-slate-900'} transition-colors`}
                    >
                      {link.label}
                    </a>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
