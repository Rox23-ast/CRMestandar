import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'crm_token'
const NAME_KEY = 'crm_user_name'

type JwtPayload = {
  role?: string
  name?: string
  exp?: number
}

const decodeJwtPayload = (token: string): JwtPayload => {
  try {
    const encoded = token.split('.')[1]
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as JwtPayload
  } catch {
    return {}
  }
}

const isExpired = (payload: JwtPayload) => typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()

const readInitialSession = () => {
  const token = sessionStorage.getItem(TOKEN_KEY) ?? ''
  const storedName = sessionStorage.getItem(NAME_KEY) ?? ''

  if (!token) {
    return { token: '', name: storedName, role: '', expired: false }
  }

  const payload = decodeJwtPayload(token)
  if (isExpired(payload)) {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(NAME_KEY)
    return { token: '', name: '', role: '', expired: true }
  }

  return {
    token,
    name: storedName || payload.name || '',
    role: payload.role || '',
    expired: false
  }
}

export function useSession() {
  const [initial] = useState(readInitialSession)
  const [token, setToken] = useState(initial.token)
  const [name, setName] = useState(initial.name)
  const [role, setRole] = useState(initial.role)
  const [sessionExpired, setSessionExpired] = useState(initial.expired)

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(NAME_KEY)
    setToken('')
    setName('')
    setRole('')
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSessionExpired(false)
  }, [clearSession])

  const expireSession = useCallback(() => {
    clearSession()
    setSessionExpired(true)
  }, [clearSession])

  const login = useCallback(async (email: string, password: string) => {
    const response = await axios.post<{ token: string; name: string }>(`${API_URL}/api/crm/auth/login`, { email, password })
    const nextToken = response.data.token
    const payload = decodeJwtPayload(nextToken)

    sessionStorage.setItem(TOKEN_KEY, nextToken)
    sessionStorage.setItem(NAME_KEY, response.data.name)
    setToken(nextToken)
    setName(response.data.name)
    setRole(payload.role || '')
    setSessionExpired(false)

    return response.data
  }, [])

  const updateToken = useCallback((nextToken: string) => {
    const payload = decodeJwtPayload(nextToken)
    sessionStorage.setItem(TOKEN_KEY, nextToken)
    setToken(nextToken)
    setRole(payload.role || '')
  }, [])

  useEffect(() => {
    if (!token) return

    const payload = decodeJwtPayload(token)
    if (typeof payload.exp !== 'number') return

    const remaining = payload.exp * 1000 - Date.now()
    if (remaining <= 0) {
      expireSession()
      return
    }

    const timer = window.setTimeout(expireSession, remaining)
    return () => window.clearTimeout(timer)
  }, [token, expireSession])

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const requestUrl = axios.isAxiosError(error) ? error.config?.url ?? '' : ''
        if (axios.isAxiosError(error) && error.response?.status === 401 && !requestUrl.includes('/api/crm/auth/')) {
          expireSession()
        }
        return Promise.reject(error)
      }
    )

    return () => axios.interceptors.response.eject(interceptor)
  }, [expireSession])

  return {
    token,
    name,
    role,
    sessionExpired,
    login,
    logout,
    updateToken
  }
}
