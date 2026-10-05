import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { addDays, api, fmtDate, form, getToken, img, payImg, rupee, setToken, thumb, today, waLink } from './api'
import { Chips, DateStrip, GENDERS, Loading, Photo, Pill, useApi, useApp } from './ui'

const cap = s => (s === 'blouse' ? 'Blouse & Kurti' : s[0].toUpperCase() + s.slice(1))
const GENDER_CHIPS = [['', 'All'], ...GENDERS.map(g => [g, cap(g)])]
const STATUS_TONE = { pending: 'hold', confirmed: 'free', out: 'free', returned: 'free', rejected: 'booked', cancelled: 'booked' }
const STATUS_LABEL = { pending: 'Payment to check', confirmed: 'Confirmed', out: 'Handed over', returned: 'Returned', rejected: 'Rejected', cancelled: 'Cancelled' }
const patchBooking = (id, body) => api(`/admin/bookings/${id}`, { method: 'PATCH', body, admin: true })

export function AdminLayout() {
  if (!getToken()) return <Navigate to="/admin/login" replace />
  const tabs = [['bookings', 'Payments'], ['day', 'Day sheet'], ['grid', 'Availability'], ['rentals', 'Rentals'],
    ['revenue', 'Revenue'],
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
// Links in WhatsApp messages always use the real domain, even if admin is opened on the railway.app address.
const SITE = 'https://www.sapnashringar.com'

/** kind: 'confirmed' | 'rejected' | 'updated' | undefined (= from the booking's status) */
function waText(b, settings, kind) {
  kind = kind || (['rejected', 'cancelled'].includes(b.status) ? 'rejected' : b.status === 'pending' ? 'pending' : 'confirmed')
  const what = [b.dress_name, b.addons].filter(Boolean).join(' + ') +
    (b.with_jewellery ? ' (with jewellery' + (b.jewellery_pref ? ': ' + b.jewellery_pref : '') + ')' : '')
  const when = fmtDate(b.date)
  if (kind === 'rejected')
    return [
      `Hi ${b.name}, sorry 🙏 we could not confirm your booking ${b.code} (${what}, ${when}).`,
      b.admin_note && `Reason: ${b.admin_note}`,
      `You can choose another outfit here: ${SITE}/garba/home`,
    ].filter(Boolean).join('\n')
  if (kind === 'pending') return `Hi ${b.name}, about your booking ${b.code} (${what}, ${when}):`
  const left = b.rent_total - b.advance + b.deposit_total
  return [
    kind === 'updated' ? `Hi ${b.name}, your booking ${b.code} has been updated ✏️` : `Hi ${b.name}, your booking ${b.code} is confirmed ✅`,
    what,
    `Date: ${when}`,
    b.dress_id && `${SITE}/garba/dresses/${b.dress_id}`,
    '',
    `Advance received: ${rupee(b.advance)}`,
    `Rent: ${rupee(b.rent_total)}`,
    `Deposit (refundable): ${rupee(b.deposit_total)}`,
    `Please pay at pickup: Rent ${rupee(b.rent_total)} − Advance ${rupee(b.advance)} + Deposit ${rupee(b.deposit_total)} = ${rupee(left)}`,
  ].filter(x => x !== false && x !== undefined && x !== null).join('\n') +
    (kind === 'confirmed' && settings.pickup_rules ? `\n\n${settings.pickup_rules}` : '')
}

function Tick({ on, label, onChange, extra }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!on} onChange={e => onChange(e.target.checked)} />
      <span className="grow">{label}</span>{extra}
    </label>
  )
}

const REJECT_REASONS = ['Payment not received', 'Payment screenshot is not clear', 'Dress not available on that day']

/** After approve / reject / edit: keep the card on screen with the right WhatsApp message until "Done". */
function AfterAction({ b, kind, onDone }) {
  const { settings } = useApp()
  const label = { confirmed: 'Approved', rejected: 'Rejected', updated: 'Booking updated' }[kind]
  return (
    <div className="note col">
      <b>✓ {label}. Now send WhatsApp to {b.name.split(' ')[0]}:</b>
      {b.phone
        ? <a className="btn sm wa" href={waLink(b.phone, waText(b, settings, kind))} target="_blank" rel="noreferrer">Send WhatsApp</a>
        : <span className="muted xs">No phone number on this booking.</span>}
      <button className="linkbtn xs" onClick={onDone}>Done</button>
    </div>
  )
}

