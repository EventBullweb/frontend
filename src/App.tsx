import { Navigate, Route, Routes } from 'react-router-dom'
import DevPage from './pages/DevPage'
import AnalyticsPage from './pages/AnalyticsPage'

function RedirectToBot() {
  window.location.replace('https://t.me/Show_Circus_bot')
  return null
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<RedirectToBot />} />
      <Route path="/dev" element={<DevPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/analytics/*" element={<AnalyticsPage />} />
      <Route path="*" element={<Navigate to="/analytics" replace />} />
    </Routes>
  )
}

export default App
