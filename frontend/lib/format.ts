export function formatSalary(range: {
  currency: string;
  min_amount: number;
  max_amount: number;
}) {
  const min = compactMoney(range.min_amount);
  const max = compactMoney(range.max_amount);
  return `${range.currency} ${min}-${max}`;
}

export function formatExperience(range: { min_years: number; max_years: number }) {
  if (range.min_years === range.max_years) {
    return `${range.min_years} yrs`;
  }
  return `${range.min_years}-${range.max_years} yrs`;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function compactMoney(value: number) {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }
  return value.toLocaleString();
}
