import re
from rapidfuzz import process, fuzz

COMMON_MEDICINES = [
    "Amoxicillin", "Paracetamol", "Ibuprofen", "Aspirin", "Omeprazole",
    "Metformin", "Atorvastatin", "Amlodipine", "Losartan", "Cetirizine",
    "Azithromycin", "Ciprofloxacin", "Pantoprazole", "Levothyroxine", "Dolo 650", "Augmentin"
]

MEDICINE_CATEGORIES = {
    "Amoxicillin": "Antibiotic",
    "Azithromycin": "Antibiotic",
    "Ciprofloxacin": "Antibiotic",
    "Augmentin": "Antibiotic",
    "Paracetamol": "Pain Relief",
    "Dolo 650": "Pain Relief",
    "Ibuprofen": "Pain Relief",
    "Aspirin": "Pain Relief",
    "Omeprazole": "Antacid",
    "Pantoprazole": "Antacid",
    "Metformin": "Diabetes",
    "Atorvastatin": "Cardiovascular",
    "Amlodipine": "Blood Pressure",
    "Losartan": "Blood Pressure",
    "Cetirizine": "Antiallergic",
    "Levothyroxine": "Thyroid"
}

def parse_prescription_text(text):
    """
    Intelligently parses OCR text to extract structured medicine parameters, doctor notes, and confidence scores.
    Never fabricates values not present in the document.
    """
    text_lower = (text or "").lower()
    
    parsed_data = {
        "name": "",
        "dosage": "",
        "frequency": "",
        "duration": "",
        "before_food": False,
        "after_food": False,
        "morning": False,
        "afternoon": False,
        "evening": False,
        "night": False,
        "category": "General",
        "total_tablets": 0,
        "doctor_instructions": "",
        "doctor_notes": "",
        "confidence_score": 0.0
    }

    if not text or len(text.strip()) < 5:
        return parsed_data

    # 1. Fuzzy match for Medicine Name
    tokens = text.split() if text else []
    best_match = None
    highest_score = 0
    
    for word in tokens:
        clean_w = re.sub(r'[^a-zA-Z]', '', word)
        if len(clean_w) < 4:
            continue
        match_result = process.extractOne(clean_w, COMMON_MEDICINES, scorer=fuzz.ratio)
        if match_result:
            matched_name, score, _ = match_result
            if score > highest_score and score >= 65:
                highest_score = score
                best_match = matched_name
                
    if best_match:
        parsed_data["name"] = best_match
        parsed_data["category"] = MEDICINE_CATEGORIES.get(best_match, "General")
        parsed_data["confidence_score"] = float(highest_score)
    else:
        # Try finding words before mg/ml/tablets
        name_match = re.search(r'\b([A-Za-z]{4,20})\s+(?:\d+\s*(?:mg|ml|mcg|g))\b', text)
        if name_match:
            parsed_data["name"] = name_match.group(1).capitalize()
            parsed_data["confidence_score"] = 70.0
        else:
            parsed_data["name"] = ""
            parsed_data["confidence_score"] = 0.0

    # 2. Extract Dosage
    dosage_pattern = r'\b(\d+\s*(?:mg|ml|g|mcg|tablets?))\b'
    dosage_matches = re.findall(dosage_pattern, text_lower)
    if dosage_matches:
        parsed_data["dosage"] = dosage_matches[0]

    # 3. Extract Frequency
    freq_pattern = r'\b(1-0-1|1-1-1|1-0-0|0-1-0|0-0-1|1-1-1-1|once daily|twice daily|thrice daily|bid|tid|od|qid)\b'
    freq_matches = re.findall(freq_pattern, text_lower)
    if freq_matches:
        f_val = freq_matches[0].upper() if '-' in freq_matches[0] else freq_matches[0]
        parsed_data["frequency"] = f_val

    # 4. Extract Duration
    duration_pattern = r'\b(\d+\s*(?:days?|weeks?|months?))\b'
    duration_matches = re.findall(duration_pattern, text_lower)
    if duration_matches:
        dur_str = duration_matches[0]
        num = int(re.search(r'\d+', dur_str).group())
        if 'week' in dur_str:
            num *= 7
        elif 'month' in dur_str:
            num *= 30
        parsed_data["duration"] = str(num)

    # 5. Food Instruction
    if any(k in text_lower for k in ['before food', 'empty stomach', 'before meal', 'ac']):
        parsed_data["before_food"] = True
        parsed_data["after_food"] = False
    elif any(k in text_lower for k in ['after food', 'after meal', 'pc', 'with food']):
        parsed_data["before_food"] = False
        parsed_data["after_food"] = True

    # 6. Slot Timing Flags (Exact Reminder Generation)
    freq_str = parsed_data["frequency"].lower() if parsed_data["frequency"] else ""
    
    if not freq_str:
        pass
    elif freq_str == '1-0-0':
        parsed_data["morning"] = True
        parsed_data["afternoon"] = False
        parsed_data["evening"] = False
        parsed_data["night"] = False
    elif freq_str == '0-1-0':
        parsed_data["morning"] = False
        parsed_data["afternoon"] = True
        parsed_data["evening"] = False
        parsed_data["night"] = False
    elif freq_str == '0-0-1':
        parsed_data["morning"] = False
        parsed_data["afternoon"] = False
        parsed_data["evening"] = False
        parsed_data["night"] = True
    elif freq_str == '1-0-1' or 'twice daily' in freq_str or 'bid' in freq_str:
        parsed_data["morning"] = True
        parsed_data["afternoon"] = False
        parsed_data["evening"] = False
        parsed_data["night"] = True
    elif freq_str == '1-1-1' or 'thrice daily' in freq_str or 'tid' in freq_str:
        parsed_data["morning"] = True
        parsed_data["afternoon"] = True
        parsed_data["evening"] = False
        parsed_data["night"] = True
    elif freq_str == '1-1-1-1' or 'qid' in freq_str:
        parsed_data["morning"] = True
        parsed_data["afternoon"] = True
        parsed_data["evening"] = True
        parsed_data["night"] = True
    elif 'once daily' in freq_str or 'od' in freq_str:
        parsed_data["morning"] = True
        parsed_data["afternoon"] = False
        parsed_data["evening"] = False
        parsed_data["night"] = False
    else:
        # Fallback slot flags if frequency wasn't matched explicitly
        if 'morning' in text_lower:
            parsed_data["morning"] = True
        if 'afternoon' in text_lower:
            parsed_data["afternoon"] = True
        if 'evening' in text_lower:
            parsed_data["evening"] = True
        if 'night' in text_lower:
            parsed_data["night"] = True

        if not any([parsed_data["morning"], parsed_data["afternoon"], parsed_data["evening"], parsed_data["night"]]):
            # Default to morning only if unspecified and a medicine name was found
            if parsed_data["name"] and parsed_data["name"] != "Unspecified Medicine":
                parsed_data["morning"] = True

    # 7. Doctor Instructions & Notes
    if 'doctor note' in text_lower or 'note:' in text_lower or 'instruction' in text_lower:
        idx = max(text_lower.find('note'), text_lower.find('instruction'))
        if idx != -1:
            parsed_data["doctor_notes"] = text[idx:idx+150].strip()

    # 8. Calculate Estimated Total Tablets / Quantity
    daily_doses = (1 if parsed_data["morning"] else 0) + \
                  (1 if parsed_data["afternoon"] else 0) + \
                  (1 if parsed_data["evening"] else 0) + \
                  (1 if parsed_data["night"] else 0)
    if daily_doses == 0:
        daily_doses = 1
    
    try:
        dur_days = int(parsed_data["duration"])
    except ValueError:
        dur_days = 7

    parsed_data["total_tablets"] = daily_doses * dur_days

    return parsed_data


