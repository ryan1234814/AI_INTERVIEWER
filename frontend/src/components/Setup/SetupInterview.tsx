import React, { useState } from 'react';
import { Upload, Briefcase, User, ArrowRight, ArrowLeft, Loader2, Check, FileText } from 'lucide-react';
import { setupInterview } from '../../services/api';

interface Props {
  onSuccess: (data: any) => void;
}

const steps = [
  { id: 1, label: 'Candidate', icon: User },
  { id: 2, label: 'Job Details', icon: Briefcase },
];

const InterviewTypes = [
  { value: 'Standard Technical Interview', label: 'Technical', desc: 'Coding & problem solving' },
  { value: 'FAANG System Design Interview', label: 'System Design', desc: 'Architecture & scale' },
  { value: 'Behavioral Storytelling', label: 'Behavioral', desc: 'Leadership & culture' },
  { value: 'Startup Scale-up Specialist', label: 'Startup', desc: 'Versatile generalist' },
];

const Lengths = [
  { value: '5', label: '5 Q', desc: 'Quick' },
  { value: '10', label: '10 Q', desc: 'Standard' },
  { value: '15', label: '15 Q', desc: 'Deep dive' },
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
    <div className="max-w-3xl mx-auto w-full">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-3 mb-8">
        {steps.map((step, i) => (
          <React.Fragment key={step.id}>
            <button
              type="button"
              onClick={() => step.id < currentStep && setCurrentStep(step.id)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors"
              style={{
                background: currentStep === step.id ? 'var(--accent-subtle)' : 'transparent',
                borderColor: currentStep === step.id ? 'var(--accent-border)' : 'var(--card-border)',
                color: currentStep > step.id ? 'var(--success)' : currentStep === step.id ? 'var(--accent-text)' : 'var(--foreground-tertiary)',
              }}
            >
              {currentStep > step.id ? (
                <Check className="w-4 h-4" />
              ) : (
                <step.icon className="w-4 h-4" />
              )}
              <span>{step.label}</span>
            </button>
            {i < steps.length - 1 && <div className="w-8 h-px" style={{ background: 'var(--card-border)' }} />}
          </React.Fragment>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {currentStep === 1 && (
          <div className="panel rounded-2xl p-8">
            <div className="mb-8">
              <h2 className="text-xl font-semibold tracking-tight">Candidate information</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--foreground-tertiary)' }}>
                Tell us about the candidate you're interviewing.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="label-eyebrow">Full name</label>
                <input
                  required
                  type="text"
                  name="candidate_name"
                  value={formData.candidate_name}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-1.5">
                <label className="label-eyebrow">Email address</label>
                <input
                  required
                  type="email"
                  name="candidate_email"
                  value={formData.candidate_email}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="john@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="label-eyebrow">Resume (PDF)</label>
                <div className="relative group">
                  <input
                    required
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center transition-colors"
                    style={{
                      borderColor: file ? 'var(--success-border)' : 'var(--input-border)',
                      background: file ? 'var(--success-subtle)' : 'var(--input-bg)',
                    }}
                  >
                    {file ? (
                      <div className="space-y-2">
                        <FileText className="w-8 h-8 mx-auto" style={{ color: 'var(--success)' }} />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>{file.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-tertiary)' }}>{(file.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <div className="inline-flex items-center justify-center gap-1.5 text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                          <Check className="w-3 h-3" style={{ color: 'var(--success)' }} />
                          Ready to upload
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-8 h-8 mx-auto" style={{ color: 'var(--foreground-tertiary)' }} />
                        <p className="text-sm font-medium" style={{ color: 'var(--foreground-secondary)' }}>
                          Click to upload resume
                        </p>
                        <p className="text-xs" style={{ color: 'var(--foreground-tertiary)' }}>PDF files only</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-8">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                disabled={!canProceedStep1}
                className="btn btn-primary"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="panel rounded-2xl p-8">
            <div className="mb-8">
              <h2 className="text-xl font-semibold tracking-tight">Job details</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--foreground-tertiary)' }}>
                Configure the interview parameters and job requirements.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="label-eyebrow">Job title</label>
                <input
                  required
                  type="text"
                  name="job_title"
                  value={formData.job_title}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="Senior Fullstack Engineer"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="label-eyebrow">Target role</label>
                  <input
                    required
                    type="text"
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="input"
                    placeholder="Backend, DevOps, etc."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="label-eyebrow">Experience level</label>
                  <select
                    name="experience_level"
                    value={formData.experience_level}
                    onChange={handleInputChange}
                    className="input theme-select appearance-none"
                  >
                    <option value="entry">Entry (0-2y)</option>
                    <option value="mid">Mid (3-5y)</option>
                    <option value="senior">Senior (5y+)</option>
                    <option value="lead">Staff / Lead</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="label-eyebrow">Interview type</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {InterviewTypes.map((goal) => {
                    const selected = formData.goal === goal.value;
                    return (
                      <button
                        key={goal.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, goal: goal.value }))}
                        className="text-left rounded-lg border p-3 transition-colors"
                        style={{
                          borderColor: selected ? 'var(--accent-border)' : 'var(--card-border)',
                          background: selected ? 'var(--accent-subtle)' : 'transparent',
                        }}
                      >
                        <p className="text-sm font-semibold" style={{ color: selected ? 'var(--accent-text)' : 'var(--foreground-secondary)' }}>{goal.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-tertiary)' }}>{goal.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="label-eyebrow">Interview length</label>
                <div className="flex gap-2.5">
                  {Lengths.map((opt) => {
                    const selected = formData.num_questions === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, num_questions: opt.value }))}
                        className="flex-1 py-2.5 rounded-lg border text-center transition-colors"
                        style={{
                          borderColor: selected ? 'var(--accent-border)' : 'var(--card-border)',
                          background: selected ? 'var(--accent-subtle)' : 'transparent',
                        }}
                      >
                        <p className="text-sm font-semibold" style={{ color: selected ? 'var(--accent-text)' : 'var(--foreground-secondary)' }}>{opt.label}</p>
                        <p className="text-xs" style={{ color: 'var(--foreground-tertiary)' }}>{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="label-eyebrow">Job description</label>
                <textarea
                  required
                  name="job_description"
                  value={formData.job_description}
                  onChange={handleInputChange}
                  rows={4}
                  className="input resize-none"
                  placeholder="Paste the job description here..."
                />
              </div>
            </div>

            <div className="flex justify-between mt-8">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="btn btn-ghost"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                disabled={loading}
                type="submit"
                className="btn btn-primary"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Initializing agents...
                  </>
                ) : (
                  <>
                    <Briefcase className="w-4 h-4" />
                    Generate Interview
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default SetupInterview;
