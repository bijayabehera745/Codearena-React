import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, API } from '../context/AuthContext';
import AuthModal from './AuthModal';
import CodeArenaLogo from '../../public/Logo';

const diffLabel = { E: 'Easy', M: 'Medium', H: 'Hard' };
const diffClass = { E: 'badge-easy', M: 'badge-medium', H: 'badge-hard' };
const COMMON_COMPANIES = ["Google", "Amazon", "Microsoft", "Facebook", "Apple", "Netflix", "Adobe", "Uber"];

export default function ProblemList({ onSelect }) {
  const { user, logout, loading: authLoading } = useAuth();

  // Data State
  const [problems, setProblems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter State
  const [diffFilter, setDiffFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showAuth, setShowAuth] = useState(false);

  // Infinite Scroll Observer
  const observer = useRef();
  const lastElementRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });

    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  // Reset list when filters change
  useEffect(() => {
    setProblems([]);
    setPage(1);
    setHasMore(true);
  }, [diffFilter, companyFilter, search]);

  // Fetch Logic
  useEffect(() => {
    setLoading(true);
    setError(null);

    const queryParams = new URLSearchParams({
      page: page,
      difficulty: diffFilter,
      company: companyFilter,
      search: search
    });

    fetch(`${API}/problems/?${queryParams.toString()}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch');
        return r.json();
      })
      .then(data => {
        // Handle DRF paginated response format: { results: [], next: "url" }
        const newResults = data.results || [];
        setProblems(prev => [...prev, ...newResults]);
        setHasMore(data.next !== null);
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to load problems. Check your backend connection.');
        setLoading(false);
      });
  }, [page, diffFilter, companyFilter, search]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* ── Header ── */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 56, position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CodeArenaLogo size={32} />
          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 18 }}>
            CodeArena
          </span>
        </div>

        {!authLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--accent-dim)', border: '1px solid rgba(124,106,245,0.25)', borderRadius: 100, fontSize: 12, color: 'var(--accent)' }}>
                  ✨ {user.ai_debugs_remaining} hints
                </div>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={logout}>Sign Out</button>
              </>
            ) : (
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowAuth(true)}>Sign In</button>
            )}
          </div>
        )}
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px' }}>
        <div className="fade-in" style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 42, fontWeight: 800, marginBottom: 10, background: 'linear-gradient(135deg, var(--text-primary) 40%, var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', padding: '6px 4px' }}>
            Ace the Interview.
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
            {problems.length.toLocaleString()}+ questions from top tech companies.
          </p>
        </div>

        {/* Filter Bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <div style={{ position: 'relative', flex: '1 1 250px' }}>
            <input type="text" placeholder="Search by title..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 12px 10px 32px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}
            />
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
          </div>

          <div style={{ display: 'flex', background: 'var(--bg-elevated)', padding: 4, borderRadius: 8 }}>
            {['ALL', 'E', 'M', 'H'].map(d => (
              <button key={d} onClick={() => setDiffFilter(d)} style={{ border: 'none', background: diffFilter === d ? 'var(--bg-surface)' : 'transparent', color: diffFilter === d ? 'var(--accent)' : 'var(--text-muted)', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                {d === 'ALL' ? 'All' : diffLabel[d]}
              </button>
            ))}
          </div>

          <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}
            style={{ padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}>
            <option value="">All Companies</option>
            {COMMON_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Problem List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {problems.map((p, i) => {
            const isLast = problems.length === i + 1;
            return (
              <div
                key={`${p.id}-${i}`}
                ref={isLast ? lastElementRef : null}
                className="problem-card"
                onClick={() => onSelect(p)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  padding: '20px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {p.is_premium && <span style={{ color: '#FFA116', fontSize: 12 }}>💎</span>}
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{p.title}</span>
                    {p.asked_by_faang && <span style={{ fontSize: 10, background: 'var(--accent-dim)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 4 }}>FAANG</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {p.related_topics?.slice(0, 3).map(t => (
                      <span key={t} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>{t}</span>
                    ))}
                    {p.companies?.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>💼 {p.companies[0]}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={`badge ${diffClass[p.difficulty]}`}>{diffLabel[p.difficulty]}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{p.acceptance_rate}% Acc.</div>
                </div>
              </div>
            );
          })}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>Loading more problems...</p>
          </div>
        )}

        {error && <div style={{ color: 'var(--red)', textAlign: 'center', padding: 20 }}>{error}</div>}

        {!hasMore && problems.length > 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            You've reached the end of the collection.
          </div>
        )}
      </main>
    </div>
  );
}