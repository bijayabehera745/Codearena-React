# core/celery.py
import os
from celery import Celery

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# Name your Celery app
app = Celery('core')

# Load task modules from all registered Django apps.
# The namespace='CELERY' means all celery-related configuration keys 
# should have a `CELERY_` prefix in settings.py.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks in all installed apps (like your 'judge' app)
app.autodiscover_tasks()