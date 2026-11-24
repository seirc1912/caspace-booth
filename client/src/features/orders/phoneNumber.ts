// Vietnamese mobile numbers only, exactly like the server (`api/_lib/uploadValidation.ts`):
// 10 digits starting 03/05/07/08/09. "+84 906…" and "84906…" become "0906…".
const phonePattern = /^0(?:3|5|7|8|9)\d{8}$/

export const normalizePhoneNumber = (value: string) => {
  const compact = value.trim().replace(/[\s().-]/g, '')
  if (compact.startsWith('+84')) return `0${compact.slice(3)}`
  if (compact.startsWith('84') && compact.length === 11) return `0${compact.slice(2)}`
  return compact
}
export const isValidPhoneNumber = (value: string) => phonePattern.test(normalizePhoneNumber(value))
