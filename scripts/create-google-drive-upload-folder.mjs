const required = (name) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const clientId = required('GOOGLE_CLIENT_ID')
const clientSecret = required('GOOGLE_CLIENT_SECRET')
const refreshToken = required('GOOGLE_REFRESH_TOKEN')

const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
})
const tokenBody = await tokenResponse.json()
if (!tokenResponse.ok || !tokenBody.access_token) throw new Error('Could not obtain a Google access token')
const authorization = { Authorization: `Bearer ${tokenBody.access_token}` }
const query = "name='CÁ SPACE - ẢNH KHÁCH' and mimeType='application/vnd.google-apps.folder' and trashed=false"
const listResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`, { headers: authorization })
const listBody = await listResponse.json()
if (!listResponse.ok) throw new Error('Could not search Google Drive')
let folderId = listBody.files?.[0]?.id
if (!folderId) {
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { ...authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'CÁ SPACE - ẢNH KHÁCH', mimeType: 'application/vnd.google-apps.folder', appProperties: { caspaceUploadRoot: 'true' } }),
  })
  const createBody = await createResponse.json()
  if (!createResponse.ok || !createBody.id) throw new Error('Could not create the Google Drive folder')
  folderId = createBody.id
}
console.log(`GOOGLE_DRIVE_PARENT_FOLDER_ID=${folderId}`)
