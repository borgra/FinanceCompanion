import type { Account } from './account';

export const minimumAmountError = 'Enter an amount from $0 to $999,999,999.99 with no more than two decimal places, or leave blank.';

// Parse decimal text into integer cents before converting to an API money value.
export function parseMinimumAmount(value: string | null | undefined): number | null {
  const text = value?.trim() ?? '';
  if (!text) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(minimumAmountError);
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > 99_999_999_999n) throw new Error(minimumAmountError);
  return cents === 0n ? null : Number(cents) / 100;
}

// Round decimal inputs to cents without binary multiplication errors (e.g. 1.005).
export function moneyCents(amount: number): bigint {
  if (!Number.isFinite(amount)) throw new Error('Money must be finite.');
  const [coefficient, exponent = '0'] = Math.abs(amount).toString().toLowerCase().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = BigInt(whole + fraction);
  const scale = fraction.length - Number(exponent) - 2;
  const divisor = 10n ** BigInt(Math.max(scale, 0));
  const cents = scale > 0
    ? (digits + divisor / 2n) / divisor
    : digits * 10n ** BigInt(-scale);
  return amount < 0 ? -cents : cents;
}

export const sumMoney = (...amounts: number[]): number =>
  Number(amounts.reduce((sum, amount) => sum + moneyCents(amount), 0n)) / 100;

export function totalAccountMinimum(accounts: Account[]): number {
  const eligible = new Map(accounts.filter((account) =>
    (account.type === 'Checking' || account.type === 'Savings') &&
    Number.isFinite(account.minimumAmount) && (account.minimumAmount ?? 0) > 0,
  ).map((account) => [account.id, account]));
  return sumMoney(...[...eligible.values()].map((account) => account.minimumAmount!));
}

export function minimumPercentage(current: number, minimum: number): string {
  const numerator = moneyCents(current) * 1000n;
  const denominator = moneyCents(minimum);
  if (denominator <= 0n) return 'Unavailable';
  const absolute = numerator < 0n ? -numerator : numerator;
  const tenths = (absolute + denominator / 2n) / denominator;
  const percentage = Number(numerator < 0n ? -tenths : tenths) / 10;
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(percentage)}%`;
}

export const localMonthCode = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export function currentMinimumBalance(
  account: Account,
  records: { month: string; net: number }[],
  months: { name: string; dateCode: string }[],
  monthCode: string,
): number | undefined {
  const month = months.find((item) => item.dateCode === monthCode);
  if (!month || account.startDate.slice(0, 7) > monthCode ||
      !account.monthlyRecords.some((record) => record.month === month.name)) return undefined;
  const amount = records.find((record) => record.month === month.name)?.net;
  return amount !== undefined && Number.isFinite(amount) ? amount : undefined;
}
