import { validateBackupLedger } from '../services/storage/webStorage.js';

const CSV_COLUMNS = [
  'record_type', 'id', 'customer_id', 'name', 'mobile', 'address', 'gov_id', 'principal',
  'interest_rate', 'interest_type', 'loan_date', 'collateral', 'gold_weight', 'notes',
  'interest_carry', 'interest_paid_since_loan_date', 'last_advance_amount', 'last_advance_date',
  'status', 'created_at', 'updated_at', 'payment_date', 'total_paid', 'interest_paid',
  'principal_paid', 'principal_deducted', 'remaining_principal', 'newStatus', 'full_name',
  'phone_number', 'business_name', 'email'
];

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell === '') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new TypeError('CSV backup contains an unclosed quoted field.');
  row.push(cell);
  if (row.some(value => value !== '')) rows.push(row);
  if (rows.length < 1) throw new TypeError('CSV backup is empty.');
  const headers = rows.shift().map(header => header.trim());
  if (headers[0]?.charCodeAt(0) === 0xFEFF) headers[0] = headers[0].slice(1);
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function numberField(row, field) {
  if (row[field] === '') return undefined;
  const value = Number(row[field]);
  if (!Number.isFinite(value)) throw new TypeError(`${field} must be a finite number in the CSV backup.`);
  return value;
}

function idField(row, field) {
  if (row[field] === '') return undefined;
  const numeric = Number(row[field]);
  return Number.isFinite(numeric) ? numeric : row[field];
}

export function createJsonBackup(profile, ledger) {
  return {
    format: 'sahukar-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    profile: profile ? {
      full_name: profile.full_name || '',
      phone_number: profile.phone_number || '',
      business_name: profile.business_name || '',
      email: profile.email || ''
    } : null,
    ledger: validateBackupLedger(ledger)
  };
}

export function serializeJsonBackup(profile, ledger) {
  return JSON.stringify(createJsonBackup(profile, ledger), null, 2);
}

export function serializeCsvBackup(profile, ledger) {
  const safeLedger = validateBackupLedger(ledger);
  const rows = [];
  if (profile) rows.push({
    record_type: 'profile',
    full_name: profile.full_name || '',
    phone_number: profile.phone_number || '',
    business_name: profile.business_name || '',
    email: profile.email || ''
  });
  for (const customer of safeLedger.customers) rows.push({ record_type: 'customer', ...customer });
  for (const payment of safeLedger.payments) rows.push({ record_type: 'payment', ...payment });
  return [CSV_COLUMNS.join(','), ...rows.map(row => CSV_COLUMNS.map(column => csvCell(row[column])).join(','))].join('\r\n');
}

export function parseBackup(text, fileName = '') {
  const isCsv = fileName.toLowerCase().endsWith('.csv') || !String(text).trimStart().startsWith('{');
  if (isCsv) {
    const rows = parseCsv(String(text));
    if (!Object.hasOwn(rows[0] || {}, 'record_type')) throw new TypeError('CSV backup is missing the record_type column.');
    if (rows.some(row => !['profile', 'customer', 'payment'].includes(row.record_type))) throw new TypeError('CSV backup contains an unsupported record type.');
    const profileRow = rows.find(row => row.record_type === 'profile');
    const customers = rows.filter(row => row.record_type === 'customer').map(row => ({
      ...row,
      id: idField(row, 'id'),
      principal: numberField(row, 'principal'),
      interest_rate: numberField(row, 'interest_rate'),
      gold_weight: numberField(row, 'gold_weight')
    }));
    const payments = rows.filter(row => row.record_type === 'payment').map(row => ({
      ...row,
      id: idField(row, 'id'),
      customer_id: idField(row, 'customer_id'),
      total_paid: numberField(row, 'total_paid'),
      interest_paid: numberField(row, 'interest_paid'),
      principal_paid: numberField(row, 'principal_paid'),
      remaining_principal: numberField(row, 'remaining_principal')
    }));
    return { profile: profileRow || null, ledger: validateBackupLedger({ customers, payments }) };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError('Backup file is not valid JSON.');
  }
  if (parsed?.format && parsed.format !== 'sahukar-backup') throw new TypeError('This backup was created by an unsupported application.');
  if (!parsed || typeof parsed !== 'object' || !(parsed.ledger || ('customers' in parsed && 'payments' in parsed))) {
    throw new TypeError('JSON file does not contain a ledger backup.');
  }
  const profile = parsed?.profile || null;
  const ledger = parsed?.ledger || { customers: parsed?.customers || [], payments: parsed?.payments || [] };
  return { profile, ledger: validateBackupLedger(ledger) };
}