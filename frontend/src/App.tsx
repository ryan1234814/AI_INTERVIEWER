import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ErrorBoundary from './components/ErrorBoundary'
import { ThemeProvider } from './hooks/useTheme'
import { Mic, ChevronRight } from 'lucide-react'

function AppContent() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ background: 'var(--background-secondary)', borderColor: 'var(--card-border)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <Mic className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-tight">Agentic AI</span>
              <span className="text-[10px] font-medium tracking-[0.18em] uppercase" style={{ color: 'var(--foreground-tertiary)' }}>
                Interviewer
              </span>
            </div>
          </a>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            <a href="#/setup" className="btn btn-primary">
              Start Interview
              <ChevronRight className="w-4 h-4" />
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'var(--overlay-light)', border: '1px solid var(--card-border)' }}>
                <Mic className="w-3.5 h-3.5" style={{ color: 'var(--accent-text)' }} />
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--foreground-secondary)' }}>Agentic AI Interviewer</span>
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
          <AppContent />
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
