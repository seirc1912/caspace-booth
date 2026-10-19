import { useEffect, useState } from 'react'
import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { checkStaffSession, downloadStaffPhoto, downloadStaffZip, listStaffPhotos, loginStaff, logoutStaff, type StaffPhoto } from '../features/staffPhotos/staffClient'
import { isValidVietnamesePhone, normalizeVietnamesePhone } from '../features/photoUpload/validation'

export function StaffPhotosPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [ready, setReady] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [photos, setPhotos] = useState<StaffPhoto[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => { void checkStaffSession().then(setAuthenticated).finally(() => setReady(true)) }, [])
  const login = async () => { setLoading(true); setMessage(''); try { await loginStaff(username, password); setPassword(''); setAuthenticated(true) } catch { setMessage('Tên đăng nhập hoặc mật khẩu không đúng.') } finally { setLoading(false) } }
  const logout = async () => { await logoutStaff().catch(() => undefined); setAuthenticated(false); setPhotos([]); setHasMore(false); setMessage('') }
  const search = async () => { if (!isValidVietnamesePhone(phone)) { setMessage('Vui lòng nhập đúng số điện thoại Việt Nam.'); return } setLoading(true); setMessage(''); try { const result = await listStaffPhotos(normalizeVietnamesePhone(phone)); setPhotos(result.items); setHasMore(result.hasMore); if (!result.items.length) setMessage('Không tìm thấy ảnh cho số điện thoại này.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Không thể tải ảnh.') } finally { setLoading(false) } }
  const loadMore = async () => { if (!hasMore) return; setLoading(true); setMessage(''); try { const result = await listStaffPhotos(normalizeVietnamesePhone(phone), photos.length); setPhotos((current) => [...current, ...result.items]); setHasMore(result.hasMore) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Không thể tải thêm ảnh.') } finally { setLoading(false) } }
  const downloadAll = async () => { if (!photos.length) return; setLoading(true); try { await downloadStaffZip(normalizeVietnamesePhone(phone)) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Không thể tải ZIP.') } finally { setLoading(false) } }

  if (!ready) return <main className="grid min-h-dvh place-items-center">Đang kiểm tra phiên…</main>
  return <PageShell className="bg-[#f3eee7]">
    <header className="flex items-center justify-between"><BrandMark compact />{authenticated ? <button className="min-h-11 rounded-full bg-white px-4 font-bold" onClick={logout} type="button">Đăng xuất</button> : null}</header>
    <section className="mx-auto mt-8 w-full max-w-5xl">
      <h1 className="text-4xl font-black">Kho ảnh khách</h1>
      {!authenticated ? <form className="mt-6 max-w-md rounded-[2rem] bg-white p-6 shadow-sm" onSubmit={(event) => { event.preventDefault(); void login() }}>
        <label className="text-sm font-bold" htmlFor="staff-username">Tên đăng nhập</label>
        <input autoCapitalize="none" autoComplete="username" className="mt-2 min-h-14 w-full rounded-2xl border px-4" id="staff-username" onChange={(event) => setUsername(event.target.value)} spellCheck={false} value={username} />
        <label className="mt-4 block text-sm font-bold" htmlFor="staff-password">Mật khẩu</label>
        <input autoComplete="current-password" className="mt-2 min-h-14 w-full rounded-2xl border px-4" id="staff-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        <button className="mt-5 min-h-14 w-full rounded-2xl bg-stone-950 font-black text-white disabled:opacity-40" disabled={loading || !username || !password} type="submit">Đăng nhập</button>
        {message ? <p className="mt-4 text-sm font-bold text-rose-700" role="alert">{message}</p> : null}
      </form> : <>
        <div className="mt-6 flex flex-col gap-3 rounded-[2rem] bg-white p-5 shadow-sm sm:flex-row"><input className="min-h-14 flex-1 rounded-2xl border px-4 text-lg font-bold" inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="Số điện thoại khách" value={phone} /><button className="min-h-14 rounded-2xl bg-stone-950 px-7 font-black text-white disabled:opacity-40" disabled={loading} onClick={search} type="button">Tìm ảnh</button></div>
        {photos.length ? <button className="mt-4 min-h-12 rounded-2xl bg-white px-5 font-black shadow-sm disabled:opacity-40" disabled={loading} onClick={downloadAll} type="button">Tải tất cả (.ZIP)</button> : null}
        {message ? <p className="mt-4 rounded-2xl bg-white p-4 font-bold" role="status">{message}</p> : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{photos.map((photo) => <article className="overflow-hidden rounded-[1.5rem] bg-white shadow-sm" key={photo.path}>{photo.previewUrl ? <a href={photo.previewUrl} rel="noreferrer" target="_blank"><img alt={photo.name} className="aspect-square w-full bg-stone-100 object-contain" loading="lazy" src={photo.previewUrl} /></a> : <div className="aspect-square bg-stone-100" />}<div className="p-4"><p className="truncate font-black">{photo.name}</p><p className="mt-1 text-sm text-stone-500">{(photo.size / 1024 / 1024).toFixed(2)} MB{photo.uploadedAt ? ` · ${new Date(photo.uploadedAt).toLocaleString('vi-VN')}` : ''}</p><button className="mt-4 min-h-11 w-full rounded-xl bg-stone-950 font-bold text-white" onClick={() => void downloadStaffPhoto(normalizeVietnamesePhone(phone), photo.path)} type="button">Tải file gốc</button></div></article>)}</div>
        {hasMore ? <button className="mx-auto mt-6 block min-h-12 rounded-2xl bg-white px-6 font-black shadow-sm disabled:opacity-40" disabled={loading} onClick={loadMore} type="button">Tải thêm ảnh</button> : null}
      </>}
    </section>
  </PageShell>
}
