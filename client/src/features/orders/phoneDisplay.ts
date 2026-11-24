/** Groups a Vietnamese number as 0906 341 807 while typing (only plain digits are regrouped). */
export function formatPhoneDisplay(value: string) {
  if (!/^[\d\s]*$/.test(value)) return value
  const digits = value.replace(/\s/g, '').slice(0, 15)
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7)].filter(Boolean).join(' ')
}

/** 0949256173 → 0949 256 173 (display only; other formats are shown as configured). */
export function formatPhoneNumberForDisplay(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length === 10 ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : value
}
