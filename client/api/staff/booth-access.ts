import { boothAccessStatus, reopenBoothAccess } from '../_lib/boothPhotos.js'
import { enforceSameOrigin, readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'
import { requireStaff } from '../_lib/staffAuth.js'
import { requireCustomerPhone } from '../_lib/staffPhotos.js'

interface QueryRequest extends ApiRequest { query?: Record<string, string | string[] | undefined> }

// GET: booth photo count + viewing window for one phone. POST: "Mở lại 6 giờ".
export default async function handler(request: QueryRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'GET' && request.method !== 'POST') { response.setHeader('Allow', 'GET, POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    enforceRateLimit(request, { limit: 120, windowMs: 10 * 60_000, scope: 'staff-booth-access' })
    const { client } = await requireStaff(request)
    if (request.method === 'GET') {
      response.status(200).json(await boothAccessStatus(client, requireCustomerPhone(request.query?.phone)))
      return
    }
    const phone = requireCustomerPhone((readJsonBody(request) as Record<string, unknown> | undefined)?.phone)
    response.status(200).json(await reopenBoothAccess(client, phone))
  } catch (reason) { sendApiError(response, reason) }
}
