import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Activity from './pages/Activity';
import Research from './pages/Research';
import Campaign from './pages/Campaign';
import Approvals from './pages/Approvals';
import Calendar from './pages/Calendar';
import Engagement from './pages/Engagement';
import Performance from './pages/Performance';
import PlatformSettings from './pages/PlatformSettings';
import Traces from './pages/Traces';
import Audit from './pages/Audit';
import Onboard from './pages/Onboard';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/research" element={<Research />} />
        <Route path="/campaign" element={<Campaign />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/engagement" element={<Engagement />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/settings" element={<PlatformSettings />} />
        <Route path="/traces" element={<Traces />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/onboard" element={<Onboard />} />
        <Route path="*" element={<div className="banner warn">Page not found.</div>} />
      </Routes>
    </Layout>
  );
}
