import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, BarChart3, Upload, Users, Shield, Cpu, ChevronLeft } from 'lucide-react';
import SetupInterview from '../components/Setup/SetupInterview';
import InterviewSession from '../components/Interview/InterviewSession';

type AppState = 'landing' | 'setup' | 'interview' | 'report';

const Home: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('landing');
  const [interviewData, setInterviewData] = useState<any>(null);

  const startSetup = () => setAppState('setup');
  
  const handleSetupSuccess = (data: any) => {
    setInterviewData(data);
    setAppState('interview');
  };

  const backToLanding = () => setAppState('landing');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <div className="relative">
      {/* Navigation for internal app states */}
      {appState !== 'landing' && (
        <button 
          onClick={backToLanding}
          className="absolute -top-16 left-0 flex items-center gap-2 text-white/40 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          Back to Overview
        </button>
      )}

      <AnimatePresence mode="wait">
        {appState === 'landing' && (
          <motion.div 
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-24"
          >
            {/* Hero Section */}
            <section className="text-center space-y-8 py-12">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium"
              >
                <Cpu className="w-4 h-4" />
                Powered by Llama 3 & Deepgram Nova-2
              </motion.div>
              
              <motion.h2 className="text-6xl md:text-7xl font-extrabold tracking-tight max-w-4xl mx-auto leading-[1.1]">
                Experience the Future of <br />
                <span className="gradient-text">Technical Hiring</span>
              </motion.h2>
              
              <motion.p className="text-white/50 text-xl max-w-2xl mx-auto font-light">
                Conduct intelligent, natural voice-based interviews with our sophisticated multi-agent system. Seamless, cost-effective, and production-ready.
              </motion.p>

              <div className="flex flex-wrap justify-center gap-4 pt-4">
                <button 
                  onClick={startSetup}
                  className="px-8 py-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
                >
                  <Mic className="w-5 h-5" />
                  Start Demo Interview
                </button>
                <button className="px-8 py-4 rounded-full bg-white/5 hover:bg-white/10 text-white font-semibold border border-white/10 transition-all">
                  View Sample Report
                </button>
              </div>
            </section>

            {/* Feature Grids */}
            <motion.section 
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <motion.div variants={itemVariants} onClick={startSetup} className="glass-card p-8 rounded-3xl hover-scale cursor-pointer group">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:bg-blue-500/20 transition-colors">
                  <Upload className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold mb-3">Setup Interview</h3>
                <p className="text-white/50 leading-relaxed">
                  Upload job descriptions and candidate resumes. Our agents automatically tailor questions based on the role.
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="glass-card p-8 rounded-3xl hover-scale cursor-pointer group">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:bg-emerald-500/20 transition-colors">
                  <BarChart3 className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold mb-3">View Analytics</h3>
                <p className="text-white/50 leading-relaxed">
                  Get detailed feedback scores on technical accuracy, communication, and relevance for every candidate.
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="glass-card p-8 rounded-3xl hover-scale cursor-pointer group">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 group-hover:bg-purple-500/20 transition-colors">
                  <Users className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold mb-3">Multi-Agent System</h3>
                <p className="text-white/50 leading-relaxed">
                  Powered by CrewAI and Agno, orchestrating multiple specialized agents for a human-like experience.
                </p>
              </motion.div>
            </motion.section>
          </motion.div>
        )}

        {appState === 'setup' && (
          <motion.div 
            key="setup"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
          >
            <SetupInterview onSuccess={handleSetupSuccess} />
          </motion.div>
        )}

        {appState === 'interview' && interviewData && (
          <motion.div 
            key="interview"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <InterviewSession interviewId={interviewData.interview_id.toString()} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Home;
