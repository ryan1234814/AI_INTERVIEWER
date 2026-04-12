import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, Briefcase, User, GraduationCap, ArrowRight, Loader2 } from 'lucide-react';
import { setupInterview } from '../../services/api';

interface Props {
  onSuccess: (data: any) => void;
}

const SetupInterview: React.FC<Props> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return alert('Please upload a resume');
    
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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-10 rounded-[2.5rem] max-w-4xl mx-auto w-full"
    >
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-bold mb-3">Setup Your Interview</h2>
        <p className="text-white/50">Provide the job details and upload your resume to generate a personalized AI interview.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Candidate Info */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-blue-400">
              <User className="w-5 h-5" /> Candidate Information
            </h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">Full Name</label>
              <input 
                required
                type="text" 
                name="candidate_name"
                value={formData.candidate_name}
                onChange={handleInputChange}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 focus:outline-none focus:border-blue-500/50 transition-all"
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
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 focus:outline-none focus:border-blue-500/50 transition-all"
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
                <div className="border-2 border-dashed border-white/10 group-hover:border-blue-500/30 rounded-2xl p-6 text-center transition-all bg-white/[0.02]">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-white/30 group-hover:text-blue-400" />
                  <p className="text-sm text-white/50">
                    {file ? file.name : "Click or drag resume PDF"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Job Info */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-emerald-400">
              <Briefcase className="w-5 h-5" /> Job Details
            </h3>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">Job Title</label>
              <input 
                required
                type="text" 
                name="job_title"
                value={formData.job_title}
                onChange={handleInputChange}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 focus:outline-none focus:border-emerald-500/50 transition-all"
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
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 focus:outline-none focus:border-emerald-500/50 transition-all"
                  placeholder="Backend, DevOps, etc."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Experience Level</label>
                <select 
                  name="experience_level"
                  value={formData.experience_level}
                  onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 focus:outline-none focus:border-emerald-500/50 transition-all"
                >
                  <option value="entry">Entry (0-2y)</option>
                  <option value="mid">Mid (3-5y)</option>
                  <option value="senior">Senior (5y+)</option>
                  <option value="lead">Staff / Lead</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">Career Goal / Interview Target</label>
              <select 
                name="goal"
                value={formData.goal}
                onChange={handleInputChange}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 focus:outline-none focus:border-blue-500/50 transition-all font-bold text-blue-400"
              >
                <option value="Standard Technical Interview" className="text-white">Standard Technical Prep</option>
                <option value="FAANG System Design Interview" className="text-white">FAANG System Design</option>
                <option value="Behavioral Storytelling" className="text-white">Behavioral / Leadership</option>
                <option value="Startup Scale-up Specialist" className="text-white">Startup Core Engineer</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">Interview Length (Questions)</label>
              <select 
                name="num_questions"
                value={formData.num_questions}
                onChange={handleInputChange}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 focus:outline-none focus:border-emerald-500/50 transition-all font-bold text-emerald-400"
              >
                <option value="5" className="text-white">5 Questions (Quick Check)</option>
                <option value="10" className="text-white">10 Questions (Standard)</option>
                <option value="15" className="text-white">15 Questions (Deep Dive)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">Job Description</label>
              <textarea 
                required
                name="job_description"
                value={formData.job_description}
                onChange={handleInputChange}
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 focus:outline-none focus:border-emerald-500/50 transition-all resize-none"
                placeholder="Paste the job description here..."
              />
            </div>
          </div>
        </div>

        <button
          disabled={loading}
          type="submit"
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold text-lg shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Initializing AI Agents...
            </>
          ) : (
            <>
              Generate Interview
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
};

export default SetupInterview;
