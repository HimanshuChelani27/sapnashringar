import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, fmtDate, form, img, rupee, thumb, today, waLink } from './api'
import { Chips, DateStrip, GENDERS, Loading, Photo, Pill, TopBar, useApi, useApp, useT } from './ui'

const store = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)) || {} } catch { return {} } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}

function useQuery() {
  const [sp, setSp] = useSearchParams()
  // set('date', d) or set({ gender: g, type: '' }) to change several at once
  const set = (k, v) => {
    const n = new URLSearchParams(sp)
    for (const [key, val] of Object.entries(typeof k === 'string' ? { [k]: v } : k)) val ? n.set(key, val) : n.delete(key)
    setSp(n, { replace: true })
  }
  return [k => sp.get(k) || '', set]
}

function DressCard({ d, date }) {
  const t = useT()
  return (
    <Link to={`/dresses/${d.id}${date ? `?date=${date}` : ''}`} className={'dcard' + (d.availability === 'booked' ? ' dim' : '')}>
      <Photo src={thumb(d.photo)} alt={d.name} tone={(d.id % 6) + 1} />
      <div className="in">
        <span className="nm">{d.name}</span>
        <div className="row between">
          <span className="price">{rupee(d.rent)}</span>
          {d.availability && <Pill s={d.availability} />}
        </div>
        {d.size && <span className="muted xs">{t('size')} {d.size}</span>}
      </div>
    </Link>
  )
}

// ---------- Home ----------
export function Home() {
  const t = useT()
  const nav = useNavigate()
  const { lang, settings } = useApp()
  const start = settings.navratri_start > today() ? settings.navratri_start : today()
  const [date, setDate] = useState(start)
  useEffect(() => setDate(start), [start])
  // category tiles show a real photo from that category (falls back to the pattern until photos exist)
  const [dresses] = useApi('/dresses')
  const [extras] = useApi('/addons')
  const pic = list => list?.find(x => x.photo)?.photo
  const tiles = [...GENDERS.map((g, i) => [`/dresses?gender=${g}`, t('g_' + g), i + 1, pic(dresses?.filter(d => d.gender === g))]),
    ['/extras', t('extras'), 6, pic(extras)]]
  return (
    <>
      <TopBar />
      <main className="body">
        <section className="hero">
          <p className="h">{t('which_night')}</p>
          <DateStrip value={date} onChange={setDate} from={start} days={12} light />
          <button className="btn gold" onClick={() => nav(`/availability?date=${date}`)}>
            {t('see_free')} · {fmtDate(date, lang)}
          </button>
        </section>
        <h2 className="lbl">{t('shop_by')}</h2>
        <div className="cats">
          {tiles.map(([to, label, tone, photo]) => (
            <Link key={to} to={to}><Photo src={thumb(photo)} tone={tone} alt="" />{label}</Link>
          ))}
        </div>
        <h2 className="lbl">{t('how')}</h2>
        <ol className="steps">
          <li>{t('how1')}</li><li>{t('how2')}</li><li>{t('how3')}</li>
        </ol>
        <Link to="/rules" className="link">{t('rules')} ›</Link>
      </main>
    </>
  )
}

// ---------- Availability by date ----------
export function Availability() {
  const t = useT()
  const [q, set] = useQuery()
  const date = q('date') || today()
  const gender = q('gender')
  const [hide, setHide] = useState(false)
  const [list, err] = useApi(`/dresses?date=${date}&gender=${gender}`)
  const count = s => list?.filter(d => d.availability === s).length || 0
  const shown = list?.filter(d => !hide || d.availability !== 'booked')
  return (
    <>
      <TopBar title={t('available_on')} />
      <main className="body">
        <DateStrip value={date} onChange={d => set('date', d)} from={today()} days={30} />
        <Chips options={[['', t('g_all')], ...GENDERS.map(g => [g, t('g_' + g)])]} value={gender} onChange={v => set('gender', v)} />
        {list && (
          <div className="row between">
            <span><b className="ok">{count('free')} {t('n_free')}</b> <span className="muted">· {count('hold')} {t('n_hold')} · {count('booked')} {t('n_booked')}</span></span>
            <label className="toggle"><input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)} /> {t('hide_booked')}</label>
          </div>
        )}
        {!list ? <Loading err={err} /> : !shown.length ? <p className="muted center">{t('none_found')}</p> : (
          <div className="grid2">{shown.map(d => <DressCard key={d.id} d={d} date={date} />)}</div>
        )}
      </main>
    </>
  )
}

// ---------- Dresses + filter sheet ----------
const PRICES = { low: [0, 499], mid: [500, 1000], high: [1001, 1e9] }

