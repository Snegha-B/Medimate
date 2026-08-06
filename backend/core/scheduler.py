import time
import threading
import os
from django.core.management import call_command

def start_scheduler():
    def loop():
        while True:
            try:
                call_command('send_push_reminders')
            except Exception as e:
                print(f"Scheduler error: {e}")
            time.sleep(300) # Run every 5 minutes

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
