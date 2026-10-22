import { useEffect, useState } from 'react'

/** The current hash route split into parts, e.g. "#/openings/abc" → ["openings", "abc"]. */
export function useRoute(): string[] {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onChange = () => setHash(location.hash)
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean)
}

export function navigate(route: string) {
  location.hash = route
}