export function Dresses() {
  const t = useT()
  const [q, set] = useQuery()
  const [all, err] = useApi('/dresses')
  const [open, setOpen] = useState(false)
  const f = { gender: q('gender'), type: q('type'), size: q('size'), price: q('price') }
  const list = all?.filter(d => (!f.gender || d.gender === f.gender) && (!f.type || d.type === f.type) &&
    (!f.size || d.size === f.size) && (!f.price || (d.rent >= PRICES[f.price][0] && d.rent <= PRICES[f.price][1])))
  const uniq = k => [...new Set((all || []).map(d => d[k]).filter(Boolean))].sort().map(v => [v, v])
  const typesIn = g => [...new Set((all || []).filter(d => d.gender === g).map(d => d.type).filter(Boolean))].sort()
  const active = Object.values(f).filter(Boolean).length
  const clear = () => set({ gender: '', type: '', size: '', price: '' })
  return (
    <>
      <TopBar title={t('nav_dresses')}>
        <button className={'chip' + (active ? ' on' : '')} onClick={() => setOpen(true)}>{t('filter')}{active ? ` · ${active}` : ''}</button>
      </TopBar>
      <main className="body">
        <Chips options={[['', t('g_all')], ...GENDERS.map(g => [g, t('g_' + g)])]} value={f.gender}
          onChange={v => set({ gender: v, type: '' })} />
        {/* inside a section, one tap between its types, e.g. Blouse / Kurti */}
        {f.gender && typesIn(f.gender).length > 1 && (
          <Chips options={[['', t('g_all')], ...typesIn(f.gender).map(v => [v, v])]} value={f.type} onChange={v => set('type', v)} />
        )}
        {!list ? <Loading err={err} /> : !list.length ? <p className="muted center">{t('none_found')}</p> : (
          <div className="grid2">{list.map(d => <DressCard key={d.id} d={d} />)}</div>
        )}
      </main>
      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-label={t('filter')}>
            <div className="grab" />
            <div className="row between"><b>{t('filter')}</b><button className="linkbtn" onClick={clear}>{t('clear_all')}</button></div>
            <div className="field"><span className="lbl">{t('for')}</span>
              <Chips wrap options={GENDERS.map(g => [g, t('g_' + g)])} value={f.gender} onChange={v => set('gender', v)} /></div>
            {uniq('type').length > 0 && <div className="field"><span className="lbl">{t('type')}</span>
              <Chips wrap options={uniq('type')} value={f.type} onChange={v => set('type', v)} /></div>}
            <div className="field"><span className="lbl">{t('rent_night')}</span>
              <Chips wrap options={[['low', t('p_low')], ['mid', t('p_mid')], ['high', t('p_high')]]} value={f.price} onChange={v => set('price', v)} /></div>
            {uniq('size').length > 0 && <div className="field"><span className="lbl">{t('size')}</span>
              <Chips wrap options={uniq('size')} value={f.size} onChange={v => set('size', v)} /></div>}
            <button className="btn" onClick={() => setOpen(false)}>{t('show_n', { n: list?.length ?? 0 })}</button>
          </div>
        </>
      )}
    </>
  )
}

