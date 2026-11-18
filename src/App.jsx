import { useState } from 'react';
import AppShell from './components/AppShell.jsx';
import AssetsPage from './pages/AssetsPage.jsx';
import CanvasPage from './pages/CanvasPage.jsx';
import CreateWorkbench from './pages/CreateWorkbench.jsx';
import DataPage from './pages/DataPage.jsx';
import DecomposePage from './pages/DecomposePage.jsx';
import DistributePage from './pages/DistributePage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ScriptsPage from './pages/ScriptsPage.jsx';
import VideosPage from './pages/VideosPage.jsx';
import AgentsPage from './pages/AgentsPage.jsx';
import TracingPage from './pages/TracingPage.jsx';

export default function App() {
  const [page, setPage] = useState('项目');
  const [project, setProject] = useState(null);
  const [createMode, setCreateMode] = useState('剧本成片');
  const openProjectPage = (nextPage, nextProject) => {
    setProject(nextProject);
    setPage(nextPage);
  };
  const content = {
    项目: <ProjectsPage onOpenProject={openProjectPage} />,
    创作: <CreateWorkbench mode={createMode} projectId={project?.id} projectName={project?.name} onOpenScripts={() => setPage('剧本')} onModeChange={setCreateMode} />,
    成片: <VideosPage projectId={project?.id} onCreate={() => setPage('创作')} />,
    智能体: <AgentsPage />,
    画布: <CanvasPage projectId={project?.id} />,
    剧本: <ScriptsPage projectId={project?.id} onOpenShots={() => setPage('画布')} />,
    拆解: <DecomposePage projectId={project?.id} />,
    资产: <AssetsPage projectId={project?.id} />,
    数据: <DataPage />,
    分发: <DistributePage />,
    追踪: <TracingPage />,
  };
  return <AppShell activePage={page} project={project} onNavigate={next => setPage(next === '首页' ? '项目' : next)}>
    {content[page] || content.项目}
  </AppShell>;
}
