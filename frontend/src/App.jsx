import { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import ProblemList from './components/ProblemList';
import WorkspacePage from './components/WorkspacePage';
import './App.css';

function App() {
  const [activeProblem, setActiveProblem] = useState(null);

  return (
    <AuthProvider>
      <div className="app-root">
        {activeProblem ? (
          <WorkspacePage
            problem={activeProblem}
            onBack={() => setActiveProblem(null)}
          />
        ) : (
          <ProblemList onSelect={setActiveProblem} />
        )}
      </div>
    </AuthProvider>
  );
}

export default App;