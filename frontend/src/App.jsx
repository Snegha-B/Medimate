import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import PwaPrompt from './components/PwaPrompt';
import ToastContainer from './components/Toast';
import Login from './screens/Login';
import Home from './screens/Home';
import AddPrescription from './screens/AddPrescription';
import Medications from './screens/Medications';
import Dashboard from './screens/Dashboard';
import Profile from './screens/Profile';
import Settings from './screens/Settings';
import SharedDashboard from './screens/SharedDashboard';
import { getAuthToken } from './services/api';

export default function App() {
  const isAuthenticated = Boolean(getAuthToken() || localStorage.getItem('userId'));

  return (
    <BrowserRouter>
      <PwaPrompt />
      <ToastContainer />
      
      <Routes>
        {/* Public Caregiver Link */}
        <Route path="/shared/:token" element={<SharedDashboard />} />
        
        {/* Public Login/Signup Route */}
        <Route path="/login" element={<Login />} />
        
        {/* Authenticated Layout Routes */}
        <Route
          path="/*"
          element={
            isAuthenticated ? (
              <div className="app-layout">
                <Sidebar />
                <div className="main-content">
                  <Header />
                  <Routes>
                    <Route path="/home" element={<Home />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/medications" element={<Medications />} />
                    <Route path="/add" element={<AddPrescription />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/home" replace />} />
                  </Routes>
                </div>
                <BottomNav />
              </div>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
