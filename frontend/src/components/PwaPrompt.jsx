import React, { useState, useEffect } from 'react';
import { showToast } from './Toast';
import api from '../services/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [pushStatus, setPushStatus] = useState('default'); // 'default', 'subscribed', 'denied'

  useEffect(() => {
    // 1. Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('[SW] Registered successfully:', reg))
        .catch((err) => console.error('[SW] Registration failed:', err));
    }

    // 2. Handle Android Chrome "Add to Home Screen" event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setPushStatus('subscribed');
      } else if (Notification.permission === 'denied') {
        setPushStatus('denied');
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('MediMate installed to home screen!', 'success');
    }
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleEnableReminders = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('Reminders are not supported in this browser.', 'error');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        showToast('Notification permission was denied. Try enabling in browser settings.', 'error');
        return;
      }

      // Fetch VAPID Key from backend
      const res = await fetch('/api/push/vapid-key/');
      const data = await res.json();
      const vapidPublicKey = data.public_key;

      if (!vapidPublicKey) {
        showToast('VAPID Key missing from server.', 'error');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      // Send subscription object to backend using authenticated api helper
      await api.post('/api/push/subscribe/', subscription.toJSON());

      setPushStatus('subscribed');
      showToast('Reminders enabled successfully!', 'success');
    } catch (err) {
      console.error('Failed to enable reminders:', err);
      showToast('Could not enable reminders. Ensure you are in a standalone browser tab.', 'error');
    }
  };

  return (
    <>
      {showInstallBanner && (
        <div style={{
          position: 'fixed',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(14, 165, 233, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          maxWidth: '90%',
          width: '400px'
        }}>
          <div style={{ fontSize: '24px' }}>📱</div>
          <div style={{ flex: 1, fontSize: '14px' }}>
            <strong>Install MediMate</strong>
            <div style={{ fontSize: '12px', opacity: 0.9 }}>Add to home screen for fast access & offline mode.</div>
          </div>
          <button 
            onClick={handleInstallClick}
            style={{
              background: '#ffffff',
              color: '#0284c7',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '20px',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Install
          </button>
          <button 
            onClick={() => setShowInstallBanner(false)}
            style={{
              background: 'transparent',
              color: '#fff',
              border: 'none',
              fontSize: '16px',
              cursor: 'pointer',
              opacity: 0.8
            }}
          >
            ✕
          </button>
        </div>
      )}

      {pushStatus === 'default' && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          right: 16,
          zIndex: 999,
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#f8fafc',
          padding: '10px 14px',
          borderRadius: '12px',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13px'
        }}>
          <span>🔔 Stay updated on doses</span>
          <button
            onClick={handleEnableReminders}
            style={{
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Enable Reminders
          </button>
        </div>
      )}
    </>
  );
}
