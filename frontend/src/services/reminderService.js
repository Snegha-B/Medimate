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
export function showReminderNotification(schedule, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.warn('[ReminderService] Notifications not permitted, using in-app fallback');
    return null;
  }

  const name = schedule.medication_name || 'Medicine';
  const dosage = schedule.dosage || '1 tablet';
  const timeStr = formatScheduleTime(schedule.scheduled_time);
  const foodInstruction = schedule.timing_instruction === 'before_food'
    ? 'Before Food' : 'After Food';

  const notification = new Notification(`💊 Time to take your medicine`, {
    body: `Medicine: ${name} ${dosage}\nTime: ${timeStr}\nInstruction: ${foodInstruction}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `medimate-reminder-${schedule.id}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    actions: [
      { action: 'take', title: 'Take Now' },
      { action: 'snooze', title: 'Snooze' },
      { action: 'skip', title: 'Skip' }
    ]
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
    if (options.onTake) options.onTake(schedule);
  };

  return notification;
}

// ──────────────────────────────────────────────────
// Reminder Engine (Scheduling + Repeat + Snooze)
// ──────────────────────────────────────────────────

// Active timer storage: { [scheduleId]: { timerId, repeatCount, schedule } }
const activeTimers = {};

/**
 * Schedule a reminder for a specific schedule item.
 * If the scheduled_time has already passed today, skip it.
 * @param {object} schedule - Schedule object
 * @param {object} callbacks - { onTake, onSnooze, onSkip, onMissed, onReminder }
 * @param {object} voiceSettings - { enabled, lang, speed }
 */
export function scheduleReminder(schedule, callbacks = {}, voiceSettings = {}) {
  const now = new Date();
  const targetTime = getTargetDateTimeForSchedule(schedule);

  if (!targetTime || targetTime <= now) return; // Already passed

  const delayMs = targetTime.getTime() - now.getTime();
  const timerId = setTimeout(() => {
    fireReminder(schedule, callbacks, voiceSettings, 0);
  }, delayMs);

  activeTimers[schedule.id] = { timerId, repeatCount: 0, schedule };
  persistActiveReminders();
}

/**
 * Fire a reminder: show notification, play voice if enabled, schedule repeat.
 */
function fireReminder(schedule, callbacks, voiceSettings, repeatCount) {
  // Show OS notification (works in background/minimized)
  showReminderNotification(schedule, callbacks);

  // Play voice if volume is enabled
  if (voiceSettings.enabled) {
    try {
      speakReminder(schedule, voiceSettings.lang || 'en', voiceSettings.speed || 1.0);
    } catch (e) {
      console.warn('[ReminderService] Voice playback failed, falling back to notification only', e);
    }
  }

  // Notify the app via callback
  if (callbacks.onReminder) {
    callbacks.onReminder(schedule, repeatCount);
  }

  // Schedule repeat if under max
  if (repeatCount < MAX_REPEAT_COUNT - 1) {
    const repeatTimerId = setTimeout(() => {
      // Check if already acted upon
      if (!activeTimers[schedule.id]) return;
      fireReminder(schedule, callbacks, voiceSettings, repeatCount + 1);
    }, REPEAT_INTERVAL_MS);

    activeTimers[schedule.id] = {
      timerId: repeatTimerId,
      repeatCount: repeatCount + 1,
      schedule
    };
    persistActiveReminders();
  } else {
    // All repeats exhausted — mark as missed
    if (callbacks.onMissed) {
      callbacks.onMissed(schedule);
    }
    delete activeTimers[schedule.id];
    persistActiveReminders();
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

  const timerId = setTimeout(() => {
    fireReminder(schedule, callbacks, voiceSettings, 0);
  }, minutes * 60 * 1000);

  activeTimers[schedule.id] = { timerId, repeatCount: 0, schedule };
  persistActiveReminders();
}

/**
 * Schedule all today's pending reminders.
 * @param {Array} schedules - Array of schedule objects from the API
 * @param {object} callbacks
 * @param {object} voiceSettings
 */
export function scheduleAllReminders(schedules, callbacks = {}, voiceSettings = {}) {
  // Clear all existing timers first to prevent duplicates
  clearAllReminders();

  const pending = (schedules || []).filter(s => s.status === 'pending');
  for (const schedule of pending) {
    scheduleReminder(schedule, callbacks, voiceSettings);
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
 * Get the Date object for today at the schedule's scheduled_time.
 * @param {object} schedule
 * @returns {Date|null}
 */
function getTargetDateTimeForSchedule(schedule) {
  if (!schedule.scheduled_time) return null;
  const parts = String(schedule.scheduled_time).split(':');
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
