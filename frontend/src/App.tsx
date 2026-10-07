import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider, useTheme } from './hooks/useTheme'
import { LayoutDashboard, LogOut, Sun, Moon } from 'lucide-react'

function AppContent() {
  const { user, isAuthenticated, loading, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  // While a stored token is still being verified we know nothing about the
  // session yet, so the header renders neither auth state's controls.
  const sessionPending = loading

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ background: 'var(--background-secondary)', borderColor: 'var(--card-border)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo — typographic masthead instead of an icon tile */}
          <Link to="/" className="flex flex-col leading-none">
            <span className="font-display text-[22px] tracking-tight" style={{ color: 'var(--foreground)' }}>
              Agentic AI<span style={{ color: 'var(--accent)' }}>.</span>
            </span>
            <span className="mt-1 text-[9.5px] font-medium tracking-[0.24em] uppercase" style={{ color: 'var(--foreground-tertiary)' }}>
              Interviewer
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-2">
            {/* Theme toggle is available to everyone, signed in or not */}
            <button
              onClick={toggleTheme}
              className="icon-btn mr-1"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {!sessionPending && !isAuthenticated && (
              <>
                <Link to="/login" className="btn btn-ghost">
                  Login
                </Link>
                <Link to="/signup" className="btn btn-primary">
                  Sign up
                </Link>
              </>
            )}

            {isAuthenticated && (
              <>
                <Link to="/dashboard" className="btn btn-ghost">
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
                <span
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--overlay-light)', border: '1px solid var(--card-border)', color: 'var(--foreground-secondary)' }}
                  title={user?.email}
                >
                  <span
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-semibold"
                    style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}
                  >
                    {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
                  </span>
                  {user?.name}
                </span>
                <button onClick={handleLogout} className="icon-btn" title="Logout" aria-label="Logout">
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
          />
          <Route
            path="/signup"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Signup />}
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg" style={{ color: 'var(--foreground-secondary)' }}>
                Agentic AI<span style={{ color: 'var(--accent-text)' }}>.</span>
              </span>
              <span className="text-[9.5px] font-medium tracking-[0.24em] uppercase" style={{ color: 'var(--foreground-tertiary)' }}>
                Interviewer
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm" style={{ color: 'var(--foreground-tertiary)' }}>
              <a href="#" className="hover:opacity-80 transition-opacity">Privacy</a>
              <a href="#" className="hover:opacity-80 transition-opacity">Terms</a>
              <a href="#" className="hover:opacity-80 transition-opacity">Contact</a>
            </div>
            <p className="text-xs" style={{ color: 'var(--foreground-tertiary)' }}>© 2026 Agentic AI Voice Interview Platform</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Router>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
