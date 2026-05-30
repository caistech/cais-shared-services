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
}

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

  if (loading) {
    return <div className="text-center py-12">Loading pipeline data...</div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Products</h2>
          <div className="space-y-2">
            {products.map(product => (
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
                <div className="mt-2 flex gap-2">
                  {product.gate1_ready && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">Gate 1</span>
                  )}
                  {product.can_run_outreach && (
                    <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 rounded">Outreach</span>
                  )}
                  {product.validation_test_status && product.validation_test_status !== 'not_run' && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      product.validation_test_status === 'passed' ? 'bg-green-100 text-green-800' :
                      product.validation_test_status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      Test: {product.validation_test_status}
                    </span>
                  )}
                </div>
              </button>
            ))}
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

      <TestRunner product={product} onUpdate={fetchProduct} />
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
      <h3 className="text-lg font-semibold mb-4">Validation Fields</h3>
      
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
        <label className="block text-sm font-medium mb-2">MVP URL</label>
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

function TestRunner({ product, onUpdate }: { product: ProductValidation; onUpdate: () => void }) {
  const [running, setRunning] = useState<string | null>(null)

  const tests = [
    { id: 'step8', name: 'Compliance Tests', desc: 'Auth, branding, metadata, security, privacy', skill: 'qa' },
    { id: 'step9', name: 'Validation Tests', desc: 'Naive tester, voice auditor, GTM auditor', skill: 'naive-tester' },
  ]

  async function runTest(testId: string) {
    if (!product.mvp_url) {
      alert('Please enter MVP URL first')
      return
    }
    setRunning(testId)
    try {
      const res = await fetch(`/api/admin/pipeline/${product.product_slug}/run-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType: testId, mvpUrl: product.mvp_url })
      })
      if (res.ok) {
        onUpdate()
      }
    } catch (err) {
      console.error('Failed to run test:', err)
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Test Runner</h3>
      
      <div className="space-y-4">
        {tests.map(test => (
          <div key={test.id} className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{test.name}</div>
                <div className="text-sm text-gray-500">{test.desc}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => runTest(test.id)}
                  disabled={running !== null}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {running === test.id ? 'Running...' : 'Run Test'}
                </button>
              </div>
            </div>
            {!product.mvp_url && (
              <div className="mt-2 text-sm text-yellow-600">Enter MVP URL above to run tests</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
