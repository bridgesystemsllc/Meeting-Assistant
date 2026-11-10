import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MeetingsPage } from './routes/meetings';
import { MeetingDetailPage } from './routes/meeting-detail';
import { LandingPage } from './marketing/landing/LandingPage';
import { PricingPage } from './marketing/landing/PricingPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route element={<Layout />}>
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="meetings/:id" element={<MeetingDetailPage />} />
      </Route>
    </Routes>
  );
}

export default App;
