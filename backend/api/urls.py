from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.register, name='register'),
    path('login/', views.login_view, name='login'),
    path('profile/', views.profile_view, name='profile'),
    path('accessibility/', views.accessibility_settings, name='accessibility_settings'),

    path('dashboard/stats/', views.dashboard_stats, name='dashboard_stats'),
    path('prescriptions/', views.list_prescriptions, name='list_prescriptions'),
    path('prescriptions/<int:prescription_id>/', views.prescription_detail, name='prescription_detail'),
    path('prescriptions/upload/', views.upload_prescription, name='upload_prescription'),
    path('prescriptions/confirm/', views.confirm_prescription, name='confirm_prescription'),
    path('schedule/today/', views.today_schedule, name='today_schedule'),
    path('doselog/', views.log_dose, name='log_dose'),
    path('analytics/adherence/', views.adherence_analytics, name='adherence_analytics'),
    path('analytics/insights/', views.insights, name='insights'),
    path('medications/', views.my_medications, name='my_medications'),
    path('push/vapid-key/', views.get_vapid_key, name='get_vapid_key'),
    path('push/subscribe/', views.subscribe_push, name='subscribe_push'),
    path('reports/upload/', views.upload_lab_report, name='upload_lab_report'),
    path('reports/confirm/', views.confirm_lab_report, name='confirm_lab_report'),
    path('reports/', views.list_lab_reports, name='list_lab_reports'),
    path('reports/<int:report_id>/insights/', views.report_insights, name='report_insights'),
    path('share/generate/', views.generate_share_link, name='generate_share_link'),
    path('share/revoke/', views.revoke_share_link, name='revoke_share_link'),
    path('shared/<str:token>/dashboard/', views.public_shared_dashboard, name='public_shared_dashboard'),
    # Phase 4: Caregiver Management
    path('caregivers/', views.caregiver_list, name='caregiver_list'),
    path('caregivers/<int:pk>/', views.caregiver_detail, name='caregiver_detail'),
    # Phase 4: Medicine Inventory Refill
    path('medications/<int:pk>/refill/', views.medication_refill, name='medication_refill'),
    # Phase 4: Enhanced Analytics
    path('analytics/enhanced/', views.enhanced_analytics, name='enhanced_analytics'),
    # Phase 5: Doctor Appointment Manager
    path('appointments/', views.appointment_list, name='appointment_list'),
    path('appointments/<int:pk>/', views.appointment_detail, name='appointment_detail'),
    # Phase 5: Notification Center
    path('notifications/', views.notification_list, name='notification_list'),
    path('notifications/<int:pk>/read/', views.notification_read, name='notification_read'),
    path('notifications/clear/', views.notification_clear, name='notification_clear'),
    # Phase 5: Reports & Backup
    path('reports/export/', views.export_health_report, name='export_health_report'),
    path('settings/backup/', views.backup_data, name='backup_data'),
    path('settings/restore/', views.restore_data, name='restore_data'),
    # Phase 6: Medicine Reminder & Preferences Endpoints
    path('reminders/', views.reminders_list, name='reminders_list'),
    path('reminders/upcoming/', views.upcoming_reminders, name='upcoming_reminders'),
    path('reminders/<int:pk>/taken/', views.reminder_mark_taken, name='reminder_mark_taken'),
    path('reminders/<int:pk>/snooze/', views.reminder_snooze, name='reminder_snooze'),
    path('reminders/<int:pk>/skip/', views.reminder_mark_skipped, name='reminder_mark_skipped'),
    path('reminders/<int:pk>/', views.reminder_detail, name='reminder_detail'),
    path('notification-preferences/', views.notification_preferences_view, name='notification_preferences_view'),
    path('push/unsubscribe/', views.unsubscribe_push, name='unsubscribe_push'),
]




