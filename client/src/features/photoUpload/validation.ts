export const PHOTO_UPLOAD_MAX_FILES = 20
export const PHOTO_UPLOAD_MAX_FILE_BYTES = 25 * 1024 * 1024
export const PHOTO_UPLOAD_MAX_TOTAL_BYTES = 250 * 1024 * 1024

const vietnameseMobilePattern = /^0(?:3|5|7|8|9)\d{8}$/

export function normalizeVietnamesePhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, '')
  if (compact.startsWith('+84')) return `0${compact.slice(3)}`
  if (compact.startsWith('84') && compact.length === 11) return `0${compact.slice(2)}`
  return compact
}

export function isValidVietnamesePhone(value: string) {
  return vietnameseMobilePattern.test(normalizeVietnamesePhone(value))
}

export function supportedImageMime(file: Pick<File, 'name' | 'type'>) {
  if (file.type === 'image/png' || file.type === 'image/jpeg') return file.type
  if (/\.png$/i.test(file.name)) return 'image/png'
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg'
  return null
}

export function validateSelectedFiles(files: readonly Pick<File, 'name' | 'size' | 'type'>[]) {
  if (files.length === 0) return 'Vui lòng chọn ít nhất một ảnh.'
  if (files.length > PHOTO_UPLOAD_MAX_FILES) return `Mỗi lần chỉ được gửi tối đa ${PHOTO_UPLOAD_MAX_FILES} ảnh.`
  let total = 0
  for (const file of files) {
    if (!supportedImageMime(file)) return `“${file.name}” không phải ảnh PNG hoặc JPG.`
    if (file.size <= 0) return `“${file.name}” là tệp trống.`
    if (file.size > PHOTO_UPLOAD_MAX_FILE_BYTES) return `“${file.name}” vượt quá giới hạn 25 MB.`
    total += file.size
  }
  if (total > PHOTO_UPLOAD_MAX_TOTAL_BYTES) return 'Tổng dung lượng ảnh vượt quá giới hạn 250 MB.'
  return null
}
