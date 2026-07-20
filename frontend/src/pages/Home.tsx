import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, BarChart3, Upload, Users, Shield, Cpu, ChevronLeft, LayoutDashboard, ArrowRight, Zap, Globe, Lock, Star, Quote, Target } from 'lucide-react';
import SetupInterview from '../components/Setup/SetupInterview';
import InterviewSession from '../components/Interview/InterviewSession';
import InterviewDashboard from '../components/Dashboard/InterviewDashboard';

type AppState = 'landing' | 'setup' | 'interview' | 'dashboard';

const FloatingOrb: React.FC<{ className: string; delay?: number }> = ({ className, delay = 0 }) => (
  <motion.div
    className={`absolute rounded-full blur-3xl pointer-events-none ${className}`}
    animate={{
      y: [0, -30, 0],
      x: [0, 15, 0],
      scale: [1, 1.1, 1],
    }}
    transition={{
      duration: 8,
      repeat: Infinity,
      delay,
      ease: 'easeInOut',
    }}
  />
);

const Home: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('landing');
  const [interviewData, setInterviewData] = useState<any>(null);

  const startSetup = () => setAppState('setup');
  const viewDashboard = () => setAppState('dashboard');
  
  const handleSetupSuccess = (data: any) => {
    setInterviewData(data);
    setAppState('interview');
  };

  const backToLanding = () => setAppState('landing');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { y: 24, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
  };

  const stats = [
    { value: '10x', label: 'Faster Hiring', icon: Zap, color: 'text-blue-400', glow: 'stat-glow-blue' },
    { value: '95%', label: 'Accuracy Rate', icon: Target, color: 'text-emerald-400', glow: 'stat-glow-emerald' },
    { value: '50+', label: 'Integrations', icon: Globe, color: 'text-purple-400', glow: 'stat-glow-purple' },
    { value: '24/7', label: 'Availability', icon: Lock, color: 'text-amber-400', glow: 'stat-glow-amber' },
  ];

  const features = [
    {
      icon: Upload,
      title: 'Smart Setup',
      description: 'Upload job descriptions and resumes. Our AI agents automatically tailor interview questions to the specific role.',
      color: 'from-blue-500/20 to-blue-600/10',
      iconColor: 'text-blue-400',
      action: startSetup,
    },
    {
      icon: BarChart3,
      title: 'Real-time Analytics',
      description: 'Track candidate performance with detailed insights, completion rates, and downloadable PDF reports.',
      color: 'from-emerald-500/20 to-emerald-600/10',
      iconColor: 'text-emerald-400',
      action: viewDashboard,
    },
    {
      icon: Users,
      title: 'Multi-Agent System',
      description: 'Powered by Llama 3 with specialized agents for question generation, difficulty pacing, and answer validation.',
      color: 'from-purple-500/20 to-purple-600/10',
      iconColor: 'text-purple-400',
      action: undefined,
    },
    {
      icon: LayoutDashboard,
      title: 'Command Center',
      description: 'Comprehensive dashboard to manage all interviews, filter by status, and access candidate reports instantly.',
      color: 'from-amber-500/20 to-amber-600/10',
      iconColor: 'text-amber-400',
      action: viewDashboard,
    },
  ];

  const testimonials = [
    {
      name: 'Sarah Chen',
      role: 'VP of Engineering, TechScale',
      quote: 'Cut our hiring time by 70%. The AI interviews are remarkably thorough and the candidate experience is outstanding.',
      rating: 5,
    },
    {
      name: 'Marcus Rivera',
      role: 'CTO, DataFlow',
      quote: 'The multi-agent system asks follow-up questions that dig deeper than most human interviewers. Incredibly impressive.',
      rating: 5,
    },
    {
      name: 'Aisha Patel',
      role: 'Head of Talent, NexGen',
      quote: 'We process 3x more candidates without sacrificing quality. The PDF reports are actionable and well-structured.',
      rating: 5,
    },
  ];

  return (
    <div className="relative">
      {/* Navigation for internal app states */}
      {appState !== 'landing' && (
        <button 
          onClick={backToLanding}
          className="absolute -top-16 left-0 flex items-center gap-2 text-white/40 hover:text-white transition-all duration-300 group"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
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
          >
            {/* Hero Section */}
            <section className="relative text-center space-y-10 py-20 overflow-hidden">
              {/* Floating orbs */}
              <FloatingOrb className="w-[500px] h-[500px] bg-blue-500/8 top-0 -left-60" delay={0} />
              <FloatingOrb className="w-[400px] h-[400px] bg-emerald-500/6 top-20 -right-40" delay={2} />
              <FloatingOrb className="w-[300px] h-[300px] bg-purple-500/5 bottom-0 left-1/3" delay={4} />

              {/* Floating particles */}
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full bg-blue-400/30"
                  style={{
                    top: `${20 + Math.random() * 60}%`,
                    left: `${10 + Math.random() * 80}%`,
                  }}
                  animate={{
                    y: [-20, 20, -20],
                    opacity: [0.2, 0.5, 0.2],
                  }}
                  transition={{
                    duration: 4 + Math.random() * 2,
                    repeat: Infinity,
                    delay: i * 0.5,
                  }}
                />
              ))}

              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium backdrop-blur-sm"
              >
                <Cpu className="w-4 h-4" />
                Powered by Llama 3 & Deepgram Nova-2
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              </motion.div>
              
              {/* Headline */}
              <motion.h2 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.7 }}
                className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight max-w-5xl mx-auto leading-[1.05]"
              >
                Experience the Future of{' '}
                <br className="hidden md:block" />
                <span className="gradient-text">Technical Hiring</span>
              </motion.h2>
              
              {/* Subheadline */}
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-white/40 text-lg md:text-xl max-w-2xl mx-auto font-light leading-relaxed"
              >
                Conduct intelligent, natural voice-based interviews with our sophisticated multi-agent system. 
                Seamless, cost-effective, and production-ready.
              </motion.p>

              {/* CTA Buttons */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex flex-wrap justify-center gap-4 pt-2"
              >
                <button 
                  onClick={startSetup}
                  className="group px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold transition-all duration-300 shadow-lg shadow-blue-500/25 flex items-center gap-3 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Mic className="w-5 h-5" />
                  Start Demo Interview
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <button className="px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white font-semibold border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm">
                  View Sample Report
                </button>
              </motion.div>

              {/* Decorative line */}
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            </section>

            {/* Stats Section */}
            <motion.section 
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 py-12"
            >
              {stats.map((stat, i) => (
                <motion.div
                  key={i}
                  variants={itemVariants}
                  className={`glass-card p-6 rounded-3xl text-center hover-scale group ${stat.glow}`}
                >
                  <div className="flex justify-center mb-3">
                    <stat.icon className={`w-6 h-6 ${stat.color} opacity-60 group-hover:opacity-100 transition-opacity`} />
                  </div>
                  <p className={`text-3xl md:text-4xl font-extrabold ${stat.color}`}>{stat.value}</p>
                  <p className="text-sm text-white/40 mt-1 font-medium">{stat.label}</p>
                </motion.div>
              ))}
            </motion.section>

            {/* Feature Grid */}
            <motion.section 
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
              className="py-16"
            >
              <motion.div variants={itemVariants} className="text-center mb-12">
                <h3 className="text-3xl md:text-4xl font-bold mb-4">
                  Everything you need to{' '}
                  <span className="gradient-text-subtle">hire smarter</span>
                </h3>
                <p className="text-white/40 max-w-xl mx-auto">
                  A complete AI-powered interview platform with specialized agents working together.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {features.map((feature, i) => (
                  <motion.div
                    key={i}
                    variants={itemVariants}
                    onClick={feature.action}
                    className={`glass-card p-8 rounded-3xl hover-scale group ${feature.action ? 'cursor-pointer' : ''} gradient-border`}
                  >
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                      <feature.icon className={`w-7 h-7 ${feature.iconColor}`} />
                    </div>
                    <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                    <p className="text-white/50 leading-relaxed text-[15px]">
                      {feature.description}
                    </p>
                    {feature.action && (
                      <div className="mt-6 flex items-center gap-2 text-sm font-medium text-white/60 group-hover:text-white/90 transition-colors">
                        <span>Get started</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* Testimonials */}
            <motion.section
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
              className="py-16"
            >
              <motion.div variants={itemVariants} className="text-center mb-12">
                <h3 className="text-3xl md:text-4xl font-bold mb-4">
                  Trusted by{' '}
                  <span className="gradient-text">forward-thinking teams</span>
                </h3>
                <p className="text-white/40 max-w-xl mx-auto">
                  See what engineering leaders are saying about our platform.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {testimonials.map((testimonial, i) => (
                  <motion.div
                    key={i}
                    variants={itemVariants}
                    className="glass-card p-8 rounded-3xl hover-scale relative overflow-hidden"
                  >
                    <Quote className="absolute top-6 right-6 w-10 h-10 text-white/5" />
                    <div className="flex gap-1 mb-4">
                      {[...Array(testimonial.rating)].map((_, j) => (
                        <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                    <p className="text-white/70 leading-relaxed mb-6 text-[15px] italic">
                      &ldquo;{testimonial.quote}&rdquo;
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-emerald-500/30 flex items-center justify-center text-sm font-bold">
                        {testimonial.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{testimonial.name}</p>
                        <p className="text-xs text-white/40">{testimonial.role}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* Final CTA */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="py-16 text-center"
            >
              <div className="glass-card p-12 md:p-16 rounded-[3rem] relative overflow-hidden gradient-border">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-emerald-500/5 pointer-events-none" />
                <div className="relative space-y-6">
                  <h3 className="text-3xl md:text-4xl font-bold">
                    Ready to transform your{' '}
                    <span className="gradient-text">hiring process?</span>
                  </h3>
                  <p className="text-white/40 max-w-lg mx-auto">
                    Start conducting AI-powered interviews in under 2 minutes.
                  </p>
                  <button 
                    onClick={startSetup}
                    className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-semibold transition-all shadow-xl shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-3 mx-auto"
                  >
                    <Mic className="w-5 h-5" />
                    Launch Your First Interview
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.section>
          </motion.div>
        )}

        {appState === 'setup' && (
          <motion.div 
            key="setup"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: -20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
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
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <InterviewSession interviewId={interviewData.interview_id.toString()} />
          </motion.div>
        )}

        {appState === 'dashboard' && (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: -20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <InterviewDashboard />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Home;
