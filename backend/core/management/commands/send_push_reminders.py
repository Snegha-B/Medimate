from django.core.management.base import BaseCommand
from django.utils import timezone
import datetime
import json
from core.models import Schedule, PushSubscription

class Command(BaseCommand):
    help = 'Check upcoming medication schedules and send Web Push notifications to subscribed users.'

    def handle(self, *args, **options):
        now = timezone.now()
        current_time = now.time()
        
        # Look for schedules within a 15-minute window
        margin_minutes = 15
        min_time = (now - datetime.timedelta(minutes=margin_minutes)).time()
        max_time = (now + datetime.timedelta(minutes=margin_minutes)).time()

        schedules = Schedule.objects.select_related('medication', 'medication__prescription__user')

        sent_count = 0
        for sch in schedules:
            med = sch.medication
            days_elapsed = (now.date() - med.start_date).days
            if sch.day_offset == days_elapsed:
                if min_time <= sch.scheduled_time <= max_time:
                    user = med.prescription.user
                    subscriptions = PushSubscription.objects.filter(user=user) if user else PushSubscription.objects.all()

                    payload = {
                        'title': f'⏰ Time for {med.name}!',
                        'body': f'Dosage: {med.dosage or "1 dose"} at {sch.scheduled_time.strftime("%I:%M %p")}',
                        'icon': '/icons/icon-192.png',
                        'data': {'url': '/'}
                    }

                    for sub in subscriptions:
                        try:
                            from pywebpush import webpush, WebPushException
                            from django.conf import settings
                            
                            webpush(
                                subscription_info={
                                    'endpoint': sub.endpoint,
                                    'keys': {
                                        'p256dh': sub.p256dh,
                                        'auth': sub.auth
                                    }
                                },
                                data=json.dumps(payload),
                                vapid_private_key=getattr(settings, 'VAPID_PRIVATE_KEY', ''),
                                vapid_claims={'sub': f'mailto:{getattr(settings, "VAPID_ADMIN_EMAIL", "admin@medimate.app")}'}
                            )
                            sent_count += 1
                        except Exception as e:
                            self.stdout.write(self.style.WARNING(f"Push send error for {sub.endpoint[:20]}: {e}"))

        self.stdout.write(self.style.SUCCESS(f"Successfully processed reminders. Sent {sent_count} push notifications."))
