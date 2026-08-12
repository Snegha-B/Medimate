# Medicine Reminder Notification System Documentation

This document describes the design, architecture, setup, and execution details for the production-ready Medicine Reminder Notification System implemented in **MediMate**.

---

## 1. How Reminder Scheduling Works
- Reminders are stored inside the `MedicineReminder` database model as the source of truth.
- A daily task generates `MedicineReminder` instances for the current date based on active schedules created under medications.
- The backend scheduler checks every 60 seconds for pending reminders matching the target date/time, evaluates retries, and coordinates delivery channels.

## 2. Email Reminders
- Emails are delivered in responsive, styled HTML/Text format.
- Leverages SMTP configuration. If no SMTP login variables are found, the scheduler logs warning info and defaults to Django's console email backend to ensure smooth local testing.

## 3. Mobile Web Push
- Push notifications are delivered using `pywebpush` to the browser's Service Worker subscription endpoint.
- Works when the app is active, minimized, or closed.

## 4. Voice Reminders
- Built on top of the native browser Web Speech API.
- Plays a custom time-of-day greeting ("Good morning", "Good afternoon", "Good evening", "Good night") in the user's selected language, followed by medication details.

---

## 5. Required Environment Variables (.env)
Create a `.env` file in the `backend/` directory using these values:
```env
EMAIL_HOST_USER=your-smtp-email@gmail.com
EMAIL_HOST_PASSWORD=your-smtp-password
EMAIL_FROM=MediMate <noreply@medimate.app>
REMINDER_RETRY_INTERVAL_MINUTES=15
REMINDER_MAX_RETRIES=2
```

## 6. How to Run & Migrate
1. **Migrations**:
   ```bash
   cd backend
   python manage.py makemigrations
   python manage.py migrate
   ```
2. **Launch server with background scheduler enabled**:
   ```bash
   python manage.py runserver
   ```
3. **Start frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

---

## 7. Limitations & Native Mobile Requirements
- **Voice Autoplay**: Modern browsers block text-to-speech autoplay unless the user has actively interacted with the page first.
- **Background Voice**: Browsers cannot synthesize voice or trigger browser Speech synthesis when the tab/app is completely closed. Native platform capabilities (e.g., Swift/Kotlin background service plugins) are required for offline/closed native voice reminders.
- **Offline Delivery**: Reminders cannot be delivered to a device that has no active internet connection. The system holds pending notifications and delivers them as soon as the client comes online.
