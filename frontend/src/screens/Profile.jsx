import React, { useState, useEffect } from 'react';
import { User, Heart, Phone, AlertTriangle, Activity, Save, Edit2, ShieldAlert } from 'lucide-react';
import api from '../services/api';
import { showToast } from '../components/Toast';

export default function Profile() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState({
    profile_picture: '',
    age: '',
    gender: 'Male',
    blood_group: 'A+',
    emergency_contact: '',
    medical_conditions: '',
    allergies: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const data = await api.get('/api/profile/');
      setUsername(data.username || '');
      setEmail(data.email || '');
      if (data.profile) {
        setProfile({
          profile_picture: data.profile.profile_picture || '',
          age: data.profile.age || '',
          gender: data.profile.gender || 'Male',
          blood_group: data.profile.blood_group || 'A+',
          emergency_contact: data.profile.emergency_contact || '',
          medical_conditions: data.profile.medical_conditions || '',
          allergies: data.profile.allergies || ''
        });
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Could not load profile details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        email,
        ...profile,
        age: profile.age === '' || profile.age === null || isNaN(profile.age) ? null : parseInt(profile.age, 10)
      };
      await api.put('/api/profile/', payload);
      showToast('Profile updated successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error saving profile changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="spinner"></div>;
  }

  return (
    <div className="page-container" style={{ maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-main)' }}>Medical Profile</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Manage personal health records & emergency info</p>
        </div>
        <span className="badge badge-green" style={{ fontSize: '13px', padding: '6px 14px' }}>
          Active Member
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Profile Card Header */}
        <div className="card" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'var(--primary-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '32px',
            fontWeight: '800',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)'
          }}>
            {username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '800', margin: 0 }}>{username}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0' }}>{email || 'No email specified'}</p>
          </div>
        </div>

        {/* Personal Health Attributes */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={20} />
            Personal Metrics
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input
                type="email"
                className="input-field"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>

            <div className="input-group">
              <label className="input-label">Age</label>
              <input
                type="number"
                className="input-field"
                value={profile.age}
                onChange={e => setProfile({ ...profile, age: e.target.value })}
                placeholder="e.g. 28"
              />
            </div>

            <div className="input-group">
              <label className="input-label">Gender</label>
              <select
                className="input-field"
                value={profile.gender}
                onChange={e => setProfile({ ...profile, gender: e.target.value })}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Blood Group</label>
              <select
                className="input-field"
                value={profile.blood_group}
                onChange={e => setProfile({ ...profile, blood_group: e.target.value })}
              >
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
            </div>
          </div>
        </div>

        {/* Emergency & Safety Info */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Phone size={20} />
            Emergency & Medical Background
          </h3>

          <div className="input-group">
            <label className="input-label">Emergency Contact Phone Number</label>
            <input
              type="text"
              className="input-field"
              value={profile.emergency_contact}
              onChange={e => setProfile({ ...profile, emergency_contact: e.target.value })}
              placeholder="+1 (555) 019-2834"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Medical Conditions</label>
            <textarea
              className="input-field"
              rows="3"
              value={profile.medical_conditions}
              onChange={e => setProfile({ ...profile, medical_conditions: e.target.value })}
              placeholder="e.g. Hypertension, Type-2 Diabetes"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Known Allergies</label>
            <textarea
              className="input-field"
              rows="3"
              value={profile.allergies}
              onChange={e => setProfile({ ...profile, allergies: e.target.value })}
              placeholder="e.g. Penicillin, Peanuts"
            />
          </div>
        </div>

        {/* Action Button */}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving}
          style={{ padding: '16px', fontSize: '16px' }}
        >
          <Save size={20} />
          <span>{saving ? 'Saving Profile...' : 'Save Profile Changes'}</span>
        </button>
      </form>
    </div>
  );
}
