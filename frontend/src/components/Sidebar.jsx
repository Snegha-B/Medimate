import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, LayoutDashboard, Pill, PlusCircle, User, Settings, LogOut, HeartPulse } from 'lucide-react';
import { clearAuthSession } from '../services/api';

export default function Sidebar() {
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || 'Patient';

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <HeartPulse size={24} />
        </div>
        <span className="sidebar-logo-text">MediMate</span>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/home" className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}>
          <Home size={20} />
          <span>Schedule</span>
        </NavLink>

        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}>
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/medications" className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}>
          <Pill size={20} />
          <span>My Medicines</span>
        </NavLink>

        <NavLink to="/add" className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}>
          <PlusCircle size={20} />
          <span>Add Prescription</span>
        </NavLink>

        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}>
          <User size={20} />
          <span>Profile</span>
        </NavLink>

        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}>
          <Settings size={20} />
          <span>Settings</span>
        </NavLink>
      </nav>

      <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
        <button
          onClick={handleLogout}
          className="sidebar-link"
          style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--danger-color)' }}
        >
          <LogOut size={20} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