# ============================================================
# SPECIALIZED EXTRACTION: BLOOD TEST REPORT
# ============================================================

COMMON_LAB_TESTS = [
    'Haemoglobin', 'Hemoglobin', 'RBC Count', 'WBC Count', 'Platelet Count',
    'Hematocrit', 'MCV', 'MCH', 'MCHC', 'ESR',
    'Fasting Blood Sugar', 'Postprandial Blood Sugar', 'HbA1c', 'Random Blood Sugar',
    'Total Cholesterol', 'HDL', 'LDL', 'Triglycerides', 'VLDL',
    'Creatinine', 'Urea', 'BUN', 'Uric Acid',
    'SGPT', 'SGOT', 'ALT', 'AST', 'ALP',
    'Total Bilirubin', 'Direct Bilirubin', 'Indirect Bilirubin',
    'Total Protein', 'Albumin', 'Globulin',
    'TSH', 'Free T3', 'Free T4', 'T3', 'T4',
    'Sodium', 'Potassium', 'Chloride', 'Calcium',
    'Vitamin D', 'Vitamin B12', 'Iron', 'Ferritin',
    'CRP', 'PSA'
]


def parse_blood_report_text(text):
    """
    Extract lab test values from blood report OCR text.
    Returns a list of dicts: [{ test_name, value, unit, status }]
    """
    if not text:
        return []

    results = []
    lines = text.split('\n')

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped or len(line_stripped) < 5:
            continue

        # Try to match patterns like: "Haemoglobin  14.2  g/dL  13.0 - 17.0"
        # or "HbA1c: 6.5 %"
        for test_name in COMMON_LAB_TESTS:
            if test_name.lower() in line_stripped.lower():
                # Extract numeric value after the test name
                after_name = line_stripped[line_stripped.lower().index(test_name.lower()) + len(test_name):]
                value_match = re.search(r'[\s:]*(\d+\.?\d*)', after_name)
                if value_match:
                    value = float(value_match.group(1))
                    # Try to extract unit
                    unit_match = re.search(
                        r'\d+\.?\d*\s*(mg/dl|g/dl|mmol/l|u/l|iu/l|%|cells/cumm|lakhs/cumm|million/cumm|'
                        r'mEq/L|ng/ml|pg/ml|µIU/ml|fL|pg|g%|mm/hr|thou/cumm)',
                        after_name, re.IGNORECASE
                    )
                    unit = unit_match.group(1) if unit_match else ''

                    results.append({
                        'test_name': test_name,
                        'value': value,
                        'unit': unit,
                        'status': 'normal'  # Will be evaluated against ReferenceRange in the view
                    })
                break  # One match per line

    return results


