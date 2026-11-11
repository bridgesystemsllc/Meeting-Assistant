import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { MeetingsPage } from './routes/meetings';
import { MeetingDetailPage } from './routes/meeting-detail';
import { LoginPage } from './routes/login';
import { InvitePage } from './routes/invite';
import { SeatsPage } from './routes/settings/seats';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<MeetingsPage />} />
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="meetings/:id" element={<MeetingDetailPage />} />
          <Route path="settings/seats" element={<SeatsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
