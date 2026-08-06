import { useCallback, useEffect, useState } from 'react'

export function usePathname() {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const update = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  const navigate = useCallback((path: string, replace = false) => {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Navigation path must be same-origin')
    window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])

  return { pathname, navigate }
}
