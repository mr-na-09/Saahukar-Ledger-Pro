const STORAGE_PREFIX = 'sahukar-data';

function requireId(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') throw new TypeError(`${label} is required.`);
}

function validateCustomer(customer) {
  if (!customer || typeof customer !== 'object') throw new TypeError('Customer record must be an object.');
  requireId(customer.id, 'Customer ID');
  if (!String(customer.name || '').trim()) throw new TypeError('Customer name is required.');
  for (const [field, label] of [['principal', 'Principal'], ['interest_rate', 'Interest rate']]) {
    const value = Number(customer[field]);
    if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a finite non-negative number.`);
  }
  if (customer.gold_weight !== undefined && (!Number.isFinite(Number(customer.gold_weight)) || Number(customer.gold_weight) < 0)) {
    throw new TypeError('Gold weight must be a finite non-negative number.');
  }
  if (!customer.loan_date || !Number.isFinite(Date.parse(customer.loan_date))) throw new TypeError('Loan date must be a valid date.');
  return { ...customer, principal: Number(customer.principal), interest_rate: Number(customer.interest_rate) };
}

function validatePayment(payment, customers) {
  if (!payment || typeof payment !== 'object') throw new TypeError('Transaction must be an object.');
  requireId(payment.id, 'Transaction ID');
  requireId(payment.customer_id, 'Customer ID');
  if (!customers.some(customer => String(customer.id) === String(payment.customer_id))) throw new TypeError('Transaction customer does not exist.');
  for (const [field, label, allowZero] of [
    ['total_paid', 'Payment amount', false],
    ['interest_paid', 'Interest paid', true],
    ['principal_paid', 'Principal paid', true],
    ['remaining_principal', 'Remaining principal', true]
  ]) {
    const value = Number(payment[field]);
    if (!Number.isFinite(value) || value < 0 || (!allowZero && value <= 0)) throw new TypeError(`${label} must be a finite ${allowZero ? 'non-negative' : 'positive'} number.`);
  }
  const splitTotal = Number(payment.interest_paid) + Number(payment.principal_paid);
  if (Math.abs(splitTotal - Number(payment.total_paid)) > 0.02) throw new TypeError('Payment allocation must equal the total payment.');
  if (payment.payment_date && !Number.isFinite(Date.parse(payment.payment_date))) throw new TypeError('Payment date must be a valid date.');
  return {
    ...payment,
    customer_id: Number(payment.customer_id),
    total_paid: Number(payment.total_paid),
    interest_paid: Number(payment.interest_paid),
    principal_paid: Number(payment.principal_paid),
    remaining_principal: Number(payment.remaining_principal)
  };
}

function normalizeLedger(ledger) {
  const customers = (Array.isArray(ledger?.customers) ? ledger.customers : []).map(validateCustomer);
  const customerIds = new Set();
  for (const customer of customers) {
    const id = String(customer.id);
    if (customerIds.has(id)) throw new TypeError('Customer IDs must be unique.');
    customerIds.add(id);
  }
  const payments = (Array.isArray(ledger?.payments) ? ledger.payments : []).map(payment => validatePayment(payment, customers));
  const paymentIds = new Set();
  for (const payment of payments) {
    const id = String(payment.id);
    if (paymentIds.has(id)) throw new TypeError('Transaction IDs must be unique.');
    paymentIds.add(id);
  }
  return { customers, payments };
}

export function getStorageKey(userId) {
  return `${STORAGE_PREFIX}-${userId}`;
}

export function readLedger(userId) {
  if (typeof localStorage === 'undefined') return { customers: [], payments: [] };
  const raw = localStorage.getItem(getStorageKey(userId));
  if (!raw) return { customers: [], payments: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Stored ledger is not valid JSON. Import a backup before making changes.');
  }
  return normalizeLedger(parsed);
}

export function writeLedger(userId, ledger) {
  const nextValue = normalizeLedger(ledger);

  if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
  localStorage.setItem(getStorageKey(userId), JSON.stringify(nextValue));

  return nextValue;
}

export function createCustomer(userId, customer) {
  const ledger = readLedger(userId);
  if (ledger.customers.some(item => String(item.id) === String(customer?.id))) throw new Error('Customer ID already exists.');
  return writeLedger(userId, { ...ledger, customers: [...ledger.customers, customer] });
}

export function updateCustomer(userId, customerId, updates) {
  const ledger = readLedger(userId);
  let found = false;
  const customers = ledger.customers.map(customer => {
    if (String(customer.id) !== String(customerId)) return customer;
    found = true;
    return { ...customer, ...updates, id: customer.id };
  });
  if (!found) throw new Error('Customer record was not found.');
  return writeLedger(userId, { ...ledger, customers });
}

export function deleteCustomer(userId, customerId) {
  const ledger = readLedger(userId);
  return writeLedger(userId, {
    customers: ledger.customers.filter(customer => String(customer.id) !== String(customerId)),
    payments: ledger.payments.filter(payment => String(payment.customer_id) !== String(customerId))
  });
}

export function createPayment(userId, payment) {
  const ledger = readLedger(userId);
  if (ledger.payments.some(item => String(item.id) === String(payment?.id))) throw new Error('Transaction ID already exists.');
  return writeLedger(userId, { ...ledger, payments: [payment, ...ledger.payments] });
}

export function updatePayment(userId, paymentId, updates) {
  const ledger = readLedger(userId);
  let found = false;
  const payments = ledger.payments.map(payment => {
    if (String(payment.id) !== String(paymentId)) return payment;
    found = true;
    return { ...payment, ...updates, id: payment.id };
  });
  if (!found) throw new Error('Transaction was not found.');
  return writeLedger(userId, { ...ledger, payments });
}

export function deletePayment(userId, paymentId) {
  const ledger = readLedger(userId);
  return writeLedger(userId, { ...ledger, payments: ledger.payments.filter(payment => String(payment.id) !== String(paymentId)) });
}

export function migrateLegacyLedger(userId, legacyLedger) {
  const nextValue = {
    customers: Array.isArray(legacyLedger?.customers) ? legacyLedger.customers : [],
    payments: Array.isArray(legacyLedger?.payments) ? legacyLedger.payments : []
  };

  return writeLedger(userId, nextValue);
}

export function deleteCustomerFiles() {
  return true;
}

export function exportBackup(userId) {
  const ledger = readLedger(userId);
  return {
    format: 'sahukar-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    ledger
  };
}

export function validateBackupLedger(ledger) {
  return normalizeLedger(ledger);
}
