from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth.models import User
from core.models import Medication, MedicineReminder
import datetime
import pytz

class Command(BaseCommand):
    help = 'Generate daily MedicineReminder records for all users based on active medication schedules.'

    def handle(self, *args, **options):
        self.stdout.write("Generating daily reminders...")
        today_utc = timezone.now().date()
        
        users = User.objects.all()
        generated_count = 0

        for user_obj in users:
            # Get user profile timezone
            profile = getattr(user_obj, 'profile', None)
            tz_str = profile.timezone if profile else 'Asia/Kolkata'
            try:
                user_tz = pytz.timezone(tz_str)
            except Exception:
                user_tz = pytz.timezone('Asia/Kolkata')

            # Get user's current local date
            now_local = timezone.now().astimezone(user_tz)
            local_date = now_local.date()

            # Find active medications for this user on local_date
            medications = Medication.objects.filter(
                prescription__user=user_obj,
                start_date__lte=local_date
            )

            for med in medications:
                # Check if it has schedules for this day
                days_diff = (local_date - med.start_date).days
                schedules = med.schedules.none()
                if days_diff >= 0:
                    if days_diff < med.duration_days:
                        schedules = med.schedules.filter(day_offset=days_diff)
                        if not schedules.exists() and med.frequency and 'daily' in med.frequency.lower():
                            schedules = med.schedules.filter(day_offset=0)
                    else:
                        if med.frequency and 'daily' in med.frequency.lower():
                            schedules = med.schedules.filter(day_offset=0)

                for sch in schedules:
                    # Create the MedicineReminder
                    reminder, created = MedicineReminder.objects.get_or_create(
                        user=user_obj,
                        medication=med,
                        reminder_date=local_date,
                        reminder_time=sch.scheduled_time,
                        defaults={
                            'schedule': sch,
                            'medicine_name': med.name,
                            'dosage': med.dosage or '',
                            'timezone': tz_str,
                            'status': 'pending',
                        }
                    )
                    if created:
                        generated_count += 1

        self.stdout.write(self.style.SUCCESS(f"Successfully generated {generated_count} reminders for date {today_utc}."))
