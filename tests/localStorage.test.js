import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCustomer,
  createPayment,
  deleteCustomer,
  deletePayment,
  getStorageKey,
  readLedger,
  updateCustomer,
  updatePayment,
  writeLedger
} from '../src/services/storage/webStorage.js';
import { parseBackup, serializeCsvBackup, serializeJsonBackup } from '../src/utils/backup.js';
import { calculateLiveInterest, processPartPayment } from '../src/utils/interestEngine.js';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};

const userId = 'test-user';
const customer = {
  id: 101,
  name: 'Ravi, "Bhai"',
  mobile: '9876543210',
  principal: 1200,
  interest_rate: 2,
  interest_type: 'SIMPLE',
  loan_date: '2026-01-01',
  notes: 'line one\nline two'
};
const payment = {
  id: 201,
  customer_id: 101,
  payment_date: '2026-02-01',
  total_paid: 100,
  interest_paid: 40,
  principal_paid: 60,
  remaining_principal: 1140
};

test.beforeEach(() => values.clear());

test('ledger CRUD persists customers and linked transactions', () => {
  createCustomer(userId, customer);
  updateCustomer(userId, customer.id, { address: 'Dharni' });
  createPayment(userId, payment);
  updatePayment(userId, payment.id, { notes: 'receipt checked' });

  let ledger = readLedger(userId);
  assert.equal(ledger.customers[0].address, 'Dharni');
  assert.equal(ledger.payments[0].notes, 'receipt checked');

  deletePayment(userId, payment.id);
  deleteCustomer(userId, customer.id);
  ledger = readLedger(userId);
  assert.deepEqual(ledger, { customers: [], payments: [] });
});

test('invalid financial records and broken customer links are rejected', () => {
  assert.throws(() => writeLedger(userId, { customers: [{ ...customer, principal: Infinity }], payments: [] }), /Principal/);
  assert.throws(() => writeLedger(userId, { customers: [customer], payments: [{ ...payment, customer_id: 999 }] }), /does not exist/);
  assert.throws(() => writeLedger(userId, { customers: [customer], payments: [{ ...payment, total_paid: 99 }] }), /allocation/);
});

test('corrupt local JSON is surfaced instead of treated as an empty ledger', () => {
  values.set(getStorageKey(userId), '{broken');
  assert.throws(() => readLedger(userId), /not valid JSON/);
  assert.equal(values.get(getStorageKey(userId)), '{broken');
});

test('JSON and CSV backups round-trip profile, customers, and transactions', () => {
  const profile = { full_name: 'Owner, One', phone_number: '9000000000', business_name: 'Ledger House', email: 'owner@example.com' };
  const ledger = { customers: [customer], payments: [payment] };

  const jsonBackup = parseBackup(serializeJsonBackup(profile, ledger), 'backup.json');
  const csvBackup = parseBackup(serializeCsvBackup(profile, ledger), 'backup.csv');
  for (const restored of [jsonBackup, csvBackup]) {
    assert.equal(restored.profile.full_name, profile.full_name);
    assert.equal(restored.ledger.customers[0].name, customer.name);
    assert.equal(restored.ledger.customers[0].notes, customer.notes);
    assert.equal(restored.ledger.payments[0].customer_id, payment.customer_id);
    assert.equal(restored.ledger.payments[0].total_paid, payment.total_paid);
  }
});

test('backup import rejects unrelated JSON and untyped CSV files', () => {
  assert.throws(() => parseBackup('{"hello":"world"}', 'other.json'), /does not contain a ledger/);
  assert.throws(() => parseBackup('name,amount\nRavi,100', 'other.csv'), /record_type/);
});

test('financial calculations reject invalid values and do not accrue before loan date', () => {
  const futureDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  assert.equal(calculateLiveInterest(1000, 2, futureDate).totalDays, 0);
  assert.throws(() => calculateLiveInterest(Number.NaN, 2, '2026-01-01'), /Principal/);
  assert.throws(() => processPartPayment(100, 20, 121), /exceed/);
});