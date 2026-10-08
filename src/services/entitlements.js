export const FREE_CUSTOMER_LIMIT = 10;
export const FREE_WHATSAPP_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PLAN_PRICING = Object.freeze({ free: 0, proMonthly: 259, proYearly: 3099 });

export const PLAN_FEATURES = Object.freeze({
  core_ledger: Object.freeze({ free: true, pro: true }),
  unlimited_customers: Object.freeze({ free: false, pro: true }),
  advanced_reports: Object.freeze({ free: false, pro: true }),
  pdf_receipts: Object.freeze({ free: false, pro: true }),
  backup_restore: Object.freeze({ free: true, pro: true }),
  advanced_ledger: Object.freeze({ free: false, pro: true })
});

const validPlans = new Set(['free', 'pro']);
const validStatuses = new Set(['active', 'expired', 'cancelled', 'payment_failed', 'pending']);
const validCycles = new Set(['monthly', 'yearly']);

export function createFreeEntitlement(source = 'default', checkedAt = null) {
  return {
    plan: 'free',
    status: 'active',
    effectiveStatus: 'active',
    billing_cycle: null,
    start_date: null,
    expiry_date: null,
    payment_provider: null,
    source,
    checkedAt
  };
}

export function normalizeEntitlement(row, { source = 'server', checkedAt = new Date().toISOString(), now = Date.now() } = {}) {
  if (!row) return createFreeEntitlement(source, checkedAt);

  const plan = validPlans.has(row.plan) ? row.plan : 'free';
  const status = validStatuses.has(row.status) ? row.status : 'pending';
  const expiry = row.expiry_date ? Date.parse(row.expiry_date) : null;
  const effectiveStatus = plan === 'pro' && status === 'active' && Number.isFinite(expiry) && expiry <= now
    ? 'expired'
    : status;

  return {
    plan,
    status,
    effectiveStatus,
    billing_cycle: validCycles.has(row.billing_cycle) ? row.billing_cycle : null,
    start_date: row.start_date || null,
    expiry_date: row.expiry_date || null,
    payment_provider: row.payment_provider || null,
    source,
    checkedAt
  };
}

export function getCurrentPlan(entitlement) {
  return isPro(entitlement) ? 'pro' : 'free';
}

export function isPro(entitlement) {
  return entitlement?.plan === 'pro'
    && (entitlement.effectiveStatus || entitlement.status) === 'active'
    && (!entitlement.expiry_date || Date.parse(entitlement.expiry_date) > Date.now());
}

export function hasFeature(featureName, entitlement) {
  const feature = PLAN_FEATURES[featureName];
  if (!feature) return false;
  return feature[getCurrentPlan(entitlement)] === true;
}

export function getSubscriptionStatus(entitlement) {
  return entitlement?.effectiveStatus || entitlement?.status || 'active';
}

export function getFreeCustomerLimit() {
  return FREE_CUSTOMER_LIMIT;
}

export function getCustomerLimit(entitlement) {
  return isPro(entitlement) ? Number.POSITIVE_INFINITY : FREE_CUSTOMER_LIMIT;
}

export function canAddCustomer(existingCount, entitlement) {
  return Number(existingCount) < getCustomerLimit(entitlement);
}

function whatsappReminderKey(userId, customerId) {
  return `sahukar-whatsapp-reminder-v1:${userId}:${customerId}`;
}

export function getWhatsAppReminderState(userId, customerId, entitlement, now = Date.now()) {
  if (isPro(entitlement)) return { allowed: true, nextAvailableAt: null };
  try {
    const lastSentAt = Number(localStorage.getItem(whatsappReminderKey(userId, customerId)) || 0);
    const nextAvailableAt = lastSentAt + FREE_WHATSAPP_REMINDER_WINDOW_MS;
    return { allowed: !lastSentAt || now >= nextAvailableAt, nextAvailableAt: lastSentAt ? nextAvailableAt : null };
  } catch {
    return { allowed: true, nextAvailableAt: null };
  }
}

export function consumeWhatsAppReminder(userId, customerId, entitlement, now = Date.now()) {
  const state = getWhatsAppReminderState(userId, customerId, entitlement, now);
  if (!state.allowed) return state;
  if (!isPro(entitlement)) {
    try {
      localStorage.setItem(whatsappReminderKey(userId, customerId), String(now));
    } catch {
      // The reminder can still be sent if browser storage is unavailable.
    }
  }
  return { allowed: true, nextAvailableAt: isPro(entitlement) ? null : now + FREE_WHATSAPP_REMINDER_WINDOW_MS };
}