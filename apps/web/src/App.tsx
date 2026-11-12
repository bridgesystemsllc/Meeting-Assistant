import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { MeetingsPage } from './routes/meetings';
import { MeetingDetailPage } from './routes/meeting-detail';
import { LoginPage } from './routes/login';
import { InvitePage } from './routes/invite';
import { SeatsPage } from './routes/settings/seats';
import { ActivityPage } from './routes/settings/activity';
import { LandingPage } from './marketing/landing/LandingPage';
import { PricingPage } from './marketing/landing/PricingPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="meetings/:id" element={<MeetingDetailPage />} />
          <Route path="settings/seats" element={<SeatsPage />} />
          <Route path="settings/activity" element={<ActivityPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
