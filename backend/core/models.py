from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class Prescription(models.Model):
    STATUS_CHOICES = [
        ('processed', 'Processed'),
        ('review_required', 'Review Required'),
        ('failed', 'Failed'),
    ]

    DOCUMENT_TYPE_CHOICES = [
        ('prescription', 'Doctor Prescription'),
        ('blood_test', 'Blood Test Report'),
        ('urine_test', 'Urine Test Report'),
        ('ultrasound', 'Ultrasound Report'),
        ('xray', 'X-Ray Report'),
        ('mri', 'MRI Report'),
        ('ct_scan', 'CT Scan Report'),
        ('ecg', 'ECG Report'),
        ('discharge_summary', 'Discharge Summary'),
        ('vaccination', 'Vaccination Record'),
        ('medical_certificate', 'General Medical Certificate'),
        ('unknown', 'Unknown / Unrecognized'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='prescriptions')
    image = models.ImageField(upload_to='prescriptions/', null=True, blank=True)
    pdf_file = models.FileField(upload_to='prescriptions/pdf/', null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    raw_ocr_text = models.TextField(blank=True, null=True)
    doctor_name = models.CharField(max_length=255, blank=True, null=True)
    doctor_notes = models.TextField(blank=True, null=True)
    doctor_instructions = models.TextField(blank=True, null=True)
    confidence_score = models.FloatField(default=90.0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='processed')

    # Phase 5: Smart Document Classification
    document_type = models.CharField(max_length=30, choices=DOCUMENT_TYPE_CHOICES, default='prescription')
    classification_confidence = models.FloatField(default=0.0)
    ocr_confidence = models.FloatField(default=0.0)
    ai_summary = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Prescription {self.id} for {self.user.username}"


class Medication(models.Model):
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name='medications')
    name = models.CharField(max_length=255)
    dosage = models.CharField(max_length=100, blank=True, null=True)
    frequency = models.CharField(max_length=100, blank=True, null=True)  # e.g., '1-0-1', 'twice daily'
    duration_days = models.IntegerField(default=1)
    start_date = models.DateField(default=timezone.now)

    # Smart AI Extensions
    total_tablets = models.IntegerField(default=30)
    remaining_tablets = models.IntegerField(default=30)
    category = models.CharField(max_length=100, default='General')
    timing_instruction = models.CharField(max_length=50, default='after_food')  # 'before_food', 'after_food', 'with_food'
    morning = models.BooleanField(default=True)
    afternoon = models.BooleanField(default=False)
    evening = models.BooleanField(default=False)
    night = models.BooleanField(default=True)

    # User-defined reminder slot times
    morning_time = models.TimeField(null=True, blank=True)
    afternoon_time = models.TimeField(null=True, blank=True)
    evening_time = models.TimeField(null=True, blank=True)
    night_time = models.TimeField(null=True, blank=True)

    # Phase 4: Inventory & Expiry Tracking
    expiry_date = models.DateField(null=True, blank=True)
    batch_number = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return self.name

class Schedule(models.Model):
    medication = models.ForeignKey(Medication, on_delete=models.CASCADE, related_name='schedules')
    scheduled_time = models.TimeField()
    day_offset = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.medication.name} at {self.scheduled_time} (Day {self.day_offset})"

class DoseLog(models.Model):
    STATUS_CHOICES = [
        ('taken', 'Taken'),
        ('missed', 'Missed'),
        ('skipped', 'Skipped'),
        ('snoozed', 'Snoozed'),
    ]
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name='doselogs')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    skip_reason = models.CharField(max_length=255, blank=True, null=True)
    snoozed_until = models.DateTimeField(blank=True, null=True)
    logged_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.schedule} - {self.status}"


