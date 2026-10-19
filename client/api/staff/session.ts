import { clearStaffSessionCookie, requireStaff } from '../_lib/staffAuth.js'
import { enforceSameOrigin, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  try {
    enforceSameOrigin(request)
    enforceRateLimit(request)
    if (request.method === 'GET') {
      await requireStaff(request)
      response.status(200).json({ authenticated: true })
      return
    }
    if (request.method === 'DELETE') {
      response.setHeader('Set-Cookie', clearStaffSessionCookie())
      response.status(200).json({ authenticated: false })
      return
    }
    response.setHeader('Allow', 'GET, DELETE')
    response.status(405).json({ error: 'Phương thức không được hỗ trợ.' })
  } catch (reason) {
    if (request.method === 'GET') response.setHeader('Set-Cookie', clearStaffSessionCookie())
    sendApiError(response, reason)
  }
}