function RejectBox({ b, onReject, onClose }) {
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState(false)
  const note = reason.trim() + (refund && b.advance ? `. Your advance of ${rupee(b.advance)} will be refunded.` : '')
  return (
    <div className="card col">
      <b>Why are you rejecting? (the customer sees this)</b>
      <div className="wrapchips">{REJECT_REASONS.map(r => <button key={r} className="chip sm" onClick={() => setReason(r)}>{r}</button>)}</div>
      <input className="input" placeholder="Type the reason" value={reason} onChange={e => setReason(e.target.value)} autoFocus />
      {b.advance > 0 && (
        <label className="check"><input type="checkbox" checked={refund} onChange={e => setRefund(e.target.checked)} />
          <span className="grow">Advance {rupee(b.advance)} was received — tell them it will be refunded</span></label>
      )}
      <div className="row">
        <button className="btn sm ghost grow" onClick={onClose}>Back</button>
        <button className="btn sm grow2" disabled={!reason.trim()} onClick={() => onReject(note)}>Reject booking</button>
      </div>
    </div>
  )
}

function EditBooking({ b, onClose, onSaved }) {
  const [dresses] = useApi('/admin/dresses')
  const [f, setF] = useState({ name: b.name, phone: b.phone, date: b.date, dress_id: b.dress_id, rent_total: b.rent_total,
    deposit_total: b.deposit_total, advance: b.advance, notes: b.notes })
  const [err, setErr] = useState('')
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const pickDress = e => {
    const d = dresses.find(x => String(x.id) === e.target.value)
    setF({ ...f, dress_id: d.id, rent_total: d.rent, deposit_total: d.deposit })  // new dress: its prices, editable
  }
  const chosen = dresses?.find(x => x.id === f.dress_id)
  const save = async e => {
    e.preventDefault()
    try {
      const body = { ...f, rent_total: Number(f.rent_total) || 0, deposit_total: Number(f.deposit_total) || 0, advance: Number(f.advance) || 0 }
      if (!f.dress_id) delete body.dress_id
      onSaved(await patchBooking(b.id, body))
    } catch (x) { setErr(x.message) }
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="sheet" onSubmit={save}>
        <div className="grab" />
        <b>Edit booking {b.code}</b>
        <div className="row">
          <label className="field grow"><span className="lbl">Name</span><input className="input" value={f.name} onChange={set('name')} required /></label>
          <label className="field grow"><span className="lbl">Phone</span><input className="input" type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} /></label>
        </div>
        <label className="field"><span className="lbl">Date</span><input className="input" type="date" value={f.date} onChange={set('date')} required /></label>
        {b.dress_id && (
          <div className="row">
            <Photo src={thumb(chosen?.photos[0]?.path)} className="mini" tone={((f.dress_id || 0) % 6) + 1} />
            <label className="field grow"><span className="lbl">Dress</span>
              {!dresses ? <Loading /> : (
                <select className="input" value={f.dress_id} onChange={pickDress}>
                  {dresses.map(d => <option key={d.id} value={d.id}>{d.code} {d.name} · {rupee(d.rent)}</option>)}
                </select>
              )}</label>
          </div>
        )}
        <div className="row">
          <label className="field grow"><span className="lbl">Rent ₹</span><input className="input" type="number" min="0" inputMode="numeric" value={f.rent_total} onChange={set('rent_total')} /></label>
          <label className="field grow"><span className="lbl">Deposit ₹</span><input className="input" type="number" min="0" inputMode="numeric" value={f.deposit_total} onChange={set('deposit_total')} /></label>
          <label className="field grow"><span className="lbl">Advance ₹</span><input className="input" type="number" min="0" inputMode="numeric" value={f.advance} onChange={set('advance')} /></label>
        </div>
        <span className="muted xs">At pickup: {rupee((Number(f.rent_total) || 0) - (Number(f.advance) || 0) + (Number(f.deposit_total) || 0))}</span>
        <label className="field"><span className="lbl">Notes</span><input className="input" value={f.notes} onChange={set('notes')} /></label>
        {err && <p className="err">{err}</p>}
        <div className="row">
          <button type="button" className="btn ghost grow" onClick={onClose}>Cancel</button>
          <button className="btn grow2">Save changes</button>
        </div>
      </form>
    </>
  )
}

