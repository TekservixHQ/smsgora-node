export interface SmsGoraOptions {
  /** Your SMS Gora API key (starts with sgk_). Keep it on your server. */
  apiKey: string;
  baseUrl?: string;
  /** Request timeout in ms (default 30000). */
  timeout?: number;
  fetch?: typeof fetch;
}

export interface SendSmsParams {
  /** One number or up to 1,000 numbers in international format. */
  to: string | string[];
  /** Up to 1,600 characters. */
  message: string;
  /** Send from this phone (ID shown in the dashboard). */
  deviceId?: number | string;
  /** 0 = SIM 1, 1 = SIM 2. */
  simSlot?: 0 | 1;
  /** Send later. */
  scheduleAt?: string | Date;
}

export interface BulkSmsParams {
  messageTemplate?: string;
  messages: Array<{ recipients: string[]; message?: string }>;
}

export interface ListParams {
  direction?: 'in' | 'out';
  status?: string;
  device_id?: number | string;
  phone?: string;
  since?: string;
  after_id?: number;
  page?: number;
  limit?: number;
}

export declare class SmsGoraError extends Error {
  status?: number;
  errors?: Record<string, string[]>;
  body?: unknown;
  retryAfter?: number;
}

export declare class SmsGora {
  constructor(options: SmsGoraOptions);
  request<T = any>(method: string, path: string, body?: unknown): Promise<T>;
  sendSms(params: SendSmsParams): Promise<{ batch_id: number | null; message_ids: number[]; status: string; [k: string]: any }>;
  sendBulkSms(deviceId: number | string, params: BulkSmsParams): Promise<{ batch_ids: number[]; message_ids: number[]; recipientCount: number }>;
  getMessage(id: number | string): Promise<any>;
  cancelMessage(id: number | string): Promise<any>;
  listMessages(params?: ListParams): Promise<any>;
  listReceivedSms(params?: ListParams): Promise<any>;
  getBatch(id: number | string): Promise<any>;
  listDevices(): Promise<any[]>;
  getDevice(id: number | string): Promise<any>;
  getAccount(): Promise<any>;
  listWebhooks(): Promise<any[]>;
  createWebhook(params: { url: string; events?: string[]; deviceId?: number | null }): Promise<{ id: number; url: string; events: string[]; secret: string }>;
  deleteWebhook(id: number | string): Promise<any>;
}

/** Check the X-SmsGora-Signature header against the raw request body. */
export declare function verifyWebhook(rawBody: string | Buffer, signature: string, secret: string): boolean;

export default SmsGora;