class PushSubscription(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_subscriptions', null=True, blank=True)
    endpoint = models.TextField(unique=True)
    p256dh = models.TextField()
    auth = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"PushSubscription ({self.user.username if self.user else 'Anonymous'}) - {self.endpoint[:30]}"

class ReferenceRange(models.Model):
    test_name = models.CharField(max_length=100, unique=True)
    unit = models.CharField(max_length=50)
    min_normal = models.FloatField(null=True, blank=True)
    max_normal = models.FloatField(null=True, blank=True)
    category = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return f"{self.test_name} ({self.min_normal}-{self.max_normal} {self.unit})"

class LabReport(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='lab_reports')
    image = models.ImageField(upload_to='lab_reports/', null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    raw_ocr_text = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Lab Report {self.id} for {self.user.username}"

class LabValue(models.Model):
    STATUS_CHOICES = [
        ('normal', 'Normal'),
        ('high', 'High'),
        ('low', 'Low'),
    ]
    report = models.ForeignKey(LabReport, on_delete=models.CASCADE, related_name='values')
    test_name = models.CharField(max_length=100)
    value = models.FloatField()
    unit = models.CharField(max_length=50, blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='normal')

    def __str__(self):
        return f"{self.test_name}: {self.value} {self.unit} ({self.status})"

class ShareToken(models.Model):
    import uuid
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='share_tokens')
    token = models.CharField(max_length=64, unique=True, default=uuid.uuid4)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"ShareToken for {self.user.username} (Active: {self.is_active})"

class UserProfile(models.Model):
    GENDER_CHOICES = [
        ('Male', 'Male'),
        ('Female', 'Female'),
        ('Other', 'Other'),
        ('Prefer not to say', 'Prefer not to say'),
    ]

    BLOOD_GROUP_CHOICES = [
        ('A+', 'A+'),
        ('A-', 'A-'),
        ('B+', 'B+'),
        ('B-', 'B-'),
        ('AB+', 'AB+'),
        ('AB-', 'AB-'),
        ('O+', 'O+'),
        ('O-', 'O-'),
    ]

    LANGUAGE_CHOICES = [
        ('en', 'English'),
        ('hi', 'Hindi'),
        ('kn', 'Kannada'),
        ('ta', 'Tamil'),
        ('te', 'Telugu'),
        ('ml', 'Malayalam'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    profile_picture = models.TextField(blank=True, null=True) # Avatar URL or Base64 string
    age = models.IntegerField(null=True, blank=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, blank=True, null=True)
    blood_group = models.CharField(max_length=5, choices=BLOOD_GROUP_CHOICES, blank=True, null=True)
    emergency_contact = models.CharField(max_length=50, blank=True, null=True)
    medical_conditions = models.TextField(blank=True, null=True)
    allergies = models.TextField(blank=True, null=True)

    # Phase 3: Accessibility & Voice Settings
    preferred_language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, default='en')
    voice_enabled = models.BooleanField(default=True)
    speech_speed = models.FloatField(default=1.0)
    elder_mode = models.BooleanField(default=False)
    high_contrast = models.BooleanField(default=False)
    large_text = models.BooleanField(default=False)
    reminder_repeat_count = models.IntegerField(default=3)

    # Phase 6: Timezone for correct reminder scheduling
    timezone = models.CharField(max_length=50, default='Asia/Kolkata')

    def __str__(self):
        return f"Profile for {self.user.username}"


class Caregiver(models.Model):
    RELATIONSHIP_CHOICES = [
        ('spouse', 'Spouse'),
        ('parent', 'Parent'),
        ('child', 'Child'),
        ('sibling', 'Sibling'),
        ('friend', 'Friend'),
        ('doctor', 'Doctor'),
        ('nurse', 'Nurse'),
        ('other', 'Other'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='caregivers')
    name = models.CharField(max_length=200)
    relationship = models.CharField(max_length=20, choices=RELATIONSHIP_CHOICES, default='other')
    mobile = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    is_emergency_contact = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.relationship}) — caregiver for {self.user.username}"


class Appointment(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='appointments')
    doctor_name = models.CharField(max_length=255)
    hospital_name = models.CharField(max_length=255, blank=True, null=True)
    date = models.DateField()
    time = models.TimeField()
    reason = models.CharField(max_length=255, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Appointment with Dr. {self.doctor_name} on {self.date} at {self.time}"


class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ('reminder', 'Reminder'),
        ('missed_dose', 'Missed Dose'),
        ('inventory', 'Low Stock'),
        ('expiry', 'Expiry Warning'),
        ('appointment', 'Appointment'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES, default='reminder')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} - {self.user.username} (Read: {self.is_read})"


# ========================================================
# PHASE 6: MEDICINE REMINDER NOTIFICATION SYSTEM
# ========================================================

class MedicineReminder(models.Model):
    """
    Per-dose reminder instance — the source of truth for the backend scheduler.
    Each record represents ONE reminder for ONE dose of ONE medicine on ONE date.
    The backend scheduler checks these records and triggers notifications.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('taken', 'Taken'),
        ('snoozed', 'Snoozed'),
        ('skipped', 'Skipped'),
        ('missed', 'Missed'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='medicine_reminders')
    medication = models.ForeignKey(Medication, on_delete=models.CASCADE, related_name='reminders', null=True, blank=True)
    schedule = models.ForeignKey(Schedule, on_delete=models.SET_NULL, null=True, blank=True, related_name='reminders')

    # Denormalized fields for quick access (medication might be deleted)
    medicine_name = models.CharField(max_length=255)
    dosage = models.CharField(max_length=100, blank=True, default='')

    # When to remind
    reminder_date = models.DateField()
    reminder_time = models.TimeField()
    timezone = models.CharField(max_length=50, default='Asia/Kolkata')

    # Status tracking
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')

    # Notification delivery tracking (prevents duplicate sends)
    notification_sent = models.BooleanField(default=False)
    push_sent = models.BooleanField(default=False)
    email_sent = models.BooleanField(default=False)

    # Retry logic
    retry_count = models.IntegerField(default=0)
    max_retries = models.IntegerField(default=2)
    retry_interval_minutes = models.IntegerField(default=15)
    next_retry_at = models.DateTimeField(null=True, blank=True)

    # Snooze
    snoozed_until = models.DateTimeField(null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'medication', 'reminder_date', 'reminder_time')
        ordering = ['reminder_date', 'reminder_time']
        indexes = [
            models.Index(fields=['status', 'reminder_date', 'reminder_time']),
            models.Index(fields=['user', 'reminder_date']),
        ]

    def __str__(self):
        return f"Reminder: {self.medicine_name} for {self.user.username} at {self.reminder_time} on {self.reminder_date} [{self.status}]"


class NotificationPreference(models.Model):
    """Per-user notification channel preferences."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='notification_preferences')
    in_app_enabled = models.BooleanField(default=True)
    push_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=True)
    voice_enabled = models.BooleanField(default=True)

    def __str__(self):
        channels = []
        if self.in_app_enabled: channels.append('InApp')
        if self.push_enabled: channels.append('Push')
        if self.email_enabled: channels.append('Email')
        if self.voice_enabled: channels.append('Voice')
        return f"NotifPrefs for {self.user.username}: {', '.join(channels)}"


class FCMDevice(models.Model):
    """
    Stores FCM device tokens for future native push notification support.
    Separate from PushSubscription which handles VAPID web push.
    """
    DEVICE_TYPE_CHOICES = [
        ('web', 'Web Browser'),
        ('android', 'Android'),
        ('ios', 'iOS'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='fcm_devices')
    registration_id = models.TextField(unique=True)
    device_type = models.CharField(max_length=10, choices=DEVICE_TYPE_CHOICES, default='web')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"FCMDevice ({self.device_type}) for {self.user.username} (Active: {self.is_active})"
