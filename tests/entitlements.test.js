import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAddCustomer,
  consumeWhatsAppReminder,
  createFreeEntitlement,
  getCurrentPlan,
  hasFeature,
  isPro,
  normalizeEntitlement
} from '../src/services/entitlements.js';

const testStorage = new Map();
globalThis.localStorage = {
  getItem: key => testStorage.get(key) || null,
  setItem: (key, value) => testStorage.set(key, String(value)),
  removeItem: key => testStorage.delete(key)
};

test('new and missing subscriptions resolve to Free', () => {
  const free = normalizeEntitlement(null);
  assert.equal(getCurrentPlan(free), 'free');
  assert.equal(free.status, 'active');
  assert.equal(canAddCustomer(0, free), true);
});

test('Free permits ten customers and safely rejects an eleventh', () => {
  const free = createFreeEntitlement();
  assert.equal(canAddCustomer(9, free), true);
  assert.equal(canAddCustomer(10, free), false);
  assert.equal(hasFeature('backup_restore', free), true);
});

test('active Pro has no customer cap and receives configured Pro features', () => {
  const pro = normalizeEntitlement({ plan: 'pro', status: 'active', billing_cycle: 'monthly', expiry_date: null });
  assert.equal(isPro(pro), true);
  assert.equal(canAddCustomer(100000, pro), true);
  assert.equal(hasFeature('pdf_receipts', pro), true);
  assert.equal(hasFeature('backup_restore', pro), true);
});

test('expired, cancelled, failed, and pending Pro entitlements are restricted', () => {
  const expired = normalizeEntitlement({ plan: 'pro', status: 'active', expiry_date: '2000-01-01T00:00:00.000Z' });
  const cancelled = normalizeEntitlement({ plan: 'pro', status: 'cancelled', expiry_date: null });
  const failed = normalizeEntitlement({ plan: 'pro', status: 'payment_failed', expiry_date: null });
  const pending = normalizeEntitlement({ plan: 'pro', status: 'pending', expiry_date: null });

  for (const entitlement of [expired, cancelled, failed, pending]) {
    assert.equal(isPro(entitlement), false);
    assert.equal(getCurrentPlan(entitlement), 'free');
    assert.equal(hasFeature('advanced_reports', entitlement), false);
    assert.equal(canAddCustomer(10, entitlement), false);
  }
  assert.equal(expired.effectiveStatus, 'expired');
});

test('unknown feature names are denied by default', () => {
  assert.equal(hasFeature('unknown_feature', createFreeEntitlement()), false);
});

test('Free allows one WhatsApp reminder per customer per 24 hours', () => {
  const free = createFreeEntitlement();
  const first = consumeWhatsAppReminder('user-a', 'customer-1', free, 1000);
  const second = consumeWhatsAppReminder('user-a', 'customer-1', free, 1000 + 60 * 60 * 1000);
  const nextDay = consumeWhatsAppReminder('user-a', 'customer-1', free, 1000 + 24 * 60 * 60 * 1000);
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(nextDay.allowed, true);
});

test('Pro allows unlimited WhatsApp reminders', () => {
  const pro = normalizeEntitlement({ plan: 'pro', status: 'active' });
  assert.equal(consumeWhatsAppReminder('user-a', 'customer-1', pro, 1000).allowed, true);
  assert.equal(consumeWhatsAppReminder('user-a', 'customer-1', pro, 1001).allowed, true);
});