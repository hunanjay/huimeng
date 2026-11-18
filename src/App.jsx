import { useState } from 'react';
import AppShell from './components/AppShell.jsx';
import CreatePage from './pages/CreatePage.jsx';
import VideosPage from './pages/VideosPage.jsx';
import AgentsPage from './pages/AgentsPage.jsx';

export default function App() {
  const [page, setPage] = useState('创作');
  return <AppShell activePage={page} onNavigate={setPage}>
    {page === '成片' ? <VideosPage onCreate={() => setPage('创作')} /> : page === '智能体' ? <AgentsPage /> : <CreatePage />}
  </AppShell>;
}
