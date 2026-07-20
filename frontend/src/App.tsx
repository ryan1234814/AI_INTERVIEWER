import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ErrorBoundary from './components/ErrorBoundary'
import { Mic, Sparkles } from 'lucide-react'

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen relative noise-overlay">
          {/* Animated mesh background */}
          <div className="mesh-bg">
            <div className="mesh-orb mesh-orb--emerald" />
          </div>
          <div className="grid-pattern" />

          {/* Header */}
          <header className="sticky top-0 z-50 glass-card border-b border-white/5">
            <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
              {/* Logo */}
              <a href="/" className="flex items-center gap-3 group">
                <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-glow-blue group-hover:shadow-glow-blue transition-shadow duration-300">
                  <Mic className="w-5 h-5 text-white" />
                  <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#06060a] animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-extrabold tracking-tight leading-none">
                    <span className="gradient-text">Agentic AI</span>
                  </span>
                  <span className="text-[10px] font-medium text-white/30 tracking-widest uppercase">Interviewer</span>
                </div>
              </a>

              {/* Nav */}
              <nav className="flex items-center gap-3">
                <a
                  href="#"
                  className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all duration-200"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Docs
                </a>
                <button className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 hover:border-white/15 transition-all duration-200">
                  Sign In
                </button>
                <button className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-sm font-semibold text-white hover:from-blue-500 hover:to-blue-400 shadow-glow-sm transition-all duration-200">
                  Get Started
                </button>
              </nav>
            </div>
            {/* Gradient line at bottom */}
            <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
          </header>

          <main className="max-w-7xl mx-auto px-6 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
            </Routes>
          </main>

          {/* Footer */}
          <footer className="border-t border-white/5 mt-20">
            <div className="max-w-7xl mx-auto px-6 py-12">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
                    <Mic className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-sm font-semibold text-white/40">Agentic AI Interviewer</span>
                </div>
                <div className="flex items-center gap-6 text-sm text-white/30">
                  <a href="#" className="hover:text-white/60 transition-colors">Privacy</a>
                  <a href="#" className="hover:text-white/60 transition-colors">Terms</a>
                  <a href="#" className="hover:text-white/60 transition-colors">Contact</a>
                </div>
                <p className="text-xs text-white/20">© 2026 Agentic AI Voice Interview Platform</p>
              </div>
            </div>
          </footer>
        </div>
      </Router>
    </ErrorBoundary>
  )
}

export default App
