import { enforceSameOrigin, readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse } from '../../_lib/http.js'
import { enforceRateLimit } from '../../_lib/rateLimit.js'
import { requireStaff } from '../../_lib/staffAuth.js'
import { requireCustomerObjectPath, requireCustomerPhone } from '../../_lib/staffPhotos.js'
import { customerPhotoBucket } from '../../_lib/supabaseStorage.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request); enforceRateLimit(request, { limit: 120, windowMs: 10 * 60_000 })
    const { client } = await requireStaff(request)
    const body = readJsonBody(request) as Record<string, unknown>
    const phone = requireCustomerPhone(body.phone)
    const path = requireCustomerObjectPath(phone, body.path)
    const signed = await client.storage.from(customerPhotoBucket).createSignedUrl(path, 60, { download: true })
    if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error('signed URL missing')
    response.status(200).json({ url: signed.data.signedUrl })
  } catch (reason) { sendApiError(response, reason) }
}
