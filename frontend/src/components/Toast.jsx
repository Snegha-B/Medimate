import React, { useState, useEffect } from 'react';

let toastListener = null;

export function showToast(message, type = 'info') {
  if (toastListener) {
    toastListener({ id: Date.now(), message, type });
  }
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    toastListener = (newToast) => {
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 3500);
    };
    return () => {
      toastListener = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 84,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'center',
      pointerEvents: 'none',
      width: '90%',
      maxWidth: '380px'
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            background: toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#dc2626' : '#0284c7',
            color: '#ffffff',
            padding: '12px 18px',
            borderRadius: '24px',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease-in-out'
          }}
        >
          <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
