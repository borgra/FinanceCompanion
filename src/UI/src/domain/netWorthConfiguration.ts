export const beginningNetWorthStorageKey = 'finance-companion-beginning-net-worth';

export const readBeginningNetWorth = (): number | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const rawValue = window.localStorage.getItem(beginningNetWorthStorageKey);
  if (rawValue === null || rawValue.trim() === '') {
    return undefined;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
};

export const writeBeginningNetWorth = (value: number | undefined) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (value === undefined || !Number.isFinite(value)) {
    window.localStorage.removeItem(beginningNetWorthStorageKey);
    return;
  }

  window.localStorage.setItem(beginningNetWorthStorageKey, String(value));
};
