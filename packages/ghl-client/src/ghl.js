/**
 * Go High Level (GHL) API Client
 *
 * Reusable Node.js client for the GHL CRM API v2021-07-28.
 * Mirrors the Python CLI at integrations/ghl/ghl_cli.py but designed
 * for server-side use by OpenClaw agents via the SecureGateway.
 *
 * No external dependencies — uses built-in fetch (Node 18+).
 *
 * Usage:
 *   const { createGHLClient } = require('./ghl');
 *   const ghl = createGHLClient(apiKey, locationId);
 *   const contacts = await ghl.listContacts({ limit: 10 });
 */

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';
const REQUEST_TIMEOUT_MS = 15000;

/**
 * @typedef {object} Contact
 * @property {string} id
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {string} [email]
 * @property {string} [phone]
 * @property {string} [companyName]
 * @property {string} [source]
 * @property {string} locationId
 */

/**
 * @typedef {object} Opportunity
 * @property {string} id
 * @property {string} name
 * @property {string} pipelineId
 * @property {string} pipelineStageId
 * @property {string} [contactId]
 * @property {number} [monetaryValue]
 * @property {string} [status]
 */

/**
 * GHL API error with status code and response body.
 */
class GHLError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {string} [body]
   */
  constructor(message, status, body) {
    super(message);
    this.name = 'GHLError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Internal helper — make an authenticated request to the GHL API.
 *
 * @param {string} apiKey
 * @param {string} method
 * @param {string} path - Relative path (e.g. '/contacts/')
 * @param {object} [options]
 * @param {object} [options.params] - URL query parameters
 * @param {object} [options.body] - JSON body (for POST/PUT)
 * @returns {Promise<any>} Parsed JSON response
 */
async function ghlFetch(apiKey, method, path, options = {}) {
  const url = new URL(path, GHL_BASE_URL);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const fetchOptions = {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': GHL_API_VERSION,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    };

    if (options.body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const resp = await fetch(url.toString(), fetchOptions);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new GHLError(
        `GHL API ${method} ${path} failed with status ${resp.status}`,
        resp.status,
        text.slice(0, 500)
      );
    }

    // Some endpoints return 200/201 with no body
    const text = await resp.text();
    if (!text) return {};
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Create a GHL API client scoped to a specific location.
 *
 * @param {string} apiKey - GHL API key (Bearer token)
 * @param {string} locationId - GHL Location ID to scope all requests
 * @returns {GHLClient}
 */
function createGHLClient(apiKey, locationId) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('GHL API key is required');
  }
  if (!locationId || typeof locationId !== 'string') {
    throw new Error('GHL Location ID is required');
  }

  return {
    /**
     * List contacts for this location.
     *
     * @param {object} [options]
     * @param {number} [options.limit=20] - Max contacts to return
     * @param {string} [options.query] - Search query string
     * @returns {Promise<Contact[]>}
     */
    async listContacts(options = {}) {
      const params = {
        locationId,
        limit: options.limit || 20,
      };
      if (options.query) {
        params.query = options.query;
      }

      const data = await ghlFetch(apiKey, 'GET', '/contacts/', { params });
      return data.contacts || [];
    },

    /**
     * Get a single contact by ID.
     *
     * @param {string} contactId
     * @returns {Promise<Contact>}
     */
    async getContact(contactId) {
      if (!contactId) throw new Error('contactId is required');

      const data = await ghlFetch(apiKey, 'GET', `/contacts/${contactId}`);
      return data.contact || data;
    },

    /**
     * Create a new contact (lead) in GHL.
     *
     * @param {object} data
     * @param {string} data.name - Full name (will be split into first/last)
     * @param {string} [data.email]
     * @param {string} [data.phone]
     * @param {string} [data.company]
     * @param {string} [data.source]
     * @returns {Promise<Contact>}
     */
    async createContact(data) {
      if (!data || !data.name) throw new Error('Contact name is required');

      const nameParts = data.name.trim().split(/\s+/);
      const payload = {
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        locationId,
      };
      if (data.email) payload.email = data.email;
      if (data.phone) payload.phone = data.phone;
      if (data.company) payload.companyName = data.company;
      if (data.source) payload.source = data.source;

      const resp = await ghlFetch(apiKey, 'POST', '/contacts/', { body: payload });
      return resp.contact || resp;
    },

    /**
     * Update an existing contact.
     *
     * @param {string} contactId
     * @param {object} data - Fields to update (firstName, lastName, email, phone, etc.)
     * @returns {Promise<Contact>}
     */
    async updateContact(contactId, data) {
      if (!contactId) throw new Error('contactId is required');
      if (!data || Object.keys(data).length === 0) throw new Error('Update data is required');

      const resp = await ghlFetch(apiKey, 'PUT', `/contacts/${contactId}`, { body: data });
      return resp.contact || resp;
    },

    /**
     * Trigger a GHL workflow for a specific contact.
     *
     * @param {string} workflowId
     * @param {string} contactId
     * @returns {Promise<void>}
     */
    async triggerWorkflow(workflowId, contactId) {
      if (!workflowId) throw new Error('workflowId is required');
      if (!contactId) throw new Error('contactId is required');

      await ghlFetch(apiKey, 'POST', `/contacts/${contactId}/workflow/${workflowId}`, {
        body: {},
      });
    },

    /**
     * List opportunities (deals) in a pipeline.
     *
     * @param {string} [pipelineId] - Specific pipeline ID; omit for all
     * @returns {Promise<Opportunity[]>}
     */
    async listOpportunities(pipelineId) {
      const params = { locationId };
      if (pipelineId) params.pipelineId = pipelineId;

      const data = await ghlFetch(apiKey, 'GET', '/opportunities/search', { params });
      return data.opportunities || [];
    },

    /**
     * Create a new opportunity (deal) in a pipeline.
     *
     * @param {object} data
     * @param {string} data.name - Opportunity name
     * @param {string} data.pipelineId
     * @param {string} data.stageId - Pipeline stage ID
     * @param {string} data.contactId
     * @param {number} [data.monetaryValue]
     * @returns {Promise<Opportunity>}
     */
    async createOpportunity(data) {
      if (!data || !data.name) throw new Error('Opportunity name is required');
      if (!data.pipelineId) throw new Error('pipelineId is required');
      if (!data.stageId) throw new Error('stageId is required');
      if (!data.contactId) throw new Error('contactId is required');

      const payload = {
        name: data.name,
        pipelineId: data.pipelineId,
        pipelineStageId: data.stageId,
        contactId: data.contactId,
        locationId,
      };
      if (data.monetaryValue !== undefined) {
        payload.monetaryValue = data.monetaryValue;
      }

      const resp = await ghlFetch(apiKey, 'POST', '/opportunities/', { body: payload });
      return resp.opportunity || resp;
    },
  };
}

module.exports = {
  createGHLClient,
  GHLError,
  GHL_BASE_URL,
  GHL_API_VERSION,
};
