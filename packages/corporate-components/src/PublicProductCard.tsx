'use client';

/**
 * PublicProductCard Component
 * 
 * Read-only display of a product's validation schema.
 * Shows all validation fields with tooltips and gate scores.
 * Includes "This is a real product in our pipeline" badge.
 */

import React, { useState } from 'react';
import {
  CheckCircle,
  AlertCircle,
  Info,
  Badge,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

export interface PublicProductCardProps {
  product: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    promise?: string;
    distributor?: string;
    end_user?: string;
    friction?: string;
    gate_scores?: {
      hard_gates_passed?: number;
      hard_gates_total?: number;
      weighted_score_percent?: number;
      gate1_ready?: boolean;
    };
  };
  showBadge?: boolean;
}

interface TooltipProps {
  children: React.ReactNode;
  text: string;
}

/**
 * Tooltip component for field explanations
 */
function Tooltip({ children, text }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex">
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="flex items-center gap-1 cursor-help"
      >
        {children}
        <Info className="w-4 h-4 text-gray-400 hover:text-gray-600" />
      </div>
      {show && (
        <div className="absolute bottom-full left-0 mb-2 p-2 bg-gray-900 text-white text-sm rounded shadow-lg whitespace-nowrap z-10">
          {text}
          <div className="absolute top-full left-2 w-2 h-2 bg-gray-900 transform rotate-45" />
        </div>
      )}
    </div>
  );
}

/**
 * Gate score badge component
 */
function GateScoreBadge({ label, value, status }: { label: string; value: string | number; status: 'pass' | 'fail' | 'pending' }) {
  const statusClasses = {
    pass: 'bg-green-50 border-green-200 text-green-900',
    fail: 'bg-red-50 border-red-200 text-red-900',
    pending: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  };

  const icon = {
    pass: <CheckCircle className="w-4 h-4 text-green-600" />,
    fail: <AlertCircle className="w-4 h-4 text-red-600" />,
    pending: <AlertCircle className="w-4 h-4 text-yellow-600" />,
  }[status];

  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border ${statusClasses[status]}`}>
      {icon}
      <div>
        <p className="text-xs font-semibold uppercase">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

export function PublicProductCard({
  product,
  showBadge = true,
}: PublicProductCardProps) {
  const gateScores = product.gate_scores || {};
  const gateStatus = gateScores.gate1_ready ? 'pass' : 'pending';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
      {/* Header with badge */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">{product.name}</h2>
            <p className="text-gray-600 mt-2">{product.slug}</p>
          </div>
          {showBadge && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-900 rounded-full border border-blue-300 text-sm font-semibold">
              <Badge className="w-4 h-4" />
              In Our Pipeline
            </div>
          )}
        </div>

        {/* One-line pitch */}
        {product.promise && (
          <p className="text-lg text-blue-900 font-semibold">{product.promise}</p>
        )}
        {product.description && (
          <p className="text-gray-600 mt-2">{product.description}</p>
        )}
      </div>

      {/* Validation Fields */}
      <div className="p-6 sm:p-8 space-y-8">
        {/* Distributor */}
        {product.distributor && (
          <div className="border-l-4 border-blue-400 pl-4">
            <Tooltip text="Who sells this product and what's in it for them?">
              <h3 className="text-sm font-semibold uppercase text-gray-500">Distributor</h3>
            </Tooltip>
            <p className="text-lg text-gray-900 mt-2 font-medium">{product.distributor}</p>
          </div>
        )}

        {/* End User */}
        {product.end_user && (
          <div className="border-l-4 border-indigo-400 pl-4">
            <Tooltip text="Who actually uses the product? What is their job?">
              <h3 className="text-sm font-semibold uppercase text-gray-500">End User</h3>
            </Tooltip>
            <p className="text-lg text-gray-900 mt-2 font-medium">{product.end_user}</p>
          </div>
        )}

        {/* Friction Point */}
        {product.friction && (
          <div className="border-l-4 border-purple-400 pl-4">
            <Tooltip text="What problem does this solve? What pain does it remove?">
              <h3 className="text-sm font-semibold uppercase text-gray-500">Friction Point</h3>
            </Tooltip>
            <p className="text-lg text-gray-900 mt-2 font-medium">{product.friction}</p>
          </div>
        )}
      </div>

      {/* Gate Scores */}
      {Object.keys(gateScores).length > 0 && (
        <div className="bg-gray-50 border-t border-gray-200 p-6 sm:p-8">
          <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Gate 1 Readiness
          </h3>

          <div className="space-y-4">
            {/* Hard Gates */}
            {gateScores.hard_gates_total && (
              <GateScoreBadge
                label="Hard Gates (Pass/Fail)"
                value={`${gateScores.hard_gates_passed} / ${gateScores.hard_gates_total}`}
                status={
                  gateScores.hard_gates_passed === gateScores.hard_gates_total
                    ? 'pass'
                    : 'fail'
                }
              />
            )}

            {/* Weighted Gates */}
            {gateScores.weighted_score_percent !== undefined && (
              <GateScoreBadge
                label="Weighted Gates (Target 80%)"
                value={`${Math.round(gateScores.weighted_score_percent)}%`}
                status={
                  gateScores.weighted_score_percent >= 80 ? 'pass' : 'pending'
                }
              />
            )}

            {/* Overall Status */}
            <div className="mt-6 p-4 rounded-lg border-2 border-green-300 bg-green-50">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-green-900">
                    {gateStatus === 'pass' ? '✓ GO: Gate 1 Approved' : '⏳ Pending Review'}
                  </p>
                  <p className="text-sm text-green-800">
                    {gateStatus === 'pass'
                      ? 'Approved for validation outreach to distributors'
                      : 'Awaiting final readiness audit'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Help text */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
            <p>
              <strong>What these scores mean:</strong> The product was audited against 45
              criteria covering responsive design, auth pattern, security, promise attributes, and
              more. A GO decision means the MVP is ready for Gate 1 outreach to validate demand.
            </p>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="bg-gray-50 border-t border-gray-200 p-6 sm:p-8 text-center text-sm text-gray-600">
        <p>
          This is a real product in the Corporate AI Solutions validation pipeline. Data shown
          is current as of the last gate review.
        </p>
      </div>
    </div>
  );
}

export default PublicProductCard;
