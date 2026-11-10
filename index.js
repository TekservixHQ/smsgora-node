'use strict';

const crypto = require('crypto');

const DEFAULT_BASE_URL = 'https://tekservix.com/smsgora/api/v1';

class SmsGoraError extends Error {
  constructor(message, { status, errors, body, retryAfter } = {}) {
    super(message);
    this.name = 'SmsGoraError';
    this.status = status;
    this.errors = errors;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

function toQuery(params) {
  if (!params) return '';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

function asList(recipients) {
  if (Array.isArray(recipients)) return recipients;
  if (typeof recipients === 'string') return [recipients];
  throw new TypeError('recipients must be a phone number or an array of phone numbers');
}

/**
 * Client for the SMS Gora SMS Gateway API.
 * Docs: https://tekservix.com/smsgora/docs/
 */
class SmsGora {
  /**
   * @param {object} options
   * @param {string} options.apiKey   Your SMS Gora API key (starts with sgk_). Keep it on your server.
   * @param {string} [options.baseUrl]
   * @param {number} [options.timeout] Request timeout in ms (default 30000).
   * @param {Function} [options.fetch] Custom fetch implementation (defaults to global fetch, Node 18+).
   */
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, timeout = 30000, fetch: fetchImpl } = {}) {
    if (!apiKey) throw new Error('SmsGora: apiKey is required (create one in SMS Gora -> API keys)');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeout = timeout;
    this._fetch = fetchImpl || globalThis.fetch;
    if (typeof this._fetch !== 'function') {
      throw new Error('SmsGora: no fetch available. Use Node 18+ or pass options.fetch');
    }
  }

  /** Low-level call to any documented endpoint, e.g. request('GET', '/devices'). Returns the `data` field. */
  async request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    let res;
    try {
      res = await this._fetch(this.baseUrl + path, {
        method,
        headers: {
          'x-api-key': this.apiKey,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    let json = null;
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch (_) { /* non-JSON answer */ }
    if (!res.ok || (json && json.success === false)) {
      const retry = res.headers && res.headers.get ? res.headers.get('retry-after') : null;
      throw new SmsGoraError((json && json.message) || `HTTP ${res.status}`, {
        status: res.status,
        errors: json && json.errors,
        body: json || text,
        retryAfter: retry ? Number(retry) : undefined,
      });
    }
    return json && 'data' in json ? json.data : json;
  }

  /**
   * Send an SMS. Picks your best online phone unless deviceId is given.
   * @param {object} p
   * @param {string|string[]} p.to  One number or up to 1,000 numbers, international format.
   * @param {string} p.message      Up to 1,600 characters.
   * @param {number} [p.deviceId]   Send from this phone.
   * @param {0|1} [p.simSlot]       0 = SIM 1, 1 = SIM 2 (with deviceId).
   * @param {string|Date} [p.scheduleAt] Send later (ISO date).
   */
  sendSms({ to, message, deviceId, simSlot, scheduleAt }) {
    const body = { recipients: asList(to), message };
    if (simSlot !== undefined) body.sim_slot = simSlot;
    if (scheduleAt) body.schedule_at = scheduleAt instanceof Date ? scheduleAt.toISOString() : scheduleAt;
    const path = deviceId ? `/devices/${encodeURIComponent(deviceId)}/send-sms` : '/send-sms';
    return this.request('POST', path, body);
  }

  /**
   * Different texts for different people in one call (up to 5,000 recipients).
   * @param {number} deviceId
   * @param {{messageTemplate?: string, messages: Array<{recipients: string[], message?: string}>}} p
   */
  sendBulkSms(deviceId, { messageTemplate, messages }) {
    return this.request('POST', `/devices/${encodeURIComponent(deviceId)}/send-bulk-sms`, { messageTemplate, messages });
  }

  /** One message: status is queued, dispatched, sent, delivered, failed or cancelled. */
  getMessage(id) { return this.request('GET', `/messages/${encodeURIComponent(id)}`); }

  /** Cancel a queued or scheduled message. */
  cancelMessage(id) { return this.request('POST', `/messages/${encodeURIComponent(id)}/cancel`); }

  /** List messages. Filters: direction (in/out), status, device_id, phone, since, after_id, page, limit. */
  listMessages(params) { return this.request('GET', `/messages${toQuery(params)}`); }

  /** Incoming SMS, for all phones or one (pass device_id). Same filters as listMessages. */
  listReceivedSms(params = {}) {
    const { device_id: deviceId, ...rest } = params;
    const path = deviceId ? `/devices/${encodeURIComponent(deviceId)}/get-received-sms` : '/received-sms';
    return this.request('GET', `${path}${toQuery(rest)}`);
  }

  /** A batch created by sending to several recipients. */
  getBatch(id) { return this.request('GET', `/batches/${encodeURIComponent(id)}`); }

  /** Your linked Android phones. */
  listDevices() { return this.request('GET', '/devices'); }

  /** One phone. */
  getDevice(id) { return this.request('GET', `/devices/${encodeURIComponent(id)}`); }

  /** Account, plan and usage. */
  getAccount() { return this.request('GET', '/account'); }

  /** Webhooks registered by API. */
  listWebhooks() { return this.request('GET', '/webhooks'); }

  /** Register a webhook. The answer includes the secret (only returned once). */
  createWebhook({ url, events = ['sms.received'], deviceId = null }) {
    return this.request('POST', '/webhooks', { url, events, device_id: deviceId });
  }

  deleteWebhook(id) { return this.request('DELETE', `/webhooks/${encodeURIComponent(id)}`); }
}

/**
 * Check the X-SmsGora-Signature header (sha256=<hex HMAC of the raw body>).
 * @param {string|Buffer} rawBody  The raw request body, before JSON parsing.
 * @param {string} signature       Value of the X-SmsGora-Signature header.
 * @param {string} secret          The webhook secret from the dashboard.
 * @returns {boolean}
 */
function verifyWebhook(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = SmsGora;
module.exports.SmsGora = SmsGora;
module.exports.SmsGoraError = SmsGoraError;
module.exports.verifyWebhook = verifyWebhook;
module.exports.default = SmsGora;
