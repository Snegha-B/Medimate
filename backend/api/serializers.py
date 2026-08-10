from rest_framework import serializers
from django.contrib.auth.models import User
from django.utils import timezone
import datetime
from core.models import Prescription, Medication, Schedule, DoseLog, LabReport, LabValue, ShareToken, UserProfile, Caregiver, Appointment, Notification



class UserProfileSerializer(serializers.ModelSerializer):
    age = serializers.IntegerField(required=False, allow_null=True)
    gender = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    blood_group = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    emergency_contact = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    medical_conditions = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    allergies = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = UserProfile
        fields = [
            'profile_picture', 'age', 'gender', 'blood_group',
            'emergency_contact', 'medical_conditions', 'allergies',
            # Phase 3: Accessibility & Voice
            'preferred_language', 'voice_enabled', 'speech_speed',
            'elder_mode', 'high_contrast', 'large_text', 'reminder_repeat_count'
        ]


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'profile']

class PrescriptionSerializer(serializers.ModelSerializer):
    medications = serializers.SerializerMethodField()

    class Meta:
        model = Prescription
        fields = '__all__'
        read_only_fields = ['user', 'uploaded_at']

    def get_medications(self, obj):
        meds = obj.medications.all()
        return MedicationSerializer(meds, many=True).data


class DoseLogSerializer(serializers.ModelSerializer):
    scheduled_time = serializers.SerializerMethodField()
    medication_name = serializers.CharField(source='schedule.medication.name', read_only=True)

    class Meta:
        model = DoseLog
        fields = ['id', 'schedule', 'status', 'skip_reason', 'snoozed_until', 'logged_at', 'scheduled_time', 'medication_name']

    def get_scheduled_time(self, obj):
        return obj.schedule.scheduled_time.strftime('%H:%M') if obj.schedule else ''

class MedicationSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    days_remaining = serializers.SerializerMethodField()
    next_reminder = serializers.SerializerMethodField()
    end_date = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()
    # Phase 4: Inventory computed fields
    inventory_status = serializers.SerializerMethodField()
    days_supply_remaining = serializers.SerializerMethodField()
    expiry_alert_level = serializers.SerializerMethodField()

    class Meta:
        model = Medication
        fields = [
            'id', 'prescription', 'name', 'dosage', 'frequency', 'duration_days',
            'start_date', 'end_date', 'total_tablets', 'remaining_tablets',
            'category', 'timing_instruction', 'morning', 'afternoon', 'evening', 'night',
            'morning_time', 'afternoon_time', 'evening_time', 'night_time',
            'expiry_date', 'batch_number',
            'status', 'days_remaining', 'next_reminder', 'history',
            'inventory_status', 'days_supply_remaining', 'expiry_alert_level'
        ]

    def get_status(self, obj):
        today = timezone.now().date()
        end_d = obj.start_date + datetime.timedelta(days=obj.duration_days)
        if today > end_d or obj.remaining_tablets <= 0:
            return 'Completed'
        elif today < obj.start_date:
            return 'Upcoming'
        else:
            return 'Active'

    def get_days_remaining(self, obj):
        today = timezone.now().date()
        end_d = obj.start_date + datetime.timedelta(days=obj.duration_days)
        diff = (end_d - today).days
        return max(0, diff)

    def get_end_date(self, obj):
        end_d = obj.start_date + datetime.timedelta(days=obj.duration_days)
        return end_d.strftime('%Y-%m-%d')

    def get_next_reminder(self, obj):
        first_sch = obj.schedules.first()
        return first_sch.scheduled_time.strftime('%H:%M') if first_sch else '09:00'

    def get_history(self, obj):
        logs = DoseLog.objects.filter(schedule__medication=obj).order_by('-logged_at')[:10]
        return DoseLogSerializer(logs, many=True).data

    def get_inventory_status(self, obj):
        """ok / low / critical / expired based on days supply remaining."""
        days = self._calc_days_supply(obj)
        today = timezone.now().date()
        if obj.expiry_date and today > obj.expiry_date:
            return 'expired'
        if days is None:
            return 'ok'
        if days <= 2:
            return 'critical'
        if days <= 5:
            return 'low'
        return 'ok'

    def get_days_supply_remaining(self, obj):
        return self._calc_days_supply(obj)

    def _calc_days_supply(self, obj):
        daily_doses = sum([
            1 if obj.morning else 0,
            1 if obj.afternoon else 0,
            1 if obj.evening else 0,
            1 if obj.night else 0,
        ])
        if daily_doses == 0:
            daily_doses = 1
        remaining = obj.remaining_tablets or 0
        return remaining // daily_doses

    def get_expiry_alert_level(self, obj):
        """none / warn30 / warn15 / warn7 / expired"""
        if not obj.expiry_date:
            return 'none'
        today = timezone.now().date()
        days_to_expiry = (obj.expiry_date - today).days
        if days_to_expiry < 0:
            return 'expired'
        if days_to_expiry <= 7:
            return 'warn7'
        if days_to_expiry <= 15:
            return 'warn15'
        if days_to_expiry <= 30:
            return 'warn30'
        return 'none'


class ScheduleSerializer(serializers.ModelSerializer):
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    dosage = serializers.CharField(source='medication.dosage', read_only=True)
    frequency = serializers.CharField(source='medication.frequency', read_only=True)
    duration_days = serializers.IntegerField(source='medication.duration_days', read_only=True)
    start_date = serializers.DateField(source='medication.start_date', read_only=True)
    timing_instruction = serializers.CharField(source='medication.timing_instruction', read_only=True)
    category = serializers.CharField(source='medication.category', read_only=True)
    remaining_tablets = serializers.IntegerField(source='medication.remaining_tablets', read_only=True)
    status = serializers.SerializerMethodField()
    skip_reason = serializers.SerializerMethodField()
    time_slot = serializers.SerializerMethodField()

    class Meta:
        model = Schedule
        fields = [
            'id', 'medication', 'scheduled_time', 'day_offset',
            'medication_name', 'dosage', 'frequency', 'duration_days', 'start_date',
            'timing_instruction', 'category', 'remaining_tablets', 'status', 'skip_reason', 'time_slot'
        ]

    def get_status(self, obj):
        log = DoseLog.objects.filter(schedule=obj).first()
        return log.status if log else 'pending'

    def get_skip_reason(self, obj):
        log = DoseLog.objects.filter(schedule=obj).first()
        return log.skip_reason if log else None

    def get_time_slot(self, obj):
        h = obj.scheduled_time.hour
        if h < 12:
            return 'Morning'
        elif h < 17:
            return 'Afternoon'
        elif h < 21:
            return 'Evening'
        else:
            return 'Night'


class LabValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabValue
        fields = '__all__'

class LabReportSerializer(serializers.ModelSerializer):
    values = LabValueSerializer(many=True, read_only=True)

    class Meta:
        model = LabReport
        fields = '__all__'

class ShareTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareToken
        fields = ['id', 'token', 'created_at', 'is_active']


class CaregiverSerializer(serializers.ModelSerializer):
    class Meta:
        model = Caregiver
        fields = ['id', 'name', 'relationship', 'mobile', 'email', 'is_emergency_contact', 'created_at']
        read_only_fields = ['created_at']


class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = ['id', 'doctor_name', 'hospital_name', 'date', 'time', 'reason', 'notes', 'created_at']
        read_only_fields = ['created_at']


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'notification_type', 'is_read', 'created_at']
        read_only_fields = ['created_at']

