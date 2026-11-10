import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { MeetingsPage } from './routes/meetings';
import { MeetingDetailPage } from './routes/meeting-detail';
import { LoginPage } from './routes/login';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<MeetingsPage />} />
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="meetings/:id" element={<MeetingDetailPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
