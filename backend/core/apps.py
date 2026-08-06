from django.apps import AppConfig
import os

class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        # Start background push scheduler in main process only
        if os.environ.get('RUN_MAIN') == 'true' or os.environ.get('START_SCHEDULER') == 'true':
            from core.scheduler import start_scheduler
            start_scheduler()
