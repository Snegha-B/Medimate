from django.contrib import admin
from .models import (
    Prescription,
    Medication,
    Schedule,
    DoseLog,
    PushSubscription,
    ReferenceRange,
    LabReport,
    LabValue,
    ShareToken,
    UserProfile,
    Caregiver,
    Appointment,
    Notification,
    MedicineReminder,
    NotificationPreference,
    FCMDevice,
)

admin.site.register(Prescription)
admin.site.register(Medication)
admin.site.register(Schedule)
admin.site.register(DoseLog)
admin.site.register(PushSubscription)
admin.site.register(ReferenceRange)
admin.site.register(LabReport)
admin.site.register(LabValue)
admin.site.register(ShareToken)
admin.site.register(UserProfile)
admin.site.register(Caregiver)
admin.site.register(Appointment)
admin.site.register(Notification)
admin.site.register(MedicineReminder)
admin.site.register(NotificationPreference)
admin.site.register(FCMDevice)