// ---------- Dress detail ----------
function Calendar({ dates, value, onPick }) {
  const { lang } = useApp()
  const [month, setMonth] = useState(() => (value || today()).slice(0, 7))
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const days = new Date(y, m, 0).getDate()
  const shift = k => { const d = new Date(y, m - 1 + k, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const now = today()
  return (
    <div className="card">
      <div className="row between">
        <button className="linkbtn" onClick={() => shift(-1)} disabled={month <= now.slice(0, 7)} aria-label="Previous month">‹</button>
        <b>{first.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric' })}</b>
        <button className="linkbtn" onClick={() => shift(1)} aria-label="Next month">›</button>
      </div>
      <div className="cal">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="wd">{d}</span>)}
        {Array.from({ length: first.getDay() }, (_, i) => <span key={'b' + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, '0')}`
          const s = d < now ? 'x' : dates[d] || 'free'
          return (
            <button key={d} className={d === value ? 'sel' : s} disabled={s !== 'free'} onClick={() => onPick(d)}
              aria-label={`${d} ${s}`}>{i + 1}</button>
          )
        })}
      </div>
      <Legend />
    </div>
  )
}

const Legend = () => {
  const t = useT()
  return <div className="legend"><span><i className="free" />{t('free')}</span><span><i className="hold" />{t('hold')}</span><span><i className="booked" />{t('booked')}</span></div>
}

export function DressDetail() {
  const t = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const { lang } = useApp()
  const [q, set] = useQuery()
  const [d, err] = useApi(`/dresses/${id}`)
  const date = q('date')
  if (!d) return <><TopBar back title={t('details')} /><main className="body"><Loading err={err} /></main></>
  const ok = date && date >= today() && !d.dates[date]
  const share = () => {
    const url = location.origin + location.pathname
    navigator.share ? navigator.share({ title: d.name, url }).catch(() => {}) : window.open(waLink('', `${d.name} ${url}`))
  }
  return (
    <>
      <TopBar back title={t('details')}><button className="chip sm" onClick={share}>{t('share')}</button></TopBar>
      <main className="body flush">
        <div className="gallery">
          {(d.photos.length ? d.photos : ['']).map((p, i) => <Photo key={i} src={img(p)} alt={`${d.name} ${i + 1}`} tone={(d.id % 6) + 1} eager={i === 0} />)}
        </div>
        <div className="body">
          <div>
            <h1 className="h">{d.name}</h1>
            <span className="muted">{[t('g_' + d.gender), d.type, d.size && `${t('size')} ${d.size}`].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="row gap">
            <div><span className="lbl">{t('rent')}</span><div><span className="price lg">{rupee(d.rent)}</span><span className="muted">{t('per_night')}</span></div></div>
            <div><span className="lbl">{t('deposit')}</span><div><span className="price lg">{rupee(d.deposit)}</span> <span className="muted">{t('refundable')}</span></div></div>
          </div>
          {!!d.jewellery_available && <div className="note">{t('with_jewel')} · +{rupee(d.jewellery_price)}</div>}
          {d.description && <p className="pre">{d.description}</p>}
          <Calendar dates={d.dates} value={date} onPick={v => set('date', v)} />
        </div>
      </main>
      <div className="cta">
        <div className="sum">{date ? fmtDate(date, lang) : t('pick_date')}<b>{rupee(d.rent)}</b></div>
        <button className="btn grow" disabled={!ok} onClick={() => nav(`/book/${d.id}?date=${date}`)}>{ok ? t('book_night') : t('pick_date')}</button>
      </div>
    </>
  )
}

// ---------- Book (2 steps + done) ----------
export function Book() {
  const t = useT()
  const { id } = useParams()
  const [q] = useQuery()
  const { lang, settings } = useApp()
  const [dress, derr] = useApi(id ? `/dresses/${id}` : null)
  const [addons] = useApi('/addons')
  const me = store.get('garba_me')
  const [step, setStep] = useState(1)
  const [date, setDate] = useState(q('date'))
  const [withJ, setWithJ] = useState(false)
  const [style, setStyle] = useState('')
  const [picked, setPicked] = useState([])
  const [notes, setNotes] = useState('')
  const [name, setName] = useState(me.name || '')
  const [phone, setPhone] = useState(me.phone || '')
  const [shot, setShot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)
  const [copied, setCopied] = useState(false)
  const shotUrl = useMemo(() => shot && URL.createObjectURL(shot), [shot])

  if (id && !dress) return <><TopBar back /><main className="body"><Loading err={derr} /></main></>
  const styles = id && withJ ? (addons || []).filter(a => a.kind === 'jewellery') : []
  const priced = (addons || []).filter(a => !id || a.kind !== 'jewellery')
  const chosen = priced.filter(a => picked.includes(a.id))
  const rent = (dress?.rent || 0) + (withJ ? dress.jewellery_price : 0) + chosen.reduce((s, a) => s + a.price, 0)
  const deposit = (dress?.deposit || 0) + chosen.reduce((s, a) => s + a.deposit, 0)
  const toggle = aid => setPicked(p => p.includes(aid) ? p.filter(x => x !== aid) : [...p, aid])

  async function submit() {
    if (!shot) return setErr(t('need_shot'))
    setBusy(true); setErr('')
    try {
      const r = await api('/bookings', {
        method: 'POST', body: form({
          dress_id: id, date, name, phone, with_jewellery: withJ, addon_ids: picked.join(','),
          jewellery_pref: style, notes, screenshot: shot,
        }),
      })
      store.set('garba_me', { name, phone })
      store.set('garba_last', { code: r.code, phone })
      setDone(r)
      window.scrollTo(0, 0)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (done) {
    return (
      <>
        <TopBar />
        <main className="body center-col">
          <div className="bigok" aria-hidden>✓</div>
          <h1 className="h">{t('sent_title')}</h1>
          <p className="muted">{t('sent_body', { date: fmtDate(date, lang) })}</p>
          <div className="card col">
            <span className="lbl">{t('your_code')}</span>
            <div className="code">{done.code}</div>
            <Pill s="hold">{t('st_pending')}</Pill>
          </div>
          <dl className="kv card">
            {dress && <><dt>{t('dress')}</dt><dd>{dress.name}</dd></>}
            {chosen.length > 0 && <><dt>{t('extras_l')}</dt><dd>{chosen.map(a => a.name).join(', ')}</dd></>}
            <dt>{t('paid')}</dt><dd>{rupee(done.rent_total)}</dd>
            <dt>{t('deposit')}</dt><dd>{rupee(done.deposit_total)} · {t('dep_at_pickup')}</dd>
          </dl>
        </main>
        <div className="cta col">
          {settings.whatsapp_number && <a className="btn wa" href={waLink(settings.whatsapp_number, t('wa_booked', { code: done.code, date: fmtDate(date, lang) }))} target="_blank" rel="noreferrer">{t('chat_wa')}</a>}
          <Link className="btn ghost" to="/availability">{t('book_another')}</Link>
        </div>
      </>
    )
  }

  const bar = (
    <TopBar back onBack={step === 2 ? () => setStep(1) : undefined} title={step === 1 ? t('extras') : t('pay_send')}>
      <span className="muted xs">{t('step', { n: step })}</span>
    </TopBar>
  )

  if (step === 1) {
    return (
      <>
        {bar}
        <main className="body">
          {dress ? (
            <div className="row card">
              <Photo src={thumb(dress.photos[0])} className="thumb" tone={(dress.id % 6) + 1} />
              <div><b>{dress.name}</b><br /><span className="muted">{fmtDate(date, lang)} · {rupee(dress.rent)}</span></div>
            </div>
          ) : (
            <label className="field"><span className="lbl">{t('which_date')}</span>
              <input className="input" type="date" min={today()} value={date} onChange={e => setDate(e.target.value)} /></label>
          )}
          {!!dress?.jewellery_available && (
            <div className="seg" role="group">
              <button className={withJ ? 'on' : ''} onClick={() => setWithJ(true)}>{t('with_j')} +{rupee(dress.jewellery_price)}</button>
              <button className={!withJ ? 'on' : ''} onClick={() => { setWithJ(false); setStyle('') }}>{t('without')}</button>
            </div>
          )}
          {styles.length > 0 && (
            <div className="field"><span className="lbl">{t('pick_style')}</span>
              <div className="jset">
                {styles.map(a => (
                  <button key={a.id} className={style === a.name ? 'sel' : ''} onClick={() => setStyle(style === a.name ? '' : a.name)}>
                    <Photo src={thumb(a.photo)} alt="" tone={(a.id % 6) + 1} />{a.name}
                  </button>
                ))}
              </div>
              <span className="muted xs">{t('style_note')}</span>
            </div>
          )}
          {priced.length > 0 && (
            <div className="card list">
              {priced.map(a => (
                <label key={a.id} className="check">
                  <input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} />
                  <span className="grow">{a.name}{a.deposit > 0 && <span className="muted xs"> · {t('deposit')} {rupee(a.deposit)}</span>}</span>
                  <span className="price">+{rupee(a.price)}</span>
                </label>
              ))}
            </div>
          )}
          <label className="field"><span className="lbl">{t('anything_else')}</span>
            <textarea className="input" rows="2" placeholder={t('anything_ph')} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        </main>
        <div className="cta">
          <div className="sum">{t('pay_now')} · {rupee(deposit)} {t('dep_at_pickup')}<b>{rupee(rent)}</b></div>
          <button className="btn" disabled={!date || (!id && !picked.length)} onClick={() => { setStep(2); window.scrollTo(0, 0) }}>{t('next')}</button>
        </div>
      </>
    )
  }

  const upi = settings.upi_id
  return (
    <>
      {bar}
      <main className="body">
        <div className="card col center">
          <span className="lbl">{t('scan')}</span>
          {settings.upi_qr && <img className="qr" src={img(settings.upi_qr)} alt="UPI QR code" />}
          {upi && (
            <div className="row center">
              <b>{upi}</b>
              <button className="chip sm" onClick={() => navigator.clipboard?.writeText(upi).then(() => setCopied(true))}>{copied ? t('copied') : t('copy')}</button>
            </div>
          )}
          <span>{t('pay_rent')} <b className="price">{rupee(rent)}</b> {t('now')}</span>
          {upi && <a className="btn sm ghost" href={`upi://pay?pa=${encodeURIComponent(upi)}&pn=Sapna%20Garba&am=${rent}&cu=INR`}>{t('open_upi')}</a>}
          {deposit > 0 && <span className="muted xs">{t('dep_note', { amt: rupee(deposit) })}</span>}
        </div>
        <label className="drop">
          <input type="file" accept="image/*,.heic,.heif" className="sr" onChange={e => { setShot(e.target.files[0] || null); setErr('') }} />
          {shot ? <><img src={shotUrl} alt="" className="shot" /><span>{t('change')}</span></>
            : <>{t('upload')}<small>{t('upload_sub')}</small></>}
        </label>
        <label className="field"><span className="lbl">{t('your_name')}</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
        <label className="field"><span className="lbl">{t('wa_number')}</span>
          <input className="input" type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="98250 12345" /></label>
        {err && <p className="err" role="alert">{err}</p>}
      </main>
      <div className="cta">
        <button className="btn grow" disabled={busy || !name.trim() || phone.replace(/\D/g, '').length < 10} onClick={submit}>{busy ? t('sending') : t('send')}</button>
      </div>
    </>
  )
}

// ---------- Extras ----------
export function Extras() {
  const t = useT()
  const [list, err] = useApi('/addons')
  return (
    <>
      <TopBar back title={t('extras')} />
      <main className="body">
        {!list ? <Loading err={err} /> : !list.length ? <p className="muted center">{t('none_extras')}</p> : (
          <div className="grid2">
            {list.map(a => (
              <div key={a.id} className="dcard">
                <Photo src={thumb(a.photo)} alt={a.name} tone={(a.id % 6) + 1} />
                <div className="in">
                  <span className="nm">{a.name}</span>
                  <span className="price">{rupee(a.price)}</span>
                  {a.description && <span className="muted xs">{a.description}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <div className="cta">
        <div className="sum">{t('extras_only_sub')}</div>
        <Link className="btn" to="/book">{t('extras_only')}</Link>
      </div>
    </>
  )
}

// ---------- Status ----------
export function Status() {
  const t = useT()
  const { lang, settings } = useApp()
  const last = store.get('garba_last')
  const [code, setCode] = useState(last.code || '')
  const [phone, setPhone] = useState(last.phone || '')
  const [b, setB] = useState(null)
  const [err, setErr] = useState('')
  const check = async e => {
    e?.preventDefault()
    setErr('')
    try { setB(await api(`/bookings/status?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`)) }
    catch (x) { setB(null); setErr(x.message) }
  }
  useEffect(() => { if (last.code) check() }, [])
  const tone = { pending: 'hold', confirmed: 'free', out: 'free', returned: 'free', rejected: 'booked', cancelled: 'booked' }
  return (
    <>
      <TopBar title={t('nav_booking')} />
      <main className="body">
        <form className="col" onSubmit={check}>
          <label className="field"><span className="lbl">{t('code')}</span>
            <input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="SG-XXXXX" autoCapitalize="characters" /></label>
          <label className="field"><span className="lbl">{t('phone')}</span>
            <input className="input" type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value)} /></label>
          <button className="btn">{t('check_status')}</button>
        </form>
        {err && <p className="err" role="alert">{err}</p>}
        {b && (
          <div className="card col">
            <div className="row between"><b>{b.code}</b><Pill s={tone[b.status]}>{t('st_' + b.status)}</Pill></div>
            <div className="row">
              {b.dress_name && <Photo src={thumb(b.dress_photo)} className="thumb" />}
              <div>
                <b>{b.dress_name || b.addons}</b><br />
                <span className="muted">{fmtDate(b.date, lang)}{b.with_jewellery ? ` · ${t('with_jewellery_s')}` : ''}</span>
                {b.dress_name && b.addons && <><br /><span className="muted xs">{b.addons}</span></>}
              </div>
            </div>
            <dl className="kv">
              <dt>{t('rent')}</dt><dd>{rupee(b.rent_total)}</dd>
              <dt>{t('deposit')}</dt><dd>{rupee(b.deposit_total)}</dd>
            </dl>
            {b.admin_note && <p className="note">{b.admin_note}</p>}
            {['confirmed', 'out'].includes(b.status) && settings.pickup_rules && <p className="note pre">{settings.pickup_rules}</p>}
          </div>
        )}
        <Link to="/rules" className="link">{t('rules')} ›</Link>
      </main>
    </>
  )
}

export function Rules() {
  const t = useT()
  const { settings } = useApp()
  return (
    <>
      <TopBar back title={t('rules')} />
      <main className="body">
        {settings.pickup_rules && <p className="card pre">{settings.pickup_rules}</p>}
        {settings.shop_address && <div className="card"><span className="lbl">{t('address')}</span><p className="pre">{settings.shop_address}</p></div>}
      </main>
    </>
  )
}
