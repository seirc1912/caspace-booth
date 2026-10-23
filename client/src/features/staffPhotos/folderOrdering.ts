import type { StaffPhotoFolder } from './staffClient'

export function newestStaffFoldersFirst(folders: StaffPhotoFolder[]) {
  return [...folders].sort((left, right) =>
    (Date.parse(right.latestUploadAt ?? '') || 0) - (Date.parse(left.latestUploadAt ?? '') || 0)
    || left.phone.localeCompare(right.phone),
  )
}

export function mergeStaffFolders(current: StaffPhotoFolder[], incoming: StaffPhotoFolder[]) {
  const byPhone = new Map(current.map((folder) => [folder.phone, folder]))
  incoming.forEach((folder) => byPhone.set(folder.phone, folder))
  return newestStaffFoldersFirst([...byPhone.values()])
}
