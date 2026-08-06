export const customerRoutes = Object.freeze({
  home: '/',
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
