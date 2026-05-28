'use client';

import React, { useState, useCallback } from 'react';
import { ExplanatoryHeader } from '../headers/ExplanatoryHeader';

export interface CommitmentPanelProps {
  productName: string;
  what?: string;
  todo?: string;
  matters?: string;
  onRun?: (input: string) => Promise<RunResult>;
  onReport?: (email: string, context?: string) => Promise<ReportResult>;
  onPilot?: (data: PilotData) => Promise<PilotResult>;
  calendarUrl?: string;
  runPlaceholder?: string;
  runCta?: string;
  reportCta?: string;
  pilotCta?: string;
  className?: string;
}

export interface RunResult {
  output: string;
  success: boolean;
}

export interface ReportResult {
  url?: string;
  message: string;
  success: boolean;
}

export interface PilotData {
  companyName: string;
  clientCount: number;
  email: string;
}

export interface PilotResult {
  success: boolean;
  message: string;
}

export function CommitmentPanel(props: CommitmentPanelProps) {
  const {
    productName,
    what = 'Try it now',
    todo = 'Run this on your real data to see exactly what output you\'ll get.',
    matters = 'If it fits your workflow, you can request early access or offer this to your clients.',
    onRun,
    onReport,
    onPilot,
    calendarUrl,
    runPlaceholder = 'Paste your real case, data, or problem here...',
    runCta = 'Run on my data',
    reportCta = 'Get full report',
    pilotCta = 'Start pilot',
    className = '',
  } = props;

  const [runInput, setRunInput] = useState('');
  const [runOutput, setRunOutput] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [reportEmail, setReportEmail] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [pilotData, setPilotData] = useState<PilotData>({
    companyName: '',
    clientCount: 1,
    email: '',
  });
  const [pilotLoading, setPilotLoading] = useState(false);

  const handleRun = useCallback(async () => {
    if (!runInput.trim() || !onRun) return;
    setRunLoading(true);
    try {
      const result = await onRun(runInput);
      setRunOutput(result.output);
    } catch {
      setRunOutput('Error running analysis. Please try again.');
    } finally {
      setRunLoading(false);
    }
  }, [runInput, onRun]);

  const handleReport = useCallback(async () => {
    if (!reportEmail.trim() || !onReport) return;
    setReportLoading(true);
    try {
      await onReport(reportEmail, runInput);
      setReportEmail('');
      alert('Report generated! Check your email.');
    } catch {
      alert('Error generating report. Please try again.');
    } finally {
      setReportLoading(false);
    }
  }, [reportEmail, onReport, runInput]);

  const handlePilot = useCallback(async () => {
    if (!pilotData.companyName || !pilotData.email || !onPilot) return;
    setPilotLoading(true);
    try {
      await onPilot(pilotData);
      setPilotData({ companyName: '', clientCount: 1, email: '' });
      alert('Pilot request received! We\'ll be in touch.');
    } catch {
      alert('Error submitting pilot request. Please try again.');
    } finally {
      setPilotLoading(false);
    }
  }, [pilotData, onPilot]);

  return (
    <div
      className={`border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 ${className}`}
      data-cais-commitment-panel={productName}
    >
      <div className="p-4 sm:p-6">
        <ExplanatoryHeader
          what={what}
          todo={todo}
          matters={matters}
          compact
        />

        {onRun && (
          <div className="mt-6 space-y-3">
            <textarea
              value={runInput}
              onChange={(e) => setRunInput(e.target.value)}
              placeholder={runPlaceholder}
              className="w-full min-h-[120px] p-3 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            />
            <button
              onClick={handleRun}
              disabled={runLoading || !runInput.trim()}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-medium rounded-md transition-colors disabled:cursor-not-allowed"
            >
              {runLoading ? 'Running...' : runCta}
            </button>
            {runOutput && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Output
                </p>
                <pre className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-mono">
                  {runOutput}
                </pre>
              </div>
            )}
          </div>
        )}

        {onReport && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={reportEmail}
                onChange={(e) => setReportEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleReport}
                disabled={reportLoading || !reportEmail.trim()}
                className="px-4 py-2 text-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 font-medium rounded-md transition-colors"
              >
                {reportLoading ? 'Generating...' : reportCta}
              </button>
            </div>
          </div>
        )}

        {(onPilot || calendarUrl) && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Want to go further?
            </p>

            {onPilot && (
              <div className="space-y-3 mb-4">
                <input
                  type="text"
                  value={pilotData.companyName}
                  onChange={(e) => setPilotData({ ...pilotData, companyName: e.target.value })}
                  placeholder="Your company name"
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="email"
                  value={pilotData.email}
                  onChange={(e) => setPilotData({ ...pilotData, email: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <select
                  value={pilotData.clientCount}
                  onChange={(e) => setPilotData({ ...pilotData, clientCount: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={1}>1 client</option>
                  <option value={2}>2-3 clients</option>
                  <option value={5}>4-5 clients</option>
                  <option value={10}>10+ clients</option>
                </select>
                <button
                  onClick={handlePilot}
                  disabled={pilotLoading || !pilotData.companyName || !pilotData.email}
                  className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-medium rounded-md transition-colors disabled:cursor-not-allowed"
                >
                  {pilotLoading ? 'Submitting...' : pilotCta}
                </button>
              </div>
            )}

            {calendarUrl && (
              <a
                href={calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center px-4 py-2.5 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-md transition-colors text-sm"
              >
                Book 10-min setup →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