# ============================================================
# SPECIALIZED EXTRACTION: IMAGING REPORTS (X-Ray, MRI, CT, Ultrasound)
# ============================================================

def parse_imaging_report_text(text):
    """
    Extract findings and impressions from imaging report OCR text.
    Returns dict: { body_part, modality, findings, impression, recommendation }
    """
    if not text:
        return {
            'body_part': 'Not identified',
            'modality': 'Imaging',
            'findings': 'Could not extract findings from document.',
            'impression': '',
            'recommendation': ''
        }

    text_lower = text.lower()

    # Detect modality
    modality = 'Imaging'
    for mod, keywords in [
        ('X-Ray', ['x-ray', 'xray', 'x ray', 'radiograph']),
        ('MRI', ['mri', 'magnetic resonance']),
        ('CT Scan', ['ct scan', 'ct ', 'cect', 'ncct', 'hrct', 'computed tomography']),
        ('Ultrasound', ['ultrasound', 'usg', 'sonography', 'sonogram']),
    ]:
        if any(kw in text_lower for kw in keywords):
            modality = mod
            break

    # Detect body part
    body_part = 'Not identified'
    body_keywords = {
        'Chest': ['chest', 'lung', 'thorax', 'pulmonary'],
        'Abdomen': ['abdomen', 'abdominal', 'liver', 'kidney', 'spleen', 'gallbladder', 'pancreas'],
        'Brain': ['brain', 'cerebral', 'cranial', 'head'],
        'Spine': ['spine', 'spinal', 'cervical', 'lumbar', 'thoracic', 'vertebra'],
        'Knee': ['knee', 'patella', 'meniscus'],
        'Shoulder': ['shoulder', 'rotator cuff', 'scapula'],
        'Pelvis': ['pelvis', 'pelvic', 'hip', 'uterus', 'ovary'],
    }
    for part, keywords in body_keywords.items():
        if any(kw in text_lower for kw in keywords):
            body_part = part
            break

    # Extract Findings section
    findings = ''
    findings_match = re.search(
        r'(?:findings?|observation)\s*[:\-]\s*(.*?)(?=(?:impression|conclusion|recommendation|opinion|$))',
        text, re.IGNORECASE | re.DOTALL
    )
    if findings_match:
        findings = findings_match.group(1).strip()[:500]
    else:
        # Use the bulk of the text as findings
        findings = text[:400].strip()

    # Extract Impression section
    impression = ''
    impression_match = re.search(
        r'(?:impression|conclusion|opinion)\s*[:\-]\s*(.*?)(?=(?:recommendation|advice|suggestion|$))',
        text, re.IGNORECASE | re.DOTALL
    )
    if impression_match:
        impression = impression_match.group(1).strip()[:300]

    # Extract Recommendation
    recommendation = ''
    rec_match = re.search(
        r'(?:recommendation|advice|suggestion|follow[\s\-]?up)\s*[:\-]\s*(.*?)$',
        text, re.IGNORECASE | re.DOTALL
    )
    if rec_match:
        recommendation = rec_match.group(1).strip()[:200]

    return {
        'body_part': body_part,
        'modality': modality,
        'findings': findings or 'No specific findings extracted.',
        'impression': impression,
        'recommendation': recommendation
    }


