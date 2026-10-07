import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, ArrowRight, ChevronLeft,
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

  // Honest process copy only — the product has no customer metrics yet, so
  // there is no stats bar. These four steps describe the actual pipeline
  // (agents in backend/app/agents, proctoring route, PDF report generator).
  const steps = [
    { n: 'Step 01', title: 'Brief the system', body: 'Paste the job description and upload the candidate resume.' },
    { n: 'Step 02', title: 'Agents prepare', body: 'Role-tailoring, difficulty, and knowledge-retrieval agents assemble the question set.' },
    { n: 'Step 03', title: 'Interview runs live', body: 'The interviewer speaks each question, transcribes the answer, and probes with follow-ups while proctoring watches session integrity.' },
    { n: 'Step 04', title: 'Report is issued', body: 'Answers are validated and scored into a consistent PDF for the hiring committee.' },
  ];

  const features = [
    {
      title: 'Guided Setup',
      description: 'Upload job descriptions and resumes. Specialized agents tailor interview questions to the specific role.',
      action: startSetup as (() => void) | undefined,
    },
    {
      title: 'Real-time Analytics',
      description: 'Track candidate performance with detailed insights, completion rates, and downloadable PDF reports.',
      action: viewDashboard as (() => void) | undefined,
    },
    {
      title: 'Webcam Proctoring',
      description: 'On-device focus, distraction and device detection with an auditable integrity trail per interview.',
      action: undefined,
    },
    {
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
                <h1 className="font-display font-normal text-5xl md:text-6xl tracking-tight leading-[1.05]">
                  Structured, proctored technical interviews{' '}
                  <span className="italic" style={{ color: 'var(--accent-text)' }}>at scale.</span>
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

            {/* Process — replaces the fabricated metrics bar with the real pipeline */}
            <section className="py-12">
              <p className="label-eyebrow mb-3">Process</p>
              <h2 className="font-display font-normal text-2xl md:text-3xl tracking-tight">How an interview runs</h2>
              <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-8">
                {steps.map((step) => (
                  <div key={step.n} className="border-t pt-4" style={{ borderColor: 'var(--card-border)' }}>
                    <p className="text-[11px] font-medium tracking-[0.14em] uppercase" style={{ color: 'var(--accent-text)' }}>
                      {step.n}
                    </p>
                    <h3 className="mt-2 text-sm font-semibold tracking-tight">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>
                      {step.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Capabilities — editorial rows divided by hairlines, no icon tiles */}
            <section className="py-10">
              <p className="label-eyebrow mb-3">Platform</p>
              <h2 className="font-display font-normal text-2xl md:text-3xl tracking-tight">Built for hiring teams</h2>

              <div className="mt-6">
                {features.map((feature, i) => (
                  <div
                    key={feature.title}
                    onClick={feature.action}
                    className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-8 items-baseline py-6 border-t ${
                      i === features.length - 1 ? 'border-b' : ''
                    } ${feature.action ? 'cursor-pointer' : ''}`}
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <span className="md:col-span-1 font-display italic text-lg leading-none" style={{ color: 'var(--foreground-tertiary)' }}>
                      0{i + 1}
                    </span>
                    <h3 className="md:col-span-4 text-base font-semibold tracking-tight">{feature.title}</h3>
                    <p className="md:col-span-6 text-sm leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>
                      {feature.description}
                    </p>
                    <div className="md:col-span-1 flex md:justify-end">
                      {feature.action ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); feature.action?.(); }}
                          className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80 transition-opacity"
                          style={{ color: 'var(--accent-text)' }}
                        >
                          <span>Open</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-sm" style={{ color: 'var(--foreground-tertiary)' }}>—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Final CTA */}
            <section className="py-10">
              <div className="panel rounded-2xl p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h3 className="font-display font-normal text-2xl md:text-3xl tracking-tight">Ready to run your first interview?</h3>
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
