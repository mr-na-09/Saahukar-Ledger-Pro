// Formula: Interest = (Principal * Rate * Days) / 3000
export function calculateLiveInterest(principal, rate, startDateStr, paymentsHistory = [], interestType = 'SIMPLE', interestCarry = 0, interestPaidSinceDate = 0) {
  const principalValue = Number(principal);
  const rateValue = Number(rate);
  const carryValue = Number(interestCarry || 0);
  const paidValue = Number(interestPaidSinceDate || 0);
  const start = new Date(startDateStr);
  if (!Number.isFinite(principalValue) || principalValue < 0) throw new TypeError('Principal must be a finite non-negative number.');
  if (!Number.isFinite(rateValue) || rateValue < 0) throw new TypeError('Interest rate must be a finite non-negative number.');
  if (!Number.isFinite(start.getTime())) throw new TypeError('Loan date must be a valid date.');
  if (!Number.isFinite(carryValue) || carryValue < 0 || !Number.isFinite(paidValue) || paidValue < 0) throw new TypeError('Interest adjustments must be finite non-negative numbers.');
  if (!Array.isArray(paymentsHistory)) throw new TypeError('Payment history must be a list.');
  const today = new Date();

  const diffTime = Math.max(0, today - start);
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const dailyRate = rateValue / 3000;
  const totalAccruedInterest = String(interestType).toUpperCase() === 'COMPOUND'
    ? principalValue * (Math.pow(1 + dailyRate, totalDays) - 1)
    : (principalValue * rateValue * totalDays) / 3000;
  if (!Number.isFinite(totalAccruedInterest)) throw new TypeError('Calculated interest exceeds the supported financial range.');

  let interestPaidSoFar = 0;
  let currentPrincipal = principal;

  paymentsHistory.forEach(p => {
    const interestPaid = Number(p.interest_paid || 0);
    const principalPaid = Number(p.principal_paid ?? p.principal_deducted ?? 0);
    if (!Number.isFinite(interestPaid) || interestPaid < 0 || !Number.isFinite(principalPaid) || principalPaid < 0) {
      throw new TypeError('Payment history contains invalid financial amounts.');
    }
    interestPaidSoFar += interestPaid;
    currentPrincipal -= principalPaid;
  });

  const livePendingInterest = Math.max(0, totalAccruedInterest - interestPaidSoFar - paidValue) + carryValue;
  currentPrincipal = Math.max(0, currentPrincipal);
  const totalPayableNow = currentPrincipal + livePendingInterest;

  return {
    totalDays,
    currentPrincipal,
    livePendingInterest,
    totalPayableNow,
    isOverdue: totalDays >= 30 && livePendingInterest > 0
  };
}

export function processPartPayment(currentPrincipal, livePendingInterest, amountPaid) {
  const principal = Number(currentPrincipal);
  const interest = Number(livePendingInterest);
  const paid = Number(amountPaid);
  if (![principal, interest, paid].every(Number.isFinite) || principal < 0 || interest < 0 || paid <= 0) {
    throw new TypeError('Payment values must be finite, with a positive payment amount.');
  }
  if (paid > principal + interest + 0.01) throw new TypeError('Payment cannot exceed the current payable balance.');
  if (paid <= interest) {
    return {
      interestPaid: paid,
      principalDeducted: 0,
      remainingPrincipal: principal,
      newStatus: principal === 0 ? 'CLOSED' : 'ACTIVE'
    };
  } else {
    const interestPaid = interest;
    const principalDeducted = paid - interest;
    const remainingPrincipal = Math.max(0, principal - principalDeducted);

    return {
      interestPaid,
      principalDeducted,
      remainingPrincipal,
      newStatus: remainingPrincipal === 0 ? 'CLOSED' : 'ACTIVE'
    };
  }
}