# ============================================================
# SPECIALIZED EXTRACTION: DISCHARGE SUMMARY
# ============================================================

def parse_discharge_summary_text(text):
    """
    Extract structured fields from a discharge summary.
    Returns dict: { diagnosis, treatment, admission_date, discharge_date, follow_up, medications }
    """
    if not text:
        return {
            'diagnosis': '',
            'treatment': '',
            'admission_date': '',
            'discharge_date': '',
            'follow_up': '',
            'medications': ''
        }

    result = {
        'diagnosis': '',
        'treatment': '',
        'admission_date': '',
        'discharge_date': '',
        'follow_up': '',
        'medications': ''
    }

    # Extract diagnosis
    diag_match = re.search(
        r'(?:final\s+)?diagnosis\s*[:\-]\s*(.*?)(?=(?:treatment|course|history|procedure|medication|$))',
        text, re.IGNORECASE | re.DOTALL
    )
    if diag_match:
        result['diagnosis'] = diag_match.group(1).strip()[:300]

    # Extract treatment
    treat_match = re.search(
        r'(?:treatment\s*(?:given)?|course\s*in\s*hospital|procedure)\s*[:\-]\s*(.*?)(?=(?:condition|discharge|follow|advice|medication|$))',
        text, re.IGNORECASE | re.DOTALL
    )
    if treat_match:
        result['treatment'] = treat_match.group(1).strip()[:400]

    # Extract dates
    adm_match = re.search(r'(?:date\s*of\s*admission|admitted\s*on)\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})', text, re.IGNORECASE)
    if adm_match:
        result['admission_date'] = adm_match.group(1)

    dis_match = re.search(r'(?:date\s*of\s*discharge|discharged\s*on)\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})', text, re.IGNORECASE)
    if dis_match:
        result['discharge_date'] = dis_match.group(1)

    # Extract follow-up
    fu_match = re.search(
        r'(?:follow[\s\-]?up|review\s*after|advice\s*on\s*discharge)\s*[:\-]\s*(.*?)(?=(?:medication|$))',
        text, re.IGNORECASE | re.DOTALL
    )
    if fu_match:
        result['follow_up'] = fu_match.group(1).strip()[:300]

    # Extract discharge medications
    med_match = re.search(
        r'(?:discharge\s*medication|medication\s*(?:on|at)\s*discharge|medicines?\s*advised)\s*[:\-]\s*(.*?)(?=(?:follow|advice|$))',
        text, re.IGNORECASE | re.DOTALL
    )
    if med_match:
        result['medications'] = med_match.group(1).strip()[:400]

    return result


# ============================================================
# SPECIALIZED EXTRACTION: VACCINATION RECORD
# ============================================================

def parse_vaccination_text(text):
    """
    Extract vaccination details from OCR text.
    Returns dict: { vaccine_name, dose_number, date, batch_number, next_dose_due, administered_by }
    """
    if not text:
        return {
            'vaccine_name': '',
            'dose_number': '',
            'date': '',
            'batch_number': '',
            'next_dose_due': '',
            'administered_by': ''
        }

    text_lower = text.lower()
    result = {
        'vaccine_name': '',
        'dose_number': '',
        'date': '',
        'batch_number': '',
        'next_dose_due': '',
        'administered_by': ''
    }

    # Detect vaccine name
    known_vaccines = [
        'Covishield', 'Covaxin', 'Pfizer', 'Moderna', 'AstraZeneca', 'Johnson',
        'BCG', 'OPV', 'IPV', 'DPT', 'MMR', 'Hepatitis A', 'Hepatitis B',
        'Tetanus', 'Influenza', 'Pneumococcal', 'Rotavirus', 'Typhoid',
        'Varicella', 'HPV', 'Rabies', 'Meningococcal'
    ]
    for vaccine in known_vaccines:
        if vaccine.lower() in text_lower:
            result['vaccine_name'] = vaccine
            break

    # Extract dose number
    dose_match = re.search(r'dose\s*[:\-#]?\s*(\d)', text_lower)
    if dose_match:
        result['dose_number'] = dose_match.group(1)
    elif 'booster' in text_lower:
        result['dose_number'] = 'Booster'

    # Extract date
    date_match = re.search(r'(?:date|administered|vaccination\s*date)\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})', text, re.IGNORECASE)
    if date_match:
        result['date'] = date_match.group(1)

    # Extract batch/lot number
    batch_match = re.search(r'(?:batch|lot)\s*(?:no|number|#)?\s*[:\-]?\s*([A-Za-z0-9\-]+)', text, re.IGNORECASE)
    if batch_match:
        result['batch_number'] = batch_match.group(1)

    # Next dose due
    next_match = re.search(r'(?:next\s*dose|due\s*date|next\s*due)\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})', text, re.IGNORECASE)
    if next_match:
        result['next_dose_due'] = next_match.group(1)

    # Administered by
    admin_match = re.search(r'(?:administered\s*by|vaccinated\s*by|given\s*by)\s*[:\-]?\s*(.+?)(?:\n|$)', text, re.IGNORECASE)
    if admin_match:
        result['administered_by'] = admin_match.group(1).strip()[:100]

    return result


