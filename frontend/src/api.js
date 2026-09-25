const TOKEN = 'garba_token'

export const getToken = () => { try { return localStorage.getItem(TOKEN) || '' } catch { return '' } }
export const setToken = t => { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN) } catch {} }

export async function api(path, { method = 'GET', body, admin } = {}) {
  const headers = {}
  if (admin) headers.Authorization = 'Bearer ' + getToken()
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }
  const r = await fetch('/api' + path, { method, headers, body })
  if (r.status === 401 && admin) {
    setToken('')
    location.href = '/garba/admin/login'
  }
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const d = data?.detail
    throw new Error(typeof d === 'string' ? d : d?.[0]?.msg || 'Something went wrong. Please try again.')
  }
  return data
}

export const form = obj => {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach(x => f.append(k, x))
    else if (v !== undefined && v !== null) f.append(k, v)
  }
  return f
}

export const img = p => (p ? '/uploads/' + p : '')
// ~40 KB version for lists; the full ~150 KB one only loads on the dress page
export const thumb = p => (p ? '/uploads/' + p.replace(/\.webp$/, '_t.jpg') : '')
export const payImg = p => `/api/admin/payments/${p}?token=${encodeURIComponent(getToken())}`
export const rupee = n => '₹' + Number(n || 0).toLocaleString('en-IN')

// dates are plain 'YYYY-MM-DD' strings in local time
const pad = n => String(n).padStart(2, '0')
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => iso(new Date())
export const addDays = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return iso(d) }
export const fmtDate = (s, lang = 'en', opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(s + 'T00:00').toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', opts)

/** "Night 3" if the date falls in the 9 Navratri nights, else null. */
export const nightNo = (s, start) => {
  if (!start) return null
  const n = Math.round((new Date(s + 'T00:00') - new Date(start + 'T00:00')) / 864e5) + 1
  return n >= 1 && n <= 9 ? n : null
}

export const waLink = (phone, text) =>
  `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(text)}`
