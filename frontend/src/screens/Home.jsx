import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Clock, XCircle, Flame, Plus, Mic, MicOff, Sunrise, Sun, Moon, Utensils, AlertCircle, RefreshCw, Volume2 } from 'lucide-react';
import api from '../services/api';
import { showToast } from '../components/Toast';
import { useAccessibility } from '../context/AccessibilityContext';
import { startListening, VOICE_ACTIONS, speakReminder, speak, stopSpeaking } from '../services/voiceService';
import { requestNotificationPermission, scheduleAllReminders, cancelReminder, snoozeReminder, getSnoozeOptions, formatScheduleTime, fetchTodayReminders, markReminderTaken, markReminderSkipped, snoozeReminderBackend, showReminderNotification } from '../services/reminderService';

export default function Home() {
  const [schedules, setSchedules] = useState([]);
  const [grouped, setGrouped] = useState({ morning: [], afternoon: [], evening: [], night: [] });
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listeningId, setListeningId] = useState(null);

  // Skip reason modal state
  const [skipModalSchedule, setSkipModalSchedule] = useState(null);
  const [skipReason, setSkipReason] = useState('Side effects');

  // Snooze modal state
  const [snoozeModalSchedule, setSnoozeModalSchedule] = useState(null);

  // Reminder escalation tracking: { scheduleId: retryCount }
  const escalationRef = useRef({});

  const navigate = useNavigate();
  const { lang, voiceEnabled, speechSpeed, settings } = useAccessibility();
  const reminderRepeatCount = settings?.reminder_repeat_count ?? 3;

  const [reminders, setReminders] = useState([]);

  const fetchSchedule = async () => {
    try {
      const data = await api.get('/api/schedule/today/');
      setSchedules(data.schedules || []);
      if (data.grouped) {
        setGrouped(data.grouped);
      }
      if (data.streak !== undefined) {
        setStreak(data.streak);
      }
      
      // Fetch backend reminders
      const todayReminders = await fetchTodayReminders();
      setReminders(todayReminders || []);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Could not load today schedule', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    requestNotificationPermission();
    fetchSchedule();

    if ('serviceWorker' in navigator) {
      const handleSwMessage = (event) => {
        if (event.data && event.data.type === 'NOTIFICATION_ACTION') {
          fetchSchedule();
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      };
    }
  }, []);

  // Schedule background reminders whenever schedules change
  useEffect(() => {
    if (schedules.length === 0) return;
    const voiceSettings = { enabled: voiceEnabled, lang, speed: speechSpeed };
    const callbacks = {
      onReminder: (schedule, repeatCount) => {
        console.log(`[Reminder] Fired for ${schedule.medication_name} (repeat #${repeatCount})`);
        fetchSchedule();
      },
      onMissed: (schedule) => {
        handleAction(schedule.id, 'missed').catch(() => {});
        showToast(`${schedule.medication_name} marked as Missed after retries.`, 'info');
      },
    };
    scheduleAllReminders(schedules, callbacks, voiceSettings);
  }, [schedules, voiceEnabled, lang, speechSpeed]);

  const handleAction = async (scheduleId, status, reason = '', snoozeMins = null) => {
    // Clear escalation for this schedule since user acted
    if (escalationRef.current[scheduleId]) {
      clearTimeout(escalationRef.current[scheduleId]);
      delete escalationRef.current[scheduleId];
    }
    // Cancel any pending background reminder timers & stop voice
    cancelReminder(scheduleId);
    stopSpeaking();

    try {
      // Find the MedicineReminder whose .schedule FK matches this Schedule ID
      const matchingReminder = reminders.find(
        r => r.schedule === scheduleId || r.id === scheduleId
      );

      let updatedReminder = null;
      if (matchingReminder) {
        if (status === 'taken') {
          const res = await markReminderTaken(matchingReminder.id);
          updatedReminder = res?.reminder || null;
        } else if (status === 'snoozed') {
          const res = await snoozeReminderBackend(matchingReminder.id, snoozeMins || 10);
          updatedReminder = res?.reminder || null;
        } else if (status === 'skipped') {
          const res = await markReminderSkipped(matchingReminder.id, reason);
          updatedReminder = res?.reminder || null;
        }
      }

      const body = {
        schedule_id: scheduleId,
        status,
        skip_reason: reason
      };
      if (status === 'snoozed' && snoozeMins) {
        body.snooze_minutes = snoozeMins;
      }
      await api.post('/api/doselog/', body);

      if (status === 'snoozed') {
        const schObj = schedules.find(s => s.id === scheduleId) || { id: scheduleId };
        snoozeReminder(schObj, snoozeMins || 10, {
          onReminder: () => fetchSchedule()
        }, { enabled: voiceEnabled, lang, speed: speechSpeed });

        const nextTime = updatedReminder?.snoozed_until_formatted || `in ${snoozeMins || 10} min`;
        showToast(`⏰ Snoozed! Next reminder at ${nextTime}.`, 'info');
        if (voiceEnabled) speak(`Reminder snoozed. I will remind you again at ${nextTime}.`, lang, speechSpeed);
      } else if (status === 'taken') {
        showToast('🎉 Dose marked as Taken! Tablet count updated.', 'success');
        if (voiceEnabled) speak('Great job! Medicine marked as taken. Stay healthy!', lang, speechSpeed);
      } else if (status === 'skipped') {
        showToast(`Dose skipped (${reason || 'Recorded'}). Tablet count unchanged.`, 'info');
      }

      setSkipModalSchedule(null);
      setSnoozeModalSchedule(null);
      fetchSchedule();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error updating dose status', 'error');
    }
  };

  /**
   * Smart Reminder Escalation:
   * Speak reminder for a schedule. If user doesn't act within 10 minutes,
   * repeat up to reminderRepeatCount times, then auto-mark as missed.
   */
  const startEscalation = (schedule, retriesLeft) => {
    if (!voiceEnabled || retriesLeft <= 0) {
      // Auto-mark as missed after all retries exhausted
      handleAction(schedule.id, 'missed').catch(() => {});
      showToast(`${schedule.medication_name} marked as Missed after ${reminderRepeatCount} reminders.`, 'info');
      return;
    }
    speakReminder(schedule, lang, speechSpeed);
    const timeoutId = setTimeout(() => {
      // Check if it was already acted on (schedule status changes on refetch)
      startEscalation(schedule, retriesLeft - 1);
    }, 10 * 60 * 1000); // 10 minutes
    escalationRef.current[schedule.id] = timeoutId;
  };


  const handleVoiceCommand = (targetSchedule = null) => {
    if (!voiceEnabled) {
      showToast('Voice is disabled. Enable it in Settings.', 'info');
      return;
    }

    if (targetSchedule) setListeningId(targetSchedule.id);
    else setListeningId('all');

    speakReminder(targetSchedule || schedules[0], lang, speechSpeed);

    startListening((text, action) => {
      setListeningId(null);
      if (!text) {
        showToast("Didn't catch that. Try tapping instead.", 'info');
        return;
      }
      showToast(`🎤 Heard: "${text}"`, 'info');

      const schId = targetSchedule?.id || (schedules.length > 0 ? schedules[0].id : null);
      if (!schId) return;

      if (action === VOICE_ACTIONS.TAKE) {
        handleAction(schId, 'taken');
      } else if (action === VOICE_ACTIONS.SKIP) {
        handleAction(schId, 'skipped', 'Voice command skip');
      } else if (action === VOICE_ACTIONS.SNOOZE) {
        handleAction(schId, 'snoozed');
      } else if (action === VOICE_ACTIONS.READ) {
        const names = schedules.map(s => s.medication_name).join(', ');
        speak(`Today you have: ${names}`, lang, speechSpeed);
      } else {
        showToast("Command not recognized. Say: Take, Skip, or Snooze.", 'info');
      }
    }, lang);
  };

  if (loading) {
    return <div className="spinner"></div>;
  }

  const renderScheduleCard = (schedule) => {
    // Find corresponding reminder
    const reminder = reminders.find(r => r.schedule === schedule.id);
    const finalStatus = reminder ? reminder.status : schedule.status;
    const isTaken = finalStatus === 'taken';
    const isMissed = finalStatus === 'missed';
    const isSnoozed = finalStatus === 'snoozed';
    const isSkipped = finalStatus === 'skipped';

    return (
      <div
        key={schedule.id}
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderLeft: isTaken
            ? '6px solid var(--secondary-color)'
            : isMissed
            ? '6px solid var(--danger-color)'
            : isSnoozed || isSkipped
            ? '6px solid var(--warning-color)'
            : '6px solid var(--primary-color)',
          marginBottom: '14px',
          backgroundColor: '#ffffff'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
              {schedule.medication_name}
            </h3>
            <span className={`badge ${isTaken ? 'badge-green' : isMissed ? 'badge-red' : isSnoozed || isSkipped ? 'badge-amber' : 'badge-blue'}`}>
              {isTaken ? 'Taken' : isMissed ? 'Missed' : isSnoozed ? 'Snoozed' : isSkipped ? 'Skipped' : 'Scheduled'}
            </span>
            <div style={{ display: 'flex', gap: '6px', marginLeft: '6px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  if (Notification.permission !== 'granted') {
                    requestNotificationPermission().then(granted => {
                      if (granted) showToast('Notification permission granted!', 'success');
                      else showToast('Notification permission denied by browser.', 'error');
                    });
                  } else {
                    showReminderNotification(schedule);
                    showToast(`🔔 Reminder notification triggered for ${schedule.medication_name}`, 'info');
                  }
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: Notification.permission === 'granted' ? 1 : 0.4, padding: 0 }}
                title="Notification Enabled - Click to test notification"
              >
                🔔
              </button>
              <button
                type="button"
                onClick={() => {
                  speakReminder(schedule, lang, speechSpeed);
                  showToast(`🔊 Playing voice reminder for ${schedule.medication_name}`, 'info');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: voiceEnabled ? 1 : 0.4, padding: 0 }}
                title="Voice Enabled - Click to test voice reminder"
              >
                🔊
              </button>
            </div>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
            <strong>Dosage:</strong> {schedule.dosage || '1 Dose'} • <strong>Time:</strong> {schedule.scheduled_time.substring(0, 5)} • 
            <span style={{ color: 'var(--primary-color)', marginLeft: '4px', fontWeight: '600' }}>
              {schedule.timing_instruction === 'before_food' ? 'Before Food' : 'After Food'}
            </span>
          </p>

          {schedule.remaining_tablets !== undefined && (
            <div style={{ fontSize: '12px', color: schedule.remaining_tablets < 5 ? 'var(--danger-color)' : 'var(--text-secondary)', marginTop: '4px', fontWeight: '600' }}>
              {schedule.remaining_tablets} Tablets Remaining
            </div>
          )}

          {/* Show next snooze time if snoozed */}
          {isSnoozed && reminder?.snoozed_until_formatted && (
            <div style={{ fontSize: '12px', color: 'var(--warning-color)', marginTop: '6px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={13} />
              <span>Next reminder at {reminder.snoozed_until_formatted}</span>
            </div>
          )}
        </div>

        {/* Action Buttons: Take Now, Snooze, Skip */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleVoiceCommand(schedule)}
            style={{
              background: listeningId === schedule.id ? 'var(--danger-light)' : 'var(--primary-light)',
              border: 'none',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: listeningId === schedule.id ? 'var(--danger-color)' : 'var(--primary-color)'
            }}
            title="Voice Log"
          >
            {listeningId === schedule.id ? <MicOff size={18} className="animate-pulse" /> : <Mic size={18} />}
          </button>

          {/* Take Now Button */}
          <button
            onClick={() => handleAction(schedule.id, 'taken')}
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: (isTaken || isSkipped) ? 0.5 : 1, cursor: (isTaken || isSkipped) ? 'not-allowed' : 'pointer' }}
            title="Take Now"
            disabled={isTaken || isSkipped}
          >
            <CheckCircle size={16} />
            <span>{isTaken ? 'Taken' : 'Take Now'}</span>
          </button>

          {/* Snooze Button — opens snooze duration picker */}
          <button
            onClick={() => setSnoozeModalSchedule(schedule)}
            className="btn btn-outline"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '13px', color: (isTaken || isSkipped) ? 'var(--text-secondary)' : 'var(--warning-color)', borderColor: (isTaken || isSkipped) ? 'var(--border-color)' : 'var(--warning-color)', display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: (isTaken || isSkipped) ? 0.5 : 1, cursor: (isTaken || isSkipped) ? 'not-allowed' : 'pointer' }}
            title="Snooze"
            disabled={isTaken || isSkipped}
          >
            <Clock size={16} />
            <span>Snooze</span>
          </button>

          {/* Skip Button */}
          <button
            onClick={() => setSkipModalSchedule(schedule)}
            className="btn btn-outline"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '13px', color: (isTaken || isSkipped) ? 'var(--text-secondary)' : 'var(--danger-color)', borderColor: (isTaken || isSkipped) ? 'var(--border-color)' : 'var(--danger-color)', display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: (isTaken || isSkipped) ? 0.5 : 1, cursor: (isTaken || isSkipped) ? 'not-allowed' : 'pointer' }}
            title="Skip Dose"
            disabled={isTaken || isSkipped}
          >
            <XCircle size={16} />
            <span>{isSkipped ? 'Skipped' : 'Skip'}</span>
          </button>
        </div>
      </div>
    );
  };

  const sections = [
    { title: 'Morning Doses', icon: <Sunrise size={20} color="#f97316" />, items: grouped.morning || [] },
    { title: 'Afternoon Doses', icon: <Sun size={20} color="#eab308" />, items: grouped.afternoon || [] },
    { title: 'Evening & Night Doses', icon: <Moon size={20} color="#6366f1" />, items: [...(grouped.evening || []), ...(grouped.night || [])] },
  ];

  const totalToday = schedules.length;

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>Today's Schedule</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0' }}>Medicines grouped by Morning, Afternoon & Night</p>
        </div>

        {streak > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '20px',
            fontWeight: '800',
            fontSize: '14px',
            boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Flame size={18} fill="#fff" />
            <span>{streak}-Day Streak!</span>
          </div>
        )}
      </div>

      {totalToday === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'var(--primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <Clock size={36} color="var(--primary-color)" />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>All Doses Caught Up!</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '15px' }}>
            No medications scheduled for today. Add a new prescription to generate reminders.
          </p>
          <button
            onClick={() => navigate('/add')}
            className="btn btn-primary"
            style={{ width: 'auto', display: 'inline-flex', padding: '12px 24px' }}
          >
            <Plus size={20} />
            <span>Add Prescription</span>
          </button>
        </div>
      ) : (
        <div>
          {sections.map((section, idx) => (
            section.items.length > 0 && (
              <div key={idx} style={{ marginBottom: '28px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {section.icon}
                  <span>{section.title} ({section.items.length})</span>
                </h2>

                {section.items.map(sch => renderScheduleCard(sch))}
              </div>
            )
          ))}
        </div>
      )}

      {/* Skip Reason Modal */}
      {skipModalSchedule && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px', color: 'var(--text-main)' }}>
              Reason for Skipping Dose?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Skipping {skipModalSchedule.medication_name}. Please specify a reason for your health logs:
            </p>

            <select
              className="input-field"
              value={skipReason}
              onChange={e => setSkipReason(e.target.value)}
              style={{ marginBottom: '20px' }}
            >
              <option value="Side effects">Side effects / Feeling unwell</option>
              <option value="Feeling better">Feeling better / Don't need it</option>
              <option value="Doctor advised">Doctor advised to pause</option>
              <option value="Forgot / Away from home">Forgot / Away from home</option>
              <option value="Out of stock">Out of stock / Need refill</option>
            </select>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setSkipModalSchedule(null)}
                className="btn btn-outline"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(skipModalSchedule.id, 'skipped', skipReason)}
                className="btn btn-primary"
                style={{ flex: 1, backgroundColor: 'var(--danger-color)' }}
              >
                Confirm Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snooze Duration Modal */}
      {snoozeModalSchedule && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '380px', width: '100%', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px', color: 'var(--text-main)' }}>
              Snooze Reminder
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Snoozing {snoozeModalSchedule.medication_name}. Choose how long:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              {getSnoozeOptions().map(opt => (
                <button
                  key={opt.minutes}
                  onClick={() => handleAction(snoozeModalSchedule.id, 'snoozed', '', opt.minutes)}
                  className="btn btn-outline"
                  style={{ borderColor: 'var(--warning-color)', color: 'var(--warning-color)', fontWeight: '700' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSnoozeModalSchedule(null)}
              className="btn btn-outline"
              style={{ width: '100%' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
