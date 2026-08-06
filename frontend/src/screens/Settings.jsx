import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, LogOut, Smartphone, Share2, Copy, ShieldOff, Link2, User, Globe, Volume2, Accessibility, ZoomIn, Sun, Contrast, Trash2, Heart, Plus, Download, Upload, ShieldCheck } from 'lucide-react';
import api, { clearAuthSession } from '../services/api';
import { showToast } from '../components/Toast';
import { useAccessibility } from '../context/AccessibilityContext';
import { LANGUAGE_OPTIONS } from '../translations/index';

export default function Settings() {
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || 'Patient';
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [shareLink, setShareLink] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);

  // Caregivers state
  const [caregivers, setCaregivers] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCaregiver, setNewCaregiver] = useState({
    name: '',
    relationship: 'other',
    mobile: '',
    email: '',
    is_emergency_contact: false
  });

  const { settings, updateSettings } = useAccessibility();
  const fileInputRef = useRef(null);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setRemindersEnabled(true);
    }
    fetchCaregivers();
  }, []);

  const fetchCaregivers = async () => {
    try {
      const data = await api.get('/api/caregivers/');
      setCaregivers(data);
    } catch (err) {
      console.error('Error fetching caregivers:', err);
    }
  };

  const handleAddCaregiver = async (e) => {
    e.preventDefault();
    if (!newCaregiver.name) {
      showToast('Caregiver name is required', 'error');
      return;
    }
    try {
      const saved = await api.post('/api/caregivers/', newCaregiver);
      setCaregivers([...caregivers, saved]);
      setNewCaregiver({
        name: '',
        relationship: 'other',
        mobile: '',
        email: '',
        is_emergency_contact: false
      });
      setShowAddForm(false);
      showToast('Caregiver added successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error adding caregiver.', 'error');
    }
  };

  const handleDeleteCaregiver = async (id) => {
    try {
      await api.delete(`/api/caregivers/${id}/`);
      setCaregivers(caregivers.filter(cg => cg.id !== id));
      showToast('Caregiver removed.', 'info');
    } catch (err) {
      console.error(err);
      showToast('Error removing caregiver.', 'error');
    }
  };

  const handleToggleReminders = async () => {
    if (!('Notification' in window)) {
      showToast('Notifications not supported on this browser', 'error');
      return;
    }
    if (remindersEnabled) {
      setRemindersEnabled(false);
      showToast('Reminders disabled for this session', 'info');
    } else {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setRemindersEnabled(true);
        showToast('Reminders enabled successfully!', 'success');
      } else {
        showToast('Permission denied in browser settings', 'error');
      }
    }
  };

  const handleGenerateShareLink = async () => {
    setShareLoading(true);
    try {
      const data = await api.post('/api/share/generate/', {});
      const fullUrl = `${window.location.origin}/shared/${data.token}`;
      setShareLink(fullUrl);
      showToast('Share link generated!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error generating share link.', 'error');
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink).then(() => {
        showToast('Link copied to clipboard!', 'success');
      }).catch(() => {
        showToast('Could not copy. Please copy manually.', 'info');
      });
    }
  };

  const handleRevokeLink = async () => {
    try {
      await api.post('/api/share/revoke/', {});
      setShareLink(null);
      showToast('Share link revoked. Caregivers can no longer view data.', 'info');
    } catch (err) {
      console.error(err);
      showToast('Error revoking share link.', 'error');
    }
  };

  // Phase 5 Backup & Restore handlers
  const handleExportCSV = () => {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    const exportUrl = `${api.defaults.baseURL || 'http://127.0.0.1:8000'}/api/reports/export/?token=${token}`;
    window.open(exportUrl, '_blank');
    showToast('Adherence report download started.', 'success');
  };

  const handleBackupJSON = () => {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    const backupUrl = `${api.defaults.baseURL || 'http://127.0.0.1:8000'}/api/settings/backup/?token=${token}`;
    window.open(backupUrl, '_blank');
    showToast('Backup JSON file download started.', 'success');
  };

  const handleRestoreJSON = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const restoreFile = e.target.files[0];
      const formData = new FormData();
      formData.append('file', restoreFile);
      try {
        await api.post('/api/settings/restore/', formData);
        showToast('Database restore complete! Refreshing page...', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        console.error(err);
        showToast('Error restoring backup. Ensure JSON file is correct.', 'error');
      }
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    showToast('Logged out successfully', 'info');
    navigate('/login');
  };

  // Row component for toggle settings rows
  const SettingRow = ({ icon, title, subtitle, children }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {icon}
        <div>
          <div style={{ fontWeight: '600', fontSize: 'calc(var(--font-size-base, 14px) + 1px)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );

  const Toggle = ({ checked, onChange }) => (
    <div
      onClick={onChange}
      style={{
        width: '48px', height: '26px', borderRadius: '13px',
        background: checked ? 'var(--primary-color)' : 'var(--border-color)',
        cursor: 'pointer', position: 'relative', transition: 'background 0.3s',
        flexShrink: 0
      }}
    >
      <div style={{
        position: 'absolute', top: '3px',
        left: checked ? '24px' : '3px',
        width: '20px', height: '20px', borderRadius: '50%',
        background: '#ffffff', transition: 'left 0.25s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
      }} />
    </div>
  );

  return (
    <div className="page-container" style={{ maxWidth: '680px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '24px', color: 'var(--text-main)' }}>Settings & Preferences</h1>

      {/* Account Info Card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'var(--primary-gradient)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: '800', fontSize: '22px'
          }}>
            {username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>{username}</h2>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>MediMate Active Account</span>
          </div>
        </div>
        <button onClick={() => navigate('/profile')} className="btn btn-outline" style={{ width: 'auto', padding: '8px 16px', fontSize: '13px' }}>
          <User size={16} />
          <span>Edit Profile</span>
        </button>
      </div>

      {/* App Preferences Section */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px', color: 'var(--primary-color)' }}>App Preferences</h3>
        <SettingRow
          icon={<Bell size={22} color="var(--primary-color)" />}
          title="Push Reminders"
          subtitle="Dose schedule notifications"
        >
          <Toggle checked={remindersEnabled} onChange={handleToggleReminders} />
        </SettingRow>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Smartphone size={22} color="var(--primary-color)" />
            <div>
              <div style={{ fontWeight: '600', fontSize: '15px' }}>MediMate Version</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>v3.0 AI Smart Medication Assistant</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== PHASE 3: Language & Voice Card ===================== */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Globe size={18} />
          Language & Voice
        </h3>

        {/* Language Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontWeight: '600', fontSize: '14px', display: 'block', marginBottom: '8px' }}>Preferred Language</label>
          <select
            value={settings.preferred_language || 'en'}
            onChange={e => updateSettings({ preferred_language: e.target.value })}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: '12px',
              border: '1.5px solid var(--border-color)',
              background: 'var(--bg-subtle)', color: 'var(--text-main)',
              fontSize: '15px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            {LANGUAGE_OPTIONS.map(opt => (
              <option key={opt.code} value={opt.code}>{opt.label}</option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            Buttons, reminders, and voice messages will use the selected language.
          </p>
        </div>

        <SettingRow
          icon={<Volume2 size={22} color="var(--primary-color)" />}
          title="Voice Reminders"
          subtitle="Speak medicine reminders aloud"
        >
          <Toggle
            checked={settings.voice_enabled}
            onChange={() => updateSettings({ voice_enabled: !settings.voice_enabled })}
          />
        </SettingRow>

        {/* Speech Speed Slider */}
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontWeight: '600', fontSize: '14px' }}>Speech Speed</span>
            <span style={{ fontSize: '14px', color: 'var(--primary-color)', fontWeight: '700' }}>{settings.speech_speed}x</span>
          </div>
          <input
            type="range"
            min="0.5" max="2.0" step="0.1"
            value={settings.speech_speed || 1.0}
            onChange={e => updateSettings({ speech_speed: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--primary-color)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            <span>0.5x Slow</span>
            <span>1.0x Normal</span>
            <span>2.0x Fast</span>
          </div>
        </div>

        {/* Reminder Repeat Count */}
        <div style={{ padding: '14px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontWeight: '600', fontSize: '14px' }}>Reminder Repeat Count</span>
            <span style={{ fontSize: '14px', color: 'var(--primary-color)', fontWeight: '700' }}>{settings.reminder_repeat_count}x</span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => updateSettings({ reminder_repeat_count: n })}
                style={{
                  flex: 1, padding: '10px', borderRadius: '12px',
                  border: `2px solid ${settings.reminder_repeat_count === n ? 'var(--primary-color)' : 'var(--border-color)'}`,
                  background: settings.reminder_repeat_count === n ? 'var(--primary-color)' : 'transparent',
                  color: settings.reminder_repeat_count === n ? '#fff' : 'var(--text-main)',
                  fontWeight: '700', fontSize: '14px', cursor: 'pointer'
                }}
              >
                {n}x
              </button>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            Max times to repeat reminder if no action is taken.
          </p>
        </div>
      </div>

      {/* ===================== PHASE 3: Accessibility Card ===================== */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Accessibility size={18} />
          Accessibility
        </h3>

        <SettingRow
          icon={<Sun size={22} color="#f97316" />}
          title="Elder Mode"
          subtitle="Larger buttons, fonts, cards & increased spacing"
        >
          <Toggle
            checked={settings.elder_mode}
            onChange={() => updateSettings({ elder_mode: !settings.elder_mode })}
          />
        </SettingRow>

        <SettingRow
          icon={<Contrast size={22} color="var(--primary-color)" />}
          title="High Contrast Mode"
          subtitle="Maximum contrast for better visibility"
        >
          <Toggle
            checked={settings.high_contrast}
            onChange={() => updateSettings({ high_contrast: !settings.high_contrast })}
          />
        </SettingRow>

        <SettingRow
          icon={<ZoomIn size={22} color="var(--primary-color)" />}
          title="Large Text Mode"
          subtitle="Increase base font size across all screens"
        >
          <Toggle
            checked={settings.large_text}
            onChange={() => {
              updateSettings({ large_text: !settings.large_text });
              showToast(`Large Text ${!settings.large_text ? 'enabled' : 'disabled'}`, 'info');
            }}
          />
        </SettingRow>

        {(settings.elder_mode || settings.high_contrast || settings.large_text) && (
          <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-subtle)', borderRadius: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            ✅ Accessibility modes are active. Changes apply across all screens instantly.
          </div>
        )}
      </div>

      {/* ===================== PHASE 4: Caregiver Management Card ===================== */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Heart size={18} />
            Caregiver Link Management
          </h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn btn-outline"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Plus size={14} />
            <span>{showAddForm ? 'Cancel' : 'Add Caregiver'}</span>
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddCaregiver} style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label" style={{ fontSize: '12px' }}>Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={newCaregiver.name}
                  onChange={e => setNewCaregiver({ ...newCaregiver, name: e.target.value })}
                  placeholder="e.g. John Doe"
                  required
                />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label" style={{ fontSize: '12px' }}>Relationship</label>
                <select
                  className="input-field"
                  value={newCaregiver.relationship}
                  onChange={e => setNewCaregiver({ ...newCaregiver, relationship: e.target.value })}
                  style={{ background: 'var(--bg-card)' }}
                >
                  <option value="spouse">Spouse</option>
                  <option value="parent">Parent</option>
                  <option value="child">Child</option>
                  <option value="sibling">Sibling</option>
                  <option value="friend">Friend</option>
                  <option value="doctor">Doctor</option>
                  <option value="nurse">Nurse</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label" style={{ fontSize: '12px' }}>Mobile Number</label>
                <input
                  type="text"
                  className="input-field"
                  value={newCaregiver.mobile}
                  onChange={e => setNewCaregiver({ ...newCaregiver, mobile: e.target.value })}
                  placeholder="e.g. +91 9876543210"
                />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label" style={{ fontSize: '12px' }}>Email Address</label>
                <input
                  type="email"
                  className="input-field"
                  value={newCaregiver.email}
                  onChange={e => setNewCaregiver({ ...newCaregiver, email: e.target.value })}
                  placeholder="e.g. john@care.com"
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <input
                type="checkbox"
                id="emergency_contact"
                checked={newCaregiver.is_emergency_contact}
                onChange={e => setNewCaregiver({ ...newCaregiver, is_emergency_contact: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
              />
              <label htmlFor="emergency_contact" style={{ fontSize: '13px', fontWeight: '600' }}>Mark as Emergency Contact</label>
            </div>

            <button type="submit" className="btn btn-primary" style={{ padding: '10px' }}>
              Save Caregiver
            </button>
          </form>
        )}

        {caregivers.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', padding: '12px 0' }}>
            No caregivers linked. Add a caregiver to receive alerts on missed medications.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {caregivers.map(cg => (
              <div
                key={cg.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 14px', borderRadius: '12px', background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div>
                  <div style={{ fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{cg.name}</span>
                    <span className="badge badge-blue" style={{ fontSize: '10px', textTransform: 'capitalize', padding: '2px 6px' }}>{cg.relationship}</span>
                    {cg.is_emergency_contact && <span className="badge badge-red" style={{ fontSize: '10px', padding: '2px 6px' }}>Emergency</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {cg.mobile && <span>📞 {cg.mobile} </span>}
                    {cg.email && <span>✉️ {cg.email}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteCaregiver(cg.id)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', padding: '6px' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===================== PHASE 5: Backup, Restore & Data Tools ===================== */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} />
          Data Backup & Export Tools
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={handleExportCSV} className="btn btn-primary" style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Download size={18} />
            <span>Export Printable Excel CSV Report</span>
          </button>

          <button onClick={handleBackupJSON} className="btn btn-outline" style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Download size={18} />
            <span>Download Database JSON Backup</span>
          </button>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: '700', display: 'block', marginBottom: '8px' }}>Restore Database from Backup</label>
            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              onChange={handleRestoreJSON}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current.click()}
              className="btn btn-outline"
              style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
            >
              <Upload size={18} />
              <span>Upload Backup JSON File</span>
            </button>
          </div>
        </div>
      </div>

      {/* Caregiver Share Link Section */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Share2 size={18} />
          Caregiver Portal Link
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Generate a secure, read-only link for family members or caregivers to view your daily adherence statistics.
        </p>
        {!shareLink ? (
          <button onClick={handleGenerateShareLink} disabled={shareLoading} className="btn btn-primary" style={{ padding: '12px' }}>
            <Link2 size={18} />
            <span>{shareLoading ? 'Generating Link...' : 'Generate Caregiver Link'}</span>
          </button>
        ) : (
          <div>
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="text" readOnly value={shareLink} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '13px', flex: 1, outline: 'none' }} />
              <button onClick={handleCopyLink} className="btn btn-primary" style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }}>
                <Copy size={14} />
                <span>Copy</span>
              </button>
            </div>
            <button onClick={handleRevokeLink} className="btn btn-outline" style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}>
              <ShieldOff size={16} />
              <span>Revoke Caregiver Access</span>
            </button>
          </div>
        )}
      </div>

      {/* Logout */}
      <button onClick={handleLogout} className="btn btn-outline" style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)', padding: '14px' }}>
        <LogOut size={20} />
        <span>Log Out of MediMate</span>
      </button>
    </div>
  );
}
