import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AccessibilityContext = createContext(null);

const DEFAULT_SETTINGS = {
  preferred_language: 'en',
  voice_enabled: true,
  speech_speed: 1.0,
  elder_mode: false,
  high_contrast: false,
  large_text: false,
  reminder_repeat_count: 3,
};

/**
 * Apply CSS variable overrides for Elder Mode, High Contrast, and Large Text.
 */
function applyAccessibilityCSS(settings) {
  const root = document.documentElement;

  // Elder Mode: larger fonts, bigger spacing, bigger border radius
  if (settings.elder_mode) {
    root.style.setProperty('--font-size-base', '18px');
    root.style.setProperty('--spacing-base', '20px');
    root.style.setProperty('--border-radius-base', '20px');
    root.style.setProperty('--card-padding', '24px');
    root.style.setProperty('--btn-font-size', '17px');
    root.style.setProperty('--btn-padding', '18px 24px');
  } else {
    root.style.removeProperty('--font-size-base');
    root.style.removeProperty('--spacing-base');
    root.style.removeProperty('--border-radius-base');
    root.style.removeProperty('--card-padding');
    root.style.removeProperty('--btn-font-size');
    root.style.removeProperty('--btn-padding');
  }

  // High Contrast Mode
  if (settings.high_contrast) {
    root.style.setProperty('--bg-main', '#000000');
    root.style.setProperty('--bg-card', '#111111');
    root.style.setProperty('--bg-subtle', '#1a1a1a');
    root.style.setProperty('--text-main', '#ffffff');
    root.style.setProperty('--text-secondary', '#dddddd');
    root.style.setProperty('--border-color', '#ffffff');
  } else if (!settings.high_contrast) {
    // Restore defaults only if we had forced high contrast before
    const savedTheme = localStorage.getItem('medimate_theme') || 'dark';
    if (savedTheme === 'light') {
      root.style.removeProperty('--bg-main');
      root.style.removeProperty('--bg-card');
      root.style.removeProperty('--bg-subtle');
      root.style.removeProperty('--text-main');
      root.style.removeProperty('--text-secondary');
      root.style.removeProperty('--border-color');
    }
  }

  // Large Text Mode (independent of elder mode)
  if (settings.large_text) {
    root.style.setProperty('--font-size-base', settings.elder_mode ? '20px' : '17px');
  }
}

export function AccessibilityProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    // Initialize from localStorage for fast render
    try {
      const stored = localStorage.getItem('medimate_accessibility');
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  });

  const [loaded, setLoaded] = useState(false);

  // Load from backend on mount
  useEffect(() => {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (!token) { setLoaded(true); return; }

    api.get('/api/accessibility/')
      .then(data => {
        const merged = { ...DEFAULT_SETTINGS, ...data };
        setSettings(merged);
        localStorage.setItem('medimate_accessibility', JSON.stringify(merged));
      })
      .catch(() => { /* use localStorage fallback */ })
      .finally(() => setLoaded(true));
  }, []);

  // Apply CSS whenever settings change
  useEffect(() => {
    applyAccessibilityCSS(settings);
    localStorage.setItem('medimate_accessibility', JSON.stringify(settings));
  }, [settings]);

  /**
   * Update one or more settings and persist to backend.
   */
  const updateSettings = useCallback(async (patch) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    try {
      await api.patch('/api/accessibility/', patch);
    } catch (err) {
      console.warn('Could not sync accessibility settings to backend:', err);
    }
  }, [settings]);

  const lang = settings.preferred_language || 'en';
  const voiceEnabled = settings.voice_enabled;
  const speechSpeed = settings.speech_speed;

  return (
    <AccessibilityContext.Provider value={{ settings, updateSettings, lang, voiceEnabled, speechSpeed, loaded }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility must be used within AccessibilityProvider');
  return ctx;
}

export default AccessibilityContext;
