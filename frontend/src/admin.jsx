import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { addDays, api, fmtDate, form, getToken, img, payImg, rupee, setToken, thumb, today, waLink } from './api'
import { Chips, DateStrip, GENDERS, Loading, Photo, Pill, useApi, useApp } from './ui'

const cap = s => s[0].toUpperCase() + s.slice(1)
const GENDER_CHIPS = [['', 'All'], ...GENDERS.map(g => [g, cap(g)])]
const STATUS_TONE = { pending: 'hold', confirmed: 'free', out: 'free', returned: 'free', rejected: 'booked', cancelled: 'booked' }
const STATUS_LABEL = { pending: 'Payment to check', confirmed: 'Confirmed', out: 'Handed over', returned: 'Returned', rejected: 'Rejected', cancelled: 'Cancelled' }
const patchBooking = (id, body) => api(`/admin/bookings/${id}`, { method: 'PATCH', body, admin: true })

export function AdminLayout() {
  if (!getToken()) return <Navigate to="/admin/login" replace />
  const tabs = [['bookings', 'Payments'], ['day', 'Day sheet'], ['grid', 'Availability'], ['revenue', 'Revenue'],
    ['dresses', 'Dresses'], ['extras', 'Extras'], ['settings', 'Settings']]
  return (
    <div className="admin">
      <header className="bar">
        <Link to="/admin/bookings" className="logo">Sapna<small>Admin</small></Link>
        <span className="grow" />
        <Link to="/home" className="linkbtn">View shop</Link>
        <button className="linkbtn" onClick={() => { setToken(''); location.href = '/garba/admin/login' }}>Log out</button>
      </header>
      <nav className="tabs">{tabs.map(([to, l]) => <NavLink key={to} to={`/admin/${to}`}>{l}</NavLink>)}</nav>
      <Outlet />
    </div>
  )
}

export function Login() {
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const submit = async e => {
    e.preventDefault()
    try {
      setToken((await api('/admin/login', { method: 'POST', body: { password: pw } })).token)
      nav('/admin/bookings')
    } catch (x) { setErr(x.message) }
  }
  return (
    <main className="body narrow">
      <h1 className="h">Sapna admin</h1>
      <form className="col" onSubmit={submit}>
        <label className="field"><span className="lbl">Password</span>
          <input className="input" type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus /></label>
        {err && <p className="err">{err}</p>}
        <button className="btn">Log in</button>
      </form>
    </main>
  )
}

// ---------- booking card (payments + day sheet) ----------
function waText(b, settings) {
  const what = [b.dress_name, b.addons].filter(Boolean).join(' + ')
  const when = fmtDate(b.date)
  if (b.status === 'rejected' || b.status === 'cancelled')
    return `Hi ${b.name}, sorry, we could not confirm your booking ${b.code} (${what}, ${when}).${b.admin_note ? ' ' + b.admin_note : ''}`
  if (b.status === 'pending') return `Hi ${b.name}, about your booking ${b.code} (${what}, ${when}):`
  return `Hi ${b.name}, your booking ${b.code} is confirmed ✅\n${what}\n${when}\nPlease bring ${rupee(b.deposit_total)} cash deposit at pickup.` +
    (settings.pickup_rules ? `\n\n${settings.pickup_rules}` : '')
}

function Tick({ on, label, onChange, extra }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!on} onChange={e => onChange(e.target.checked)} />
      <span className="grow">{label}</span>{extra}
    </label>
  )
}

