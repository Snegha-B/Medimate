from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from core.models import MedicineReminder, DoseLog
import datetime
import pytz


class Command(BaseCommand):
    help = 'Restores snoozed reminders when their snooze time arrives; marks overdue ones as missed.'

    def handle(self, *args, **options):
        now = timezone.now()
        self.stdout.write(f"[process_reminders] Running at {now}")

        # ── 1. Restore Snoozed Reminders atomically ───────────────────────────
        # Collect IDs first, then lock each one individually to avoid a race
        # where two scheduler cycles restore the same snoozed reminder.
        snoozed_ids = list(
            MedicineReminder.objects.filter(
                status='snoozed',
                snoozed_until__lte=now
            ).values_list('id', flat=True)
        )

        for rid in snoozed_ids:
            with transaction.atomic():
                try:
                    reminder = (
                        MedicineReminder.objects
                        .select_for_update(nowait=True)
                        .get(pk=rid, status='snoozed', snoozed_until__lte=now)
                    )
                except MedicineReminder.DoesNotExist:
                    # Already restored by another cycle — skip
                    continue
                except Exception:
                    # Could not acquire lock — skip, next cycle will get it
                    continue

                # Restore to pending with a FRESH, CLEAN notification state.
                # notification_sent=False ensures send_push_reminders will fire
                # exactly ONCE for this newly-due reminder.
                reminder.status = 'pending'
                reminder.snoozed_until = None
                reminder.notification_sent = False
                reminder.push_sent = False
                reminder.email_sent = False
                # Clear retry counters — we do NOT use retries; snooze is the
                # intentional re-notification mechanism.
                reminder.retry_count = 0
                reminder.next_retry_at = None
                reminder.save()

                self.stdout.write(self.style.NOTICE(
                    f"[process_reminders] Snoozed reminder {reminder.id} "
                    f"({reminder.medicine_name}) restored to pending."
                ))

        # ── 2. Mark overdue pending reminders as MISSED ───────────────────────
        # A reminder is missed only after its full window (original time +
        # cutoff) has elapsed. We use updated_at as the anchor for recently
        # restored snooze reminders so they get a fresh window.
        pending_ids = list(
            MedicineReminder.objects.filter(status='pending').values_list('id', flat=True)
        )

        for rid in pending_ids:
            try:
                reminder = MedicineReminder.objects.get(pk=rid, status='pending')
            except MedicineReminder.DoesNotExist:
                continue

            try:
                user_tz = pytz.timezone(reminder.timezone)
            except Exception:
                user_tz = pytz.timezone('Asia/Kolkata')

            naive_dt = datetime.datetime.combine(reminder.reminder_date, reminder.reminder_time)
            local_dt = user_tz.localize(naive_dt)
            utc_dt = local_dt.astimezone(pytz.utc)

            if now <= utc_dt:
                continue  # Not yet past the original scheduled time

            # Give a 30-minute window before marking missed.
            # For snooze-restored reminders use updated_at as anchor so the
            # freshly-restored reminder doesn't get immediately killed.
            if reminder.updated_at and reminder.updated_at > utc_dt:
                cutoff_anchor = reminder.updated_at
            else:
                cutoff_anchor = utc_dt

            cutoff_dt = cutoff_anchor + datetime.timedelta(minutes=30)

            if now > cutoff_dt:
                with transaction.atomic():
                    try:
                        reminder = MedicineReminder.objects.select_for_update(nowait=True).get(
                            pk=rid, status='pending'
                        )
                    except Exception:
                        continue
                    reminder.status = 'missed'
                    reminder.save()

                    if reminder.schedule:
                        DoseLog.objects.get_or_create(
                            schedule=reminder.schedule,
                            defaults={'status': 'missed'}
                        )
                    self.stdout.write(self.style.WARNING(
                        f"[process_reminders] Reminder {reminder.id} "
                        f"({reminder.medicine_name}) marked as MISSED."
                    ))
