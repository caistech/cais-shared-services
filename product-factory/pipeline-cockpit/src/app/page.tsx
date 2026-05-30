'use client'

import { useState, useEffect } from 'react'

interface ProductValidation {
  id: string
  product_slug: string
  display_name: string
  gate1_ready: boolean
  can_run_outreach: boolean
  weighted_score_percent: number | null
  has_promise: boolean
  has_distributor: boolean
  has_end_user: boolean
  has_friction: boolean
  has_methodology_commitment: boolean
  mvp_url: string | null
  validation_test_status: string | null
  phase_results: Record<string, { status: string; tested_at: string; findings: string[] }> | null
}

interface TestPhase {
  id: string
  name: string
  number: number
  desc: string
  testType: 'auto' | 'manual' | 'both'
  tools: string[]
  passCriteria: string
  fixChannel: string
}

const PHASES: TestPhase[] = [
  {
    id: 'phase1',
    number: 1,
    name: 'Pre-Development',
    desc: 'Idea documented with promise, distributor, end_user, friction',
    testType: 'auto',
    tools: ['validation_fields'],
    passCriteria: 'All 5 validation fields checked (promise, distributor, end_user, friction, commitment)',
    fixChannel: 'Direct edit in Validation Fields panel'
  },
  {
    id: 'phase2',
    number: 2,
    name: 'Design Planning',
    desc: 'Design meets portfolio standards (responsive, headers, branding)',
    testType: 'both',
    tools: ['portfolio-gate-audit-responsive', 'portfolio-gate-audit-explanatory-header', 'portfolio-gate-audit-sample-artefact', 'portfolio-gate-audit-commitment-panel'],
    passCriteria: 'All portfolio-gate audits pass',
    fixChannel: 'Run portfolio-gate-audit-* commands, fix issues, re-run'
  },
  {
    id: 'phase3',
    number: 3,
    name: 'Compliance Standards',
    desc: 'Security & compliance checks (RLS, vendor leak, auth, trust panel)',
    testType: 'both',
    tools: ['portfolio-gate-audit-rls', 'portfolio-gate-audit-vendor-leak', 'portfolio-gate-audit-unauth-endpoints', 'portfolio-gate-audit-trust-panel'],
    passCriteria: 'All compliance audits pass',
    fixChannel: 'Run portfolio-gate-audit-* commands, fix issues, re-run'
  },
  {
    id: 'phase4',
    number: 4,
    name: 'Construction',
    desc: 'Code builds successfully (lint, typecheck, build)',
    testType: 'auto',
    tools: ['npm run lint', 'npm run typecheck', 'npm run build'],
    passCriteria: 'All npm scripts exit with code 0',
    fixChannel: 'Fix lint/type errors, rebuild'
  },
  {
    id: 'phase5',
    number: 5,
    name: 'Certification',
    desc: 'User experience validated (naive-tester, voice-auditor, GTM, QA)',
    testType: 'manual',
    tools: ['/naive-tester', '/voice-auditor', '/gtm-auditor', '/qa'],
    passCriteria: 'All gstack skills pass',
    fixChannel: 'Run /naive-tester, /qa, etc on the URL, fix findings, re-run'
  },
  {
    id: 'phase6',
    number: 6,
    name: 'Handover',
    desc: 'Production smoke test (auth works, links work, pages render)',
    testType: 'both',
    tools: ['portfolio-gate-smoke-routes', 'portfolio-gate-smoke-auth', '/qa'],
    passCriteria: 'All smoke tests pass',
    fixChannel: 'Run smoke tests, fix production issues, redeploy'
  },
  {
    id: 'phase7',
    number: 7,
    name: 'Operations',
    desc: 'Ongoing monitoring (canary, benchmark, performance)',
    testType: 'manual',
    tools: ['/canary', '/benchmark'],
    passCriteria: 'No alerts from canary/benchmark',
    fixChannel: 'Monitor /canary results, fix regressions'
  }
]

