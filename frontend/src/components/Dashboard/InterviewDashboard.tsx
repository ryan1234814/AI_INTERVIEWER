import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  Users, 
  TrendingUp, 
  Award, 
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
  Clock3,
  ArrowUpRight
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

  const stats = [
    {
      label: 'Total Interviews',
      value: totalInterviews,
      icon: Users,
      color: 'from-blue-500/20 to-blue-600/10',
      iconColor: 'text-blue-400',
      glow: 'stat-glow-blue',
      change: '+12%',
      changeUp: true,
    },
    {
      label: 'Completed',
      value: completedInterviews,
      icon: CheckCircle,
      color: 'from-emerald-500/20 to-emerald-600/10',
      iconColor: 'text-emerald-400',
      glow: 'stat-glow-emerald',
      change: '+8%',
      changeUp: true,
    },
    {
      label: 'In Progress',
      value: ongoingInterviews,
      icon: Clock3,
      color: 'from-blue-500/20 to-blue-600/10',
      iconColor: 'text-blue-400',
      glow: 'stat-glow-blue',
      change: '',
      changeUp: true,
    },
    {
      label: 'Completion Rate',
      value: `${completionRate}%`,
      icon: TrendingUp,
      color: 'from-purple-500/20 to-purple-600/10',
      iconColor: 'text-purple-400',
      glow: 'stat-glow-purple',
      change: completionRate >= 70 ? 'Excellent' : completionRate >= 40 ? 'Good' : 'Needs Work',
      changeUp: completionRate >= 40,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-blue-400/60">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Loading dashboard...</span>
        </div>
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
      <div className="text-center space-y-3">
        <motion.h2 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl md:text-4xl font-bold"
        >
          Interview <span className="gradient-text">Dashboard</span>
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-white/40"
        >
          Track all candidate performances and overall stats
        </motion.p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className={`glass-card p-5 rounded-2xl hover-scale group ${stat.glow}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
              </div>
              {stat.change && (
                <div className={`flex items-center gap-1 text-xs font-bold ${stat.changeUp ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {stat.changeUp && <ArrowUpRight className="w-3 h-3" />}
                  {stat.change}
                </div>
              )}
            </div>
            <p className="text-2xl md:text-3xl font-extrabold">{stat.value}</p>
            <p className="text-xs text-white/40 mt-1 font-medium">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Search and Filter */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col md:flex-row gap-4"
      >
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search candidates or jobs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.05] transition-all text-white placeholder:text-white/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-white/50" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3.5 focus:outline-none focus:border-blue-500/50 transition-all text-white appearance-none"
          >
            <option value="all" className="bg-[#101016]">All Status</option>
            <option value="completed" className="bg-[#101016]">Completed</option>
            <option value="ongoing" className="bg-[#101016]">In Progress</option>
            <option value="pending" className="bg-[#101016]">Pending</option>
          </select>
        </div>
      </motion.div>

      {/* Interview List */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="glass-card rounded-3xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            Recent Interviews
            <span className="text-xs text-white/30 font-normal ml-auto">{filteredInterviews.length} total</span>
          </h3>
        </div>
        
        {filteredInterviews.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white/50 font-medium">No interviews found</p>
            <p className="text-sm text-white/30 mt-1.5">
              {searchTerm || filterStatus !== 'all' 
                ? 'Try adjusting your search or filter criteria' 
                : 'Start by creating your first interview'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredInterviews.map((interview, index) => (
              <motion.div
                key={interview.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                className="p-5 hover:bg-white/[0.02] transition-all duration-300 group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Candidate Info */}
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <span className="text-sm font-bold">
                        {interview.candidate_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-[15px]">{interview.candidate_name}</h4>
                      <p className="text-sm text-white/50">{interview.job_title}</p>
                      <p className="text-xs text-white/30 mt-0.5">
                        #{interview.id} • {interview.started_at 
                          ? new Date(interview.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Not started'}
                      </p>
                    </div>
                  </div>

                  {/* Progress & Status */}
                  <div className="flex items-center gap-5">
                    {/* Progress Bar */}
                    <div className="w-36 space-y-1.5">
                      <div className="flex justify-between text-[11px] text-white/50">
                        <span>Progress</span>
                        <span className="font-medium">{getProgressPercentage(interview)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${getProgressPercentage(interview)}%` }}
                          transition={{ duration: 0.5, delay: index * 0.03 }}
                        />
                      </div>
                      <p className="text-[10px] text-white/25">
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
                      className={`p-2.5 rounded-xl transition-all duration-300 ${
                        interview.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:scale-105'
                          : 'bg-white/5 text-white/20 cursor-not-allowed'
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
      </motion.div>

      {/* Performance Insights */}
      {completedInterviews > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-8 rounded-3xl"
        >
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
            <Target className="w-5 h-5 text-purple-400" />
            Performance Insights
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Star className="w-4 h-4 text-amber-400" />
                <span>Average Completion</span>
              </div>
              <p className="text-3xl font-extrabold gradient-text">{completionRate}%</p>
              <p className="text-xs text-white/30">
                {completedInterviews} of {totalInterviews} interviews finished
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-sm text-white/50">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span>Total Questions Asked</span>
              </div>
              <p className="text-3xl font-extrabold">
                {interviews.reduce((acc, i) => acc + i.current_question_index, 0)}
              </p>
              <p className="text-xs text-white/30">
                Across all interviews
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Award className="w-4 h-4 text-emerald-400" />
                <span>Success Rate</span>
              </div>
              <p className={`text-3xl font-extrabold ${completionRate >= 80 ? 'text-emerald-400' : completionRate >= 50 ? 'text-blue-400' : 'text-amber-400'}`}>
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
