export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(value))
}

export function formatPriceTl(priceMinor: number) {
  return `${(priceMinor / 100).toFixed(2)} TL`
}
