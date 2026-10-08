const ACCOUNTS_KEY = 'sahukar-local-accounts-v1';
const ACTIVE_USER_KEY = 'sahukar-active-user-v1';
const PASSWORD_ITERATIONS = 310000;

function readAccounts() {
  const raw = localStorage.getItem(ACCOUNTS_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.accounts) ? parsed.accounts : [];
}

function writeAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify({ version: 1, accounts }));
}

function toSession(account) {
  return {
    user: {
      id: account.profile.id,
      email: account.profile.email,
      phone: account.profile.phone_number,
      user_metadata: {
        full_name: account.profile.full_name,
        phone_number: account.profile.phone_number,
        business_name: account.profile.business_name
      }
    }
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function derivePassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
    key,
    256
  ));
}

function encodeBytes(bytes) {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}

function decodeBytes(value) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function createPasswordRecord(password) {
  if (typeof password !== 'string' || password.length < 8) throw new TypeError('Password must contain at least 8 characters.');
  if (!globalThis.crypto?.subtle) throw new Error('Secure local account storage requires Web Crypto (HTTPS or localhost).');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt);
  return { salt: encodeBytes(salt), hash: encodeBytes(hash), iterations: PASSWORD_ITERATIONS };
}

async function verifyPassword(password, record) {
  if (!record || !Number.isInteger(record.iterations) || record.iterations < 100000 || record.iterations > 1000000) return false;
  const candidate = await derivePassword(password, decodeBytes(record.salt));
  const expected = decodeBytes(record.hash);
  if (candidate.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) difference |= candidate[index] ^ expected[index];
  return difference === 0;
}

function publicProfile(profile) {
  return { ...profile };
}

export async function createLocalAccount({ fullName, phone, businessName = '', email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (!String(fullName || '').trim() || !String(phone || '').trim() || !normalizedEmail) {
    throw new TypeError('Name, mobile number, and email are required.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new TypeError('Enter a valid email address.');

  const accounts = readAccounts();
  if (accounts.some(account => normalizeEmail(account.profile?.email) === normalizedEmail)) {
    throw new Error('An account with this email already exists in this browser.');
  }

  const timestamp = new Date().toISOString();
  const profile = {
    id: crypto.randomUUID(),
    full_name: String(fullName).trim(),
    phone_number: String(phone).trim(),
    business_name: String(businessName).trim(),
    email: normalizedEmail,
    created_at: timestamp,
    updated_at: timestamp
  };
  const account = { profile, password: await createPasswordRecord(password) };
  writeAccounts([...accounts, account]);
  return publicProfile(profile);
}

export async function signInLocalAccount(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const account = readAccounts().find(item => normalizeEmail(item.profile?.email) === normalizedEmail);
  if (!account || !(await verifyPassword(String(password || ''), account.password))) {
    throw new Error('Email or password is incorrect.');
  }
  localStorage.setItem(ACTIVE_USER_KEY, account.profile.id);
  return toSession(account);
}

export function getLocalProfile(userId) {
  const account = readAccounts().find(item => item.profile?.id === userId);
  return account ? publicProfile(account.profile) : null;
}

export function updateLocalProfile(userId, updates) {
  const accounts = readAccounts();
  const accountIndex = accounts.findIndex(item => item.profile?.id === userId);
  if (accountIndex < 0) throw new Error('Local profile was not found.');
  const current = accounts[accountIndex].profile;
  const email = normalizeEmail(updates.email ?? current.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError('Enter a valid profile email address.');
  if (accounts.some((account, index) => index !== accountIndex && normalizeEmail(account.profile?.email) === email)) {
    throw new Error('Another local account already uses this email.');
  }
  const next = {
    ...current,
    email,
    full_name: String(updates.full_name ?? current.full_name).trim(),
    phone_number: String(updates.phone_number ?? current.phone_number).trim(),
    business_name: String(updates.business_name ?? current.business_name).trim(),
    updated_at: new Date().toISOString()
  };
  if (!next.full_name || !next.phone_number) throw new TypeError('Name and mobile number cannot be empty.');
  accounts[accountIndex] = { ...accounts[accountIndex], profile: next };
  writeAccounts(accounts);
  return publicProfile(next);
}

export function restoreLocalProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const accounts = readAccounts();
  const existing = accounts.find(account => account.profile?.id === profile.id || normalizeEmail(account.profile?.email) === normalizeEmail(profile.email));
  if (existing) return publicProfile(existing.profile);
  const timestamp = new Date().toISOString();
  const restored = {
    id: crypto.randomUUID(),
    full_name: String(profile.full_name || profile.name || 'Ledger Owner').trim(),
    phone_number: String(profile.phone_number || profile.phone || '').trim(),
    business_name: String(profile.business_name || '').trim(),
    email: normalizeEmail(profile.email),
    created_at: timestamp,
    updated_at: timestamp
  };
  if (!restored.email) return null;
  writeAccounts([...accounts, { profile: restored, password: null }]);
  return publicProfile(restored);
}

export function getActiveLocalSession() {
  const userId = localStorage.getItem(ACTIVE_USER_KEY);
  const account = readAccounts().find(item => item.profile?.id === userId);
  return account ? toSession(account) : null;
}

export function setActiveLocalUser(userId) {
  localStorage.setItem(ACTIVE_USER_KEY, userId);
}

export function signOutLocalAccount() {
  localStorage.removeItem(ACTIVE_USER_KEY);
}

export function deleteLocalProfile(userId) {
  writeAccounts(readAccounts().filter(account => account.profile?.id !== userId));
  if (localStorage.getItem(ACTIVE_USER_KEY) === userId) signOutLocalAccount();
}