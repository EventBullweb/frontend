import { Navigate, Route, Routes } from 'react-router-dom'
import DevPage from './pages/DevPage'
import AnalyticsPage from './pages/AnalyticsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/scanner" replace />} />
      <Route path="/dev" element={<Navigate to="/scanner" replace />} />
      <Route path="/scanner" element={<DevPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/analytics/*" element={<AnalyticsPage />} />
      <Route path="*" element={<Navigate to="/analytics" replace />} />
    </Routes>
  )
}

export default App
