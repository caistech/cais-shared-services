/**
 * Badge SVG Renderer
 *
 * Generates self-contained SVG badges for Agent Trust Scores.
 * No external dependencies — pure string template.
 */

import type { Grade, TrustScoreReport } from "./types";

const GRADE_COLORS: Record<string, string> = {
  A: "#22c55e",   // green
  "A-": "#22c55e",
  "B+": "#eab308", // yellow
  B: "#eab308",
  "B-": "#eab308",
  "C+": "#f97316", // orange
  C: "#f97316",
  "C-": "#f97316",
  D: "#ef4444",    // red
  grey: "#9ca3af",
};

function getColor(grade: Grade | "grey"): string {
  return GRADE_COLORS[grade] ?? GRADE_COLORS.grey;
}

function shortGrade(grade: Grade): string {
  return grade;
}

/**
 * Generate a compact SVG badge showing the overall grade and dimension scores.
 */
export function renderBadge(report: TrustScoreReport): string {
  const color = getColor(report.overall_grade);
  const scanDate = report.scan_date.slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="88" viewBox="0 0 280 88">
  <defs>
    <style>
      .label { font: bold 11px 'Segoe UI', system-ui, sans-serif; fill: #fff; }
      .value { font: bold 11px 'Segoe UI', system-ui, sans-serif; fill: #fff; }
      .grade { font: bold 24px 'Segoe UI', system-ui, sans-serif; fill: #fff; }
      .dim { font: 10px 'Segoe UI', system-ui, sans-serif; fill: #fff; opacity: 0.9; }
      .date { font: 9px 'Segoe UI', system-ui, sans-serif; fill: #fff; opacity: 0.7; }
    </style>
  </defs>
  <rect width="280" height="88" rx="6" fill="#1e293b"/>
  <rect x="0" y="0" width="110" height="88" rx="6" fill="${color}"/>
  <rect x="104" y="0" width="6" height="88" fill="${color}"/>

  <!-- Left: Grade -->
  <text x="55" y="22" text-anchor="middle" class="label">Platform Trust</text>
  <text x="55" y="56" text-anchor="middle" class="grade">${report.overall_grade}</text>
  <text x="55" y="72" text-anchor="middle" class="dim">${report.overall_score}/100</text>

  <!-- Right: Dimensions -->
  <text x="125" y="20" class="dim">Agent Safety</text>
  <text x="250" y="20" text-anchor="end" class="dim">${report.dimensions.agent_safety.grade} (${report.dimensions.agent_safety.score})</text>

  <text x="125" y="35" class="dim">Code Security</text>
  <text x="250" y="35" text-anchor="end" class="dim">${report.dimensions.code_security.grade} (${report.dimensions.code_security.score})</text>

  <text x="125" y="50" class="dim">Cost Governance</text>
  <text x="250" y="50" text-anchor="end" class="dim">${report.dimensions.cost_governance.grade} (${report.dimensions.cost_governance.score})</text>

  <text x="125" y="65" class="dim">Compliance</text>
  <text x="250" y="65" text-anchor="end" class="dim">${report.dimensions.compliance.grade} (${report.dimensions.compliance.score})</text>

  <text x="125" y="82" class="date">Last scan: ${scanDate}</text>
</svg>`;
}

/**
 * Generate an expired/not-scanned badge.
 */
export function renderExpiredBadge(projectSlug: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="30" viewBox="0 0 200 30">
  <defs>
    <style>
      .label { font: bold 11px 'Segoe UI', system-ui, sans-serif; fill: #fff; }
    </style>
  </defs>
  <rect width="200" height="30" rx="4" fill="#9ca3af"/>
  <text x="100" y="19" text-anchor="middle" class="label">Platform Trust: Not Scanned</text>
</svg>`;
}
