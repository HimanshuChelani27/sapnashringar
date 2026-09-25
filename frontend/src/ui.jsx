import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import T from './i18n'
import { addDays, api, fmtDate, nightNo, today } from './api'

export const GENDERS = ['women', 'girls', 'men', 'boys', 'kids']

const Ctx = createContext({ lang: 'en', setLang() {}, settings: {}, reloadSettings() {} })
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [lang, setLangState] = useState(() => { try { return localStorage.getItem('lang') || 'en' } catch { return 'en' } })
  const [settings, setSettings] = useState({})
  const reloadSettings = () => api('/settings/public').then(setSettings).catch(() => {})
  useEffect(() => { reloadSettings() }, [])
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  const setLang = l => { setLangState(l); try { localStorage.setItem('lang', l) } catch {} }
  return <Ctx.Provider value={{ lang, setLang, settings, reloadSettings }}>{children}</Ctx.Provider>
}

export function useT() {
  const { lang } = useApp()
  return (k, vars = {}) => (T[lang][k] ?? T.en[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '')
}

/** GET a path; returns [data, error, reload]. Pass null to skip. */
export function useApi(path) {
  const [s, setS] = useState({ data: null, err: '' })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    api(path, { admin: path.startsWith('/admin') })
      .then(data => live && setS({ data, err: '' }))
      .catch(e => live && setS({ data: null, err: e.message }))
    return () => { live = false }
  }, [path, n])
  return [s.data, s.err, () => setN(x => x + 1)]
}

export function TopBar({ title, back, onBack, children }) {
  const t = useT()
  const nav = useNavigate()
  const { lang, setLang } = useApp()
  return (
    <header className="bar">
      {back
        ? <button className="back" onClick={onBack || (() => nav(-1))} aria-label="Back">‹</button>
        : <Link to="/home" className="logo">Sapna<small>{t('tagline')}</small></Link>}
      {title && <h1 className="t">{title}</h1>}
      <span className="grow" />
      {children}
      <button className="chip sm" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}>{lang === 'en' ? 'हिंदी' : 'English'}</button>
    </header>
  )
}

export function DateStrip({ value, onChange, from = today(), days = 21, light }) {
  const t = useT()
  const { lang, settings } = useApp()
  const ref = useRef()
  useEffect(() => {
    const box = ref.current, el = box?.querySelector('.on')
    if (el) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2
  }, [value])
  return (
    <div className={'dates' + (light ? ' light' : '')} ref={ref}>
      {Array.from({ length: days }, (_, i) => addDays(from, i)).map(d => {
        const n = nightNo(d, settings.navratri_start)
        return (
          <button key={d} className={'date' + (d === value ? ' on' : '')} onClick={() => onChange(d)} aria-pressed={d === value}>
            <small>{fmtDate(d, lang, { weekday: 'short' })}</small>
            <b>{Number(d.slice(8))}</b>
            <em>{n ? `${t('night')} ${n}` : fmtDate(d, lang, { month: 'short' })}</em>
          </button>
        )
      })}
    </div>
  )
}

export function Chips({ options, value, onChange, wrap }) {
  return (
    <div className={wrap ? 'wrapchips' : 'chips'}>
      {options.map(([v, label]) => (
        <button key={v} className={'chip' + (v === value ? ' on' : '')} aria-pressed={v === value}
          onClick={() => onChange(v === value && wrap ? '' : v)}>{label}</button>
      ))}
    </div>
  )
}

export const Pill = ({ s, children }) => {
  const t = useT()
  return <span className={'pill ' + s}>{children || t(s)}</span>
}

export const Photo = ({ src, alt = '', className = '', tone = 1, eager }) =>
  src ? <img className={'ph ' + className} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    : <div className={`ph p${tone} ${className}`} role="img" aria-label={alt} />

export const Loading = ({ err }) => {
  const t = useT()
  return <p className={err ? 'err' : 'muted center'}>{err || t('loading')}</p>
}
