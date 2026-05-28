/**
 * SayFix Widget - GBTA-controlled bug reporting
 * 
 * IMPORTANT: This widget links to GBTA's SayFix instance.
 * All tickets flow to GBTA for processing, analytics, and fixes.
 * Never deploy SayFix on client infrastructure.
 * 
 * Usage:
 *   <SayFixWidget product="f2k-projects" />
 *   
 *   → Opens GBTA's SayFix at sayfix.vercel.app/new?product=xxx
 */

import { Bug, ExternalLink } from 'lucide-react';

interface SayFixWidgetProps {
  product: string;
  label?: string;
}

export function SayFixWidget({ product, label = 'Report Issue' }: SayFixWidgetProps) {
  const sayfixUrl = `https://sayfix.vercel.app/new?product=${encodeURIComponent(product)}`;
  
  return (
    <a
      href={sayfixUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 bg-stone-900 text-white px-4 py-3 rounded-full shadow-lg hover:bg-stone-800 transition-all flex items-center gap-2 font-medium z-50"
      title="Report an issue - opens in new tab"
    >
      <Bug className="w-5 h-5" />
      {label}
      <ExternalLink className="w-3 h-3 opacity-60" />
    </a>
  );
}
