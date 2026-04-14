import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  Users, 
  TrendingUp, 
  Award, 
  Clock, 
  FileText, 
  Download,
  Loader2,
  Search,
  Filter,
  ChevronRight,
  Star,
  Target,
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock3
} from 'lucide-react';
import { listInterviews, downloadReport } from '../../services/api';

interface Interview {
  id: number;
  status: string;
  total_questions: number;
  current_question_index: number;
  started_at: string | null;
  job_title: string;
  candidate_name: string;
}

const InterviewDashboard: React.FC = () => {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    loadInterviews();
  }, []);

  const loadInterviews = async () => {
    try {
      const data = await listInterviews();
      setInterviews(data);
    } catch (error) {
      console.error('Failed to load interviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (interview: Interview) => {
    if (interview.status !== 'completed') return;
    
    setDownloadingId(interview.id);
    try {
      await downloadReport(interview.id, interview.candidate_name);
    } catch (error) {
      console.error('Failed to download report:', error);
      alert('Failed to download report. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Stats calculation
  const totalInterviews = interviews.length;
  const completedInterviews = interviews.filter(i => i.status === 'completed').length;
  const ongoingInterviews = interviews.filter(i => i.status === 'ongoing').length;
  const pendingInterviews = interviews.filter(i => i.status === 'pending').length;
  
  const completionRate = totalInterviews > 0 
    ? Math.round((completedInterviews / totalInterviews) * 100) 
    : 0;

  const filteredInterviews = interviews.filter(interview => {
    const matchesSearch = 
      interview.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interview.job_title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || interview.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'ongoing':
        return <Clock3 className="w-4 h-4 text-blue-400" />;
      default:
        return <XCircle className="w-4 h-4 text-amber-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'ongoing':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
  };

  const getProgressPercentage = (interview: Interview) => {
    if (interview.total_questions === 0) return 0;
    return Math.round((interview.current_question_index / interview.total_questions) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Interview Dashboard</h2>
        <p className="text-white/50">Track all candidate performances and overall stats</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 rounded-2xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-2xl font-bold">{totalInterviews}</span>
          </div>
          <p className="text-sm text-white/50">Total Interviews</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 rounded-2xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-2xl font-bold">{completedInterviews}</span>
          </div>
          <p className="text-sm text-white/50">Completed</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 rounded-2xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Clock3 className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-2xl font-bold">{ongoingInterviews}</span>
          </div>
          <p className="text-sm text-white/50">In Progress</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6 rounded-2xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-2xl font-bold">{completionRate}%</span>
          </div>
          <p className="text-sm text-white/50">Completion Rate</p>
        </motion.div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search candidates or jobs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 focus:outline-none focus:border-blue-500/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-white/50" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-blue-500/50 transition-all"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="ongoing">In Progress</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Interview List */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            Recent Interviews
          </h3>
        </div>
        
        {filteredInterviews.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-white/30" />
            </div>
            <p className="text-white/50">No interviews found</p>
            <p className="text-sm text-white/30 mt-1">
              {searchTerm || filterStatus !== 'all' 
                ? 'Try adjusting your search or filter' 
                : 'Start by creating your first interview'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredInterviews.map((interview, index) => (
              <motion.div
                key={interview.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-6 hover:bg-white/[0.02] transition-colors group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Candidate Info */}
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
                      <span className="text-lg font-bold">
                        {interview.candidate_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-semibold">{interview.candidate_name}</h4>
                      <p className="text-sm text-white/50">{interview.job_title}</p>
                      <p className="text-xs text-white/30 mt-1">
                        ID: #{interview.id} • {interview.started_at 
                          ? new Date(interview.started_at).toLocaleDateString() 
                          : 'Not started'}
                      </p>
                    </div>
                  </div>

                  {/* Progress & Status */}
                  <div className="flex items-center gap-6">
                    {/* Progress Bar */}
                    <div className="w-32 space-y-1">
                      <div className="flex justify-between text-xs text-white/50">
                        <span>Progress</span>
                        <span>{getProgressPercentage(interview)}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${getProgressPercentage(interview)}%` }}
                        />
                      </div>
                      <p className="text-xs text-white/30">
                        {interview.current_question_index} / {interview.total_questions} questions
                      </p>
                    </div>

                    {/* Status Badge */}
                    <div className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${getStatusColor(interview.status)}`}>
                      {getStatusIcon(interview.status)}
                      {interview.status.charAt(0).toUpperCase() + interview.status.slice(1)}
                    </div>

                    {/* Download Button */}
                    <button
                      onClick={() => handleDownload(interview)}
                      disabled={interview.status !== 'completed' || downloadingId === interview.id}
                      className={`p-2 rounded-xl transition-all ${
                        interview.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-white/5 text-white/30 cursor-not-allowed'
                      }`}
                      title={interview.status === 'completed' ? 'Download Report' : 'Complete interview to download'}
                    >
                      {downloadingId === interview.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Performance Insights */}
      {completedInterviews > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card p-6 rounded-2xl"
        >
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
            <Target className="w-5 h-5 text-purple-400" />
            Performance Insights
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Star className="w-4 h-4 text-yellow-400" />
                <span>Average Completion</span>
              </div>
              <p className="text-2xl font-bold">{completionRate}%</p>
              <p className="text-xs text-white/30">
                {completedInterviews} of {totalInterviews} interviews finished
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-white/50">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span>Total Questions Asked</span>
              </div>
              <p className="text-2xl font-bold">
                {interviews.reduce((acc, i) => acc + i.current_question_index, 0)}
              </p>
              <p className="text-xs text-white/30">
                Across all interviews
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Award className="w-4 h-4 text-emerald-400" />
                <span>Success Rate</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400">
                {completionRate >= 80 ? 'Excellent' : completionRate >= 50 ? 'Good' : 'Needs Work'}
              </p>
              <p className="text-xs text-white/30">
                Based on completion rate
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default InterviewDashboard;
