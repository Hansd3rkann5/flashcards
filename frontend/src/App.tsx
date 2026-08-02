import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './app/_layout';
import HomeView from './app/index';
import SubjectView from './app/subject';
import { AppLoadingProvider } from './components/ui/AppLoadingOverlay';

export default function App() {
  return (
    <AppLoadingProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<HomeView />} />
            <Route path="subject/:subjectId" element={<SubjectView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppLoadingProvider>
  );
}
