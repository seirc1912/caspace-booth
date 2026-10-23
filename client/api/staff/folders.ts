import { enforceSameOrigin, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'
import { requireStaff } from '../_lib/staffAuth.js'
import { listCustomerFolders, normalizeFolderSearch } from '../_lib/staffPhotos.js'

interface QueryRequest extends ApiRequest { query?: Record<string, string | string[] | undefined> }

export const config = { maxDuration: 60 }

export default async function handler(request: QueryRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    enforceRateLimit(request, { limit: 60, windowMs: 10 * 60_000 })
    const { client } = await requireStaff(request)
    const search = normalizeFolderSearch(request.query?.search)
    const offset = Math.max(0, Math.min(100_000, Number(request.query?.offset ?? 0) || 0))
    const limit = Math.max(1, Math.min(500, Number(request.query?.limit ?? 24) || 24))
    response.status(200).json(await listCustomerFolders(client, search, offset, limit))
  } catch (reason) { sendApiError(response, reason) }
}
