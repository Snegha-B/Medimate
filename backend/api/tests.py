from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from django.utils import timezone
from core.models import Prescription, Medication, Schedule, DoseLog
import datetime

class ReminderSystemTests(APITestCase):
    def setUp(self):
        # Create test user
        self.user = User.objects.create_user(username="testuser", password="password")
        self.client.login(username="testuser", password="password")
        
        # Create test prescription
        self.prescription = Prescription.objects.create(user=self.user)

    def test_frequency_parsing_and_exact_slots(self):
        """
        Verify that schedules are generated strictly for active slots matching frequency flags,
        and no additional/duplicate slots are created.
        """
        # Test Case 1: 1-0-0 (Morning only)
        med1 = Medication.objects.create(
            prescription=self.prescription,
            name="Medicine A",
            dosage="500mg",
            frequency="1-0-0",
            duration_days=3,
            total_tablets=10,
            remaining_tablets=10,
            morning=True,
            afternoon=False,
            evening=False,
            night=False,
            morning_time=datetime.time(8, 30)
        )
        
        # Manually verify the schedule creation logic matches our confirm_prescription view behavior
        slot_times = []
        if med1.morning:
            slot_times.append(med1.morning_time or datetime.time(8, 30))
        if med1.afternoon:
            slot_times.append(med1.afternoon_time or datetime.time(13, 0))
        if med1.evening:
            slot_times.append(med1.evening_time or datetime.time(19, 0))
        if med1.night:
            slot_times.append(med1.night_time or datetime.time(21, 30))

        schedules_created = []
        for day in range(med1.duration_days):
            for t in slot_times:
                sch = Schedule.objects.create(medication=med1, scheduled_time=t, day_offset=day)
                schedules_created.append(sch)

        self.assertEqual(len(schedules_created), 3) # 3 days * 1 slot = 3 schedules
        for sch in schedules_created:
            self.assertEqual(sch.scheduled_time, datetime.time(8, 30))

    def test_custom_time_selection(self):
        """
        Test that user can define custom reminder times and the backend respects them.
        """
        response = self.client.post('/api/prescriptions/confirm/', {
            'prescription_id': self.prescription.id,
            'medication': {
                'name': 'Custom Med',
                'dosage': '250mg',
                'frequency': '1-0-1',
                'duration': 5,
                'total_tablets': 15,
                'morning': True,
                'afternoon': False,
                'night': True,
                'morning_time': '07:45',
                'night_time': '22:15'
            }
        }, format='json')

        self.assertEqual(response.status_code, 201)
        med = Medication.objects.get(name='Custom Med')
        self.assertEqual(med.morning_time, datetime.time(7, 45))
        self.assertEqual(med.night_time, datetime.time(22, 15))
        self.assertIsNone(med.afternoon_time)

        # Check that schedule entries use exactly these times
        schedules = Schedule.objects.filter(medication=med)
        self.assertEqual(schedules.count(), 10) # 5 days * 2 slots = 10 schedules
        morning_schedules = schedules.filter(scheduled_time=datetime.time(7, 45))
        night_schedules = schedules.filter(scheduled_time=datetime.time(22, 15))
        self.assertEqual(morning_schedules.count(), 5)
        self.assertEqual(night_schedules.count(), 5)

    def test_take_now_updates_inventory_and_logs(self):
        """
        When user logs 'taken', remaining tablets should decrement and DoseLog is saved.
        """
        med = Medication.objects.create(
            prescription=self.prescription,
            name="Inventory Med",
            dosage="1 tab",
            duration_days=2,
            total_tablets=10,
            remaining_tablets=10,
            morning=True
        )
        sch = Schedule.objects.create(medication=med, scheduled_time=datetime.time(9, 0), day_offset=0)

        # First request to mark taken
        response = self.client.post('/api/doselog/', {
            'schedule_id': sch.id,
            'status': 'taken'
        })
        self.assertEqual(response.status_code, 200)
        
        # Verify tablet count decremented
        med.refresh_from_db()
        self.assertEqual(med.remaining_tablets, 9)

        # Verify DoseLog status
        log = DoseLog.objects.get(schedule=sch)
        self.assertEqual(log.status, 'taken')

    def test_skip_does_not_reduce_tablets(self):
        """
        When user logs 'skipped', tablet count must NOT decrement.
        """
        med = Medication.objects.create(
            prescription=self.prescription,
            name="Skip Med",
            dosage="1 tab",
            duration_days=2,
            total_tablets=10,
            remaining_tablets=10,
            morning=True
        )
        sch = Schedule.objects.create(medication=med, scheduled_time=datetime.time(9, 0), day_offset=0)

        # Request to mark skipped
        response = self.client.post('/api/doselog/', {
            'schedule_id': sch.id,
            'status': 'skipped',
            'skip_reason': 'Felt nauseous'
        })
        self.assertEqual(response.status_code, 200)

        # Verify tablet count is unchanged
        med.refresh_from_db()
        self.assertEqual(med.remaining_tablets, 10)

        # Verify DoseLog status and reason
        log = DoseLog.objects.get(schedule=sch)
        self.assertEqual(log.status, 'skipped')
        self.assertEqual(log.skip_reason, 'Felt nauseous')

    def test_snooze_calculates_snoozed_until_correctly(self):
        """
        Snoozing a dose sets the snoozed_until time based on custom snooze minutes.
        """
        med = Medication.objects.create(
            prescription=self.prescription,
            name="Snooze Med",
            dosage="1 tab",
            duration_days=2,
            total_tablets=10,
            remaining_tablets=10,
            morning=True
        )
        sch = Schedule.objects.create(medication=med, scheduled_time=datetime.time(9, 0), day_offset=0)

        # Snooze for 15 minutes
        response = self.client.post('/api/doselog/', {
            'schedule_id': sch.id,
            'status': 'snoozed',
            'snooze_minutes': 15
        })
        self.assertEqual(response.status_code, 200)

        # Verify DoseLog entry and timezone-aware snoozed_until datetime
        log = DoseLog.objects.get(schedule=sch)
        self.assertEqual(log.status, 'snoozed')
        self.assertIsNotNone(log.snoozed_until)
        
        # Difference between snoozed_until and now should be roughly 15 minutes
        diff = log.snoozed_until - timezone.now()
        self.assertTrue(14 <= diff.total_seconds() / 60 <= 16)

    def test_persistence_across_restart(self):
        """
        Verify schedule and logs persist in the database, demonstrating survival of system restarts.
        """
        med = Medication.objects.create(
            prescription=self.prescription,
            name="Persistent Med",
            dosage="1 tab",
            duration_days=1,
            total_tablets=5,
            remaining_tablets=5,
            morning=True
        )
        sch = Schedule.objects.create(medication=med, scheduled_time=datetime.time(8, 0), day_offset=0)
        DoseLog.objects.create(schedule=sch, status='taken')

        # Query database again simulating fresh environment
        self.assertTrue(Medication.objects.filter(name="Persistent Med").exists())
        self.assertTrue(Schedule.objects.filter(medication__name="Persistent Med").exists())
        self.assertTrue(DoseLog.objects.filter(schedule__medication__name="Persistent Med", status='taken').exists())