export default function PipelineCockpit() {
  const [products, setProducts] = useState<ProductValidation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    try {
      const res = await fetch('/api/admin/pipeline')
      const data = await res.json()
      setProducts(data.products || [])
    } catch (err) {
      console.error('Failed to fetch products:', err)
    } finally {
      setLoading(false)
    }
  }

  function getPhaseStatus(product: ProductValidation, phaseId: string): string {
    if (!product.phase_results) return 'not_run'
    return product.phase_results[phaseId]?.status || 'not_run'
  }

  function getCompletedPhases(product: ProductValidation): number {
    if (!product.phase_results) return 0
    return Object.values(product.phase_results).filter(p => p.status === 'passed').length
  }

  if (loading) {
    return <div className="text-center py-12">Loading pipeline data...</div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Products</h2>
          <div className="space-y-2">
            {products.map(product => {
              const completed = getCompletedPhases(product)
              return (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product.product_slug)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    selectedProduct === product.product_slug
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="font-medium">{product.display_name}</div>
                  <div className="text-sm opacity-80">{product.product_slug}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-xs px-2 py-0.5 bg-gray-200 rounded">{completed}/7 phases</span>
                    {product.gate1_ready && (
                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">Gate 1</span>
                    )}
                    {product.can_run_outreach && (
                      <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 rounded">Outreach</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2">
        {selectedProduct ? (
          <ProductDetailView 
            productSlug={selectedProduct} 
            onUpdate={fetchProducts}
          />
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            Select a product to view validation details
          </div>
        )}
      </div>
    </div>
  )
}

function ProductDetailView({ productSlug, onUpdate }: { productSlug: string; onUpdate: () => void }) {
  const [product, setProduct] = useState<ProductValidation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProduct()
  }, [productSlug])

  async function fetchProduct() {
    try {
      const res = await fetch(`/api/admin/pipeline/${productSlug}`)
      const data = await res.json()
      setProduct(data.product)
    } catch (err) {
      console.error('Failed to fetch product:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="bg-white rounded-lg shadow p-12">Loading...</div>
  if (!product) return <div className="bg-white rounded-lg shadow p-12">Product not found</div>

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">{product.display_name}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-blue-600">{product.weighted_score_percent ?? 0}%</div>
            <div className="text-sm text-gray-600">Score</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className={`text-3xl font-bold ${product.gate1_ready ? 'text-green-600' : 'text-gray-400'}`}>
              {product.gate1_ready ? '✓' : '✗'}
            </div>
            <div className="text-sm text-gray-600">Gate 1</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className={`text-3xl font-bold ${product.can_run_outreach ? 'text-purple-600' : 'text-gray-400'}`}>
              {product.can_run_outreach ? '✓' : '✗'}
            </div>
            <div className="text-sm text-gray-600">Outreach Ready</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className={`text-3xl font-bold ${
              product.validation_test_status === 'passed' ? 'text-green-600' :
              product.validation_test_status === 'warning' ? 'text-yellow-600' :
              product.validation_test_status === 'failed' ? 'text-red-600' : 'text-gray-400'
            }`}>
              {product.validation_test_status?.[0]?.toUpperCase() || '—'}
            </div>
            <div className="text-sm text-gray-600">Tests</div>
          </div>
        </div>
      </div>

      <ValidationFieldsEditor product={product} onUpdate={fetchProduct} />

      <PipelinePhases product={product} onUpdate={fetchProduct} />
    </div>
  )
}

function ValidationFieldsEditor({ product, onUpdate }: { product: ProductValidation; onUpdate: () => void }) {
  const [saving, setSaving] = useState(false)
  const [mvpUrl, setMvpUrl] = useState(product.mvp_url || '')

  async function updateField(field: string, value: boolean | string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/pipeline/${product.product_slug}/validation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      if (res.ok) {
        const data = await res.json()
        setMvpUrl(data.product?.mvp_url || mvpUrl)
        onUpdate()
      }
    } catch (err) {
      console.error('Failed to update:', err)
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    { key: 'has_promise', label: 'Promise', desc: 'Problem statement defined' },
    { key: 'has_distributor', label: 'Distributor', desc: 'Distribution hypothesis' },
    { key: 'has_end_user', label: 'End User', desc: 'Target user identified' },
    { key: 'has_friction', label: 'Friction', desc: 'Pain point documented' },
    { key: 'has_methodology_commitment', label: 'Founder Commitment', desc: 'Committed to validation pipeline' },
  ]

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Phase 1: Pre-Development (Validation Fields)</h3>
      
      <div className="space-y-3 mb-6">
        {fields.map(field => (
          <label key={field.key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={product[field.key as keyof ProductValidation] as boolean}
              onChange={(e) => updateField(field.key, e.target.checked)}
              disabled={saving}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="font-medium">{field.label}</div>
              <div className="text-sm text-gray-500">{field.desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="border-t pt-4">
        <label className="block text-sm font-medium mb-2">MVP URL (required for phases 2-7)</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={mvpUrl}
            onChange={(e) => setMvpUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={() => updateField('mvp_url', mvpUrl)}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PipelinePhases({ product, onUpdate }: { product: ProductValidation; onUpdate: () => void }) {
  const [running, setRunning] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { message: string; findings: string[] }>>({})

  async function runPhaseTest(phaseId: string) {
    if (!product.mvp_url && phaseId !== 'phase1') {
      alert('Please enter MVP URL first')
      return
    }
    setRunning(phaseId)
    setResults(prev => ({ ...prev, [phaseId]: { message: '', findings: [] } }))
    try {
      const res = await fetch(`/api/admin/pipeline/${product.product_slug}/run-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          testType: phaseId, 
          mvpUrl: product.mvp_url,
          phaseNumber: PHASES.find(p => p.id === phaseId)?.number
        })
      })
      const data = await res.json()
      setResults(prev => ({ ...prev, [phaseId]: { 
        message: data.message || data.error || 'Test completed',
        findings: data.findings || []
      }}))
      if (res.ok) {
        onUpdate()
      }
    } catch (err) {
      console.error('Failed to run test:', err)
      setResults(prev => ({ ...prev, [phaseId]: { message: 'Error running test', findings: [] } }))
    } finally {
      setRunning(null)
    }
  }

  function getPhaseStatus(phaseId: string): string {
    return product.phase_results?.[phaseId]?.status || 'not_run'
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Pipeline Phases 2-7</h3>
      
      <div className="space-y-4">
        {PHASES.slice(1).map(phase => {
          const status = getPhaseStatus(phase.id)
          const result = results[phase.id]
          
          return (
            <div key={phase.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      status === 'passed' ? 'bg-green-100 text-green-800' :
                      status === 'failed' ? 'bg-red-100 text-red-800' :
                      status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      Phase {phase.number}
                    </span>
                    <div className="font-medium">{phase.name}</div>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{phase.desc}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    <span className="font-medium">Tools:</span> {phase.tools.join(', ')}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    <span className="font-medium">Pass:</span> {phase.passCriteria}
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    <span className="font-medium">Fix:</span> {phase.fixChannel}
                  </div>
                  
                  {result && (
                    <div className="mt-2 text-sm bg-gray-50 p-2 rounded">
                      {result.message}
                      {result.findings.length > 0 && (
                        <div className="mt-1 text-red-600">
                          Findings: {result.findings.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => runPhaseTest(phase.id)}
                    disabled={running !== null}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                  >
                    {running === phase.id ? 'Running...' : 'Run Test'}
                  </button>
                  {status === 'failed' && (
                    <button
                      onClick={() => runPhaseTest(phase.id)}
                      disabled={running !== null}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm"
                    >
                      Fix & Retry
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
