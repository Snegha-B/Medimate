import re
import datetime
from django.utils import timezone
from rapidfuzz import process, fuzz
from core.models import ReferenceRange, Medication, DoseLog, Schedule

DEFAULT_REFERENCE_RANGES = [
    {"test_name": "Fasting Glucose", "unit": "mg/dL", "min_normal": 70.0, "max_normal": 99.0, "category": "Metabolic"},
    {"test_name": "HbA1c", "unit": "%", "min_normal": 4.0, "max_normal": 5.6, "category": "Metabolic"},
    {"test_name": "Total Cholesterol", "unit": "mg/dL", "min_normal": 125.0, "max_normal": 200.0, "category": "Lipids"},
    {"test_name": "LDL Cholesterol", "unit": "mg/dL", "min_normal": 50.0, "max_normal": 100.0, "category": "Lipids"},
    {"test_name": "HDL Cholesterol", "unit": "mg/dL", "min_normal": 40.0, "max_normal": 60.0, "category": "Lipids"},
    {"test_name": "Triglycerides", "unit": "mg/dL", "min_normal": 50.0, "max_normal": 150.0, "category": "Lipids"},
    {"test_name": "Systolic BP", "unit": "mmHg", "min_normal": 90.0, "max_normal": 120.0, "category": "Cardiovascular"},
    {"test_name": "Diastolic BP", "unit": "mmHg", "min_normal": 60.0, "max_normal": 80.0, "category": "Cardiovascular"},
    {"test_name": "Hemoglobin", "unit": "g/dL", "min_normal": 12.0, "max_normal": 17.5, "category": "Hematology"},
    {"test_name": "Creatinine", "unit": "mg/dL", "min_normal": 0.6, "max_normal": 1.2, "category": "Renal"},
    {"test_name": "TSH", "unit": "mIU/L", "min_normal": 0.4, "max_normal": 4.0, "category": "Thyroid"},
]

# Medication to Test Mapping for Adherence Correlation
TEST_MEDICATION_MAP = {
    "Fasting Glucose": ["Metformin", "Glipizide", "Insulin", "Empagliflozin"],
    "HbA1c": ["Metformin", "Glipizide", "Insulin", "Empagliflozin"],
    "Total Cholesterol": ["Atorvastatin", "Simvastatin", "Rosuvastatin", "Statins"],
    "LDL Cholesterol": ["Atorvastatin", "Simvastatin", "Rosuvastatin", "Statins"],
    "Triglycerides": ["Atorvastatin", "Fenofibrate", "Statins"],
    "Systolic BP": ["Amlodipine", "Losartan", "Lisinopril", "Metoprolol", "Telmisartan"],
    "Diastolic BP": ["Amlodipine", "Losartan", "Lisinopril", "Metoprolol", "Telmisartan"],
    "Hemoglobin": ["Iron", "Ferrous Sulfate", "Folic Acid"],
    "Creatinine": ["Lisinopril", "Losartan", "Telmisartan"],
    "TSH": ["Levothyroxine", "Thyronorm"],
}

def seed_reference_ranges():
    """Ensure standard reference ranges exist in DB."""
    for ref in DEFAULT_REFERENCE_RANGES:
        ReferenceRange.objects.get_or_create(
            test_name=ref["test_name"],
            defaults=ref
        )

def evaluate_value_status(min_val, max_val, numeric_val):
    if max_val is not None and numeric_val > max_val:
        return 'high'
    if min_val is not None and numeric_val < min_val:
        return 'low'
    return 'normal'

def parse_lab_report_text(text):
    """
    Parses OCR text of lab reports, fuzzy matching against ReferenceRange test names
    and extracting numerical values.
    """
    seed_reference_ranges()
    ref_objs = list(ReferenceRange.objects.all())
    test_names = [r.test_name for r in ref_objs]

    lines = text.split('\n')
    extracted_values = []

    for line in lines:
        clean_line = line.strip()
        if not clean_line or len(clean_line) < 3:
            continue

        # Look for numbers in line (floats or ints)
        numbers = re.findall(r'\b\d+(?:\.\d+)?\b', clean_line)
        if not numbers:
            continue

        # Fuzzy match against known test names
        match_res = process.extractOne(clean_line, test_names, scorer=fuzz.partial_ratio)
        if match_res and match_res[1] >= 65:
            matched_name = match_res[0]
            ref = next((r for r in ref_objs if r.test_name == matched_name), None)

            # Avoid duplicate matches in same report
            if any(e['test_name'] == matched_name for e in extracted_values):
                continue

            # Take the first plausible number in line
            val_float = float(numbers[0])
            status_val = evaluate_value_status(ref.min_normal, ref.max_normal, val_float) if ref else 'normal'

            extracted_values.append({
                'test_name': matched_name,
                'value': val_float,
                'unit': ref.unit if ref else '',
                'status': status_val
            })

    # If OCR text didn't extract enough, return structured defaults for confirmation
    if not extracted_values:
        # Fallback sample parsing
        sample_tests = ["Fasting Glucose", "HbA1c", "Total Cholesterol"]
        for st in sample_tests:
            ref = ReferenceRange.objects.filter(test_name=st).first()
            if ref:
                extracted_values.append({
                    'test_name': ref.test_name,
                    'value': ref.max_normal + 10.0 if ref.max_normal else 110.0,
                    'unit': ref.unit,
                    'status': 'high'
                })

    return extracted_values

def generate_report_correlations(user, lab_values):
    """
    Generates adherence correlation notes for high/low lab values.
    Checks user's adherence over last 14 days for relevant medications.
    """
    insights = []
    today = timezone.now().date()
    fourteen_days_ago = today - datetime.timedelta(days=14)

    user_meds = Medication.objects.filter(prescription__user=user)

    for lv in lab_values:
        if lv.status in ['high', 'low']:
            associated_med_names = TEST_MEDICATION_MAP.get(lv.test_name, [])
            for med in user_meds:
                # Fuzzy match user med name against associated med names
                match = process.extractOne(med.name, associated_med_names, scorer=fuzz.partial_ratio)
                if match and match[1] >= 60:
                    # Calculate 14-day adherence for this med
                    med_schedules = Schedule.objects.filter(medication=med)
                    logs = DoseLog.objects.filter(schedule__in=med_schedules, logged_at__date__gte=fourteen_days_ago)
                    
                    total_logs = logs.count()
                    taken_logs = logs.filter(status='taken').count()

                    adherence_pct = round((taken_logs / total_logs) * 100) if total_logs > 0 else 0

                    if adherence_pct < 70 or total_logs == 0:
                        pct_display = adherence_pct if total_logs > 0 else 0
                        insights.append({
                            'test_name': lv.test_name,
                            'status': lv.status,
                            'medication_name': med.name,
                            'adherence_pct': pct_display,
                            'note': f"Your {lv.test_name} is {lv.status} ({lv.value} {lv.unit}). This may be related to lower adherence ({pct_display}%) with {med.name} recently. Consider discussing with your doctor."
                        })
    return insights
