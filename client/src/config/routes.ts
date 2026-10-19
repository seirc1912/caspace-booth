export const customerRoutes = Object.freeze({
  home: '/',
  colorLab: '/color-lab',
  photoUpload: '/upload-anh',
  templates: '/templates',
  editor: '/editor',
  preview: '/preview',
  success: '/success',
})

export const adminRoutes = Object.freeze({
  home: '/admin',
  templates: '/admin/templates',
  newTemplate: '/admin/templates/new',
  templateEditPattern: '/admin/templates/:id/edit',
})

export const staffRoutes = Object.freeze({ photos: '/staff/photos' })

export interface DeploymentOrigins {
  customer: string
  admin: string
  api: string
}
