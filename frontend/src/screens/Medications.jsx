import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, Plus, Sun, Moon, Sunrise, Utensils, Clock, History, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, Volume2, Calendar, ShoppingCart, ShieldAlert, Search, Filter } from 'lucide-react';
import api from '../services/api';
import { useAccessibility } from '../context/AccessibilityContext';
import { readMedicine, stopSpeaking } from '../services/voiceService';
import { showToast } from '../components/Toast';

export default function Medications() {
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDetailId, setExpandedDetailId] = useState(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);
  const navigate = useNavigate();
  const { lang, voiceEnabled, speechSpeed } = useAccessibility();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'reminder', 'expiry'

  const handleReadMedicine = (med) => {
    if (!voiceEnabled) return;
    if (speakingId === med.id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(med.id);
    readMedicine(med, lang, speechSpeed);
    setTimeout(() => setSpeakingId(null), 8000);
  };

  useEffect(() => {
    fetchMeds();
  }, []);

  const fetchMeds = async () => {
    try {
      const data = await api.get('/api/medications/');
      setMeds(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefill = async (medId) => {
    try {
      await api.post(`/api/medications/${medId}/refill/`);
      showToast('Inventory restocked successfully!', 'success');
      fetchMeds();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error restocking medicine.', 'error');
    }
  };

  const toggleDetail = (id) => {
    setExpandedDetailId(expandedDetailId === id ? null : id);
  };

  // Get distinct categories
  const categories = ['all', ...new Set(meds.map(m => m.category).filter(Boolean))];

  // Filtering & Sorting logic
  const filteredMeds = meds
    .filter(med => {
      const nameMatch = med.name.toLowerCase().includes(searchQuery.toLowerCase());
      const statusMatch = statusFilter === 'all' || (med.status || 'Active').toLowerCase() === statusFilter.toLowerCase();
      const catMatch = categoryFilter === 'all' || med.category === categoryFilter;
      return nameMatch && statusMatch && catMatch;
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'reminder') {
        return (a.next_reminder || '09:00').localeCompare(b.next_reminder || '09:00');
      } else if (sortBy === 'expiry') {
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return new Date(a.expiry_date) - new Date(b.expiry_date);
      }
      return 0;
    });

  if (loading) {
    return <div className="spinner"></div>;
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>My Medications</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0' }}>Manage active courses, remaining tablets & history</p>
        </div>

        <button
          onClick={() => navigate('/add')}
          className="btn btn-primary"
          style={{ width: 'auto', padding: '10px 20px' }}
        >
          <Plus size={18} />
          <span>Add Medicine</span>
        </button>
      </div>

      {/* ===================== PHASE 5: Search & Filter bar ===================== */}
      <div className="card" style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-subtle)', padding: '10px 14px', borderRadius: '12px', flex: 1, border: '1px solid var(--border-color)', minWidth: '240px' }}>
            <Search size={18} color="var(--text-secondary)" />
            <input
              type="text"
              placeholder="Search medicine by name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', width: '100%', outline: 'none', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: '12px', background: 'var(--bg-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', fontWeight: '600', fontSize: '13px' }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="upcoming">Upcoming</option>
            </select>

            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: '12px', background: 'var(--bg-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', fontWeight: '600', fontSize: '13px', textTransform: 'capitalize' }}
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: '12px', background: 'var(--bg-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', fontWeight: '600', fontSize: '13px' }}
            >
              <option value="name">Sort Alphabetically</option>
              <option value="reminder">Sort by Reminder</option>
              <option value="expiry">Sort by Expiry</option>
            </select>
          </div>
        </div>
      </div>

      {filteredMeds.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Pill size={42} color="var(--primary-color)" />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>No Medications Found</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '15px' }}>
            No medicine matching the current filters or query was found.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {filteredMeds.map(med => {
            const remTabs = med.remaining_tablets ?? med.total_tablets ?? 30;
            const totTabs = med.total_tablets || 30;
            const tabPercent = Math.min(100, Math.max(0, Math.round((remTabs / totTabs) * 100)));
            const statusLabel = med.status || 'Active';
            const isCompleted = statusLabel === 'Completed';
            const isLowStock = med.days_supply_remaining !== null && med.days_supply_remaining <= 5;
            const hasExpired = med.expiry_alert_level === 'expired';
            const isExpanded = expandedDetailId === med.id;

            return (
              <div
                key={med.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  border: hasExpired ? '1px solid var(--danger-color)' : '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onClick={() => toggleDetail(med.id)}
              >
                {/* Header Title & Badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--primary-color)', margin: 0 }}>
                        {med.name}
                      </h3>
                      <span className={`badge ${isCompleted ? 'badge-amber' : hasExpired ? 'badge-red' : 'badge-green'}`}>
                        {hasExpired ? 'Expired' : statusLabel}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {med.category && (
                        <span className="badge badge-blue" style={{ fontSize: '11px' }}>
                          {med.category}
                        </span>
                      )}
                      <span className="badge badge-blue" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Utensils size={12} />
                        {med.timing_instruction === 'before_food' ? 'Before Food' : 'After Food'}
                      </span>
                    </div>
                  </div>

                  {/* Slot Icons */}
                  <div style={{ display: 'flex', gap: '6px', color: 'var(--text-secondary)' }}>
                    {med.morning && <span title="Morning Dose"><Sunrise size={20} color="#f97316" /></span>}
                    {med.afternoon && <span title="Afternoon Dose"><Sun size={20} color="#eab308" /></span>}
                    {med.night && <span title="Night Dose"><Moon size={20} color="#6366f1" /></span>}
                  </div>
                </div>

                {/* Remaining Tablets Progress Bar */}
                <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Remaining Tablets:</span>
                    <span style={{ color: remTabs < 5 ? 'var(--danger-color)' : 'var(--text-main)' }}>
                      {remTabs} / {totTabs} Tablets
                    </span>
                  </div>
                  <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${tabPercent}%`,
                      backgroundColor: remTabs < 5 ? 'var(--danger-color)' : 'var(--secondary-color)',
                      transition: 'width 0.3s ease'
                    }}></div>
                  </div>
                </div>

                {/* Info Grid (Visible on Expand) */}
                {isExpanded ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }} onClick={e => e.stopPropagation()}>
                    {/* Placeholder image representation */}
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--primary-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                        <Pill size={24} />
                      </div>
                      <div>
                        <div style={{ fontWeight: '800', fontSize: '14px' }}>Medicine Specifications</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Batch: {med.batch_number || 'N/A'}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700', display: 'block' }}>DOSAGE & FREQ</span>
                        <strong style={{ color: 'var(--text-main)' }}>{med.dosage} ({med.frequency})</strong>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700', display: 'block' }}>NEXT REMINDER</span>
                        <strong style={{ color: 'var(--primary-color)' }}>{med.next_reminder || '09:00'}</strong>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700', display: 'block' }}>DAYS REMAINING</span>
                        <strong style={{ color: 'var(--text-main)' }}>{med.days_remaining} Days</strong>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700', display: 'block' }}>START / END DATE</span>
                        <strong style={{ color: 'var(--text-main)' }}>{med.start_date} → {med.end_date}</strong>
                      </div>

                      {med.expiry_date && (
                        <div>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700', display: 'block' }}>EXPIRY DATE</span>
                          <strong style={{ color: hasExpired ? 'var(--danger-color)' : 'var(--text-main)' }}>{med.expiry_date}</strong>
                        </div>
                      )}
                    </div>

                    {/* Expiry alerts / Low stock warnings */}
                    {isLowStock && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b45309', background: '#fef3c7', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                        <ShieldAlert size={14} />
                        <span>Medicine running low ({med.days_supply_remaining} days left)</span>
                      </div>
                    )}

                    {/* Actions Row */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {voiceEnabled && (
                        <button
                          onClick={() => handleReadMedicine(med)}
                          className="btn btn-primary"
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '10px 16px', borderRadius: '12px',
                            fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                            justifyContent: 'center'
                          }}
                        >
                          <Volume2 size={16} />
                          <span>{speakingId === med.id ? '🔊 Speaking...' : '🔊 Read Medicine'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleRefill(med.id)}
                        className="btn btn-outline"
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '10px 16px', borderRadius: '12px',
                          fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                          justifyContent: 'center'
                        }}
                      >
                        <ShoppingCart size={16} />
                        <span>Restock</span>
                      </button>
                    </div>

                    {/* Expandable History Log */}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      <div style={{ fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                        <History size={14} />
                        <span>Medication Log History</span>
                      </div>
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {med.history && med.history.length > 0 ? (
                          med.history.map(log => (
                            <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '6px 8px', borderRadius: '8px', background: 'var(--bg-subtle)' }}>
                              <span>{log.status === 'taken' ? '✔️ Taken' : log.status === 'missed' ? '❌ Missed' : '⏰ Skipped'}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{new Date(log.logged_at).toLocaleString()}</span>
                            </div>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No logs yet.</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                    Tap to expand full details, dosage schedule, & logs.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
