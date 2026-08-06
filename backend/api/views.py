from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login as django_login
from core.models import Prescription, Medication, Schedule, DoseLog, PushSubscription, LabReport, LabValue, ReferenceRange, ShareToken, UserProfile, Caregiver, Appointment, Notification
from .serializers import UserSerializer, PrescriptionSerializer, MedicationSerializer, ScheduleSerializer, DoseLogSerializer, LabReportSerializer, LabValueSerializer, ShareTokenSerializer, UserProfileSerializer, CaregiverSerializer, AppointmentSerializer, NotificationSerializer
from core.services.ocr_service import extract_text_from_image
from core.services.nlp_service import parse_prescription_text, parse_blood_report_text, parse_imaging_report_text, parse_discharge_summary_text, parse_vaccination_text, generate_ai_summary
from core.services.classifier_service import classify_document
from core.services.lab_service import parse_lab_report_text, generate_report_correlations, evaluate_value_status
from django.core.mail import send_mail
from django.conf import settings as django_settings

import datetime
from django.utils import timezone

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    username = request.data.get('username')
    password = request.data.get('password')
    email = request.data.get('email', '')
    if not username or not password:
        return Response({'error': 'Username and password required'}, status=status.HTTP_400_BAD_REQUEST)
    
    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username already exists'}, status=status.HTTP_400_BAD_REQUEST)
        
    user = User.objects.create_user(username=username, password=password, email=email)
    UserProfile.objects.create(user=user)
    token, _ = Token.objects.get_or_create(user=user)
    
    return Response({
        'token': token.key,
        'user': UserSerializer(user).data
    }, status=status.HTTP_201_CREATED)

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(request, username=username, password=password)
    
    if user is not None:
        django_login(request, user)
        token, _ = Token.objects.get_or_create(user=user)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': UserSerializer(user).data
        })
    else:
        return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    user = request.user
    profile, _ = UserProfile.objects.get_or_create(user=user)
    
    if request.method == 'GET':
        return Response({
            'username': user.username,
            'email': user.email,
            'profile': UserProfileSerializer(profile).data
        })
        
    elif request.method == 'PUT':
        data = request.data
        if 'email' in data:
            user.email = data['email']
            user.save()
            
        profile_serializer = UserProfileSerializer(profile, data=data, partial=True)
        if profile_serializer.is_valid():
            profile_serializer.save()
            return Response({
                'message': 'Profile updated successfully',
                'username': user.username,
                'email': user.email,
                'profile': profile_serializer.data
            })
        return Response(profile_serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def accessibility_settings(request):
    """
    GET  /api/accessibility/ → Returns current user accessibility & voice preferences.
    PATCH /api/accessibility/ → Updates one or more accessibility/voice preference fields.
    """
    profile, _ = UserProfile.objects.get_or_create(user=request.user)

    if request.method == 'GET':
        return Response({
            'preferred_language': profile.preferred_language,
            'voice_enabled': profile.voice_enabled,
            'speech_speed': profile.speech_speed,
            'elder_mode': profile.elder_mode,
            'high_contrast': profile.high_contrast,
            'large_text': profile.large_text,
            'reminder_repeat_count': profile.reminder_repeat_count,
        })

    elif request.method == 'PATCH':
        allowed_fields = [
            'preferred_language', 'voice_enabled', 'speech_speed',
            'elder_mode', 'high_contrast', 'large_text', 'reminder_repeat_count'
        ]
        data = {k: v for k, v in request.data.items() if k in allowed_fields}
        serializer = UserProfileSerializer(profile, data=data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'message': 'Accessibility settings updated.', **serializer.data})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    today = timezone.now().date()
    now_time = timezone.now().time()
    user = request.user
    
    # User's medications & prescriptions
    medications = Medication.objects.filter(prescription__user=user)
    active_prescriptions_count = Prescription.objects.filter(user=user).count()
    total_medications_count = medications.count()
    
    # Today's scheduled doses
    todays_schedules = []
    for med in medications:
        days_diff = (today - med.start_date).days
        if 0 <= days_diff < med.duration_days:
            schedules = med.schedules.filter(day_offset=days_diff)
            todays_schedules.extend(schedules)
            
    todays_meds_data = ScheduleSerializer(todays_schedules, many=True).data
    todays_count = len(todays_schedules)
    
    # Calculate Next Reminder (closest scheduled time today after current time, or first dose tomorrow)
    next_reminder = None
    upcoming_today = [s for s in todays_schedules if s.scheduled_time > now_time]
    if upcoming_today:
        upcoming_today.sort(key=lambda s: s.scheduled_time)
        first = upcoming_today[0]
        next_reminder = {
            'medication_name': first.medication.name,
            'scheduled_time': first.scheduled_time.strftime('%H:%M'),
            'dosage': first.medication.dosage
        }
    elif todays_schedules:
        # Show first schedule of day if all passed
        first = sorted(todays_schedules, key=lambda s: s.scheduled_time)[0]
        next_reminder = {
            'medication_name': first.medication.name,
            'scheduled_time': first.scheduled_time.strftime('%H:%M'),
            'dosage': first.medication.dosage
        }
        
    # Missed doses count overall
    user_schedules = Schedule.objects.filter(medication__prescription__user=user)
    missed_doses_count = DoseLog.objects.filter(schedule__in=user_schedules, status='missed').count()
    
    # Weekly Progress (last 7 days adherence stats)
    weekly_progress = []
    for i in range(6, -1, -1):
        day_date = today - datetime.timedelta(days=i)
        day_name = day_date.strftime('%a')
        
        day_schedules = []
        for med in medications:
            diff = (day_date - med.start_date).days
            if 0 <= diff < med.duration_days:
                day_schedules.extend(med.schedules.filter(day_offset=diff))
                
        day_logs = DoseLog.objects.filter(schedule__in=day_schedules)
        taken = day_logs.filter(status='taken').count()
        missed = day_logs.filter(status='missed').count()
        skipped = day_logs.filter(status='skipped').count()
        total = len(day_schedules)
        
        weekly_progress.append({
            'day': day_name,
            'date': day_date.strftime('%Y-%m-%d'),
            'taken': taken,
            'missed': missed,
            'skipped': skipped,
            'total': total,
            'adherence': round((taken / total * 100)) if total > 0 else 100
        })

    return Response({
        'todays_medicines_count': todays_count,
        'todays_medicines': todays_meds_data,
        'next_reminder': next_reminder,
        'total_medicines': total_medications_count,
        'active_prescriptions': active_prescriptions_count,
        'missed_doses': missed_doses_count,
        'weekly_progress': weekly_progress
    })



