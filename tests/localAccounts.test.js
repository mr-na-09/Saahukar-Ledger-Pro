import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalAccount,
  deleteLocalProfile,
  getActiveLocalSession,
  getLocalProfile,
  setActiveLocalUser,
  signInLocalAccount,
  signOutLocalAccount,
  updateLocalProfile
} from '../src/services/localAccounts.js';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};

test.beforeEach(() => values.clear());

test('local accounts create, authenticate, update profile, restore session, and delete', async () => {
  const profile = await createLocalAccount({
    fullName: 'Ledger Owner',
    phone: '9000000000',
    businessName: 'Community Lending',
    email: 'owner@example.com',
    password: 'local-password-123'
  });
  assert.equal(getLocalProfile(profile.id).full_name, 'Ledger Owner');
  await assert.rejects(signInLocalAccount(profile.email, 'incorrect-password'), /incorrect/);

  const session = await signInLocalAccount(profile.email, 'local-password-123');
  assert.equal(session.user.id, profile.id);
  assert.equal(getActiveLocalSession().user.email, profile.email);

  const updated = updateLocalProfile(profile.id, { full_name: 'Updated Owner', phone_number: '9111111111' });
  assert.equal(updated.full_name, 'Updated Owner');
  assert.equal(updated.phone_number, '9111111111');

  signOutLocalAccount();
  assert.equal(getActiveLocalSession(), null);
  setActiveLocalUser(profile.id);
  deleteLocalProfile(profile.id);
  assert.equal(getLocalProfile(profile.id), null);
  assert.equal(getActiveLocalSession(), null);
});

test('local account creation rejects short passwords and duplicate email addresses', async () => {
  const details = { fullName: 'Owner', phone: '9000000000', email: 'owner@example.com' };
  await assert.rejects(createLocalAccount({ ...details, password: 'short' }), /8 characters/);
  await createLocalAccount({ ...details, password: 'valid-password' });
  await assert.rejects(createLocalAccount({ ...details, password: 'another-password' }), /already exists/);
});
