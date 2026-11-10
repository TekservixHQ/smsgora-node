'use strict';
const assert = require('assert');
const crypto = require('crypto');
const SmsGora = require('./index');
const { verifyWebhook, SmsGoraError } = SmsGora;

const calls = [];
const mockFetch = (status, json, headers = {}) => async (url, opts) => {
  calls.push({ url, opts });
  return { ok: status < 400, status, text: async () => JSON.stringify(json), headers: { get: (k) => headers[k.toLowerCase()] || null } };
};

(async () => {
  const c = new SmsGora({ apiKey: 'sgk_test', fetch: mockFetch(200, { success: true, data: { message_ids: [1] } }) });
  const r = await c.sendSms({ to: '+15551234567', message: 'hi' });
  assert.deepStrictEqual(r, { message_ids: [1] });
  assert.strictEqual(calls[0].url, 'https://tekservix.com/smsgora/api/v1/send-sms');
  assert.strictEqual(calls[0].opts.method, 'POST');
  assert.strictEqual(calls[0].opts.headers['x-api-key'], 'sgk_test');
  assert.deepStrictEqual(JSON.parse(calls[0].opts.body), { recipients: ['+15551234567'], message: 'hi' });

  await c.sendSms({ to: ['+1', '+2'], message: 'x', deviceId: 42, simSlot: 1, scheduleAt: new Date('2026-12-01T08:00:00Z') });
  assert.strictEqual(calls[1].url, 'https://tekservix.com/smsgora/api/v1/devices/42/send-sms');
  assert.deepStrictEqual(JSON.parse(calls[1].opts.body), { recipients: ['+1', '+2'], message: 'x', sim_slot: 1, schedule_at: '2026-12-01T08:00:00.000Z' });

  await c.listMessages({ direction: 'out', limit: 10, phone: undefined });
  assert.strictEqual(calls[2].url, 'https://tekservix.com/smsgora/api/v1/messages?direction=out&limit=10');
  await c.listReceivedSms({ device_id: 7, limit: 5 });
  assert.strictEqual(calls[3].url, 'https://tekservix.com/smsgora/api/v1/devices/7/get-received-sms?limit=5');
  await c.listReceivedSms();
  assert.strictEqual(calls[4].url, 'https://tekservix.com/smsgora/api/v1/received-sms');
  await c.createWebhook({ url: 'https://a.test/h' });
  assert.deepStrictEqual(JSON.parse(calls[5].opts.body), { url: 'https://a.test/h', events: ['sms.received'], device_id: null });

  const bad = new SmsGora({ apiKey: 'k', fetch: mockFetch(429, { success: false, message: 'Rate limit' }, { 'retry-after': '30' }) });
  await assert.rejects(bad.getAccount(), (e) => e instanceof SmsGoraError && e.status === 429 && e.retryAfter === 30 && e.message === 'Rate limit');

  const body = '{"event":"sms.received"}';
  const sig = 'sha256=' + crypto.createHmac('sha256', 's3cret').update(body).digest('hex');
  assert.strictEqual(verifyWebhook(body, sig, 's3cret'), true);
  assert.strictEqual(verifyWebhook(Buffer.from(body), sig, 's3cret'), true);
  assert.strictEqual(verifyWebhook(body, sig, 'wrong'), false);
  assert.strictEqual(verifyWebhook(body, '', 's3cret'), false);
  assert.throws(() => new SmsGora({}), /apiKey/);
  console.log('smsgora: all tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
