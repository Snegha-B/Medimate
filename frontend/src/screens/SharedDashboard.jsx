import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Shield, Heart, AlertCircle } from 'lucide-react';
import api from '../services/api';

export default function SharedDashboard() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSharedData = async () => {
      try {
        const json = await api.get(`/api/shared/${token}/dashboard/`);
        setData(json);
      } catch (err) {
        console.error(err);
        setError('This share link is invalid or has been revoked.');
      } finally {
        setLoading(false);
      }
    };
    fetchSharedData();
  }, [token]);

  if (loading) return <div className="spinner"></div>;

  if (error) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: 'var(--danger-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <AlertCircle size={40} color="var(--danger-color)" />
        </div>
        <h2 style={{ marginBottom: '8px', fontSize: '22px', fontWeight: '700' }}>Link Unavailable</h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '340px' }}>{error}</p>
      </div>
    );
  }

  const pieData = [
    { name: 'Taken', value: data.taken || 0 },
    { name: 'Missed', value: data.missed || 0 },
    { name: 'Skipped', value: data.skipped || 0 },
  ];
  const COLORS = ['#10b981', '#ef4444', '#f59e0b'];

  return (
    <div style={{ maxWidth: '540px', margin: '0 auto', padding: '24px 16px', paddingBottom: '60px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'var(--primary-gradient)',
        borderRadius: '20px',
        padding: '24px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        boxShadow: '0 8px 24px rgba(2, 132, 199, 0.25)',
        color: '#ffffff'
      }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Heart size={28} color="#fff" fill="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', margin: 0 }}>
            Shared Caregiver Report
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)', margin: '4px 0 0' }}>
            {data.patient_alias} • Read-only view
          </p>
        </div>
      </div>

      {/* Privacy Notice */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: '12px', padding: '12px 16px', marginBottom: '24px',
        fontSize: '13px', color: 'var(--text-secondary)'
      }}>
        <Shield size={18} color="var(--primary-color)" style={{ flexShrink: 0 }} />
        <span>Only adherence statistics are shared. Prescriptions and personal details remain private.</span>
      </div>

      {/* Adherence Donut Chart */}
      <div className="card" style={{ textAlign: 'center', padding: '28px' }}>
        <h3 style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '15px' }}>Overall Adherence Score</h3>
        <div style={{ position: 'relative', height: '220px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={88} paddingAngle={4} dataKey="value">
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '28px', fontWeight: '800', color: 'var(--primary-color)'
          }}>
            {data.overall_adherence_percent}%
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '16px', fontSize: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
            Taken ({data.taken})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div>
            Missed ({data.missed})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></div>
            Skipped ({data.skipped})
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '32px', fontSize: '13px', color: 'var(--text-secondary)' }}>
        Powered by <strong style={{ color: 'var(--primary-color)' }}>MediMate</strong> • Professional Healthcare Companion
      </div>
    </div>
  );
}