function BookingCard({ b, reload }) {
  const { settings } = useApp()
  const [note, setNote] = useState(b.admin_note)
  const [ded, setDed] = useState(b.deduction)
  const [err, setErr] = useState('')
  const patch = body => { setErr(''); patchBooking(b.id, body).then(reload).catch(e => setErr(e.message)) }
  const live = ['confirmed', 'out', 'returned'].includes(b.status)
  return (
    <article className="card col">
      <div className="row between">
        <div><b>{b.name}</b> {b.phone && <a className="muted xs" href={`tel:${b.phone}`}>{b.phone}</a>}</div>
        <Pill s={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Pill>
      </div>
      <div className="row top">
        <div className="pics">
          {b.dress_photo
            ? <a href={img(b.dress_photo)} target="_blank" rel="noreferrer" title="Open dress photo"><Photo src={thumb(b.dress_photo)} className="shotthumb" alt={b.dress_name} /></a>
            : <Photo className="shotthumb" />}
          {b.screenshot && (
            <a href={payImg(b.screenshot)} target="_blank" rel="noreferrer" className="paylink" title="Open payment screenshot">
              <img className="payshot" src={payImg(b.screenshot)} alt="Payment screenshot" />Payment
            </a>
          )}
        </div>
        <dl className="kv grow">
          <dt>Night</dt><dd>{fmtDate(b.date)}</dd>
          {b.dress_name && <><dt>Dress</dt><dd>{b.dress_code} {b.dress_name}</dd></>}
          {b.with_jewellery ? <><dt>Jewellery</dt><dd>{b.jewellery_pref || 'Yes'}</dd></> : null}
          {b.addons && <><dt>Extras</dt><dd>{b.addons}</dd></>}
          <dt>Rent</dt><dd>{rupee(b.rent_total)} · {b.rent_paid_mode.toUpperCase()}</dd>
          <dt>Deposit</dt><dd>{rupee(b.deposit_total)} cash</dd>
          <dt>Source</dt><dd>{b.source === 'online' ? 'Online' : 'Shop'} · {b.code}</dd>
        </dl>
      </div>
      {b.notes && <p className="note">“{b.notes}”</p>}
      {b.status === 'pending' && (
        <>
          {b.screenshot && <span className="muted xs">Tap "Payment" to zoom. Match the amount and UTR in your bank app.</span>}
          <input className="input" placeholder="Note to customer (e.g. reason for rejecting)" value={note}
            onChange={e => setNote(e.target.value)} />
          <div className="row">
            <button className="btn sm ghost grow" onClick={() => patch({ status: 'rejected', admin_note: note })}>Reject</button>
            <button className="btn sm grow2" onClick={() => patch({ status: 'confirmed', admin_note: note })}>Approve</button>
          </div>
        </>
      )}
      {live && (
        <div className="list">
          <Tick on={b.deposit_collected_at} label={`Deposit ${rupee(b.deposit_total)} collected`} onChange={v => patch({ deposit_collected: v })} />
          <Tick on={b.handed_over_at} label="Handed over" onChange={v => patch({ handed_over: v })} />
          <Tick on={b.returned_at} label="Returned" onChange={v => patch({ returned: v })} />
          <Tick on={b.deposit_refunded} label={`Deposit refunded ${rupee(b.deposit_total - ded)}`}
            onChange={v => patch({ deposit_refunded: v, deduction: Number(ded) || 0 })}
            extra={<input className="input tiny" type="number" min="0" max={b.deposit_total} value={ded} aria-label="Deduction"
              title="Deduction for damage / late" onChange={e => setDed(e.target.value)} onBlur={() => Number(ded) !== b.deduction && patch({ deduction: Number(ded) || 0 })} />} />
        </div>
      )}
      {live && <button className="linkbtn xs" onClick={() => patch({ status: 'cancelled' })}>Cancel booking</button>}
      {err && <p className="err">{err}</p>}
      {b.phone && <a className="btn sm wa" href={waLink(b.phone, waText(b, settings))} target="_blank" rel="noreferrer">Send WhatsApp to {b.name.split(' ')[0]}</a>}
    </article>
  )
}

// ---------- payments ----------
export function Payments() {
  const [tab, setTab] = useState('pending')
  const [list, err, reload] = useApi(`/admin/bookings?status=${tab}`)
  const tabs = [['pending', 'To check'], ['confirmed', 'Confirmed'], ['out', 'Out'], ['returned', 'Returned'], ['rejected,cancelled', 'Rejected']]
  return (
    <main className="body">
      <Chips options={tabs} value={tab} onChange={setTab} />
      {!list ? <Loading err={err} /> : !list.length ? <p className="muted center">Nothing here.</p> :
        <div className="cards">{list.map(b => <BookingCard key={b.id + b.status} b={b} reload={reload} />)}</div>}
    </main>
  )
}

// ---------- day sheet ----------
export function Day() {
  const [date, setDate] = useState(useLocation().state?.date || today())
  const [tab, setTab] = useState('customers')
  const [pick, setPick] = useState(null)
  const [list, err, reload] = useApi(`/admin/bookings?date=${date}&status=pending,confirmed,out,returned`)
  const [returns, , reloadR] = useApi(`/admin/bookings?date=${addDays(date, -1)}&status=out,returned`)
  const [avail, , reloadF] = useApi(`/admin/availability?from=${date}&to=${date}`)
  const free = avail?.dresses.filter(d => !avail.grid[d.id]?.[date])
  const reloadAll = () => { reload(); reloadR(); reloadF() }
  const shown = tab === 'customers' ? list : returns
  return (
    <main className="body">
      <div className="row between">
        <h1 className="h sm">{fmtDate(date, 'en', { weekday: 'long', day: 'numeric', month: 'short' })}</h1>
        <input className="input tiny wide" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Pick date" />
      </div>
      <DateStrip value={date} onChange={setDate} from={addDays(today(), -3)} days={30} />
      <Chips options={[['customers', `Customers · ${list?.length ?? '…'}`], ['returns', `Returns · ${returns?.length ?? '…'}`], ['free', `Still free · ${free?.length ?? '…'}`]]}
        value={tab} onChange={setTab} />
      {tab === 'returns' && <p className="muted xs">Dresses out from the night before ({fmtDate(addDays(date, -1))}).</p>}
      {tab === 'free' ? (
        !avail ? <Loading /> : <DayPhotos data={avail} date={date} onlyFree onBook={setPick} />
      ) : !shown ? <Loading err={err} /> : !shown.length ? <p className="muted center">No one on this day.</p> :
        <div className="cards">{shown.map(b => <BookingCard key={b.id + b.status} b={b} reload={reloadAll} />)}</div>}
      {pick && <ShopBooking {...pick} onClose={() => setPick(null)} onSaved={() => { setPick(null); reloadAll() }} />}
    </main>
  )
}

// ---------- offline (shop) booking sheet ----------
function ShopBooking({ dress, date, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', phone: '', with_jewellery: false, rent_paid_mode: 'cash', notes: '' })
  // null = list price; a typed number = the price agreed with the customer
  const [rent, setRent] = useState(null)
  const [dep, setDep] = useState(null)
  const [err, setErr] = useState('')
  const listRent = dress.rent + (f.with_jewellery ? dress.jewellery_price : 0)
  const changed = (rent !== null && Number(rent) !== listRent) || (dep !== null && Number(dep) !== dress.deposit)
  const num = v => (v === null || v === '' ? undefined : Number(v))
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async e => {
    e.preventDefault()
    try {
      await api('/admin/bookings', { method: 'POST', admin: true, body: form({ ...f, dress_id: dress.id, date, rent: num(rent), deposit: num(dep) }) })
      onSaved()
    } catch (x) { setErr(x.message) }
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="sheet" onSubmit={save}>
        <div className="grab" />
        <div className="row">
          <Photo src={thumb(dress.photo)} className="mini" tone={(dress.id % 6) + 1} />
          <b className="grow">{dress.code} {dress.name} · {fmtDate(date)} is free</b>
        </div>
        <input className="input" placeholder="Customer name" value={f.name} onChange={set('name')} required autoFocus />
        <input className="input" type="tel" inputMode="numeric" placeholder="Phone (optional)" value={f.phone} onChange={set('phone')} />
        {!!dress.jewellery_available && <label className="check"><input type="checkbox" checked={f.with_jewellery} onChange={set('with_jewellery')} /><span className="grow">With jewellery</span><span className="price">+{rupee(dress.jewellery_price)}</span></label>}
        <div className="row">
          <label className="field grow"><span className="lbl">Rent ₹</span>
            <input className="input" type="number" min="0" inputMode="numeric" value={rent ?? listRent} onChange={e => setRent(e.target.value)} /></label>
          <label className="field grow"><span className="lbl">Deposit ₹</span>
            <input className="input" type="number" min="0" inputMode="numeric" value={dep ?? dress.deposit} onChange={e => setDep(e.target.value)} /></label>
        </div>
        {changed && <span className="muted xs">Special price. List price is {rupee(listRent)} rent · {rupee(dress.deposit)} deposit.</span>}
        <div className="seg">
          {['cash', 'upi'].map(m => <button type="button" key={m} className={f.rent_paid_mode === m ? 'on' : ''} onClick={() => setF({ ...f, rent_paid_mode: m })}>Rent paid by {m.toUpperCase()}</button>)}
        </div>
        <input className="input" placeholder="Notes (optional)" value={f.notes} onChange={set('notes')} />
        {err && <p className="err">{err}</p>}
        <button className="btn">Mark booked (shop customer)</button>
      </form>
    </>
  )
}

// ---------- availability grid ----------
const CELL_LABEL = { hold: 'Payment to check', online: 'Booked online', shop: 'Booked in shop' }
const VIEWS = [['day', 'One day · photos'], ['week', '2 weeks · grid']]

/** Photo cards for one date: what is free (Book) and what is taken (by whom). */
function DayPhotos({ data, date, onlyFree, onBook }) {
  const nav = useNavigate()
  const cell = d => data.grid[d.id]?.[date]
  const free = data.dresses.filter(d => !cell(d)).length
  const list = data.dresses.filter(d => !onlyFree || !cell(d)).sort((a, b) => !!cell(a) - !!cell(b))
  return (
    <>
      <p className="xs"><b className="ok">{free} free</b> <span className="muted">· {data.dresses.length - free} booked</span></p>
      {!list.length ? <p className="muted center">{onlyFree ? 'Nothing free on this day.' : 'No dresses in this category yet.'}</p> : (
        <div className="grid2">
          {list.map(d => {
            const c = cell(d)
            return (
              <div key={d.id} className={'dcard' + (c ? ' taken' : '')}>
                {d.photo
                  ? <a href={img(d.photo)} target="_blank" rel="noreferrer" title="Open full photo"><Photo src={thumb(d.photo)} alt={d.name} /></a>
                  : <Photo tone={(d.id % 6) + 1} alt={d.name} />}
                <div className="in">
                  <span className="nm"><b>{d.code}</b> {d.name}</span>
                  <span className="muted xs">{[cap(d.gender), d.size, rupee(d.rent)].filter(Boolean).join(' · ')}</span>
                  {c
                    ? <button className="who" onClick={() => nav('/admin/day', { state: { date } })} title="Open day sheet">
                        <Pill s={c.state === 'hold' ? 'hold' : 'booked'}>{CELL_LABEL[c.state]}</Pill><span>{c.name}</span>
                      </button>
                    : <button className="btn sm" onClick={() => onBook({ dress: d, date })}>Book</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export function Grid() {
  const nav = useNavigate()
  const [view, setView] = useState('day')
  const [date, setDate] = useState(today())
  const [from, setFrom] = useState(today())
  const [gender, setGender] = useState('')
  const [pick, setPick] = useState(null)
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i))
  const [dayData, dayErr, reloadDay] = useApi(view === 'day' ? `/admin/availability?from=${date}&to=${date}&gender=${gender}` : null)
  const [data, err, reload] = useApi(view === 'week' ? `/admin/availability?from=${from}&to=${days[13]}&gender=${gender}` : null)
  const LETTER = { hold: 'P', online: 'O', shop: 'S' }
  const saved = () => { setPick(null); view === 'day' ? reloadDay() : reload() }
  const bookSheet = pick && <ShopBooking {...pick} onClose={() => setPick(null)} onSaved={saved} />
  if (view === 'day') {
    return (
      <main className="body">
        <Chips options={VIEWS} value={view} onChange={setView} />
        <div className="row between">
          <h1 className="h sm">{fmtDate(date, 'en', { weekday: 'long', day: 'numeric', month: 'short' })}</h1>
          <input className="input tiny wide" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Pick date" />
        </div>
        <DateStrip value={date} onChange={setDate} from={addDays(today(), -3)} days={30} />
        <Chips options={GENDER_CHIPS} value={gender} onChange={setGender} />
        {!dayData ? <Loading err={dayErr} /> : <DayPhotos data={dayData} date={date} onBook={setPick} />}
        {bookSheet}
      </main>
    )
  }
  return (
    <main className="body">
      <Chips options={VIEWS} value={view} onChange={setView} />
      <div className="row between">
        <button className="chip" onClick={() => setFrom(addDays(from, -7))}>‹ Week</button>
        <input className="input tiny wide" type="date" value={from} onChange={e => e.target.value && setFrom(e.target.value)} aria-label="Start date" />
        <button className="chip" onClick={() => setFrom(addDays(from, 7))}>Week ›</button>
      </div>
      <Chips options={GENDER_CHIPS} value={gender} onChange={setGender} />
      {!data ? <Loading err={err} /> : (
        <div className="scrollx">
          <table className="mtx">
            <thead><tr><th />{days.map(d => <th key={d}>{fmtDate(d, 'en', { weekday: 'narrow' })}<br />{Number(d.slice(8))}</th>)}</tr></thead>
            <tbody>
              {data.dresses.map(dr => (
                <tr key={dr.id}>
                  <td className="n"><span className="nrow"><Photo src={thumb(dr.photo)} className="micro" tone={(dr.id % 6) + 1} alt="" /><span><b>{dr.code}</b><br />{dr.name.slice(0, 12)}</span></span></td>
                  {days.map(d => {
                    const c = data.grid[dr.id]?.[d]
                    return c
                      ? <td key={d} className={c.state}><button onClick={() => nav('/admin/day', { state: { date: d } })} title={`${c.state} – open day sheet`}>{LETTER[c.state]}</button></td>
                      : <td key={d}><button onClick={() => setPick({ dress: dr, date: d })} aria-label={`Book ${dr.code} on ${d}`} /></td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="legend">
        <span><i className="free" />Free (tap to book)</span><span><i className="hold solid" />P Payment to check</span>
        <span><i className="online" />O Online</span><span><i className="shop" />S Shop</span>
      </div>
      {bookSheet}
    </main>
  )
}

// ---------- revenue ----------
export function Revenue() {
  const { settings } = useApp()
  const start = settings.navratri_start || today().slice(0, 8) + '01'
  const [range, setRange] = useState(null)
  const [from, to] = range || [start, addDays(start, 10)]
  const [data, err] = useApi(`/admin/revenue?from=${from}&to=${to}`)
  const csv = async () => {
    const r = await fetch(`/api/admin/revenue?from=${from}&to=${to}&format=csv`, { headers: { Authorization: 'Bearer ' + getToken() } })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await r.blob())
    a.download = `sapna-revenue_${from}_${to}.csv`
    a.click()
  }
  const T = data?.totals
  return (
    <main className="body">
      <div className="row">
        <input className="input tiny wide" type="date" value={from} onChange={e => setRange([e.target.value, to])} aria-label="From" />
        <span>to</span>
        <input className="input tiny wide" type="date" value={to} onChange={e => setRange([from, e.target.value])} aria-label="To" />
      </div>
      {!data ? <Loading err={err} /> : (
        <>
          <div className="grid2">
            <div className="card"><span className="lbl">Rent earned</span><div className="price lg">{rupee(T.rent)}</div><span className="muted xs">UPI {rupee(T.rent_upi)} · Cash {rupee(T.rent_cash)}</span></div>
            <div className="card"><span className="lbl">Deposits held</span><div className="price lg warn">{rupee(T.deposit_held)}</div><span className="muted xs">still to return</span></div>
            <div className="card"><span className="lbl">Bookings</span><div className="price lg">{T.bookings}</div></div>
            <div className="card"><span className="lbl">Deductions kept</span><div className="price lg">{rupee(T.deductions)}</div><span className="muted xs">damage / late</span></div>
          </div>
          <div className="card scrollx">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Rent UPI</th><th>Rent cash</th><th>Dep. in</th><th>Dep. out</th><th>Kept</th></tr></thead>
              <tbody>
                {data.days.map(d => (
                  <tr key={d.date}><td>{fmtDate(d.date)}</td><td>{rupee(d.rent_upi)}</td><td>{rupee(d.rent_cash)}</td>
                    <td>{rupee(d.deposit_in)}</td><td>{rupee(d.deposit_out)}</td><td>{rupee(d.deductions)}</td></tr>
                ))}
                {!data.days.length && <tr><td colSpan="6" className="muted">No bookings in this range.</td></tr>}
              </tbody>
            </table>
          </div>
          <button className="btn ghost sm" onClick={csv}>Download CSV</button>
        </>
      )}
    </main>
  )
}

// ---------- dresses ----------
export function DressesAdmin() {
  const [list, err] = useApi('/admin/dresses')
  return (
    <main className="body">
      <Link className="btn" to="/admin/dresses/new">+ Add dress</Link>
      {!list ? <Loading err={err} /> : (
        <div className="card list">
          {list.map(d => (
            <Link key={d.id} to={`/admin/dresses/${d.id}`} className={'check' + (d.active ? '' : ' dim')}>
              <Photo src={thumb(d.photos[0]?.path)} className="mini" tone={(d.id % 6) + 1} />
              <span className="grow"><b>{d.code}</b> {d.name}<br /><span className="muted xs">{cap(d.gender)} · {d.type} · {d.size}{d.active ? '' : ' · hidden'}</span></span>
              <span className="price">{rupee(d.rent)}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}

const BLANK_DRESS = { code: '', name: '', gender: 'women', type: '', size: '', description: '', rent: '', deposit: '', jewellery_available: false, jewellery_price: 0, active: true }

export function DressForm() {
  const { id } = useParams()
  const isNew = id === 'new'
  const [list, err, reload] = useApi(isNew ? null : '/admin/dresses')
  const existing = list?.find(d => String(d.id) === id)
  if (!isNew && !existing) return <main className="body"><Loading err={err} /></main>
  return <DressEditor key={id} dress={existing} reload={reload} />
}

function DressEditor({ dress, reload }) {
  const nav = useNavigate()
  const [f, setF] = useState(() => dress ? { ...dress, jewellery_available: !!dress.jewellery_available, active: !!dress.active } : BLANK_DRESS)
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const fields = ({ photos, id, ...rest }) => rest
  const save = async e => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      if (!dress) await api('/admin/dresses', { method: 'POST', admin: true, body: form({ ...fields(f), photos: files }) })
      else {
        await api(`/admin/dresses/${dress.id}`, { method: 'PUT', admin: true, body: form(fields(f)) })
        if (files.length) await api(`/admin/dresses/${dress.id}/photos`, { method: 'POST', admin: true, body: form({ photos: files }) })
      }
      nav('/admin/dresses')
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  const delPhoto = pid => api(`/admin/photos/${pid}`, { method: 'DELETE', admin: true }).then(reload)
  return (
    <main className="body">
      <form className="col" onSubmit={save}>
        <h1 className="h sm">{dress ? 'Edit dress' : 'Add dress'}</h1>
        <div className="photos">
          {dress?.photos.map(p => (
            <div key={p.id} className="pwrap"><img src={thumb(p.path)} alt="" /><button type="button" onClick={() => delPhoto(p.id)} aria-label="Remove photo">✕</button></div>
          ))}
          {files.map((file, i) => <div key={i} className="pwrap"><img src={URL.createObjectURL(file)} alt="" /></div>)}
          <label className="drop sm"><input type="file" accept="image/*,.heic,.heif" multiple className="sr" onChange={e => setFiles([...files, ...e.target.files])} />+ Add photos</label>
        </div>
        <div className="row">
          <label className="field w30"><span className="lbl">Code</span><input className="input" value={f.code} onChange={set('code')} placeholder="D14" /></label>
          <label className="field grow"><span className="lbl">Name</span><input className="input" value={f.name} onChange={set('name')} required /></label>
        </div>
        <div className="row">
          <label className="field grow"><span className="lbl">For</span>
            <select className="input" value={f.gender} onChange={set('gender')}>{GENDERS.map(g => <option key={g} value={g}>{cap(g)}</option>)}</select></label>
          <label className="field grow"><span className="lbl">Size</span><input className="input" value={f.size} onChange={set('size')} placeholder="M" list="sizes" /></label>
        </div>
        <datalist id="sizes">{['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free size', '2-4 yrs', '4-6 yrs', '6-8 yrs', '8-10 yrs'].map(s => <option key={s} value={s} />)}</datalist>
        <label className="field"><span className="lbl">Type</span><input className="input" value={f.type} onChange={set('type')} list="types" placeholder="Chaniya choli" /></label>
        <datalist id="types">{['Chaniya choli', 'Kediyu', 'Kurta pyjama', 'Dhoti kurta', 'Kids set'].map(s => <option key={s} value={s} />)}</datalist>
        <div className="row">
          <label className="field grow"><span className="lbl">Rent / night ₹</span><input className="input" type="number" min="0" value={f.rent} onChange={set('rent')} required /></label>
          <label className="field grow"><span className="lbl">Deposit ₹</span><input className="input" type="number" min="0" value={f.deposit} onChange={set('deposit')} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={f.jewellery_available} onChange={set('jewellery_available')} /><span className="grow">Jewellery available</span>
          {f.jewellery_available && <input className="input tiny" type="number" min="0" value={f.jewellery_price} onChange={set('jewellery_price')} aria-label="Jewellery price" />}</label>
        <label className="field"><span className="lbl">Description</span><textarea className="input" rows="3" value={f.description} onChange={set('description')} /></label>
        <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /><span className="grow">Show on website</span></label>
        {err && <p className="err">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save dress'}</button>
      </form>
    </main>
  )
}

// ---------- extras ----------
const KINDS = ['jewellery', 'pagdi', 'umbrella', 'dupatta', 'other']
const BLANK_ADDON = { name: '', kind: 'jewellery', description: '', price: 0, deposit: 0, active: true }

export function ExtrasAdmin() {
  const [list, err, reload] = useApi('/admin/addons')
  const [f, setF] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [msg, setMsg] = useState('')
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async e => {
    e.preventDefault()
    const { id, photo: _, ...body } = f
    try {
      await api(id ? `/admin/addons/${id}` : '/admin/addons', { method: id ? 'PUT' : 'POST', admin: true, body: form({ ...body, photo }) })
      setF(null); setPhoto(null); setMsg(''); reload()
    } catch (x) { setMsg(x.message) }
  }
  return (
    <main className="body">
      <p className="muted xs">Jewellery items appear as style choices when a customer books a dress with jewellery. All extras can also be booked on their own.</p>
      {f ? (
        <form className="card col" onSubmit={save}>
          <b>{f.id ? 'Edit extra' : 'New extra'}</b>
          <input className="input" placeholder="Name, e.g. Oxidised silver set" value={f.name} onChange={set('name')} required />
          <select className="input" value={f.kind} onChange={set('kind')}>{KINDS.map(k => <option key={k} value={k}>{cap(k)}</option>)}</select>
          <div className="row">
            <label className="field grow"><span className="lbl">Price ₹</span><input className="input" type="number" min="0" value={f.price} onChange={set('price')} /></label>
            <label className="field grow"><span className="lbl">Deposit ₹</span><input className="input" type="number" min="0" value={f.deposit} onChange={set('deposit')} /></label>
          </div>
          <input className="input" placeholder="Short description (optional)" value={f.description} onChange={set('description')} />
          <label className="drop sm"><input type="file" accept="image/*,.heic,.heif" className="sr" onChange={e => setPhoto(e.target.files[0])} />{photo ? photo.name : f.photo ? 'Change photo' : '+ Add photo'}</label>
          <label className="check"><input type="checkbox" checked={!!f.active} onChange={set('active')} /><span className="grow">Show on website</span></label>
          {msg && <p className="err">{msg}</p>}
          <div className="row"><button type="button" className="btn ghost grow" onClick={() => setF(null)}>Cancel</button><button className="btn grow2">Save</button></div>
        </form>
      ) : <button className="btn" onClick={() => setF(BLANK_ADDON)}>+ Add extra</button>}
      {!list ? <Loading err={err} /> : (
        <div className="card list">
          {list.map(a => (
            <button key={a.id} className={'check' + (a.active ? '' : ' dim')} onClick={() => { setF({ ...a, active: !!a.active }); setPhoto(null) }}>
              <Photo src={thumb(a.photo)} className="mini" tone={(a.id % 6) + 1} />
              <span className="grow"><b>{a.name}</b><br /><span className="muted xs">{cap(a.kind)}{a.deposit ? ` · deposit ${rupee(a.deposit)}` : ''}</span></span>
              <span className="price">{rupee(a.price)}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

// ---------- settings ----------
export function SettingsAdmin() {
  const { settings, reloadSettings } = useApp()
  const [f, setF] = useState(null)
  const [qr, setQr] = useState(null)
  const [msg, setMsg] = useState('')
  const v = f || settings
  const set = k => e => setF({ ...v, [k]: e.target.value })
  const save = async e => {
    e.preventDefault()
    const { upi_qr, ...rest } = v
    try {
      await api('/admin/settings', { method: 'PUT', admin: true, body: form({ ...rest, upi_qr: qr || undefined }) })
      await reloadSettings(); setF(null); setQr(null); setMsg('Saved')
    } catch (x) { setMsg(x.message) }
  }
  const field = (k, label, props = {}) => (
    <label className="field"><span className="lbl">{label}</span>
      {props.rows ? <textarea className="input" value={v[k] || ''} onChange={set(k)} {...props} />
        : <input className="input" value={v[k] || ''} onChange={set(k)} {...props} />}</label>
  )
  return (
    <main className="body">
      <form className="col" onSubmit={save}>
        {field('upi_id', 'UPI ID', { placeholder: 'sapnagarba@okicici' })}
        <div className="row">
          {settings.upi_qr && <img className="qr sm" src={img(settings.upi_qr)} alt="Current QR" />}
          <label className="drop sm grow"><input type="file" accept="image/*,.heic,.heif" className="sr" onChange={e => setQr(e.target.files[0])} />{qr ? qr.name : 'Upload UPI QR image'}</label>
        </div>
        {field('whatsapp_number', 'WhatsApp number (customers message this)', { type: 'tel', placeholder: '98250 12345' })}
        {field('navratri_start', 'Navratri first night (labels Night 1–9)', { type: 'date' })}
        {field('shop_address', 'Shop address', { rows: 2 })}
        {field('pickup_rules', 'Pickup & return rules (shown to customers)', { rows: 5, placeholder: 'Pickup 11am–5pm on the day. Return by 1pm next day. Late return ₹200/day. Bring photo ID.' })}
        {msg && <p className={msg === 'Saved' ? 'ok' : 'err'}>{msg}</p>}
        <button className="btn">Save settings</button>
      </form>
    </main>
  )
}
