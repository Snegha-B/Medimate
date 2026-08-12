import time
import threading
import logging
from django.core.management import call_command

logger = logging.getLogger('medimate.scheduler')

def start_scheduler():
    def loop():
        logger.info("Background reminder scheduler started.")
        while True:
            try:
                # Generate new daily reminders
                call_command('generate_daily_reminders')
                # Process active/missed states
                call_command('process_reminders')
                # Dispatch push notifications & emails
                call_command('send_push_reminders')
            except Exception as e:
                logger.error(f"Scheduler error in loop execution: {e}")
            time.sleep(60) # Check every 60 seconds

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()

