import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, LayoutDashboard, PlusCircle, Pill, User, Settings } from 'lucide-react';

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/home" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
        <Home size={20} />
        <span>Today</span>
      </NavLink>

      <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
        <LayoutDashboard size={20} />
        <span>Stats</span>
      </NavLink>

      <NavLink to="/add" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
        <PlusCircle size={20} />
        <span>Add</span>
      </NavLink>

      <NavLink to="/medications" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
        <Pill size={20} />
        <span>Meds</span>
      </NavLink>

      <NavLink to="/profile" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
        <User size={20} />
        <span>Profile</span>
      </NavLink>

      <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
        <Settings size={20} />
        <span>Settings</span>
      </NavLink>
    </nav>
  );
}