@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_prescription(request):
    """
    Smart Document Upload Pipeline (Phase 5 Enhanced):
    Stage 1: Upload & save file
    Stage 2: OCR extraction + confidence scoring
    Stage 3: Validate OCR quality
    Stage 4: Document type classification
    Stage 5: Specialized extraction based on type + AI summary
    """
    uploaded_file = request.FILES.get('image') or request.FILES.get('file') or request.FILES.get('pdf_file')
    if not uploaded_file:
        return Response({'error': 'Unreadable or missing prescription file. Please upload an image or PDF.'}, status=status.HTTP_400_BAD_REQUEST)
        
    ext = uploaded_file.name.split('.')[-1].lower() if uploaded_file.name else ''
    if ext not in ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'bmp']:
        return Response({'error': 'Invalid file format. Please upload a JPEG, PNG, or PDF file.'}, status=status.HTTP_400_BAD_REQUEST)

    # ── Stage 1: Upload & Save ──
    presc = Prescription(user=request.user)
    if ext == 'pdf':
        presc.pdf_file = uploaded_file
    else:
        presc.image = uploaded_file
    presc.save()
    
    file_path = presc.pdf_file.path if presc.pdf_file else (presc.image.path if presc.image else '')

    # ── Stage 2: OCR Extraction + Confidence ──
    ocr_result = extract_text_from_image(file_path)

    # Handle both old (string) and new (dict) return formats for safety
    if isinstance(ocr_result, dict):
        raw_text = ocr_result.get('text', '')
        ocr_confidence = ocr_result.get('ocr_confidence', 0.0)
    else:
        raw_text = ocr_result or ''
        ocr_confidence = 75.0  # Fallback

    presc.ocr_confidence = ocr_confidence

    # ── Stage 3: Validate OCR Quality ──
    if not raw_text or len(raw_text.strip()) < 5:
        presc.status = 'review_required'
        presc.ocr_confidence = 0.0
        presc.document_type = 'unknown'
        presc.save()
        parsed_data = parse_prescription_text("")
        parsed_data["confidence_score"] = 60.0
        return Response({
            'prescription_id': presc.id,
            'raw_text': "Notice: OCR confidence low. Please review and confirm extracted fields.",
            'extracted_data': parsed_data,
            'confidence_score': 60.0,
            'ocr_confidence': 0.0,
            'document_type': 'unknown',
            'document_label': 'Unknown / Unrecognized',
            'classification_confidence': 0.0,
            'ai_summary': 'Could not read the document. Please try uploading a clearer image.',
            'message': 'Low OCR confidence. Manual verification suggested.'
        })

    if ocr_confidence < 40.0:
        presc.status = 'review_required'
        presc.raw_ocr_text = raw_text
        presc.save()

    # ── Stage 4: Document Type Classification ──
    classification = classify_document(raw_text)
    document_type = classification['document_type']
    document_label = classification['document_label']
    classification_confidence = classification['classification_confidence']

    presc.document_type = document_type
    presc.classification_confidence = classification_confidence

    # ── Stage 5: Specialized Extraction + AI Summary ──
    extracted_data = {}
    ai_summary = ''

    if document_type == 'prescription':
        extracted_data = parse_prescription_text(raw_text)
        ai_summary = generate_ai_summary('prescription', extracted_data, raw_text)

    elif document_type == 'blood_test':
        extracted_data = parse_blood_report_text(raw_text)
        ai_summary = generate_ai_summary('blood_test', extracted_data, raw_text)

    elif document_type in ('xray', 'mri', 'ct_scan', 'ultrasound'):
        extracted_data = parse_imaging_report_text(raw_text)
        ai_summary = generate_ai_summary(document_type, extracted_data, raw_text)

    elif document_type == 'discharge_summary':
        extracted_data = parse_discharge_summary_text(raw_text)
        ai_summary = generate_ai_summary('discharge_summary', extracted_data, raw_text)

    elif document_type == 'vaccination':
        extracted_data = parse_vaccination_text(raw_text)
        ai_summary = generate_ai_summary('vaccination', extracted_data, raw_text)

    elif document_type == 'urine_test':
        # Urine tests share similar structure with blood tests
        extracted_data = parse_blood_report_text(raw_text)
        ai_summary = generate_ai_summary('urine_test', extracted_data, raw_text)

    elif document_type == 'ecg':
        extracted_data = parse_imaging_report_text(raw_text)
        ai_summary = generate_ai_summary('ecg', extracted_data, raw_text)

    else:
        # Fallback: treat as prescription for backward compatibility
        extracted_data = parse_prescription_text(raw_text)
        ai_summary = generate_ai_summary('unknown', extracted_data, raw_text)

    # Store results on the Prescription model
    presc.raw_ocr_text = raw_text
    presc.ai_summary = ai_summary

    # For prescription-type documents, store doctor fields
    if isinstance(extracted_data, dict):
        presc.doctor_instructions = extracted_data.get('doctor_instructions', '')
        presc.doctor_notes = extracted_data.get('doctor_notes', '')
        presc.confidence_score = extracted_data.get('confidence_score', 90.0)

    if presc.status != 'review_required':
        presc.status = 'processed'
    presc.save()
    
    return Response({
        'prescription_id': presc.id,
        'raw_text': raw_text,
        'extracted_data': extracted_data,
        'confidence_score': presc.confidence_score,
        'doctor_instructions': presc.doctor_instructions,
        'doctor_notes': presc.doctor_notes,
        # New Phase 5 fields
        'document_type': document_type,
        'document_label': document_label,
        'classification_confidence': classification_confidence,
        'ocr_confidence': ocr_confidence,
        'ai_summary': ai_summary,
        'matched_keywords': classification.get('matched_keywords', []),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_prescriptions(request):
    prescriptions = Prescription.objects.filter(user=request.user).order_by('-uploaded_at')
    serializer = PrescriptionSerializer(prescriptions, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def prescription_detail(request, prescription_id):
    try:
        presc = Prescription.objects.get(id=prescription_id, user=request.user)
        return Response(PrescriptionSerializer(presc).data)
    except Prescription.DoesNotExist:
        return Response({'error': 'Prescription not found'}, status=status.HTTP_404_NOT_FOUND)



@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_prescription(request):
    data = request.data
    prescription_id = data.get('prescription_id')
    
    prescription = None
    if prescription_id:
        try:
            prescription = Prescription.objects.get(id=prescription_id, user=request.user)
        except Prescription.DoesNotExist:
            prescription = None

    if not prescription:
        # Create a fallback prescription entry if user created manual medication
        prescription = Prescription.objects.create(user=request.user)
        
    medication_data = data.get('medication', {})
    
    dur_days = int(medication_data.get('duration', 1) or 1)
    tot_tablets = int(medication_data.get('total_tablets', 30) or 30)
    
    med = Medication.objects.create(
        prescription=prescription,
        name=medication_data.get('name', 'Unknown Medication'),
        dosage=medication_data.get('dosage', 'Standard'),
        frequency=medication_data.get('frequency', '1-0-1'),
        duration_days=dur_days,
        start_date=timezone.now().date(),
        total_tablets=tot_tablets,
        remaining_tablets=tot_tablets,
        category=medication_data.get('category', 'General'),
        timing_instruction='before_food' if medication_data.get('before_food') else 'after_food',
        morning=bool(medication_data.get('morning', True)),
        afternoon=bool(medication_data.get('afternoon', False)),
        evening=bool(medication_data.get('evening', False)),
        night=bool(medication_data.get('night', True))
    )
    
    # Auto-generate schedule times for Morning (09:00), Afternoon (14:00), Evening (19:00), Night (21:00)
    slot_times = []
    if med.morning:
        slot_times.append(datetime.time(9, 0))
    if med.afternoon:
        slot_times.append(datetime.time(14, 0))
    if med.evening:
        slot_times.append(datetime.time(19, 0))
    if med.night:
        slot_times.append(datetime.time(21, 0))

    if not slot_times:
        slot_times = [datetime.time(9, 0)]
        
    for day in range(med.duration_days):
        for t in slot_times:
            Schedule.objects.create(medication=med, scheduled_time=t, day_offset=day)
            
    return Response({
        'message': 'Medication saved and automated reminder schedule generated successfully!',
        'medication': MedicationSerializer(med).data
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def today_schedule(request):
    today = timezone.now().date()
    medications = Medication.objects.filter(prescription__user=request.user)
    
    todays_schedules = []
    for med in medications:
        days_diff = (today - med.start_date).days
        if 0 <= days_diff < med.duration_days:
            schedules = med.schedules.filter(day_offset=days_diff)
            todays_schedules.extend(schedules)
            
    serializer = ScheduleSerializer(todays_schedules, many=True)

    # Group schedules into Morning, Afternoon, Evening, Night
    grouped = {
        'morning': [],
        'afternoon': [],
        'evening': [],
        'night': []
    }
    for item in serializer.data:
        slot = item['time_slot'].lower()
        if slot in grouped:
            grouped[slot].append(item)
        else:
            grouped['morning'].append(item)

    # Calculate streak
    streak = 0
    check_date = today
    for _ in range(365):
        day_schedules = []
        for med in medications:
            diff = (check_date - med.start_date).days
            if 0 <= diff < med.duration_days:
                day_schedules.extend(med.schedules.filter(day_offset=diff))
        
        if not day_schedules:
            if check_date == today:
                check_date -= datetime.timedelta(days=1)
                continue
            else:
                break
        
        all_taken = True
        for sch in day_schedules:
            log = DoseLog.objects.filter(schedule=sch).first()
            if not log or log.status != 'taken':
                all_taken = False
                break
        
        if all_taken:
            streak += 1
            check_date -= datetime.timedelta(days=1)
        else:
            if check_date == today:
                check_date -= datetime.timedelta(days=1)
                continue
            break

    return Response({
        'schedules': serializer.data,
        'grouped': grouped,
        'streak': streak
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def log_dose(request):
    schedule_id = request.data.get('schedule_id')
    status_val = request.data.get('status') # 'taken', 'missed', 'skipped', 'snoozed'
    skip_reason = request.data.get('skip_reason', '')
    
    if status_val not in ['taken', 'missed', 'skipped', 'snoozed']:
        return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)
        
    try:
        schedule = Schedule.objects.get(id=schedule_id, medication__prescription__user=request.user)
    except Schedule.DoesNotExist:
        return Response({'error': 'Schedule not found'}, status=status.HTTP_404_NOT_FOUND)
        
    existing_log = DoseLog.objects.filter(schedule=schedule).first()
    prev_status = existing_log.status if existing_log else None

    snooze_time = None
    if status_val == 'snoozed':
        snooze_time = timezone.now() + datetime.timedelta(minutes=10)

    log, created = DoseLog.objects.update_or_create(
        schedule=schedule,
        defaults={
            'status': status_val,
            'skip_reason': skip_reason,
            'snoozed_until': snooze_time
        }
    )
    
    # If dose marked taken for the first time, decrement remaining tablets
    med = schedule.medication
    if status_val == 'taken' and prev_status != 'taken':
        if med.remaining_tablets > 0:
            med.remaining_tablets -= 1
            med.save()
    elif prev_status == 'taken' and status_val != 'taken':
        med.remaining_tablets += 1
        med.save()

    # Phase 4: Alert caregivers on consecutive misses
    if status_val == 'missed':
        try:
            _check_and_alert_caregivers(request.user, med)
        except Exception as e:
            print(f"[MediMate] Caregiver alert error: {e}")

    return Response({
        'message': f'Dose status updated to {status_val}',
        'status': status_val,
        'remaining_tablets': med.remaining_tablets,
        'snoozed_until': snooze_time.strftime('%H:%M:%S') if snooze_time else None
    })



@api_view(['GET'])
@permission_classes([IsAuthenticated])
def adherence_analytics(request):
    # Total doses across all schedules for this user vs taken
    schedules = Schedule.objects.filter(medication__prescription__user=request.user)
    
    total_logs = DoseLog.objects.filter(schedule__in=schedules)
    
    taken_count = total_logs.filter(status='taken').count()
    missed_count = total_logs.filter(status='missed').count()
    skipped_count = total_logs.filter(status='skipped').count()
    
    total_logged = taken_count + missed_count + skipped_count
    
    overall_adherence = 0
    if total_logged > 0:
        overall_adherence = (taken_count / total_logged) * 100
        
    return Response({
        'overall_adherence_percent': round(overall_adherence, 1),
        'taken': taken_count,
        'missed': missed_count,
        'skipped': skipped_count
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_medications(request):
    meds = Medication.objects.filter(prescription__user=request.user)
    return Response(MedicationSerializer(meds, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def insights(request):
    """Generate human-readable adherence insights from DoseLog data."""
    schedules = Schedule.objects.filter(medication__prescription__user=request.user)
    logs = DoseLog.objects.filter(schedule__in=schedules).select_related('schedule__medication')

    insight_list = []
    now = timezone.now()
    today = now.date()

    # --- Insight 1: This week's adherence ---
    week_start = today - datetime.timedelta(days=today.weekday())  # Monday
    week_logs = logs.filter(logged_at__date__gte=week_start)
    week_total = week_logs.count()
    week_taken = week_logs.filter(status='taken').count()
    if week_total > 0:
        pct = round((week_taken / week_total) * 100)
        insight_list.append(f"You've taken {week_taken}/{week_total} doses this week ({pct}% adherence)")
    else:
        insight_list.append("No dose data recorded this week yet.")

    # --- Insight 2: Day-of-week with highest miss rate ---
    DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    day_misses = {}
    day_totals = {}
    for log in logs:
        dow = log.logged_at.weekday()
        day_totals[dow] = day_totals.get(dow, 0) + 1
        if log.status in ('missed', 'skipped'):
            day_misses[dow] = day_misses.get(dow, 0) + 1

    if day_misses:
        worst_day = max(day_misses, key=lambda d: day_misses[d] / max(day_totals.get(d, 1), 1))
        miss_rate = round((day_misses[worst_day] / day_totals[worst_day]) * 100)
        if miss_rate > 20:
            insight_list.append(f"You tend to miss doses on {DAY_NAMES[worst_day]}s ({miss_rate}% miss rate)")

    # --- Insight 3: Time-of-day miss pattern ---
    time_misses = {}
    time_totals = {}
    for log in logs:
        t = log.schedule.scheduled_time
        if t.hour < 12:
            period = 'morning'
        elif t.hour < 17:
            period = 'afternoon'
        else:
            period = 'evening'
        time_totals[period] = time_totals.get(period, 0) + 1
        if log.status in ('missed', 'skipped'):
            time_misses[period] = time_misses.get(period, 0) + 1

    if time_misses:
        worst_time = max(time_misses, key=lambda p: time_misses[p] / max(time_totals.get(p, 1), 1))
        t_miss_rate = round((time_misses[worst_time] / time_totals[worst_time]) * 100)
        if t_miss_rate > 20:
            insight_list.append(f"Your {worst_time} doses have a {t_miss_rate}% miss rate — consider setting a reminder")

    # --- Insight 4: Week-over-week trend ---
    prev_week_start = week_start - datetime.timedelta(days=7)
    prev_logs = logs.filter(logged_at__date__gte=prev_week_start, logged_at__date__lt=week_start)
    prev_total = prev_logs.count()
    prev_taken = prev_logs.filter(status='taken').count()

    if prev_total > 0 and week_total > 0:
        prev_pct = (prev_taken / prev_total) * 100
        curr_pct = (week_taken / week_total) * 100
        diff = curr_pct - prev_pct
        if diff > 5:
            insight_list.append(f"📈 Great job! Your adherence improved by {round(diff)}% compared to last week")
        elif diff < -5:
            insight_list.append(f"📉 Your adherence dropped by {round(abs(diff))}% compared to last week — you can get back on track!")

    return Response({'insights': insight_list})


@api_view(['GET'])
@permission_classes([AllowAny])
def get_vapid_key(request):
    from django.conf import settings
    return Response({'public_key': getattr(settings, 'VAPID_PUBLIC_KEY', '')})


@api_view(['POST'])
@permission_classes([AllowAny])
def subscribe_push(request):
    endpoint = request.data.get('endpoint')
    keys = request.data.get('keys', {})
    p256dh = keys.get('p256dh')
    auth = keys.get('auth')

    if not endpoint or not p256dh or not auth:
        return Response({'error': 'Invalid subscription object'}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user if request.user.is_authenticated else None

    sub, created = PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            'user': user,
            'p256dh': p256dh,
            'auth': auth,
        }
    )
    return Response({'message': 'Push subscription saved successfully', 'created': created}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


# --- FEATURE 1: LAB REPORT ANALYSIS & CORRELATION ---

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_lab_report(request):
    uploaded_file = request.FILES.get('image') or request.FILES.get('file') or request.FILES.get('pdf_file')
    if not uploaded_file:
        return Response({'error': 'No report file provided. Please upload an image or PDF.'}, status=status.HTTP_400_BAD_REQUEST)
        
    ext = uploaded_file.name.split('.')[-1].lower() if uploaded_file.name else ''
    if ext not in ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'bmp']:
        return Response({'error': 'Invalid file format. Please upload a JPEG, PNG, or PDF file.'}, status=status.HTTP_400_BAD_REQUEST)

    report = LabReport.objects.create(user=request.user, image=uploaded_file)

    raw_text = ""
    try:
        raw_text = extract_text_from_image(report.image.path if report.image else '')
        if isinstance(raw_text, dict):
            raw_text = raw_text.get('text', '')
        report.raw_ocr_text = raw_text
        report.save()
    except Exception as e:
        print(f"Lab Report OCR Error: {e}")

    extracted_values = parse_lab_report_text(raw_text)

    return Response({
        'report_id': report.id,
        'raw_text': raw_text,
        'extracted_values': extracted_values
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_lab_report(request):
    report_id = request.data.get('report_id')
    values_data = request.data.get('values', [])

    try:
        report = LabReport.objects.get(id=report_id, user=request.user)
    except LabReport.DoesNotExist:
        return Response({'error': 'Report not found'}, status=status.HTTP_404_NOT_FOUND)

    # Delete existing draft values if any
    LabValue.objects.filter(report=report).delete()

    created_values = []
    for item in values_data:
        test_name = item.get('test_name')
        val = float(item.get('value', 0))
        unit = item.get('unit', '')

        # Recalculate status against ReferenceRange
        ref = ReferenceRange.objects.filter(test_name=test_name).first()
        status_val = evaluate_value_status(ref.min_normal, ref.max_normal, val) if ref else item.get('status', 'normal')

        lv = LabValue.objects.create(
            report=report,
            test_name=test_name,
            value=val,
            unit=unit,
            status=status_val
        )
        created_values.append(lv)

    correlations = generate_report_correlations(request.user, created_values)

    return Response({
        'message': 'Lab report saved successfully',
        'report_id': report.id,
        'correlations': correlations
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_lab_reports(request):
    reports = LabReport.objects.filter(user=request.user).order_by('-uploaded_at')
    serializer = LabReportSerializer(reports, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def report_insights(request, report_id):
    try:
        report = LabReport.objects.get(id=report_id, user=request.user)
    except LabReport.DoesNotExist:
        return Response({'error': 'Report not found'}, status=status.HTTP_404_NOT_FOUND)

    values = report.values.all()
    correlations = generate_report_correlations(request.user, values)
    return Response({'correlations': correlations})


# --- FEATURE 3: CAREGIVER SHARE LINK ---

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_share_link(request):
    token_obj = ShareToken.objects.filter(user=request.user, is_active=True).first()
    if not token_obj:
        import uuid
        token_obj = ShareToken.objects.create(user=request.user, token=str(uuid.uuid4()))

    share_url = f"/shared/{token_obj.token}"
    return Response({
        'token': token_obj.token,
        'share_url': share_url,
        'created_at': token_obj.created_at
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def revoke_share_link(request):
    ShareToken.objects.filter(user=request.user, is_active=True).update(is_active=False)
    return Response({'message': 'Share link revoked successfully'})


@api_view(['GET'])
@permission_classes([AllowAny])
def public_shared_dashboard(request, token):
    try:
        share_obj = ShareToken.objects.get(token=token, is_active=True)
    except ShareToken.DoesNotExist:
        return Response({'error': 'Invalid or expired share link'}, status=status.HTTP_404_NOT_FOUND)

    user = share_obj.user

    # Calculate adherence summary without revealing personal user details or prescription images
    schedules = Schedule.objects.filter(medication__prescription__user=user)
    total_logs = DoseLog.objects.filter(schedule__in=schedules)

    taken_count = total_logs.filter(status='taken').count()
    missed_count = total_logs.filter(status='missed').count()
    skipped_count = total_logs.filter(status='skipped').count()

    total_logged = taken_count + missed_count + skipped_count
    overall_adherence = round((taken_count / total_logged) * 100, 1) if total_logged > 0 else 0

    return Response({
        'patient_alias': f"Patient #{user.id}",
        'overall_adherence_percent': overall_adherence,
        'taken': taken_count,
        'missed': missed_count,
        'skipped': skipped_count,
        'total_logged': total_logged
    })


# ========================================================
# PHASE 5: APPOINTMENT MANAGEMENT
# ========================================================

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def appointment_list(request):
    if request.method == 'GET':
        appointments = Appointment.objects.filter(user=request.user).order_by('date', 'time')
        return Response(AppointmentSerializer(appointments, many=True).data)

    elif request.method == 'POST':
        serializer = AppointmentSerializer(data=request.data)
        if serializer.is_valid():
            appt = serializer.save(user=request.user)
            # Create a notification for the appointment
            Notification.objects.create(
                user=request.user,
                title="Appointment Scheduled",
                message=f"Upcoming appointment with Dr. {appt.doctor_name} at {appt.hospital_name} on {appt.date} at {appt.time}.",
                notification_type='appointment'
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def appointment_detail(request, pk):
    try:
        appt = Appointment.objects.get(pk=pk, user=request.user)
    except Appointment.DoesNotExist:
        return Response({'error': 'Appointment not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        appt.delete()
        return Response({'message': 'Appointment cancelled.'})


# ========================================================
# PHASE 5: NOTIFICATION CENTER
# ========================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_list(request):
    notifications = Notification.objects.filter(user=request.user).order_by('-created_at')[:50]
    return Response(NotificationSerializer(notifications, many=True).data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def notification_read(request, pk):
    try:
        notif = Notification.objects.get(pk=pk, user=request.user)
    except Notification.DoesNotExist:
        return Response({'error': 'Notification not found'}, status=status.HTTP_404_NOT_FOUND)

    notif.is_read = True
    notif.save()
    return Response(NotificationSerializer(notif).data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def notification_clear(request):
    Notification.objects.filter(user=request.user).delete()
    return Response({'message': 'All notifications cleared.'})


# ========================================================
# PHASE 5: DOWNLOADABLE REPORTS (PDF/EXCEL CSV)
# ========================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_health_report(request):
    import csv
    from django.http import HttpResponse

    user = request.user
    meds = Medication.objects.filter(prescription__user=user)
    appts = Appointment.objects.filter(user=user)
    caregivers = Caregiver.objects.filter(user=user)

    # Adherence calculations
    schedules = Schedule.objects.filter(medication__prescription__user=user)
    logs = DoseLog.objects.filter(schedule__in=schedules)
    taken_count = logs.filter(status='taken').count()
    missed_count = logs.filter(status='missed').count()
    skipped_count = logs.filter(status='skipped').count()
    total_logged = taken_count + missed_count + skipped_count
    adherence = round((taken_count / total_logged) * 100, 1) if total_logged > 0 else 100

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="MediMate_Report_{user.username}.csv"'

    writer = csv.writer(response)
    writer.writerow(['MEDIMATE COMPREHENSIVE HEALTH REPORT'])
    writer.writerow(['Patient Username', user.username])
    writer.writerow(['Date Generated', timezone.now().strftime('%Y-%m-%d %H:%M')])
    writer.writerow([])
    
    writer.writerow(['ADHERENCE SUMMARY'])
    writer.writerow(['Taken Doses', taken_count])
    writer.writerow(['Missed Doses', missed_count])
    writer.writerow(['Skipped Doses', skipped_count])
    writer.writerow(['Overall Adherence Score', f"{adherence}%"])
    writer.writerow([])

    writer.writerow(['MEDICATION INVENTORY & STATUS'])
    writer.writerow(['Medicine Name', 'Category', 'Dosage', 'Frequency', 'Remaining Tablets', 'Total Tablets', 'Expiry Date'])
    for m in meds:
        writer.writerow([m.name, m.category, m.dosage, m.frequency, m.remaining_tablets, m.total_tablets, m.expiry_date])
    writer.writerow([])

    writer.writerow(['UPCOMING DOCTOR APPOINTMENTS'])
    writer.writerow(['Doctor Name', 'Hospital/Clinic', 'Date', 'Time', 'Reason'])
    for a in appts:
        writer.writerow([a.doctor_name, a.hospital_name, a.date, a.time, a.reason])
    writer.writerow([])

    writer.writerow(['LINKED CAREGIVER CONTACTS'])
    writer.writerow(['Caregiver Name', 'Relationship', 'Mobile', 'Email', 'Emergency Contact'])
    for c in caregivers:
        writer.writerow([c.name, c.relationship, c.mobile, c.email, 'Yes' if c.is_emergency_contact else 'No'])

    return response


# ========================================================
# PHASE 5: BACKUP & RESTORE (JSON DATA EXPORT/IMPORT)
# ========================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def backup_data(request):
    import json
    from django.http import HttpResponse

    user = request.user
    meds = Medication.objects.filter(prescription__user=user)
    appts = Appointment.objects.filter(user=user)
    caregivers = Caregiver.objects.filter(user=user)

    data = {
        'username': user.username,
        'backup_version': '3.0',
        'generated_at': timezone.now().isoformat(),
        'medications': [
            {
                'name': m.name,
                'dosage': m.dosage,
                'frequency': m.frequency,
                'duration_days': m.duration_days,
                'total_tablets': m.total_tablets,
                'remaining_tablets': m.remaining_tablets,
                'category': m.category,
                'timing_instruction': m.timing_instruction,
                'morning': m.morning,
                'afternoon': m.afternoon,
                'evening': m.evening,
                'night': m.night,
                'expiry_date': m.expiry_date.isoformat() if m.expiry_date else None,
                'batch_number': m.batch_number
            } for m in meds
        ],
        'appointments': [
            {
                'doctor_name': a.doctor_name,
                'hospital_name': a.hospital_name,
                'date': a.date.isoformat(),
                'time': a.time.isoformat(),
                'reason': a.reason,
                'notes': a.notes
            } for a in appts
        ],
        'caregivers': [
            {
                'name': c.name,
                'relationship': c.relationship,
                'mobile': c.mobile,
                'email': c.email,
                'is_emergency_contact': c.is_emergency_contact
            } for c in caregivers
        ]
    }

    response = HttpResponse(json.dumps(data, indent=2), content_type='application/json')
    response['Content-Disposition'] = f'attachment; filename="MediMate_Backup_{user.username}.json"'
    return response


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def restore_data(request):
    import json

    backup_file = request.FILES.get('file')
    if not backup_file:
        return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        data = json.loads(backup_file.read().decode('utf-8'))
    except Exception as e:
        return Response({'error': f'Invalid JSON backup file: {e}'}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user

    # Restore Medications (create placeholder prescription if none exists)
    prescription, _ = Prescription.objects.get_or_create(
        user=user,
        defaults={'raw_ocr_text': 'Restored backup data prescription placeholder.'}
    )

    medications_data = data.get('medications', [])
    for m in medications_data:
        Medication.objects.create(
            prescription=prescription,
            name=m.get('name'),
            dosage=m.get('dosage'),
            frequency=m.get('frequency'),
            duration_days=m.get('duration_days', 7),
            total_tablets=m.get('total_tablets', 30),
            remaining_tablets=m.get('remaining_tablets', 30),
            category=m.get('category', 'General'),
            timing_instruction=m.get('timing_instruction', 'after_food'),
            morning=m.get('morning', True),
            afternoon=m.get('afternoon', False),
            evening=m.get('evening', False),
            night=m.get('night', True),
            expiry_date=m.get('expiry_date'),
            batch_number=m.get('batch_number')
        )

    # Restore Appointments
    appts_data = data.get('appointments', [])
    for a in appts_data:
        Appointment.objects.create(
            user=user,
            doctor_name=a.get('doctor_name'),
            hospital_name=a.get('hospital_name'),
            date=a.get('date'),
            time=a.get('time'),
            reason=a.get('reason'),
            notes=a.get('notes')
        )

    # Restore Caregivers
    caregivers_data = data.get('caregivers', [])
    for c in caregivers_data:
        Caregiver.objects.create(
            user=user,
            name=c.get('name'),
            relationship=c.get('relationship', 'other'),
            mobile=c.get('mobile'),
            email=c.get('email'),
            is_emergency_contact=c.get('is_emergency_contact', False)
        )

    return Response({'message': 'Backup data successfully restored!'})



# ========================================================
# PHASE 4: CAREGIVER MANAGEMENT
# ========================================================

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def caregiver_list(request):
    """GET → list caregivers. POST → add a new caregiver."""
    if request.method == 'GET':
        caregivers = Caregiver.objects.filter(user=request.user).order_by('name')
        return Response(CaregiverSerializer(caregivers, many=True).data)

    elif request.method == 'POST':
        serializer = CaregiverSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def caregiver_detail(request, pk):
    """GET / PUT / DELETE a specific caregiver."""
    try:
        caregiver = Caregiver.objects.get(pk=pk, user=request.user)
    except Caregiver.DoesNotExist:
        return Response({'error': 'Caregiver not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(CaregiverSerializer(caregiver).data)

    elif request.method == 'PUT':
        serializer = CaregiverSerializer(caregiver, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        caregiver.delete()
        return Response({'message': 'Caregiver removed successfully.'})


def _check_and_alert_caregivers(user, medication):
    """
    Count consecutive missed doses for a medication.
    If >= 3, send in-app (print) + email to all caregivers with email.
    """
    logs = DoseLog.objects.filter(
        schedule__medication=medication
    ).order_by('-logged_at')[:10]

    consecutive_missed = 0
    for log in logs:
        if log.status == 'missed':
            consecutive_missed += 1
        else:
            break

    if consecutive_missed >= 3:
        caregivers = Caregiver.objects.filter(user=user).exclude(email='').exclude(email__isnull=True)
        patient_name = user.get_full_name() or user.username
        subject = f"[MediMate Alert] {patient_name} missed {medication.name} {consecutive_missed} times"
        message = (
            f"Dear Caregiver,\n\n"
            f"This is an automated alert from MediMate.\n\n"
            f"Patient: {patient_name}\n"
            f"Missed Medicine: {medication.name} ({medication.dosage})\n"
            f"Consecutive Missed Doses: {consecutive_missed}\n"
            f"Date: {timezone.now().strftime('%Y-%m-%d')}\n"
            f"Time: {timezone.now().strftime('%H:%M')}\n\n"
            f"Please check in with the patient.\n\n"
            f"— MediMate Smart Health Assistant"
        )
        for cg in caregivers:
            try:
                send_mail(subject, message, 'noreply@medimate.app', [cg.email], fail_silently=True)
                print(f"[MediMate] Caregiver alert sent to {cg.email}")
            except Exception as e:
                print(f"[MediMate] Email error: {e}")


# ========================================================
# PHASE 4: MEDICINE INVENTORY — REFILL / MARK AS PURCHASED
# ========================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def medication_refill(request, pk):
    """
    POST /api/medications/<pk>/refill/
    Reset remaining_tablets to total_tablets (mark as purchased / restocked).
    Optionally update total_tablets if 'total_tablets' sent in body.
    """
    try:
        med = Medication.objects.get(pk=pk, prescription__user=request.user)
    except Medication.DoesNotExist:
        return Response({'error': 'Medication not found'}, status=status.HTTP_404_NOT_FOUND)

    new_total = request.data.get('total_tablets')
    if new_total:
        med.total_tablets = int(new_total)
    med.remaining_tablets = med.total_tablets
    med.save()

    return Response({
        'message': f'{med.name} inventory restocked to {med.remaining_tablets} tablets.',
        'remaining_tablets': med.remaining_tablets,
        'total_tablets': med.total_tablets
    })


# ========================================================
# PHASE 4: ENHANCED ANALYTICS
# ========================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def enhanced_analytics(request):
    """
    GET /api/analytics/enhanced/
    Returns: overall adherence%, current streak, longest streak, monthly heatmap,
    medicine timeline, per-medicine completion rate, enhanced AI insights.
    """
    user = request.user
    today = timezone.now().date()
    medications = Medication.objects.filter(prescription__user=user)
    user_schedules = Schedule.objects.filter(medication__prescription__user=user)
    all_logs = DoseLog.objects.filter(schedule__in=user_schedules).order_by('-logged_at')

    # ---- Overall Adherence ----
    total_logs = all_logs.count()
    taken_count = all_logs.filter(status='taken').count()
    missed_count = all_logs.filter(status='missed').count()
    skipped_count = all_logs.filter(status='skipped').count()
    overall_adherence = round((taken_count / total_logs) * 100, 1) if total_logs > 0 else 0

    # ---- Current & Longest Streak (days with all scheduled doses taken) ----
    current_streak = 0
    longest_streak = 0
    temp_streak = 0

    for i in range(0, 90):
        check_date = today - datetime.timedelta(days=i)
        day_scheds = []
        for med in medications:
            diff = (check_date - med.start_date).days
            if 0 <= diff < med.duration_days:
                day_scheds.extend(med.schedules.filter(day_offset=diff))

        if not day_scheds:
            if i == 0:
                continue
            else:
                if i == current_streak + 1:
                    pass
                break

        day_logs = DoseLog.objects.filter(schedule__in=day_scheds)
        day_taken = day_logs.filter(status='taken').count()
        total_day = len(day_scheds)
        all_taken = total_day > 0 and day_taken == total_day

        if all_taken:
            temp_streak += 1
            if i == 0 or i == current_streak:
                current_streak = temp_streak
        else:
            longest_streak = max(longest_streak, temp_streak)
            temp_streak = 0
            if i < current_streak:
                current_streak = i

    longest_streak = max(longest_streak, temp_streak)

    # ---- Monthly Heatmap (last 30 days) ----
    heatmap = []
    for i in range(29, -1, -1):
        day_date = today - datetime.timedelta(days=i)
        day_scheds = []
        for med in medications:
            diff = (day_date - med.start_date).days
            if 0 <= diff < med.duration_days:
                day_scheds.extend(med.schedules.filter(day_offset=diff))

        if not day_scheds:
            heatmap.append({'date': day_date.strftime('%Y-%m-%d'), 'status': 'no_dose'})
            continue

        day_logs = DoseLog.objects.filter(schedule__in=day_scheds)
        day_taken = day_logs.filter(status='taken').count()
        total_day = len(day_scheds)
        adherence_pct = round((day_taken / total_day) * 100) if total_day > 0 else 0

        if adherence_pct >= 80:
            cell_status = 'good'
        elif adherence_pct >= 50:
            cell_status = 'partial'
        else:
            cell_status = 'missed'

        heatmap.append({
            'date': day_date.strftime('%Y-%m-%d'),
            'day': day_date.strftime('%d'),
            'status': cell_status,
            'adherence': adherence_pct,
            'taken': day_taken,
            'total': total_day
        })

    # ---- Medicine Timeline ----
    timeline = []
    for med in medications:
        med_logs = DoseLog.objects.filter(schedule__medication=med)
        taken_days = med_logs.filter(status='taken').count()
        missed_days_count = med_logs.filter(status='missed').count()
        end_d = med_log_end = med.start_date + datetime.timedelta(days=med.duration_days)
        completed = today >= end_d or med.remaining_tablets <= 0

        timeline.append({
            'id': med.id,
            'name': med.name,
            'category': med.category,
            'start_date': med.start_date.strftime('%Y-%m-%d'),
            'end_date': end_d.strftime('%Y-%m-%d'),
            'completed': completed,
            'taken_doses': taken_days,
            'missed_doses': missed_days_count,
            'total_tablets': med.total_tablets,
            'remaining_tablets': med.remaining_tablets,
            'expiry_date': med.expiry_date.strftime('%Y-%m-%d') if med.expiry_date else None,
        })

    # ---- Enhanced AI Insights ----
    enhanced_insights = []

    if current_streak >= 7:
        enhanced_insights.append(f"🔥 Excellent! You have taken medicines for {current_streak} consecutive days. Keep it up!")
    elif current_streak >= 3:
        enhanced_insights.append(f"✅ Good job! You're on a {current_streak}-day streak. Stay consistent!")

    if longest_streak > current_streak and longest_streak >= 5:
        enhanced_insights.append(f"🏆 Your longest streak was {longest_streak} days. Try to beat it!")

    if overall_adherence >= 90:
        enhanced_insights.append(f"💯 Outstanding adherence of {overall_adherence}%! You are managing your health excellently.")
    elif overall_adherence >= 70:
        enhanced_insights.append(f"📈 Good adherence at {overall_adherence}%. A little more consistency will get you to 90%!")
    elif overall_adherence > 0:
        enhanced_insights.append(f"📉 Your adherence is {overall_adherence}%. Missing medicines can reduce treatment effectiveness.")

    for med in medications:
        daily_doses = sum([1 if med.morning else 0, 1 if med.afternoon else 0, 1 if med.evening else 0, 1 if med.night else 0]) or 1
        days_supply = (med.remaining_tablets or 0) // daily_doses
        if days_supply <= 2:
            enhanced_insights.append(f"🚨 Critical: Only {med.remaining_tablets} tablets of {med.name} left ({days_supply} days supply). Refill immediately!")
        elif days_supply <= 5:
            enhanced_insights.append(f"⚠️ {med.name} is running low — {med.remaining_tablets} tablets remaining ({days_supply} days). Consider refilling soon.")

        if med.expiry_date:
            days_to_exp = (med.expiry_date - today).days
            if days_to_exp < 0:
                enhanced_insights.append(f"❌ {med.name} has EXPIRED on {med.expiry_date}. Do not use. Please replace.")
            elif days_to_exp <= 7:
                enhanced_insights.append(f"⚠️ {med.name} expires in {days_to_exp} days ({med.expiry_date}). Replace before it expires.")
            elif days_to_exp <= 30:
                enhanced_insights.append(f"📅 {med.name} expires in {days_to_exp} days. Plan a refill soon.")

    if missed_count >= 5:
        enhanced_insights.append(f"📋 You have {missed_count} missed doses total. Consider enabling voice reminders in Settings.")

    return Response({
        'overall_adherence_percent': overall_adherence,
        'taken': taken_count,
        'missed': missed_count,
        'skipped': skipped_count,
        'current_streak': current_streak,
        'longest_streak': longest_streak,
        'monthly_heatmap': heatmap,
        'medicine_timeline': timeline,
        'enhanced_insights': enhanced_insights,
    })




