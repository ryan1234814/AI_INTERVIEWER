import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Briefcase, User, ArrowRight, ArrowLeft, Loader2, Check, FileText, Sparkles } from 'lucide-react';
import { setupInterview } from '../../services/api';

interface Props {
  onSuccess: (data: any) => void;
}

const steps = [
  { id: 1, label: 'Candidate', icon: User },
  { id: 2, label: 'Job Details', icon: Briefcase },
];

const SetupInterview: React.FC<Props> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    job_title: '',
    job_description: '',
    role: '',
    experience_level: 'mid',
    candidate_name: '',
    candidate_email: '',
    num_questions: '5',
    goal: 'Standard Technical Interview',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const canProceedStep1 = formData.candidate_name && formData.candidate_email && file;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    
    setLoading(true);
    try {
      const data = new FormData();
      data.append('resume', file);
      data.append('job_title', formData.job_title);
      data.append('job_description', formData.job_description);
      data.append('role', formData.role);
      data.append('experience_level', formData.experience_level);
      data.append('candidate_name', formData.candidate_name);
      data.append('candidate_email', formData.candidate_email);
      data.append('num_questions', formData.num_questions);
      data.append('goal', formData.goal);

      const response = await setupInterview(data);
      onSuccess(response);
    } catch (error) {
      console.error('Setup failed:', error);
      alert('Failed to setup interview. Please check the backend connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((step, i) => (
          <React.Fragment key={step.id}>
            <button
              onClick={() => step.id < currentStep && setCurrentStep(step.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                currentStep === step.id
                  ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
                  : currentStep > step.id
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 cursor-pointer hover:bg-emerald-500/20'
                  : 'bg-white/5 border border-white/10 text-white/30'
              }`}
            >
              {currentStep > step.id ? (
                <Check className="w-4 h-4" />
              ) : (
                <step.icon className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div className={`w-8 h-px transition-colors duration-300 ${currentStep > step.id ? 'bg-emerald-500/40' : 'bg-white/10'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card p-10 rounded-[2.5rem]"
            >
              <div className="mb-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                  <User className="w-7 h-7 text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Candidate Information</h2>
                <p className="text-white/40 text-sm">Tell us about the candidate you're interviewing.</p>
              </div>

              <div className="space-y-6 max-w-lg mx-auto">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">Full Name</label>
                  <input 
                    required
                    type="text" 
                    name="candidate_name"
                    value={formData.candidate_name}
                    onChange={handleInputChange}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3.5 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.05] transition-all text-white placeholder:text-white/20"
                    placeholder="John Doe"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">Email Address</label>
                  <input 
                    required
                    type="email" 
                    name="candidate_email"
                    value={formData.candidate_email}
                    onChange={handleInputChange}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3.5 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.05] transition-all text-white placeholder:text-white/20"
                    placeholder="john@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">Resume (PDF)</label>
                  <div className="relative group">
                    <input 
                      required
                      type="file" 
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${
                      file 
                        ? 'border-emerald-500/30 bg-emerald-500/5' 
                        : 'border-white/10 group-hover:border-blue-500/30 bg-white/[0.02]'
                    }`}>
                      {file ? (
                        <div className="space-y-3">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                            <FileText className="w-6 h-6 text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-emerald-400">{file.name}</p>
                            <p className="text-xs text-white/30 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                          </div>
                          <div className="flex items-center justify-center gap-1.5 text-xs text-white/40">
                            <Check className="w-3 h-3 text-emerald-400" />
                            Ready to upload
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <Upload className="w-10 h-10 mx-auto text-white/20 group-hover:text-blue-400 transition-colors" />
                          <div>
                            <p className="text-sm text-white/60 font-medium">
                              Click or drag to upload resume
                            </p>
                            <p className="text-xs text-white/30 mt-1">PDF files only</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-8 max-w-lg mx-auto">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  disabled={!canProceedStep1}
                  className="px-8 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
                >
                  Next Step
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card p-10 rounded-[2.5rem]"
            >
              <div className="mb-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-7 h-7 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Job Details</h2>
                <p className="text-white/40 text-sm">Configure the interview parameters and job requirements.</p>
              </div>

              <div className="space-y-6 max-w-lg mx-auto">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">Job Title</label>
                  <input 
                    required
                    type="text" 
                    name="job_title"
                    value={formData.job_title}
                    onChange={handleInputChange}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3.5 focus:outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition-all text-white placeholder:text-white/20"
                    placeholder="Senior Fullstack Engineer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/70">Target Role</label>
                    <input 
                      required
                      type="text" 
                      name="role"
                      value={formData.role}
                      onChange={handleInputChange}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3.5 focus:outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition-all text-white placeholder:text-white/20"
                      placeholder="Backend, DevOps, etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/70">Experience Level</label>
                    <select 
                      name="experience_level"
                      value={formData.experience_level}
                      onChange={handleInputChange}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3.5 focus:outline-none focus:border-emerald-500/50 transition-all text-white appearance-none"
                    >
                      <option value="entry" className="bg-[#101016]">Entry (0-2y)</option>
                      <option value="mid" className="bg-[#101016]">Mid (3-5y)</option>
                      <option value="senior" className="bg-[#101016]">Senior (5y+)</option>
                      <option value="lead" className="bg-[#101016]">Staff / Lead</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">Interview Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'Standard Technical Interview', label: 'Technical', desc: 'Coding & problem solving' },
                      { value: 'FAANG System Design Interview', label: 'System Design', desc: 'Architecture & scale' },
                      { value: 'Behavioral Storytelling', label: 'Behavioral', desc: 'Leadership & culture' },
                      { value: 'Startup Scale-up Specialist', label: 'Startup', desc: 'Versatile generalist' },
                    ].map((goal) => (
                      <button
                        key={goal.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, goal: goal.value }))}
                        className={`p-3 rounded-xl border text-left transition-all duration-300 ${
                          formData.goal === goal.value
                            ? 'border-blue-500/40 bg-blue-500/10'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                        }`}
                      >
                        <p className={`text-sm font-semibold ${formData.goal === goal.value ? 'text-blue-400' : 'text-white/70'}`}>{goal.label}</p>
                        <p className="text-xs text-white/30 mt-0.5">{goal.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">Interview Length</label>
                  <div className="flex gap-3">
                    {[
                      { value: '5', label: '5 Q', desc: 'Quick' },
                      { value: '10', label: '10 Q', desc: 'Standard' },
                      { value: '15', label: '15 Q', desc: 'Deep Dive' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, num_questions: opt.value }))}
                        className={`flex-1 py-3 rounded-xl border text-center transition-all duration-300 ${
                          formData.num_questions === opt.value
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                        }`}
                      >
                        <p className={`text-sm font-bold ${formData.num_questions === opt.value ? 'text-emerald-400' : 'text-white/70'}`}>{opt.label}</p>
                        <p className="text-xs text-white/30">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">Job Description</label>
                  <textarea 
                    required
                    name="job_description"
                    value={formData.job_description}
                    onChange={handleInputChange}
                    rows={4}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3.5 focus:outline-none focus:border-emerald-500/50 transition-all resize-none text-white placeholder:text-white/20"
                    placeholder="Paste the job description here..."
                  />
                </div>
              </div>

              <div className="flex justify-between mt-8 max-w-lg mx-auto">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-6 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-medium transition-all duration-300 flex items-center gap-2 border border-white/10"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  disabled={loading}
                  type="submit"
                  className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-blue-500/20 hover:shadow-blue-500/30"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Initializing AI Agents...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate Interview
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
};

export default SetupInterview;
