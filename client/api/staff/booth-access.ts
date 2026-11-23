import { boothAccessStatus } from '../_lib/boothPhotos.js'
import { enforceSameOrigin, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'
import { requireStaff } from '../_lib/staffAuth.js'
import { requireCustomerPhone } from '../_lib/staffPhotos.js'

interface QueryRequest extends ApiRequest { query?: Record<string, string | string[] | undefined> }

// GET: how many booth photos / customer uploads one phone can pick from.
export default async function handler(request: QueryRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    enforceRateLimit(request, { limit: 120, windowMs: 10 * 60_000, scope: 'staff-booth-access' })
    const { client } = await requireStaff(request)
    response.status(200).json(await boothAccessStatus(client, requireCustomerPhone(request.query?.phone)))
  } catch (reason) { sendApiError(response, reason) }
}
