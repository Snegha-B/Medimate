/**
 * Reminder Service — MediMate
 * Handles:
 * - Background notification scheduling via Notification API
 * - Repeat reminders (up to 3x every 10 minutes)
 * - Snooze with custom durations (5/10/15/30/custom)
 * - Silent mode detection & fallback
 * - Voice auto-play when volume is enabled
 * - Persistence via localStorage for restart survival
 */

import { speak, speakReminder, stopSpeaking } from './voiceService';

const REMINDER_STORAGE_KEY = 'medimate_active_reminders';
const MAX_REPEAT_COUNT = 3;
const REPEAT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ──────────────────────────────────────────────────
// Notification Permission
// ──────────────────────────────────────────────────

/**
 * Request browser notification permission.
 * @returns {Promise<boolean>} true if granted
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('[ReminderService] Notification API not supported');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ──────────────────────────────────────────────────
// Show OS Notification (works in background)
// ──────────────────────────────────────────────────

/**
 * Show a system notification for a medication reminder.
 * Works even when the tab/app is minimized or another window is focused.
 * @param {object} schedule - Schedule object with medication_name, dosage, scheduled_time, timing_instruction
 * @param {object} options - { onTake, onSnooze, onSkip } callback options
 * @returns {Notification|null}
 */
export async function showReminderNotification(schedule, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.warn('[ReminderService] Notifications not permitted, using in-app fallback');
    return null;
  }

  const name = schedule.medication_name || schedule.name || 'Medicine';
  const dosage = schedule.dosage || '1 tablet';
  const timeStr = formatScheduleTime(schedule.scheduled_time || schedule.reminder_time);
  const foodInstruction = schedule.timing_instruction === 'before_food'
    ? 'Before Food' : 'After Food';

  const title = `💊 Time to take your medicine`;
  const notifOptions = {
    body: `Medicine: ${name} ${dosage}\nTime: ${timeStr}\nInstruction: ${foodInstruction}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `medimate-reminder-${schedule.id}`,
    renotify: true,
    requireInteraction: true,
    data: { scheduleId: schedule.id, url: '/' },
    actions: [
      { action: 'take', title: 'Take Now' },
      { action: 'snooze', title: 'Snooze' },
      { action: 'skip', title: 'Skip' }
    ]
  };

  // Try Service Worker registration first for reliable system OS notification display
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, notifOptions);
        return;
      }
    } catch (e) {
      console.warn('[ReminderService] SW showNotification failed, using Notification constructor fallback', e);
    }
  }

  try {
    const notification = new Notification(title, notifOptions);
    notification.onclick = () => {
      window.focus();
      notification.close();
      if (options.onTake) options.onTake(schedule);
    };
    return notification;
  } catch (err) {
    console.error('[ReminderService] Notification API error:', err);
  }
}

// ──────────────────────────────────────────────────
// Reminder Engine (Scheduling + Repeat + Snooze)
// ──────────────────────────────────────────────────

// Active timer storage: { [scheduleId]: { timerId, repeatCount, schedule } }
const activeTimers = {};
// Track notified dose IDs to ensure idempotency across re-renders and page refreshes: Set of schedule IDs
const notifiedDoseIds = new Set();

/**
 * Schedule a reminder for a specific schedule item.
 * @param {object} schedule - Schedule object
 * @param {object} callbacks - { onTake, onSnooze, onSkip, onMissed, onReminder }
 * @param {object} voiceSettings - { enabled, lang, speed }
 */
export function scheduleReminder(schedule, callbacks = {}, voiceSettings = {}) {
  if (!schedule || !schedule.id) return;

  // 1. DO NOT NOTIFY FOR COMPLETED/TAKEN/SKIPPED DOSES
  if (schedule.status === 'taken' || schedule.status === 'skipped' || schedule.status === 'missed') {
    cancelReminder(schedule.id);
    return;
  }

  // 2. IDEMPOTENCY CHECK: If already notified, DO NOT schedule or fire again
  if (notifiedDoseIds.has(schedule.id) && schedule.status !== 'snoozed') {
    return;
  }

  const now = new Date();
  const targetTime = getTargetDateTimeForSchedule(schedule);

  if (!targetTime) return;

  const delayMs = targetTime.getTime() - now.getTime();

  // If schedule is in the past (e.g. > 1 min ago) and already past, do not fire repeatedly.
  // Only trigger if delay is within future window or fresh (< 60 sec past)
  if (delayMs < -60 * 1000) {
    return;
  }

  // If a timer is already active for this exact schedule, avoid duplicating timers
  if (activeTimers[schedule.id]) {
    return;
  }

  const effectiveDelay = Math.max(0, delayMs);
  const timerId = setTimeout(() => {
    fireReminder(schedule, callbacks, voiceSettings);
  }, effectiveDelay);

  activeTimers[schedule.id] = { timerId, repeatCount: 0, schedule };
}

/**
 * Fire a reminder: show notification, play voice if enabled, mark notified.
 */
function fireReminder(schedule, callbacks, voiceSettings) {
  if (!schedule || !schedule.id) return;

  // Double check status before firing
  if (schedule.status === 'taken' || schedule.status === 'skipped' || schedule.status === 'missed') {
    delete activeTimers[schedule.id];
    return;
  }

  // Ensure idempotent delivery: fire exactly ONCE per dose event
  if (notifiedDoseIds.has(schedule.id) && schedule.status !== 'snoozed') {
    delete activeTimers[schedule.id];
    return;
  }

  // Mark as notified IMMEDIATELY
  notifiedDoseIds.add(schedule.id);

  // Show OS notification exactly ONCE is now handled by backend Web Push.
  // Frontend timers are kept purely for voice auto-play and in-app updates.
  // showReminderNotification(schedule, callbacks);

  // Play voice if volume is enabled
  if (voiceSettings.enabled) {
    try {
      speakReminder(schedule, voiceSettings.lang || 'en', voiceSettings.speed || 1.0);
    } catch (e) {
      console.warn('[ReminderService] Voice playback failed, falling back to notification only', e);
    }
  }

  // Clean up timer after firing
  delete activeTimers[schedule.id];

  // Notify the app via callback
  if (callbacks.onReminder) {
    callbacks.onReminder(schedule);
  }
}

/**
 * Cancel a reminder (user acted: Take Now / Skip / Snooze)
 * @param {number|string} scheduleId
 */
export function cancelReminder(scheduleId) {
  const entry = activeTimers[scheduleId];
  if (entry) {
    clearTimeout(entry.timerId);
    delete activeTimers[scheduleId];
    persistActiveReminders();
  }
  stopSpeaking();
}

/**
 * Snooze a reminder for N minutes.
 * @param {object} schedule - Schedule object
 * @param {number} minutes - Snooze duration in minutes
 * @param {object} callbacks - { onTake, onSnooze, onSkip, onMissed, onReminder }
 * @param {object} voiceSettings - { enabled, lang, speed }
 */
export function snoozeReminder(schedule, minutes, callbacks = {}, voiceSettings = {}) {
  cancelReminder(schedule.id);

  // Reset notified set so the NEW snooze event can trigger ONCE at the snoozed time
  notifiedDoseIds.delete(schedule.id);

  const targetTime = new Date(Date.now() + minutes * 60 * 1000);
  const snoozedSchedule = { ...schedule, status: 'snoozed', snoozed_until: targetTime.toISOString() };

  const delayMs = minutes * 60 * 1000;
  const timerId = setTimeout(() => {
    fireReminder(snoozedSchedule, callbacks, voiceSettings);
  }, delayMs);

  activeTimers[schedule.id] = { timerId, repeatCount: 0, schedule: snoozedSchedule };
  persistActiveReminders();
}

/**
 * Schedule all today's pending reminders.
 * IMPORTANT: Must NOT clear active snooze timers — snoozeReminder() sets a
 * precise setTimeout that must survive fetchSchedule() re-renders.
 * @param {Array} schedules - Array of schedule objects from the API
 * @param {object} callbacks
 * @param {object} voiceSettings
 */
export function scheduleAllReminders(schedules, callbacks = {}, voiceSettings = {}) {
  // Collect IDs that exist in the new schedule list
  const incomingIds = new Set((schedules || []).map(s => String(s.id)));

  // Clear timers for schedules that are no longer pending/snoozed,
  // but PRESERVE any active snooze timers (they were set by snoozeReminder()
  // and must NOT be wiped by a fetchSchedule() triggered re-render).
  for (const id of Object.keys(activeTimers)) {
    const entry = activeTimers[id];
    const isSnoozed = entry.schedule && entry.schedule.status === 'snoozed';
    if (isSnoozed) {
      // Do not clear active snooze timer — it fires at the precise snoozed time
      continue;
    }
    if (!incomingIds.has(id)) {
      // Schedule no longer in today's list — clear its timer
      clearTimeout(entry.timerId);
      delete activeTimers[id];
    }
  }

  const pending = (schedules || []).filter(s => s.status === 'pending');
  for (const schedule of pending) {
    scheduleReminder(schedule, callbacks, voiceSettings);
  }

  // For snoozed schedules that have a snoozed_until value from the API
  // (e.g. after page refresh), re-register them if no active timer exists yet.
  const snoozed = (schedules || []).filter(s => s.status === 'snoozed' && s.snoozed_until);
  for (const schedule of snoozed) {
    if (!activeTimers[schedule.id]) {
      scheduleReminder(schedule, callbacks, voiceSettings);
    }
  }
}

/**
 * Clear all active timers.
 */
export function clearAllReminders() {
  for (const id of Object.keys(activeTimers)) {
    clearTimeout(activeTimers[id].timerId);
    delete activeTimers[id];
  }
  persistActiveReminders();
}

// ──────────────────────────────────────────────────
// Persistence (survive page refresh)
// ──────────────────────────────────────────────────

function persistActiveReminders() {
  try {
    const data = {};
    for (const [id, entry] of Object.entries(activeTimers)) {
      data[id] = {
        scheduleId: id,
        repeatCount: entry.repeatCount,
        schedule: entry.schedule
      };
    }
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage may be unavailable in some contexts
  }
}

/**
 * Restore reminders from localStorage after page refresh.
 * @param {object} callbacks
 * @param {object} voiceSettings
 */
export function restoreReminders(callbacks = {}, voiceSettings = {}) {
  try {
    const raw = localStorage.getItem(REMINDER_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    for (const entry of Object.values(data)) {
      if (entry.schedule) {
        scheduleReminder(entry.schedule, callbacks, voiceSettings);
      }
    }
  } catch (e) {
    // ignore corrupted data
  }
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

/**
 * Get the Date object for today at the schedule's scheduled_time or snoozed_until.
 * @param {object} schedule
 * @returns {Date|null}
 */
function getTargetDateTimeForSchedule(schedule) {
  if (schedule.snoozed_until) {
    const snoozedDate = new Date(schedule.snoozed_until);
    if (!isNaN(snoozedDate.getTime())) return snoozedDate;
  }

  const timeVal = schedule.scheduled_time || schedule.reminder_time;
  if (!timeVal) return null;
  const parts = String(timeVal).split(':');
  if (parts.length < 2) return null;
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
    parseInt(parts[0], 10), parseInt(parts[1], 10), 0);
  return target;
}

/**
 * Format a time string (HH:MM or HH:MM:SS) to 12h AM/PM display format.
 * @param {string} timeStr
 * @returns {string}
 */
export function formatScheduleTime(timeStr) {
  if (!timeStr) return '';
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const m = parts[1].padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Get the snooze duration options.
 * @returns {Array<{label: string, minutes: number}>}
 */
export function getSnoozeOptions() {
  return [
    { label: '5 min', minutes: 5 },
    { label: '10 min', minutes: 10 },
    { label: '15 min', minutes: 15 },
    { label: '30 min', minutes: 30 },
  ];
}

import api from './api';

export async function fetchTodayReminders() {
  return api.get('/api/reminders/');
}

export async function markReminderTaken(reminderId) {
  return api.post(`/api/reminders/${reminderId}/taken/`, {});
}

export async function markReminderSkipped(reminderId, skipReason = '') {
  return api.post(`/api/reminders/${reminderId}/skip/`, { skip_reason: skipReason });
}

export async function snoozeReminderBackend(reminderId, minutes) {
  return api.post(`/api/reminders/${reminderId}/snooze/`, { snooze_minutes: minutes });
}


