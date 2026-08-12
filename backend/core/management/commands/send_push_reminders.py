from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
import datetime
import json
import logging
import pytz
from core.models import MedicineReminder, PushSubscription, NotificationPreference, Notification
from core.services.email_service import send_reminder_email

logger = logging.getLogger('medimate.scheduler')


class Command(BaseCommand):
    help = 'Send ONE notification per pending reminder. Idempotent and race-condition safe.'

    def handle(self, *args, **options):
        now = timezone.now()
        logger.info(f"[send_push_reminders] Checking at UTC: {now}")

        # ── Collect IDs of reminders that are due and not yet sent ────────────
        # We first collect IDs, then lock them one-by-one atomically.
        # Only look at status='pending' (process_reminders already converted
        # snoozed→pending at the snooze wake time). We never touch 'snoozed'
        # records here — that is process_reminders' job.
        candidate_ids = list(
            MedicineReminder.objects.filter(
                status='pending',
                notification_sent=False,
            ).values_list('id', flat=True)
        )

        sent_count = 0

        for reminder_id in candidate_ids:
            # ── Atomic lock: claim this reminder before any other scheduler
            # iteration can process it. If two scheduler threads run at once,
            # only ONE will proceed past this block per reminder.
            with transaction.atomic():
                try:
                    reminder = (
                        MedicineReminder.objects
                        .select_for_update(nowait=True)
                        .get(pk=reminder_id, status='pending', notification_sent=False)
                    )
                except MedicineReminder.DoesNotExist:
                    # Already claimed by another thread or already sent — skip
                    continue
                except Exception:
                    # Lock could not be acquired (nowait) — another worker has it
                    continue

                # ── Compute the due time for this reminder ─────────────────
                try:
                    user_tz = pytz.timezone(reminder.timezone)
                except Exception:
                    user_tz = pytz.timezone('Asia/Kolkata')

                naive_dt = datetime.datetime.combine(reminder.reminder_date, reminder.reminder_time)
                local_dt = user_tz.localize(naive_dt)
                utc_dt = local_dt.astimezone(pytz.utc)

                # After a snooze wake-up, process_reminders clears snoozed_until,
                # so target_send_dt is always utc_dt here. Keep the field check
                # as a safety net.
                target_send_dt = reminder.snoozed_until if reminder.snoozed_until else utc_dt

                if now < target_send_dt:
                    # Not due yet — skip (no lock held after context exit)
                    continue

                # ── CLAIM: Mark notification_sent = True INSIDE the transaction
                # so no other scheduler iteration can claim this record. ──────
                reminder.notification_sent = True
                reminder.push_sent = False   # will update below after sending
                reminder.email_sent = False
                # Clear retry fields — retries are NOT used; snooze is the
                # explicit re-notification mechanism.
                reminder.retry_count = 0
                reminder.next_retry_at = None
                reminder.save()
                # Transaction commits here — record is now permanently claimed.

            # ── Send notifications OUTSIDE the transaction so a push failure
            # does NOT roll back notification_sent. The record is already claimed.
            user = reminder.user
            prefs, _ = NotificationPreference.objects.get_or_create(user=user)

            # In-App notification
            if prefs.in_app_enabled:
                try:
                    Notification.objects.create(
                        user=user,
                        title=f"🔔 Medicine Reminder: {reminder.medicine_name}",
                        message=f"It's time to take your {reminder.medicine_name} ({reminder.dosage}).",
                        notification_type="reminder"
                    )
                except Exception as e:
                    logger.warning(f"In-app notification creation failed: {e}")

            # Web Push
            if prefs.push_enabled:
                subscriptions = PushSubscription.objects.filter(user=user)
                payload = {
                    'title': '💊 MediMate Medicine Reminder',
                    'body': f"It's time to take {reminder.medicine_name} — {reminder.dosage or '1 tablet'}.",
                    'icon': '/icons/icon-192.png',
                    'data': {
                        'url': '/',
                        'scheduleId': reminder.schedule_id if reminder.schedule else None
                    },
                    'tag': f'medimate-reminder-{reminder.id}'
                }
                push_ok = False
                for sub in subscriptions:
                    try:
                        from pywebpush import webpush
                        from django.conf import settings
                        webpush(
                            subscription_info={
                                'endpoint': sub.endpoint,
                                'keys': {'p256dh': sub.p256dh, 'auth': sub.auth}
                            },
                            data=json.dumps(payload),
                            vapid_private_key=getattr(settings, 'VAPID_PRIVATE_KEY', ''),
                            vapid_claims={
                                'sub': f'mailto:{getattr(settings, "VAPID_ADMIN_EMAIL", "admin@medimate.app")}'
                            }
                        )
                        push_ok = True
                        logger.info(f"[Push] Sent to {user.username} for {reminder.medicine_name}")
                    except Exception as pe:
                        logger.warning(f"[Push] Failed for sub {sub.id}: {pe}")

                if push_ok:
                    MedicineReminder.objects.filter(pk=reminder.pk).update(push_sent=True)

            # Email
            if prefs.email_enabled:
                try:
                    email_ok = send_reminder_email(user, reminder)
                    if email_ok:
                        MedicineReminder.objects.filter(pk=reminder.pk).update(email_sent=True)
                except Exception as e:
                    logger.warning(f"[Email] Failed for reminder {reminder.id}: {e}")

            sent_count += 1
            logger.info(
                f"[send_push_reminders] ONE notification sent: "
                f"{reminder.medicine_name} (id={reminder.id}, user={user.username})"
            )

        self.stdout.write(
            self.style.SUCCESS(f"[send_push_reminders] Done. Sent {sent_count} notifications.")
        )
