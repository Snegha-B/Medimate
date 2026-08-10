import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { Pill, Clock, AlertTriangle, FileText, CheckCircle2, Flame, Calendar, Activity, Lightbulb, TrendingUp, CalendarDays, Plus, CalendarRange, HeartPulse, Trash2 } from 'lucide-react';
import api from '../services/api';
import { showToast } from '../components/Toast';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'reports', or 'appointments'
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [insights, setInsights] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportCorrelations, setReportCorrelations] = useState({});
  const [loading, setLoading] = useState(true);

  // Appointments State
  const [appointments, setAppointments] = useState([]);
  const [showAddAppt, setShowAddAppt] = useState(false);
  const [newAppt, setNewAppt] = useState({
    doctor_name: '',
    hospital_name: '',
    date: '',
    time: '',
    reason: '',
    notes: ''
  });

  // Phase 4 & 5 enhanced analytics
  const [enhancedData, setEnhancedData] = useState({
    overall_adherence_percent: 0,
    taken: 0,
    missed: 0,
    skipped: 0,
    current_streak: 0,
    longest_streak: 0,
    monthly_heatmap: [],
    medicine_timeline: [],
    enhanced_insights: []
  });

  useEffect(() => {
    fetchDashboardData();
    fetchAppointments();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, analyticsRes, insightsRes, reportsRes, enhancedRes] = await Promise.all([
        api.get('/api/dashboard/stats/'),
        api.get('/api/analytics/adherence/'),
        api.get('/api/analytics/insights/'),
        api.get('/api/reports/'),
        api.get('/api/analytics/enhanced/')
      ]);

      setStats(statsRes);
      setAnalytics(analyticsRes);
      setInsights(insightsRes.insights || []);
      setReports(reportsRes || []);
      setEnhancedData(enhancedRes);

      const corrObj = {};
      for (const rep of (reportsRes || [])) {
        try {
          const corrRes = await api.get(`/api/reports/${rep.id}/insights/`);
          corrObj[rep.id] = corrRes.correlations || [];
        } catch (e) {
          console.error(e);
        }
      }
      setReportCorrelations(corrObj);
    } catch (err) {
      console.error('Error fetching dashboard metrics', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      const data = await api.get('/api/appointments/');
      setAppointments(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddAppointment = async (e) => {
    e.preventDefault();
    if (!newAppt.doctor_name || !newAppt.date || !newAppt.time) {
      showToast('Doctor name, date, and time are required.', 'error');
      return;
    }
    try {
      const saved = await api.post('/api/appointments/', newAppt);
      setAppointments([...appointments, saved]);
      setNewAppt({ doctor_name: '', hospital_name: '', date: '', time: '', reason: '', notes: '' });
      setShowAddAppt(false);
      showToast('Appointment scheduled successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error scheduling appointment.', 'error');
    }
  };

  const handleDeleteAppointment = async (id) => {
    try {
      await api.delete(`/api/appointments/${id}/`);
      setAppointments(appointments.filter(a => a.id !== id));
      showToast('Appointment cancelled.', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  const pieData = [
    { name: 'Taken', value: enhancedData.taken || analytics?.taken || 0 },
    { name: 'Missed', value: enhancedData.missed || analytics?.missed || 0 },
    { name: 'Skipped', value: enhancedData.skipped || analytics?.skipped || 0 },
  ];

  const PIE_COLORS = ['#10b981', '#ef4444', '#f59e0b'];
  const allInsights = [...new Set([...insights, ...(enhancedData.enhanced_insights || [])])];

  // Expiry / Low stock counts computed on frontend
  const expiringCount = enhancedData.medicine_timeline.filter(m => {
    if (!m.expiry_date) return false;
    const days = (new Date(m.expiry_date) - new Date()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 30;
  }).length;

  const lowStockCount = enhancedData.medicine_timeline.filter(m => {
    const dailyDoses = 2; // general default estimate
    const supply = (m.remaining_tablets || 0) / dailyDoses;
    return supply <= 5;
  }).length;

  return (
    <div className="page-container">
      {/* Header Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>Healthcare Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0' }}>Comprehensive overview of medications, adherence & health metrics</p>
        </div>

        <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '12px' }}>
          {['overview', 'reports', 'appointments'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? 'var(--primary-gradient)' : 'transparent',
                color: activeTab === tab ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'capitalize'
              }}
            >
              {tab === 'reports' ? 'Lab Reports' : tab === 'appointments' ? 'Doctor Visits' : tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Health Summary Card */}
          <div className="card" style={{ marginBottom: '24px', background: 'var(--primary-gradient)', color: '#ffffff', border: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', opacity: 0.9 }}>
                  <HeartPulse size={18} />
                  <span>HEALTH SUMMARY STATUS</span>
                </div>
                <h2 style={{ fontSize: '32px', fontWeight: '800', margin: '8px 0 4px', color: '#ffffff' }}>
                  {enhancedData.overall_adherence_percent || 0}% Adherence Score
                </h2>
                <p style={{ fontSize: '14px', opacity: 0.9, margin: 0 }}>
                  Streak: 🔥 {enhancedData.current_streak} days current (Longest: {enhancedData.longest_streak} days)
                </p>
              </div>

              {/* Badges Overlay */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {lowStockCount > 0 && <span className="badge badge-amber" style={{ fontSize: '12px', padding: '6px 12px' }}>⚠️ {lowStockCount} Low Stock</span>}
                {expiringCount > 0 && <span className="badge badge-red" style={{ fontSize: '12px', padding: '6px 12px' }}>📅 {expiringCount} Expiring Soon</span>}
                {enhancedData.missed > 0 && <span className="badge badge-red" style={{ fontSize: '12px', padding: '6px 12px' }}>🚨 {enhancedData.missed} Missed Doses</span>}
              </div>
            </div>
          </div>

          {/* Primary Metric Grid Cards (6 Required Dashboard Metrics + Streaks) */}
          <div className="metrics-grid" style={{ marginBottom: '24px' }}>
            <div className="metric-card">
              <div className="metric-icon-box" style={{ background: 'var(--primary-light)', color: 'var(--primary-color)' }}>
                <Pill size={26} />
              </div>
              <div>
                <div className="metric-label">Today's Medicines</div>
                <div className="metric-value">{stats?.todays_medicines_count || 0}</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-box" style={{ background: 'var(--secondary-light)', color: 'var(--secondary-hover)' }}>
                <Clock size={26} />
              </div>
              <div>
                <div className="metric-label">Next Reminder</div>
                <div className="metric-value" style={{ fontSize: '15px', fontWeight: '800' }}>
                  {stats?.next_reminder ? `${stats.next_reminder.scheduled_time} (${stats.next_reminder.medication_name})` : 'All Done'}
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-box" style={{ background: '#e0e7ff', color: '#4338ca' }}>
                <Activity size={26} />
              </div>
              <div>
                <div className="metric-label">Total Medicines</div>
                <div className="metric-value">{stats?.total_medicines || 0}</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-box" style={{ background: '#fef3c7', color: '#b45309' }}>
                <Flame size={26} />
              </div>
              <div>
                <div className="metric-label">Streaks (Current / Max)</div>
                <div className="metric-value" style={{ fontSize: '18px', fontWeight: '800' }}>
                  🔥 {enhancedData.current_streak} / {enhancedData.longest_streak} days
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-box" style={{ background: 'var(--danger-light)', color: 'var(--danger-color)' }}>
                <AlertTriangle size={26} />
              </div>
              <div>
                <div className="metric-label">Missed Doses</div>
                <div className="metric-value" style={{ color: (enhancedData.missed || stats?.missed_doses) > 0 ? 'var(--danger-color)' : 'var(--text-main)' }}>
                  {enhancedData.missed || stats?.missed_doses || 0}
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-box" style={{ background: 'var(--secondary-light)', color: 'var(--secondary-hover)' }}>
                <CheckCircle2 size={26} />
              </div>
              <div>
                <div className="metric-label">Adherence Score</div>
                <div className="metric-value" style={{ color: 'var(--secondary-hover)' }}>
                  {enhancedData.overall_adherence_percent || analytics?.overall_adherence_percent || 0}%
                </div>
              </div>
            </div>
          </div>

          {/* Smart AI Insights */}
          {allInsights.length > 0 && (
            <div className="card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-subtle) 100%)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Lightbulb size={22} color="var(--primary-color)" />
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary-color)', margin: 0 }}>Smart Health Insights</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {allInsights.map((insight, idx) => (
                  <div key={idx} style={{ fontSize: '14px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary-color)', flexShrink: 0 }}></span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weekly Progress Breakdown Chart & Donut Chart */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '24px' }}>
            <div className="card">
              <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="var(--primary-color)" />
                Weekly Progress (Last 7 Days)
              </h3>
              <div style={{ height: '220px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.weekly_progress || []}>
                    <XAxis dataKey="day" stroke="var(--text-secondary)" fontSize={12} />
                    <YAxis stroke="var(--text-secondary)" fontSize={12} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(value) => [`${value}% Adherence`]} />
                    <Bar dataKey="adherence" fill="var(--primary-color)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-main)' }}>
                Dose Breakdown
              </h3>
              <div style={{ position: 'relative', height: '220px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value">
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  fontSize: '24px', fontWeight: '800', color: 'var(--primary-color)'
                }}>
                  {enhancedData.overall_adherence_percent || analytics?.overall_adherence_percent || 0}%
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span style={{ color: '#10b981', fontWeight: '700' }}>Taken: {enhancedData.taken || analytics?.taken || 0}</span>
                <span style={{ color: '#ef4444', fontWeight: '700' }}>Missed: {enhancedData.missed || analytics?.missed || 0}</span>
                <span style={{ color: '#f59e0b', fontWeight: '700' }}>Skipped: {enhancedData.skipped || analytics?.skipped || 0}</span>
              </div>
            </div>
          </div>

          {/* Monthly Adherence Heatmap Grid */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CalendarDays size={18} color="var(--primary-color)" />
              Monthly Progress Heatmap (Last 30 Days)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))', gap: '8px' }}>
              {enhancedData.monthly_heatmap.map((day, idx) => {
                let bgColor = 'var(--bg-subtle)';
                let border = '1px solid var(--border-color)';
                let titleText = `${day.date}: No Doses scheduled`;

                if (day.status === 'good') {
                  bgColor = '#10b981';
                  border = 'none';
                  titleText = `${day.date}: Excellent (${day.adherence}% adherence)`;
                } else if (day.status === 'partial') {
                  bgColor = '#f59e0b';
                  border = 'none';
                  titleText = `${day.date}: Partial (${day.adherence}% adherence)`;
                } else if (day.status === 'missed') {
                  bgColor = '#ef4444';
                  border = 'none';
                  titleText = `${day.date}: Low Adherence (${day.adherence}% adherence)`;
                }

                return (
                  <div
                    key={idx}
                    title={titleText}
                    style={{
                      height: '36px',
                      borderRadius: '8px',
                      background: bgColor,
                      border: border,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: '700',
                      color: day.status === 'no_dose' ? 'var(--text-secondary)' : '#ffffff',
                      cursor: 'help'
                    }}
                  >
                    {day.day}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Medicine Timeline */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} color="var(--primary-color)" />
              Medicine Timeline & Course Completion Rate
            </h3>

            {enhancedData.medicine_timeline.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>No active timelines available.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '500px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      <th style={{ padding: '8px' }}>Medicine</th>
                      <th style={{ padding: '8px' }}>Course Dates</th>
                      <th style={{ padding: '8px' }}>Progress</th>
                      <th style={{ padding: '8px' }}>Doses (Taken/Missed)</th>
                      <th style={{ padding: '8px' }}>Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enhancedData.medicine_timeline.map(med => {
                      const totalCount = med.total_tablets || 30;
                      const remCount = med.remaining_tablets || 0;
                      const progressPct = Math.round(((totalCount - remCount) / totalCount) * 100) || 0;

                      return (
                        <tr key={med.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}>
                          <td style={{ padding: '12px 8px', fontWeight: '700' }}>
                            <div>{med.name}</div>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>{med.category}</span>
                          </td>
                          <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>
                            {med.start_date} → {med.end_date}
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '80px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--primary-color)' }} />
                              </div>
                              <span>{progressPct}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{ color: '#10b981', fontWeight: '700' }}>{med.taken_doses} taken</span>
                            {med.missed_doses > 0 && <span style={{ color: '#ef4444' }}> ({med.missed_doses} missed)</span>}
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <span className={`badge ${med.completed ? 'badge-green' : 'badge-blue'}`}>
                              {med.completed ? 'Completed' : 'In Progress'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'appointments' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <CalendarRange size={18} color="var(--primary-color)" />
              Doctor Visits & Appointments
            </h3>
            <button
              onClick={() => setShowAddAppt(!showAddAppt)}
              className="btn btn-outline"
              style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }}
            >
              {showAddAppt ? 'Cancel' : 'Schedule Appointment'}
            </button>
          </div>

          {showAddAppt && (
            <form onSubmit={handleAddAppointment} style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label" style={{ fontSize: '12px' }}>Doctor Name</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newAppt.doctor_name}
                    onChange={e => setNewAppt({ ...newAppt, doctor_name: e.target.value })}
                    placeholder="e.g. Dr. Smith"
                    required
                  />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label" style={{ fontSize: '12px' }}>Hospital / Clinic Name</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newAppt.hospital_name}
                    onChange={e => setNewAppt({ ...newAppt, hospital_name: e.target.value })}
                    placeholder="e.g. City General Hospital"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label" style={{ fontSize: '12px' }}>Appointment Date</label>
                  <input
                    type="date"
                    className="input-field"
                    value={newAppt.date}
                    onChange={e => setNewAppt({ ...newAppt, date: e.target.value })}
                    required
                  />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label" style={{ fontSize: '12px' }}>Appointment Time</label>
                  <input
                    type="time"
                    className="input-field"
                    value={newAppt.time}
                    onChange={e => setNewAppt({ ...newAppt, time: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label" style={{ fontSize: '12px' }}>Reason for Visit</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newAppt.reason}
                    onChange={e => setNewAppt({ ...newAppt, reason: e.target.value })}
                    placeholder="e.g. Annual physical exam"
                  />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label" style={{ fontSize: '12px' }}>Notes</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newAppt.notes}
                    onChange={e => setNewAppt({ ...newAppt, notes: e.target.value })}
                    placeholder="e.g. Fast 12 hours before checkup"
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ padding: '10px' }}>
                Schedule Appointment
              </button>
            </form>
          )}

          {appointments.length === 0 ? (
            <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)', padding: '12px 0' }}>
              No upcoming appointments scheduled. Linked appointments will show alert updates in the notification header.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {appointments.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', borderRadius: '12px', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: '800', fontSize: '15px' }}>Dr. {a.doctor_name}</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0' }}>
                      🏥 {a.hospital_name || 'Hospital'} | 📅 {a.date} | ⏰ {a.time}
                    </p>
                    {a.reason && <p style={{ fontSize: '12px', color: 'var(--text-main)', margin: '4px 0 0' }}><strong>Reason:</strong> {a.reason}</p>}
                    {a.notes && <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0' }}><em>Note: {a.notes}</em></p>}
                  </div>
                  <button
                    onClick={() => handleDeleteAppointment(a.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', padding: '6px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div>
          {reports.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
              <FileText size={48} color="var(--primary-color)" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ marginBottom: '8px', fontSize: '18px' }}>No Lab Reports Uploaded</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '400px', margin: '0 auto 20px' }}>
                Upload blood test results to evaluate health metrics and generate correlation warnings.
              </p>
            </div>
          ) : (
            reports.map(report => {
              const corrs = reportCorrelations[report.id] || [];
              return (
                <div key={report.id} className="card" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Activity size={22} color="var(--primary-color)" />
                      <strong style={{ fontSize: '16px' }}>Lab Report #{report.id}</strong>
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {new Date(report.uploaded_at).toLocaleDateString()}
                    </span>
                  </div>

                  {corrs.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      {corrs.map((c, i) => (
                        <div key={i} style={{
                          background: 'var(--danger-light)',
                          borderLeft: '4px solid var(--danger-color)',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          marginBottom: '8px',
                          fontSize: '13px',
                          color: 'var(--danger-color)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px'
                        }}>
                          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <strong>Adherence Correlation Notice:</strong> {c.note}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                    {report.values && report.values.map(val => {
                      const badgeClass = val.status === 'high' ? 'badge-red' : val.status === 'low' ? 'badge-amber' : 'badge-green';
                      return (
                        <div key={val.id} style={{
                          background: 'var(--bg-subtle)',
                          padding: '12px',
                          borderRadius: '12px',
                          border: '1px solid var(--border-color)'
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            {val.test_name}
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>
                            {val.value} <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--text-secondary)' }}>{val.unit}</span>
                          </div>
                          <span className={`badge ${badgeClass}`} style={{ marginTop: '8px' }}>
                            {val.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
