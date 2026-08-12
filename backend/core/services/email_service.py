"""
Email Service — MediMate Phase 6
Sends medicine reminder emails via Django's email backend (SMTP).
Never crashes the scheduler — all errors are caught and logged.
"""

import logging
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger('medimate.email')


def get_time_greeting(hour):
    """Return a time-appropriate greeting based on the hour (0-23)."""
    if 5 <= hour < 12:
        return "Good morning"
    elif 12 <= hour < 17:
        return "Good afternoon"
    elif 17 <= hour < 21:
        return "Good evening"
    else:
        return "Good night"


def send_reminder_email(user, reminder):
    """
    Send a medicine reminder email to the user.

    Args:
        user: Django User instance
        reminder: MedicineReminder instance

    Returns:
        bool: True if sent successfully, False otherwise
    """
    if not user.email:
        logger.warning(f"[Email] User {user.username} has no email address. Skipping email reminder.")
        return False

    # Check if email backend is configured
    email_host_user = getattr(settings, 'EMAIL_HOST_USER', '')
    if not email_host_user:
        logger.warning("[Email] EMAIL_HOST_USER not configured. Skipping email reminder.")
        return False

    hour = reminder.reminder_time.hour
    greeting = get_time_greeting(hour)
    time_display = reminder.reminder_time.strftime('%I:%M %p')
    user_name = user.get_full_name() or user.username

    subject = f"MediMate Medicine Reminder — {reminder.medicine_name}"

    # Build HTML email body
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background-color: #f4f6f9;
                margin: 0;
                padding: 0;
            }}
            .container {{
                max-width: 520px;
                margin: 32px auto;
                background: #ffffff;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 4px 24px rgba(0,0,0,0.08);
            }}
            .header {{
                background: linear-gradient(135deg, #6366f1, #8b5cf6);
                color: #ffffff;
                padding: 32px 24px;
                text-align: center;
            }}
            .header h1 {{
                margin: 0;
                font-size: 24px;
                font-weight: 800;
            }}
            .header p {{
                margin: 8px 0 0;
                font-size: 14px;
                opacity: 0.9;
            }}
            .body {{
                padding: 32px 24px;
            }}
            .greeting {{
                font-size: 18px;
                font-weight: 600;
                color: #1e293b;
                margin-bottom: 16px;
            }}
            .reminder-card {{
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 20px;
                margin: 20px 0;
            }}
            .reminder-card .label {{
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                color: #64748b;
                margin-bottom: 4px;
            }}
            .reminder-card .value {{
                font-size: 16px;
                font-weight: 600;
                color: #1e293b;
                margin-bottom: 12px;
            }}
            .cta {{
                text-align: center;
                margin: 24px 0;
            }}
            .cta p {{
                color: #475569;
                font-size: 14px;
            }}
            .footer {{
                text-align: center;
                padding: 16px 24px;
                color: #94a3b8;
                font-size: 12px;
                border-top: 1px solid #e2e8f0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>💊 MediMate</h1>
                <p>Medicine Reminder</p>
            </div>
            <div class="body">
                <div class="greeting">{greeting}, {user_name}!</div>
                <p style="color: #475569; font-size: 15px;">
                    It is time to take your medicine.
                </p>
                <div class="reminder-card">
                    <div class="label">Medicine</div>
                    <div class="value">{reminder.medicine_name}</div>
                    <div class="label">Dosage</div>
                    <div class="value">{reminder.dosage or 'As prescribed'}</div>
                    <div class="label">Scheduled Time</div>
                    <div class="value">{time_display}</div>
                </div>
                <div class="cta">
                    <p>Please mark the medicine as taken in MediMate after taking it.</p>
                </div>
            </div>
            <div class="footer">
                Regards,<br>
                <strong>MediMate</strong> — Smart Health Assistant<br>
                <br>
                This is an automated reminder. If you no longer wish to receive email reminders,
                please update your notification preferences in MediMate Settings.
            </div>
        </div>
    </body>
    </html>
    """

    plain_message = f"""{greeting}, {user_name}!

It is time to take your medicine.

Medicine: {reminder.medicine_name}
Dosage: {reminder.dosage or 'As prescribed'}
Scheduled Time: {time_display}

Please mark the medicine as taken in MediMate after taking it.

Regards,
MediMate — Smart Health Assistant
"""

    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@medimate.app')

    try:
        send_mail(
            subject=subject,
            message=plain_message,
            from_email=from_email,
            recipient_list=[user.email],
            html_message=html_message,
            fail_silently=False,
        )
        logger.info(f"[Email] Reminder email sent to {user.email} for {reminder.medicine_name}")
        return True
    except Exception as e:
        logger.error(f"[Email] Failed to send email to {user.email} for {reminder.medicine_name}: {e}")
        return False
