# smsgora

Node.js client for the [SMS Gora SMS Gateway](https://tekservix.com/smsgora/) API.

SMS Gora turns Android phones with ordinary SIM cards into an SMS gateway. Your server calls the API, a linked phone sends the text, and replies and delivery reports come back to you. There's no sender ID registration and no per-message fee from us: your mobile operator bills the texts like any SMS.

- Zero dependencies, uses the built-in `fetch` (Node 18+)
- TypeScript types included
- Webhook signature check built in

## Install

```bash
npm install smsgora
```

## Quick start

Create an API key in the SMS Gora dashboard (SMS Gora -> API keys) and keep it on your server.

```js
const SmsGora = require('smsgora');

const sms = new SmsGora({ apiKey: process.env.SMSGORA_KEY });

const result = await sms.sendSms({
  to: '+15551234567',
  message: 'Your verification code is 482913',
});

console.log(result.message_ids); // [1873]
```

ES modules work too:

```js
import SmsGora from 'smsgora';
```

## Sending

```js
// Several recipients (up to 1,000 per call)
await sms.sendSms({ to: ['+15551234567', '+447700900123'], message: 'Your order has shipped' });

// From a chosen phone and SIM, scheduled for later
await sms.sendSms({
  to: '+15551234567',
  message: 'Reminder: your appointment is tomorrow at 10:00',
  deviceId: 42,
  simSlot: 1,            // 0 = SIM 1, 1 = SIM 2
  scheduleAt: new Date('2026-12-01T08:00:00Z'),
});

// Different texts for different people in one call (up to 5,000 recipients)
await sms.sendBulkSms(42, {
  messageTemplate: 'Hello, your parcel is ready for pickup.',
  messages: [
    { recipients: ['+15551234567'], message: 'Hi Aline, parcel #1042 is ready.' },
    { recipients: ['+15557654321'] },
  ],
});
```

## Delivery status and incoming SMS

```js
const msg = await sms.getMessage(1873);
console.log(msg.status); // queued -> dispatched -> sent -> delivered (or failed)

await sms.cancelMessage(1874); // works while queued or scheduled

const inbox = await sms.listReceivedSms({ since: '2026-11-01', limit: 50 });
const phones = await sms.listDevices();
const account = await sms.getAccount();
```

Anything else in the [API reference](https://tekservix.com/smsgora/docs/) is one call away:

```js
const batch = await sms.request('GET', '/batches/311');
```

## Webhooks

Add your HTTPS URL in SMS Gora -> Webhooks (or with `createWebhook`) and keep the secret. Each request carries `X-SmsGora-Signature: sha256=...`, an HMAC-SHA256 of the raw body. Check it before trusting the request:

```js
const express = require('express');
const { verifyWebhook } = require('smsgora');

const app = express();

app.post('/sms/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!verifyWebhook(req.body, req.get('X-SmsGora-Signature'), process.env.SMSGORA_WEBHOOK_SECRET)) {
    return res.sendStatus(401);
  }
  res.sendStatus(200); // answer within 10 seconds, then do the work
  const event = JSON.parse(req.body);
  if (event.event === 'sms.received') {
    console.log(event.data.from, event.data.message);
  }
});
```

## Errors

Failed calls throw `SmsGoraError` with `status`, `message`, field `errors` and, on 429, `retryAfter` in seconds.

```js
const { SmsGoraError } = require('smsgora');

try {
  await sms.sendSms({ to: '+15551234567', message: 'Hi' });
} catch (err) {
  if (err instanceof SmsGoraError && err.status === 429) {
    // rate limit (300 requests/minute per key) or plan limit reached
  }
}
```

Never call the API from a browser or mobile app: anyone could read the key. Call it from your server.

## Migrating from TextBee

SMS Gora accepts TextBee-style requests, so most integrations switch by changing the base URL and key. See the [compatibility notes](https://tekservix.com/smsgora/docs/).

## Good to know

A phone-based gateway suits OTPs, order alerts, reminders and two-way conversations at moderate volume. It isn't meant for mass marketing blasts, and in the US high-volume business texting belongs on registered 10DLC or toll-free numbers.

## More from Tekservix

- [WAservix WhatsApp API Gateway](https://tekservix.com/waservix/): send WhatsApp messages from your own number (`npm install waservix`)
- [AI Sales Agent](https://tekservix.com/ai-sales-agent): answers customers on WhatsApp and SMS using your website's content
- [Website to App](https://tekservix.com/mobile-apps): turn your website into Android and iOS apps
- [SMS Gora WordPress plugin](https://tekservix.com/smsgora/docs/wordpress-plugin): WooCommerce order texts without code

## License

MIT
