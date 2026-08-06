const phonePattern = /^\+?[0-9]{9,15}$/

export const normalizePhoneNumber = (value: string) => value.replace(/[\s().-]/g, '')
export const isValidPhoneNumber = (value: string) => phonePattern.test(normalizePhoneNumber(value))
