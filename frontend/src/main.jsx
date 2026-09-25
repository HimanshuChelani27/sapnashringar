import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { waLink } from './api'
import { AppProvider, useApp, useT } from './ui'
import { Availability, Book, DressDetail, Dresses, Extras, Home, Rules, Status } from './shop'
import { AdminLayout, Day, DressesAdmin, DressForm, ExtrasAdmin, Grid, Login, Payments, Revenue, SettingsAdmin } from './admin'
import './styles.css'

function Shop() {
  const t = useT()
  const { settings } = useApp()
  const { pathname } = useLocation()
  // pages with their own bottom action bar hide the menu
  const ownBar = pathname.startsWith('/book') || /^\/dresses\/\d/.test(pathname) || pathname === '/extras'
  return (
    <div className="app">
      <Outlet />
      {!ownBar && settings.whatsapp_number && (
        <a className="fab" href={waLink(settings.whatsapp_number, 'Hi Sapna Garba!')} target="_blank" rel="noreferrer">{t('wa_us')}</a>
      )}
      {!ownBar && (
        <nav className="nav">
          <NavLink to="/home">{t('nav_home')}</NavLink>
          <NavLink to="/availability">{t('nav_date')}</NavLink>
          <NavLink to="/dresses" end>{t('nav_dresses')}</NavLink>
          <NavLink to="/status">{t('nav_booking')}</NavLink>
        </nav>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename="/garba">
    <AppProvider>
      <Routes>
        <Route element={<Shop />}>
          <Route path="home" element={<Home />} />
          <Route path="availability" element={<Availability />} />
          <Route path="dresses" element={<Dresses />} />
          <Route path="dresses/:id" element={<DressDetail />} />
          <Route path="book/:id?" element={<Book />} />
          <Route path="extras" element={<Extras />} />
          <Route path="status" element={<Status />} />
          <Route path="rules" element={<Rules />} />
        </Route>
        <Route path="admin/login" element={<Login />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="bookings" replace />} />
          <Route path="bookings" element={<Payments />} />
          <Route path="day" element={<Day />} />
          <Route path="grid" element={<Grid />} />
          <Route path="revenue" element={<Revenue />} />
          <Route path="dresses" element={<DressesAdmin />} />
          <Route path="dresses/:id" element={<DressForm />} />
          <Route path="extras" element={<ExtrasAdmin />} />
          <Route path="settings" element={<SettingsAdmin />} />
        </Route>
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AppProvider>
  </BrowserRouter>
)
