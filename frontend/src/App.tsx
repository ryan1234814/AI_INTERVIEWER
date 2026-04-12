import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'

function App() {
  return (
    <Router>
      <div className="min-h-screen selection:bg-blue-500/30">
        <div className="hero-glow" />
        
        <header className="sticky top-0 z-50 glass-card border-b border-white/5 px-6 py-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-extrabold tracking-tight">
              <span className="gradient-text">Agentic AI</span>
              <span className="text-white ml-2 opacity-90">Interviewer</span>
            </h1>
            
            <nav className="flex items-center gap-6">
              <a href="#" className="text-sm font-medium text-white/60 hover:text-white transition-colors">Documentation</a>
              <button className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-all">
                Login
              </button>
            </nav>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-12">
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </main>
        
        <footer className="py-12 border-t border-white/5 text-center text-white/40 text-sm">
          <p>© 2026 Agentic AI Voice Interview Platform. Powered by Deepgram & Groq.</p>
        </footer>
      </div>
    </Router>
  )
}

export default App
