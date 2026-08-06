export const customerRoutes = Object.freeze({
  home: '/',
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

export interface DeploymentOrigins {
  customer: string
  admin: string
  api: string
}
