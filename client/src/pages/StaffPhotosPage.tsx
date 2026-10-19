import { useEffect, useState } from 'react'
import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { checkStaffSession, downloadStaffPhoto, downloadStaffZip, listStaffPhotoFolders, listStaffPhotos, loginStaff, logoutStaff, type StaffPhoto, type StaffPhotoFolder } from '../features/staffPhotos/staffClient'

function sortFolders(folders: StaffPhotoFolder[]) {
  return [...folders].sort((left, right) => (Date.parse(right.latestUploadAt ?? '') || 0) - (Date.parse(left.latestUploadAt ?? '') || 0) || left.phone.localeCompare(right.phone))
}

export function StaffPhotosPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [ready, setReady] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [search, setSearch] = useState('')
  const [folders, setFolders] = useState<StaffPhotoFolder[]>([])
  const [folderOffset, setFolderOffset] = useState(0)
  const [foldersHaveMore, setFoldersHaveMore] = useState(false)
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [folderError, setFolderError] = useState('')
  const [folderRefresh, setFolderRefresh] = useState(0)
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [photos, setPhotos] = useState<StaffPhoto[]>([])
  const [photosHaveMore, setPhotosHaveMore] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { void checkStaffSession().then(setAuthenticated).finally(() => setReady(true)) }, [])
  useEffect(() => {
    if (!authenticated || selectedPhone) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setFoldersLoading(true)
      setFolderError('')
      void listStaffPhotoFolders(search).then((result) => {
        if (cancelled) return
        setFolders(sortFolders(result.items))
        setFolderOffset(result.nextOffset)
        setFoldersHaveMore(result.hasMore)
      }).catch((reason: unknown) => { if (!cancelled) setFolderError(reason instanceof Error ? reason.message : 'Không thể tải thư mục khách hàng.') })
        .finally(() => { if (!cancelled) setFoldersLoading(false) })
    }, search ? 250 : 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [authenticated, folderRefresh, search, selectedPhone])

  const login = async () => { setLoading(true); setMessage(''); try { await loginStaff(username, password); setPassword(''); setAuthenticated(true) } catch { setMessage('Tên đăng nhập hoặc mật khẩu không đúng.') } finally { setLoading(false) } }
  const logout = async () => { await logoutStaff().catch(() => undefined); setAuthenticated(false); setSelectedPhone(null); setFolders([]); setPhotos([]); setMessage('') }
  const loadMoreFolders = async () => { setFoldersLoading(true); setFolderError(''); try { const result = await listStaffPhotoFolders(search, folderOffset); setFolders((current) => sortFolders([...current, ...result.items])); setFolderOffset(result.nextOffset); setFoldersHaveMore(result.hasMore) } catch (reason) { setFolderError(reason instanceof Error ? reason.message : 'Không thể tải thêm thư mục.') } finally { setFoldersLoading(false) } }
  const openFolder = async (phone: string) => { setSelectedPhone(phone); setPhotos([]); setMessage(''); setLoading(true); try { const result = await listStaffPhotos(phone); setPhotos(result.items); setPhotosHaveMore(result.hasMore); if (!result.items.length) setMessage('Thư mục này chưa có ảnh.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Không thể tải ảnh.') } finally { setLoading(false) } }
  const loadMorePhotos = async () => { if (!selectedPhone) return; setLoading(true); try { const result = await listStaffPhotos(selectedPhone, photos.length); setPhotos((current) => [...current, ...result.items]); setPhotosHaveMore(result.hasMore) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Không thể tải thêm ảnh.') } finally { setLoading(false) } }
  const downloadAll = async () => { if (!selectedPhone || !photos.length) return; setLoading(true); try { await downloadStaffZip(selectedPhone) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Không thể tải ZIP.') } finally { setLoading(false) } }

  if (!ready) return <main className="grid min-h-dvh place-items-center">Đang kiểm tra phiên…</main>
  return <PageShell className="bg-[#f3eee7]">
    <header className="flex items-center justify-between gap-3"><BrandMark compact />{authenticated ? <div className="flex items-center gap-2"><a className="grid min-h-11 place-items-center rounded-full bg-white px-4 font-bold" href="/">Trang chủ</a><button className="min-h-11 rounded-full bg-white px-4 font-bold" onClick={logout} type="button">Đăng xuất</button></div> : null}</header>
    <section className="mx-auto mt-8 w-full max-w-5xl">
      <h1 className="text-4xl font-black">Kho ảnh khách</h1>
      {!authenticated ? <form className="mt-6 max-w-md rounded-[2rem] bg-white p-6 shadow-sm" onSubmit={(event) => { event.preventDefault(); void login() }}><label className="text-sm font-bold" htmlFor="staff-username">Tên đăng nhập</label><input autoCapitalize="none" autoComplete="username" className="mt-2 min-h-14 w-full rounded-2xl border px-4" id="staff-username" onChange={(event) => setUsername(event.target.value)} spellCheck={false} value={username} /><label className="mt-4 block text-sm font-bold" htmlFor="staff-password">Mật khẩu</label><input autoComplete="current-password" className="mt-2 min-h-14 w-full rounded-2xl border px-4" id="staff-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /><button className="mt-5 min-h-14 w-full rounded-2xl bg-stone-950 font-black text-white disabled:opacity-40" disabled={loading || !username || !password} type="submit">Đăng nhập</button>{message ? <p className="mt-4 text-sm font-bold text-rose-700" role="alert">{message}</p> : null}</form> : selectedPhone ? <>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><button className="min-h-11 rounded-full bg-white px-5 font-black shadow-sm" onClick={() => { setSelectedPhone(null); setPhotos([]); setMessage('') }} type="button">← Quay lại danh sách</button><div className="text-right"><p className="text-sm font-bold text-stone-500">Số điện thoại</p><h2 className="text-2xl font-black">{selectedPhone}</h2></div></div>
        <button className="mt-4 min-h-12 rounded-2xl bg-white px-5 font-black shadow-sm disabled:opacity-40" disabled={loading || !photos.length} onClick={downloadAll} type="button">Tải tất cả (.ZIP)</button>
        {message ? <p className="mt-4 rounded-2xl bg-white p-4 font-bold" role="status">{message}</p> : null}
        {loading && !photos.length ? <p className="mt-6 text-center font-bold">Đang tải ảnh…</p> : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{photos.map((photo) => <article className="overflow-hidden rounded-[1.5rem] bg-white shadow-sm" key={photo.path}>{photo.previewUrl ? <a href={photo.previewUrl} rel="noreferrer" target="_blank"><img alt={photo.name} className="aspect-square w-full bg-stone-100 object-contain" loading="lazy" src={photo.previewUrl} /></a> : <div className="aspect-square bg-stone-100" />}<div className="p-4"><p className="truncate font-black">{photo.name}</p><p className="mt-1 text-sm text-stone-500">{(photo.size / 1024 / 1024).toFixed(2)} MB{photo.uploadedAt ? ` · ${new Date(photo.uploadedAt).toLocaleString('vi-VN')}` : ''}</p><button className="mt-4 min-h-11 w-full rounded-xl bg-stone-950 font-bold text-white" onClick={() => void downloadStaffPhoto(selectedPhone, photo.path)} type="button">Tải file gốc</button></div></article>)}</div>
        {photosHaveMore ? <button className="mx-auto mt-6 block min-h-12 rounded-2xl bg-white px-6 font-black shadow-sm disabled:opacity-40" disabled={loading} onClick={loadMorePhotos} type="button">Tải thêm ảnh</button> : null}
      </> : <>
        <div className="mt-6 flex items-center gap-3 rounded-[2rem] bg-white p-5 shadow-sm"><input aria-label="Tìm theo số điện thoại" className="min-h-14 min-w-0 flex-1 rounded-2xl border px-4 text-lg font-bold" inputMode="tel" onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo số điện thoại" value={search} /><button className="min-h-14 shrink-0 rounded-2xl bg-stone-950 px-5 font-black text-white" onClick={() => setFolderRefresh((value) => value + 1)} type="button">Làm mới</button></div>
        {folderError ? <div className="mt-5 rounded-2xl bg-white p-5"><p className="font-bold text-rose-700" role="alert">{folderError}</p><button className="mt-3 min-h-11 rounded-xl bg-stone-950 px-5 font-bold text-white" onClick={() => setFolderRefresh((value) => value + 1)} type="button">Thử lại</button></div> : null}
        {foldersLoading && !folders.length ? <p className="mt-8 text-center font-bold">Đang tải thư mục khách hàng…</p> : null}
        {!foldersLoading && !folderError && !folders.length ? <div className="mt-6 rounded-[2rem] bg-white p-8 text-center"><p className="text-4xl">📁</p><p className="mt-3 font-black">Không tìm thấy thư mục phù hợp.</p></div> : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{folders.map((folder) => <button className="min-h-36 rounded-[1.5rem] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5" key={folder.phone} onClick={() => void openFolder(folder.phone)} type="button"><span aria-hidden="true" className="text-4xl">📁</span><span className="mt-3 block text-xl font-black">{folder.phone}</span><span className="mt-1 block text-sm text-stone-500">{folder.countCapped ? `${folder.photoCount}+ ảnh` : `${folder.photoCount} ảnh`}{folder.latestUploadAt ? ` · ${new Date(folder.latestUploadAt).toLocaleDateString('vi-VN')}` : ''}</span></button>)}</div>
        {foldersHaveMore ? <button className="mx-auto mt-6 block min-h-12 rounded-2xl bg-white px-6 font-black shadow-sm disabled:opacity-40" disabled={foldersLoading} onClick={loadMoreFolders} type="button">Tải thêm thư mục</button> : null}
      </>}
    </section>
  </PageShell>
}
