import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, HeartPulse, Trash2, Check, X, ShieldAlert, Calendar, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { showToast } from './Toast';

export default function Header() {
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || 'Patient';
  const todayFormatted = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchNotifications();
    // Close dropdown on click outside
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const data = await api.get('/api/notifications/');
      setNotifications(data);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  const markAsRead = async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read/`);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
      showToast('Notification marked as read', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllNotifications = async () => {
    try {
      await api.delete('/api/notifications/clear/');
      setNotifications([]);
      showToast('All notifications cleared', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const filteredNotifications = notifications.filter(n => {
    if (filterType === 'all') return true;
    return n.notification_type === filterType;
  });

  return (
    <header className="app-header" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HeartPulse size={22} color="var(--primary-color)" />
          <span style={{ fontWeight: '800', fontSize: '18px', color: 'var(--primary-color)' }}>MediMate</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
          {todayFormatted}
        </span>

        {/* Notification Bell with Badge & Dropdown */}
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              background: 'var(--bg-subtle)',
              border: 'none',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              position: 'relative'
            }}
            title="Notification Center"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '0',
                  right: '0',
                  background: 'var(--danger-color)',
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: '800',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                right: '0',
                width: '320px',
                maxHeight: '400px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                zIndex: 999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontWeight: '800', fontSize: '15px', color: 'var(--text-main)' }}>Notifications</span>
                {notifications.length > 0 && (
                  <button
                    onClick={clearAllNotifications}
                    style={{ background: 'transparent', border: 'none', color: 'var(--danger-color)', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Trash2 size={12} />
                    <span>Clear All</span>
                  </button>
                )}
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: '4px', padding: '8px 12px', borderBottom: '1px solid var(--border-color)', overflowX: 'auto', background: 'var(--bg-subtle)' }}>
                {['all', 'missed_dose', 'inventory', 'appointment'].map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '700',
                      border: 'none',
                      cursor: 'pointer',
                      background: filterType === type ? 'var(--primary-color)' : 'transparent',
                      color: filterType === type ? '#ffffff' : 'var(--text-secondary)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {type === 'all' ? 'All' : type === 'missed_dose' ? 'Misses' : type === 'inventory' ? 'Low Stock' : 'Appts'}
                  </button>
                ))}
              </div>

              {/* List */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {filteredNotifications.length === 0 ? (
                  <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)', padding: '24px 0', margin: 0 }}>
                    No notifications.
                  </p>
                ) : (
                  filteredNotifications.map(n => (
                    <div
                      key={n.id}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border-color)',
                        background: n.is_read ? 'transparent' : 'var(--primary-light)',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start'
                      }}
                    >
                      <div style={{ marginTop: '2px' }}>
                        {n.notification_type === 'missed_dose' ? (
                          <X color="var(--danger-color)" size={16} />
                        ) : n.notification_type === 'inventory' ? (
                          <ShieldAlert color="#b45309" size={16} />
                        ) : (
                          <Calendar color="var(--primary-color)" size={16} />
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{n.title}</span>
                          {!n.is_read && (
                            <button
                              onClick={() => markAsRead(n.id)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '2px' }}
                              title="Mark as Read"
                            >
                              <Check size={14} />
                            </button>
                          )}
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>{n.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div
          className="header-user"
          onClick={() => navigate('/profile')}
          style={{ cursor: 'pointer' }}
          title="View Profile"
        >
          <div className="header-avatar">
            {username.charAt(0).toUpperCase()}
          </div>
          <div style={{ display: 'none', mdDisplay: 'block' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>{username}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
