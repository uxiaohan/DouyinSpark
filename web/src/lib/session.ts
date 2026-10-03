import { api } from '@/api'

/**
 * 真实会话：后端只有口令登录 + HttpOnly cookie（同源自动携带）。
 * 模板的 localStorage 假会话不可用，这里开机探针一次，路由守卫复用缓存结果。
 */

export type SessionUser = {
  id: string
  name: string
  role: string
}

/** 本地单口令控制台，没有多用户体系，用固定展示身份 */
const CONSOLE_USER: SessionUser = {
  id: 'local-admin',
  name: '管理员',
  role: '本地控制台',
}

type SessionState = 'unknown' | 'authed' | 'anonymous'

let state: SessionState = 'unknown'

/** 用需要登录的接口探针：401 即未登录（/api/bootstrap 是公开接口，不能用来探针） */
export async function probeSession(): Promise<boolean> {
  try {
    await api.getSettings()
    state = 'authed'
  } catch {
    state = 'anonymous'
  }
  return state === 'authed'
}

export function isAuthenticated(): boolean {
  return state === 'authed'
}

export function sessionUser(): SessionUser {
  return CONSOLE_USER
}

/** 登录不走 api.login：401 时 req 会全局跳登录页并吞掉「口令错误」文案 */
export async function login(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
  } catch {
    return { ok: false, error: '网络异常，无法连接控制台服务' }
  }
  if (res.ok) {
    state = 'authed'
    return { ok: true }
  }
  const detail = (await res.json().catch(() => null)) as { error?: string } | null
  return { ok: false, error: detail?.error ?? `登录失败 ${res.status}` }
}

export async function logout(): Promise<void> {
  try {
    await api.logout()
  } catch {
    // 登出接口失败也清本地状态，交由路由守卫跳登录页
  }
  state = 'anonymous'
}