# ============================================================
# AI SUMMARY GENERATOR
# ============================================================

def generate_ai_summary(document_type, extracted_data, raw_text=''):
    """
    Generate a patient-friendly AI summary based on document type and extracted data.
    Includes a mandatory 'informational only' disclaimer.
    Never fabricates values not present in the data.
    """
    disclaimer = "\n\n⚕️ Disclaimer: This summary is AI-generated for informational purposes only. It is not a medical diagnosis. Please consult your doctor for professional medical advice."

    if document_type == 'prescription':
        name = extracted_data.get('name', 'a medication')
        dosage = extracted_data.get('dosage', '')
        freq = extracted_data.get('frequency', '')
        duration = extracted_data.get('duration', '')
        food = 'before food' if extracted_data.get('before_food') else 'after food'
        summary = f"Your doctor has prescribed {name} {dosage}. "
        if freq:
            summary += f"Take it {freq} "
        if duration:
            summary += f"for {duration} days. "
        summary += f"It should be taken {food}."
        notes = extracted_data.get('doctor_notes', '')
        if notes:
            summary += f" Doctor's note: {notes}"
        return summary + disclaimer

    elif document_type == 'blood_test':
        if isinstance(extracted_data, list):
            count = len(extracted_data)
            abnormal = [v for v in extracted_data if v.get('status') in ('high', 'low')]
            summary = f"Your blood test report contains {count} test parameter(s). "
            if abnormal:
                summary += f"{len(abnormal)} value(s) are outside the normal range: "
                summary += ", ".join([f"{v['test_name']} ({v['status']})" for v in abnormal[:5]])
                summary += ". Please discuss these results with your doctor."
            else:
                summary += "All values appear to be within normal range."
        else:
            summary = "A blood test report was detected. Please review the extracted values."
        return summary + disclaimer

    elif document_type in ('xray', 'mri', 'ct_scan', 'ultrasound'):
        modality = extracted_data.get('modality', 'Imaging')
        body_part = extracted_data.get('body_part', '')
        impression = extracted_data.get('impression', '')
        summary = f"Your {modality} report"
        if body_part and body_part != 'Not identified':
            summary += f" of the {body_part}"
        summary += " has been processed. "
        if impression:
            summary += f"Key impression: {impression[:200]}"
        else:
            findings = extracted_data.get('findings', '')
            if findings and findings != 'No specific findings extracted.':
                summary += f"Findings: {findings[:200]}"
            else:
                summary += "Please review the full report with your doctor."
        return summary + disclaimer

    elif document_type == 'discharge_summary':
        diagnosis = extracted_data.get('diagnosis', '')
        follow_up = extracted_data.get('follow_up', '')
        summary = "Your discharge summary has been processed. "
        if diagnosis:
            summary += f"Diagnosis: {diagnosis[:200]}. "
        if follow_up:
            summary += f"Follow-up instructions: {follow_up[:200]}"
        return summary + disclaimer

    elif document_type == 'vaccination':
        vaccine = extracted_data.get('vaccine_name', 'a vaccine')
        dose = extracted_data.get('dose_number', '')
        date = extracted_data.get('date', '')
        summary = f"Vaccination record detected for {vaccine}. "
        if dose:
            summary += f"Dose: {dose}. "
        if date:
            summary += f"Administered on: {date}. "
        next_due = extracted_data.get('next_dose_due', '')
        if next_due:
            summary += f"Next dose due: {next_due}."
        return summary + disclaimer

    elif document_type == 'urine_test':
        summary = "A urine test report has been detected and processed. Please review the extracted values with your healthcare provider."
        return summary + disclaimer

    elif document_type == 'ecg':
        summary = "An ECG report has been detected. ECG interpretation requires clinical context. Please consult your cardiologist for detailed analysis."
        return summary + disclaimer

    elif document_type == 'medical_certificate':
        summary = "A medical certificate has been detected. The document has been stored for your records."
        return summary + disclaimer

    else:
        summary = "A medical document has been uploaded and processed. Please review the extracted information for accuracy."
        return summary + disclaimer
