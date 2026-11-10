import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MeetingsPage } from './routes/meetings';
import { MeetingDetailPage } from './routes/meeting-detail';
import { ConsentSettings } from './routes/settings/consent';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<MeetingsPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="meetings/:id" element={<MeetingDetailPage />} />
        <Route path="settings/consent" element={<ConsentSettings />} />
      </Route>
    </Routes>
  );
}

export default App;