function BookingCard({ b, reload }) {
  const { settings } = useApp()
  const [ded, setDed] = useState(b.deduction)
  const [err, setErr] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [after, setAfter] = useState(null)   // { b, kind } after approve / reject / edit
  const patch = body => { setErr(''); patchBooking(b.id, body).then(reload).catch(e => setErr(e.message)) }
  const act = (body, kind) => { setErr(''); patchBooking(b.id, body).then(nb => setAfter({ b: nb, kind })).catch(e => setErr(e.message)) }
  const live = ['confirmed', 'out', 'returned'].includes(b.status)
  if (after) b = after.b
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
          <dt>Rent</dt><dd>{rupee(b.rent_total)}</dd>
          <dt>Advance</dt><dd>{rupee(b.advance)}{b.advance ? ` · ${b.source === 'online' ? 'UPI' : b.rent_paid_mode.toUpperCase()}` : ''}</dd>
          <dt>At pickup</dt><dd>{rupee(b.rent_total - b.advance)} + {rupee(b.deposit_total)} dep.</dd>
          <dt>Source</dt><dd>{b.source === 'online' ? 'Online' : 'Shop'} · {b.code}</dd>
        </dl>
      </div>
      {b.notes && <p className="note">“{b.notes}”</p>}
      {b.admin_note && ['rejected', 'cancelled'].includes(b.status) && <p className="muted xs">Reason: {b.admin_note}</p>}
      {after ? <AfterAction b={after.b} kind={after.kind} onDone={() => { setAfter(null); reload() }} /> : (
        <>
          {b.status === 'pending' && !rejecting && (
            <>
              {b.screenshot && <span className="muted xs">Tap "Payment" to zoom. Match the amount and UTR in your bank app.</span>}
              <div className="row">
                <button className="btn sm ghost grow" onClick={() => setRejecting(true)}>Reject</button>
                <button className="btn sm grow2" onClick={() => act({ status: 'confirmed' }, 'confirmed')}>Approve</button>
              </div>
            </>
          )}
          {rejecting && <RejectBox b={b} onClose={() => setRejecting(false)} onReject={note => act({ status: 'rejected', admin_note: note }, 'rejected')} />}
          {live && (
            <div className="list">
              <Tick on={b.deposit_collected_at} label={`Collected ${rupee(b.rent_total - b.advance)} rent + ${rupee(b.deposit_total)} deposit`} onChange={v => patch({ deposit_collected: v })} />
              <Tick on={b.handed_over_at} label="Handed over" onChange={v => patch({ handed_over: v })} />
              <Tick on={b.returned_at} label="Returned" onChange={v => patch({ returned: v })} />
              <Tick on={b.deposit_refunded} label={`Deposit refunded ${rupee(b.deposit_total - ded)}`}
                onChange={v => patch({ deposit_refunded: v, deduction: Number(ded) || 0 })}
                extra={<input className="input tiny" type="number" min="0" max={b.deposit_total} value={ded} aria-label="Deduction"
                  title="Deduction for damage / late" onChange={e => setDed(e.target.value)} onBlur={() => Number(ded) !== b.deduction && patch({ deduction: Number(ded) || 0 })} />} />
            </div>
          )}
          {err && <p className="err">{err}</p>}
          <div className="row between">
            {['pending', 'confirmed', 'out'].includes(b.status) && <button className="linkbtn" onClick={() => setEditing(true)}>✏️ Edit booking</button>}
            {live && <button className="linkbtn xs danger" onClick={() => patch({ status: 'cancelled' })}>Cancel booking</button>}
          </div>
          {b.phone && <a className="btn sm wa" href={waLink(b.phone, waText(b, settings))} target="_blank" rel="noreferrer">Send WhatsApp to {b.name.split(' ')[0]}</a>}
        </>
      )}
      {editing && <EditBooking b={b} onClose={() => setEditing(false)} onSaved={nb => { setEditing(false); setAfter({ b: nb, kind: 'updated' }) }} />}
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
  const [adv, setAdv] = useState('')
  const [err, setErr] = useState('')
  const listRent = dress.rent + (f.with_jewellery ? dress.jewellery_price : 0)
  const changed = (rent !== null && Number(rent) !== listRent) || (dep !== null && Number(dep) !== dress.deposit)
  const num = v => (v === null || v === '' ? undefined : Number(v))
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async e => {
    e.preventDefault()
    try {
      await api('/admin/bookings', { method: 'POST', admin: true, body: form({ ...f, dress_id: dress.id, date, rent: num(rent), deposit: num(dep), advance: num(adv) ?? 0 }) })
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
        <label className="field"><span className="lbl">Advance taken now ₹ (rest at pickup)</span>
          <input className="input" type="number" min="0" inputMode="numeric" placeholder="0" value={adv} onChange={e => setAdv(e.target.value)} /></label>
        {changed && <span className="muted xs">Special price. List price is {rupee(listRent)} rent · {rupee(dress.deposit)} deposit.</span>}
        <div className="seg">
          {['cash', 'upi'].map(m => <button type="button" key={m} className={f.rent_paid_mode === m ? 'on' : ''} onClick={() => setF({ ...f, rent_paid_mode: m })}>Advance by {m.toUpperCase()}</button>)}
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

// ---------- rentals: which dresses went out on a day, and what each earned ----------
export function Rentals() {
  const [date, setDate] = useState(today())
  const [list, err] = useApi(`/admin/bookings?date=${date}&status=confirmed,out,returned`)
  const total = k => (list || []).reduce((s, b) => s + b[k], 0)
  return (
    <main className="body">
      <div className="row between">
        <h1 className="h sm">{fmtDate(date, 'en', { weekday: 'long', day: 'numeric', month: 'short' })}</h1>
        <input className="input tiny wide" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Pick date" />
      </div>
      <DateStrip value={date} onChange={setDate} from={addDays(today(), -10)} days={40} />
      {!list ? <Loading err={err} /> : (
        <>
          <div className="grid2">
            <div className="card"><span className="lbl">Dresses on rent</span><div className="price lg">{list.length}</div></div>
            <div className="card"><span className="lbl">Rent earned</span><div className="price lg">{rupee(total('rent_total'))}</div>
              <span className="muted xs">Advance {rupee(total('advance'))} · At pickup {rupee(total('rent_total') - total('advance'))}</span></div>
          </div>
          {!list.length ? <p className="muted center">No confirmed rentals on this day.</p> : (
            <div className="grid2">
              {list.map(b => (
                <div key={b.id} className="dcard">
                  {b.dress_photo
                    ? <a href={img(b.dress_photo)} target="_blank" rel="noreferrer"><Photo src={thumb(b.dress_photo)} alt={b.dress_name} /></a>
                    : <Photo tone={(b.id % 6) + 1} alt="" />}
                  <div className="in">
                    <span className="nm"><b>{b.dress_code}</b> {b.dress_name || b.addons}</span>
                    <span className="price">{rupee(b.rent_total)}</span>
                    <span className="muted xs">{b.name} · {b.source === 'online' ? 'Online' : 'Shop'}</span>
                    <span className="muted xs">Advance {rupee(b.advance)}{b.deposit_collected_at ? ' · paid in full' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
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
            <div className="card"><span className="lbl">Rent earned</span><div className="price lg">{rupee(T.rent)}</div><span className="muted xs">Advance {rupee(T.advance)} · At pickup {rupee(T.balance)}</span></div>
            <div className="card"><span className="lbl">Deposits held</span><div className="price lg warn">{rupee(T.deposit_held)}</div><span className="muted xs">still to return</span></div>
            <div className="card"><span className="lbl">Bookings</span><div className="price lg">{T.bookings}</div></div>
            <div className="card"><span className="lbl">Deductions kept</span><div className="price lg">{rupee(T.deductions)}</div><span className="muted xs">damage / late</span></div>
          </div>
          <div className="card scrollx">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Rent</th><th>Advance</th><th>At pickup</th><th>Dep. in</th><th>Dep. out</th><th>Kept</th></tr></thead>
              <tbody>
                {data.days.map(d => (
                  <tr key={d.date}><td>{fmtDate(d.date)}</td><td>{rupee(d.rent)}</td><td>{rupee(d.advance)}</td><td>{rupee(d.balance)}</td>
                    <td>{rupee(d.deposit_in)}</td><td>{rupee(d.deposit_out)}</td><td>{rupee(d.deductions)}</td></tr>
                ))}
                {!data.days.length && <tr><td colSpan="7" className="muted">No bookings in this range.</td></tr>}
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
  const delDress = async () => {
    if (!window.confirm(`Delete ${dress.code} ${dress.name} and all its photos? This can't be undone.`)) return
    try {
      await api(`/admin/dresses/${dress.id}`, { method: 'DELETE', admin: true })
      nav('/admin/dresses')
    } catch (x) { setErr(x.message) }
  }
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
        {dress && <button type="button" className="linkbtn danger" onClick={delDress}>Delete this dress</button>}
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
        {field('advance_amount', 'Advance customers pay online when booking (₹)', { type: 'number', min: 0, placeholder: '200' })}
        {field('shop_address', 'Shop address', { rows: 2 })}
        {field('pickup_rules', 'Pickup & return rules (shown to customers)', { rows: 5, placeholder: 'Pickup 11am–5pm on the day. Return by 1pm next day. Late return ₹200/day. Bring photo ID.' })}
        {msg && <p className={msg === 'Saved' ? 'ok' : 'err'}>{msg}</p>}
        <button className="btn">Save settings</button>
      </form>
    </main>
  )
}
