import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, BarChart3, Upload, ArrowRight, ChevronLeft,
  Lock, Target, Zap, Globe, ShieldCheck, FileText,
} from 'lucide-react';
import SetupInterview from '../components/Setup/SetupInterview';
import InterviewSession from '../components/Interview/InterviewSession';
import InterviewDashboard from '../components/Dashboard/InterviewDashboard';
import { useAuth } from '../context/AuthContext';

type AppState = 'landing' | 'setup' | 'interview' | 'dashboard';

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

const Home: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('landing');
  const [interviewData, setInterviewData] = useState<any>(null);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // The setup and dashboard views talk to user-scoped endpoints, so anonymous
  // visitors are sent to sign in instead of bouncing off a 401.
  const openView = (view: AppState) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setAppState(view);
  };

  const startSetup = () => openView('setup');
  const viewDashboard = () => openView('dashboard');

  // Signing out mid-flow drops us back to the public overview rather than
  // leaving a broken view up.
  useEffect(() => {
    if (!isAuthenticated && appState !== 'landing') setAppState('landing');
  }, [isAuthenticated, appState]);

  // Dashboard's "Start Interview" routes home with this flag to open setup.
  useEffect(() => {
    const state = location.state as { openSetup?: boolean } | null;
    if (state?.openSetup) {
      // Consume it so navigating back doesn't reopen the form.
      window.history.replaceState({}, '');
      openView('setup');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, isAuthenticated]);

  const handleSetupSuccess = (data: any) => {
    setInterviewData(data);
    setAppState('interview');
  };

  const backToLanding = () => setAppState('landing');

  const stats = [
    { value: '10x', label: 'Faster Screening', icon: Zap },
    { value: '95%', label: 'Evaluation Accuracy', icon: Target },
    { value: '50+', label: 'Role Integrations', icon: Globe },
    { value: '24/7', label: 'Availability', icon: Lock },
  ];

  const features = [
    {
      icon: Upload,
      title: 'Guided Setup',
      description: 'Upload job descriptions and resumes. Specialized agents tailor interview questions to the specific role.',
      action: startSetup as (() => void) | undefined,
    },
    {
      icon: BarChart3,
      title: 'Real-time Analytics',
      description: 'Track candidate performance with detailed insights, completion rates, and downloadable PDF reports.',
      action: viewDashboard as (() => void) | undefined,
    },
    {
      icon: ShieldCheck,
      title: 'Webcam Proctoring',
      description: 'On-device focus, distraction and device detection with an auditable integrity trail per interview.',
      action: undefined,
    },
    {
      icon: FileText,
      title: 'Structured Reports',
      description: 'Every session produces a consistent, scored report ready for hiring-committee review.',
      action: viewDashboard as (() => void) | undefined,
    },
  ];

  return (
    <div className="relative">
      {appState !== 'landing' && (
        <button
          onClick={backToLanding}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-100"
          style={{ color: 'var(--foreground-tertiary)' }}
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Overview
        </button>
      )}

      <AnimatePresence mode="wait">
        {appState === 'landing' && (
          <motion.div key="landing" {...fade}>
            {/* Hero */}
            <section className="py-16 md:py-24 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="max-w-3xl">
                <span className="chip mb-6">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-text)' }} />
                  AI Interview Platform
                </span>
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
                  Structured, proctored technical interviews{' '}
                  <span style={{ color: 'var(--accent-text)' }}>at scale</span>
                </h1>
                <p className="mt-5 text-lg leading-relaxed max-w-2xl" style={{ color: 'var(--foreground-secondary)' }}>
                  Run consistent voice-based interviews with a multi-agent system that generates questions,
                  validates answers, and produces objective, comparable reports.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button onClick={startSetup} className="btn btn-primary">
                    <Mic className="w-4 h-4" />
                    Start Demo Interview
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button onClick={viewDashboard} className="btn btn-ghost">
                    View Dashboard
                  </button>
                </div>
              </div>
            </section>

            {/* Stats */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4 py-10">
              {stats.map((stat, i) => (
                <div key={i} className="panel rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <stat.icon className="w-4 h-4" style={{ color: 'var(--accent-text)' }} />
                    <span className="label-eyebrow">{stat.label}</span>
                  </div>
                  <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
                </div>
              ))}
            </section>

            {/* Features */}
            <section className="py-10">
              <div className="mb-8">
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Built for hiring teams</h2>
                <p className="mt-2 max-w-2xl" style={{ color: 'var(--foreground-secondary)' }}>
                  A complete interview platform with specialized agents working together.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {features.map((feature, i) => (
                  <div
                    key={i}
                    onClick={feature.action}
                    className={`panel hover-scale rounded-xl p-6 ${feature.action ? 'cursor-pointer' : ''}`}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                      style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}
                    >
                      <feature.icon className="w-5 h-5" style={{ color: 'var(--accent-text)' }} />
                    </div>
                    <h3 className="text-base font-semibold mb-1.5">{feature.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>
                      {feature.description}
                    </p>
                    {feature.action && (
                      <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--accent-text)' }}>
                        <span>Open</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Final CTA */}
            <section className="py-10">
              <div className="panel rounded-2xl p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h3 className="text-xl md:text-2xl font-semibold tracking-tight">Ready to run your first interview?</h3>
                  <p className="mt-2 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                    Set up a role, upload a resume, and start in under two minutes.
                  </p>
                </div>
                <button onClick={startSetup} className="btn btn-primary shrink-0">
                  <Mic className="w-4 h-4" />
                  Launch Interview
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </section>
          </motion.div>
        )}

        {appState === 'setup' && (
          <motion.div key="setup" {...fade}>
            <SetupInterview onSuccess={handleSetupSuccess} />
          </motion.div>
        )}

        {appState === 'interview' && interviewData && (
          <motion.div key="interview" {...fade}>
            <InterviewSession interviewId={interviewData.interview_id.toString()} />
          </motion.div>
        )}

        {appState === 'dashboard' && (
          <motion.div key="dashboard" {...fade}>
            <InterviewDashboard />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Home;
