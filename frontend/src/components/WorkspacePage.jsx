import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, API } from '../context/AuthContext';
import AuthModal from './AuthModal';
import Editor from '@monaco-editor/react';

const LANGUAGES = [
  { id: 'python', label: 'Python 3', ext: 'py', monaco: 'python' },
  { id: 'cpp', label: 'C++17', ext: 'cpp', monaco: 'cpp' },
  { id: 'java', label: 'Java 17', ext: 'java', monaco: 'java' },
];

const STATUS_META = {
  P: { label: 'Running...', color: 'var(--blue)', bg: 'var(--blue-dim)', icon: null },
  A: { label: 'Accepted', color: 'var(--green)', bg: 'var(--green-dim)', icon: '✓' },
  WA: { label: 'Wrong Answer', color: 'var(--red)', bg: 'var(--red-dim)', icon: '✗' },
  TLE: { label: 'Time Limit Exceeded', color: 'var(--amber)', bg: 'var(--amber-dim)', icon: '⏱' },
  CE: { label: 'Compilation Error', color: 'var(--amber)', bg: 'var(--amber-dim)', icon: '✗' },
  RE: { label: 'Runtime Error', color: 'var(--red)', bg: 'var(--red-dim)', icon: '✗' },
};

// Generic fallbacks if the problem doesn't have a specific template
const GLOBAL_BOILERPLATES = {
  python: `class Solution:\n    def solve(self, nums: list[int]) -> int:\n        # Write your solution here\n        pass\n`,
  cpp: `class Solution {\npublic:\n    int solve(vector<int>& nums) {\n        // Write your solution here\n        return 0;\n    }\n};\n`,
  java: `class Solution {\n    public int solve(int[] nums) {\n        // Write your solution here\n        return 0;\n    }\n}\n`,
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function WorkspacePage({ problem, onBack }) {
  const { user, authFetch, decrementQuota } = useAuth();

  const [lang, setLang] = useState('python');
  const [code, setCode] = useState('');
  const [tab, setTab] = useState('description');
  const [submitting, setSubmitting] = useState(false);
  const [latestResult, setLatestResult] = useState(null);
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [viewingCode, setViewingCode] = useState(null);
  const [pollTimer, setPollTimer] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [showAuth, setShowAuth] = useState(false);

  // Logic for Different Templates for Different Problems
  useEffect(() => {
    // 1. Check if the backend sent a specific template for this problem and language
    // backend field example: problem.templates = { python: "...", cpp: "..." }
    const problemSpecificTemplate = problem.templates?.[lang];

    // 2. Legacy check: your previous boilerplate_code field
    const legacyPythonTemplate = lang === 'python' ? problem.boilerplate_code : null;

    if (problemSpecificTemplate) {
      setCode(problemSpecificTemplate);
    } else if (legacyPythonTemplate) {
      setCode(legacyPythonTemplate);
    } else {
      // 3. Fallback to global defaults
      setCode(GLOBAL_BOILERPLATES[lang]);
    }
  }, [lang, problem]);

  const loadSubmissions = useCallback(async () => {
    if (!user) return;
    setSubsLoading(true);
    try {
      const r = await authFetch(`${API}/submissions/?problem=${problem.id}`);
      if (r.ok) {
        const data = await r.json();
        const list = Array.isArray(data) ? data : (data.results || []);
        setAllSubmissions(list.filter(s => s.problem === problem.id));
      }
    } catch { /* silent */ }
    finally { setSubsLoading(false); }
  }, [user, problem.id, authFetch]);

  useEffect(() => {
    if (tab === 'submissions') loadSubmissions();
  }, [tab, loadSubmissions]);

  useEffect(() => () => { if (pollTimer) clearInterval(pollTimer); }, [pollTimer]);

  const pollSubmission = useCallback((id) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 60;

    const timer = setInterval(async () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(timer);
        setSubmitting(false);
        setLatestResult(prev => prev ? { ...prev, status: 'TLE' } : prev);
        return;
      }
      try {
        const r = await fetch(`${API}/submissions/${id}/status/`);
        if (!r.ok) {
          if (r.status !== 404) { clearInterval(timer); setSubmitting(false); }
          return;
        }
        const data = await r.json();
        const done = data.status !== 'P' && data.status !== 'Pending';
        setLatestResult(prev => ({ ...prev, ...data }));

        if (done) {
          clearInterval(timer);
          setSubmitting(false);
          setAllSubmissions(prev => prev.map(s => s.id === data.id ? { ...s, ...data } : s));
        }
      } catch { /* Network retry */ }
    }, 1500);
    setPollTimer(timer);
  }, []);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setLatestResult(null);
    setAiResult(null);
    setSubmitError('');
    setTab('submissions');

    try {
      const r = await fetch(`${API}/submissions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem: problem.id, code, language: lang }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      const pending = { ...data, status: 'P' };
      setLatestResult(pending);
      setAllSubmissions(prev => [pending, ...prev]);
      pollSubmission(data.id);
    } catch {
      setSubmitError('Could not reach the judge. Is the server running?');
      setSubmitting(false);
    }
  };

  const handleAIReview = async () => {
    if (!user) { setShowAuth(true); return; }
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setTab('ai');

    try {
      const r = await authFetch(`${API}/ai-review/`, {
        method: 'POST',
        body: JSON.stringify({
          code,
          problem_id: problem.id,
          error_message: latestResult ? STATUS_META[latestResult.status]?.label : 'General review',
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'AI review failed');
      setAiResult(data);
      decrementQuota();
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const diffLabel = { E: 'Easy', M: 'Medium', H: 'Hard' };
  const diffClass = { E: 'badge-easy', M: 'badge-medium', H: 'badge-hard' };
  const currentLang = LANGUAGES.find(l => l.id === lang);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)' }}>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* Code viewer overlay */}
      {viewingCode && (
        <div onClick={() => setViewingCode(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 720, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                  {viewingCode.language} · {timeAgo(viewingCode.submitted_at)}
                </span>
                <span className={`badge`} style={{ color: STATUS_META[viewingCode.status]?.color, background: STATUS_META[viewingCode.status]?.bg, border: `1px solid ${STATUS_META[viewingCode.status]?.color}33` }}>
                  {STATUS_META[viewingCode.status]?.label}
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => setViewingCode(null)}>✕ Close</button>
            </div>
            <pre style={{ flex: 1, overflow: 'auto', padding: '16px 20px', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#c9d1d9', margin: 0 }}>
              {viewingCode.code}
            </pre>
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <header style={{ height: 52, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={onBack}>← Problems</button>
          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 14 }}>{problem.title}</span>
          <span className={`badge ${diffClass[problem.difficulty]}`}>{diffLabel[problem.difficulty]}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {user && (
            <div style={{ padding: '3px 10px', background: 'var(--accent-dim)', border: '1px solid rgba(124,106,245,0.2)', borderRadius: 100, fontSize: 11, color: 'var(--accent)' }}>
              ✨ {user.ai_debugs_remaining}
            </div>
          )}
          <select value={lang} onChange={e => setLang(e.target.value)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 12 }}>
            {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={handleAIReview} disabled={aiLoading}>
            {aiLoading ? '✨ Thinking...' : '✨ AI Hint'}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Running...' : '▶ Submit'}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT PANEL */}
        <div style={{ width: '42%', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            {['description', 'submissions', 'ai'].map(id => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '10px 16px', fontSize: 13, background: 'transparent', cursor: 'pointer', color: tab === id ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent', border: 'none' }}>
                {id.charAt(0).toUpperCase() + id.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {/* inside WorkspacePage.jsx - Left Panel (Description Tab) */}
            {tab === 'description' && (
              <div className="fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
                    {problem.title}
                  </h2>
                  {problem.asked_by_faang && (
                    <span style={{ fontSize: 10, background: 'rgba(255,215,0,0.1)', color: '#FFD700', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,215,0,0.2)', fontWeight: 600 }}>
                      FAANG Favorite
                    </span>
                  )}
                </div>

                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.75, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  {problem.description}
                </div>

                {/* Related Topics */}
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Related Topics</h4>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {problem.related_topics?.map(topic => (
                      <span key={topic} style={{ padding: '4px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 100, fontSize: 11, color: 'var(--text-secondary)' }}>
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Companies Section with Premium Lock */}
                <div style={{ marginBottom: 24, padding: 16, background: 'var(--bg-active)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h4 style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Companies</h4>
                    {problem.is_premium && <span style={{ fontSize: 11, color: 'var(--accent)' }}>🔒 Premium</span>}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', filter: problem.is_premium ? 'blur(3px)' : 'none', pointerEvents: problem.is_premium ? 'none' : 'auto' }}>
                    {problem.companies?.map(company => (
                      <span key={company} style={{ padding: '4px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
                        {company}
                      </span>
                    ))}
                  </div>

                  {problem.is_premium && (
                    <div style={{ textAlign: 'center', marginTop: -20, position: 'relative', zIndex: 1 }}>
                      <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--bg-surface)' }}>
                        Unlock Company List
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {tab === 'submissions' && (
              <div className="fade-in">
                {latestResult && (
                  <div style={{ padding: 16, background: STATUS_META[latestResult.status]?.bg, borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, color: STATUS_META[latestResult.status]?.color }}>{STATUS_META[latestResult.status]?.label}</div>
                  </div>
                )}
                {allSubmissions.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 10, background: 'var(--bg-elevated)', marginBottom: 6, borderRadius: 6 }}>
                    <span style={{ color: STATUS_META[s.status]?.color }}>{STATUS_META[s.status]?.label}</span>
                    <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setViewingCode(s)}>View</button>
                  </div>
                ))}
              </div>
            )}
            {tab === 'ai' && (
              <div className="fade-in">
                {aiResult && <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 8 }}>{aiResult.review}</div>}
                {!aiResult && <p>Click "Get Hint" to analyze your code.</p>}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Monaco Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1e1e1e' }}>
          <div style={{ padding: '8px 14px', background: '#252526', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#999', fontFamily: 'var(--font-mono)' }}>solution.{currentLang?.ext}</span>
          </div>

          <Editor
            height="100%"
            theme="vs-dark"
            language={currentLang?.monaco || 'python'}
            value={code}
            onChange={(value) => setCode(value || '')}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              padding: { top: 16 },
              fontFamily: 'var(--font-mono)',
            }}
          />

          <div style={{ padding: '5px 14px', background: '#252526', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#777' }}>
            <span>{currentLang?.label}</span>
            <span>Tab Size: 4</span>
          </div>
        </div>
      </div>
    </div>
  );
}