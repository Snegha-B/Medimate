"""
Document Type Classification Service for MediMate.

Classifies OCR-extracted text into one of 12 medical document categories
using keyword/pattern matching with confidence scoring.
"""

import re

# ============================================================
# DOCUMENT TYPE DEFINITIONS & KEYWORD DICTIONARIES
# ============================================================

DOCUMENT_TYPES = {
    'prescription': {
        'label': 'Doctor Prescription',
        'keywords': [
            'rx', 'prescription', 'prescribe', 'prescribed', 'medicine',
            'tablet', 'capsule', 'syrup', 'ointment', 'injection',
            'dosage', 'dose', 'frequency', 'after food', 'before food',
            'twice daily', 'thrice daily', 'once daily', 'bid', 'tid', 'od',
            '1-0-1', '1-1-1', '1-0-0', '0-0-1', '0-1-0',
            'mg', 'ml', 'mcg', 'take', 'apply', 'inhale',
            'dr.', 'doctor', 'clinic', 'opd', 'outpatient',
            'sig:', 'disp:', 'refill', 'dispense'
        ],
        'patterns': [
            r'\b\d+\s*(?:mg|ml|mcg|g)\b',
            r'\b[10]-[10]-[10]\b',
            r'\brx\b',
            r'\btab(?:let)?s?\b',
            r'\bcap(?:sule)?s?\b',
        ]
    },
    'blood_test': {
        'label': 'Blood Test Report',
        'keywords': [
            'blood test', 'blood report', 'cbc', 'complete blood count',
            'haemoglobin', 'hemoglobin', 'hgb', 'hb', 'rbc', 'wbc',
            'platelet', 'plt', 'hematocrit', 'hct', 'mcv', 'mch', 'mchc',
            'esr', 'crp', 'blood sugar', 'fasting', 'postprandial',
            'hba1c', 'cholesterol', 'hdl', 'ldl', 'triglyceride',
            'creatinine', 'urea', 'bun', 'sgpt', 'sgot', 'alt', 'ast',
            'bilirubin', 'albumin', 'globulin', 'protein',
            'thyroid', 'tsh', 't3', 't4', 'free t3', 'free t4',
            'blood group', 'serum', 'plasma', 'lipid profile',
            'liver function', 'kidney function', 'renal profile',
            'electrolyte', 'sodium', 'potassium', 'chloride',
            'reference range', 'normal range', 'units',
            'pathology', 'laboratory', 'lab report'
        ],
        'patterns': [
            r'\b\d+\.?\d*\s*(?:mg/dl|g/dl|mmol/l|u/l|iu/l|cells/cumm|lakhs?/cumm|million)',
            r'\breference\s+(?:range|value)\b',
            r'\bnormal\s+range\b',
        ]
    },
    'urine_test': {
        'label': 'Urine Test Report',
        'keywords': [
            'urine', 'urinalysis', 'urine test', 'urine analysis',
            'urine routine', 'urine culture', 'midstream',
            'specific gravity', 'ph', 'protein trace', 'glucose trace',
            'pus cells', 'epithelial cells', 'rbc in urine',
            'cast', 'crystal', 'bacteria', 'ketone', 'nitrite',
            'bilirubin', 'urobilinogen', 'microalbumin',
            'urine microscopy'
        ],
        'patterns': [
            r'\burine\b',
            r'\bpus\s+cells?\b',
            r'\bepithelial\b',
        ]
    },
    'ultrasound': {
        'label': 'Ultrasound Report',
        'keywords': [
            'ultrasound', 'ultrasonography', 'usg', 'sonography', 'sonogram',
            'transducer', 'probe', 'echogenicity', 'echo', 'anechoic',
            'hypoechoic', 'hyperechoic', 'heterogeneous', 'homogeneous',
            'abdomen', 'pelvis', 'obstetric', 'fetal', 'gestational',
            'kidney', 'liver', 'spleen', 'gallbladder', 'pancreas',
            'ovary', 'uterus', 'prostate', 'thyroid',
            'doppler', 'color doppler', 'impression', 'findings',
            'no focal lesion', 'normal study', 'unremarkable'
        ],
        'patterns': [
            r'\b(?:usg|ultrasound|sonography)\b',
            r'\becho(?:genicity|genic)?\b',
        ]
    },
    'xray': {
        'label': 'X-Ray Report',
        'keywords': [
            'x-ray', 'xray', 'x ray', 'radiograph', 'radiography',
            'chest x-ray', 'chest pa', 'lateral view', 'ap view',
            'pa view', 'oblique', 'posteroanterior',
            'lung field', 'cardiac shadow', 'costophrenic',
            'hilar', 'mediastinum', 'trachea', 'diaphragm',
            'fracture', 'dislocation', 'bone', 'joint',
            'opacity', 'lucency', 'consolidation', 'effusion',
            'soft tissue', 'skeletal', 'spine', 'cervical', 'lumbar',
            'impression', 'findings', 'normal study'
        ],
        'patterns': [
            r'\bx[\s-]?ray\b',
            r'\bradiograph\b',
            r'\bchest\s+(?:pa|ap)\b',
        ]
    },
    'mri': {
        'label': 'MRI Report',
        'keywords': [
            'mri', 'magnetic resonance', 'mr imaging',
            't1 weighted', 't2 weighted', 'flair', 'dwi', 'adc',
            'gadolinium', 'contrast enhanced', 'post contrast',
            'signal intensity', 'high signal', 'low signal',
            'brain mri', 'spine mri', 'knee mri', 'shoulder mri',
            'disc herniation', 'disc bulge', 'ligament', 'meniscus',
            'white matter', 'grey matter', 'ventricle', 'cerebellum',
            'impression', 'findings', 'sequences', 'axial', 'sagittal', 'coronal'
        ],
        'patterns': [
            r'\bmri\b',
            r'\bmagnetic\s+resonance\b',
            r'\bt[12]\s*(?:weighted|w)\b',
        ]
    },
    'ct_scan': {
        'label': 'CT Scan Report',
        'keywords': [
            'ct scan', 'ct', 'computed tomography', 'cect', 'ncct',
            'hrct', 'ct angiography', 'contrast enhanced ct',
            'hounsfield', 'attenuation', 'window', 'axial section',
            'coronal reconstruction', 'sagittal reconstruction',
            'brain ct', 'chest ct', 'abdomen ct', 'ct head',
            'hypodense', 'hyperdense', 'isodense',
            'impression', 'findings', 'protocol'
        ],
        'patterns': [
            r'\bct\s*scan\b',
            r'\b(?:cect|ncct|hrct)\b',
            r'\bcomputed\s+tomography\b',
        ]
    },
    'ecg': {
        'label': 'ECG Report',
        'keywords': [
            'ecg', 'ekg', 'electrocardiogram', 'electrocardiograph',
            'heart rate', 'rhythm', 'sinus rhythm', 'sinus tachycardia',
            'sinus bradycardia', 'atrial fibrillation', 'arrhythmia',
            'p wave', 'qrs complex', 'st segment', 't wave', 'pr interval',
            'qt interval', 'qtc', 'axis', 'left axis', 'right axis',
            'heart block', 'bundle branch', 'ischemia', 'infarction',
            'normal ecg', 'within normal limits',
            'lead', '12 lead', 'limb leads', 'chest leads',
            'bpm', 'beats per minute'
        ],
        'patterns': [
            r'\becg\b',
            r'\bekg\b',
            r'\belectrocardiogra(?:m|ph)\b',
            r'\bsinus\s+rhythm\b',
        ]
    },
    'discharge_summary': {
        'label': 'Discharge Summary',
        'keywords': [
            'discharge summary', 'discharge', 'admitted', 'admission',
            'date of admission', 'date of discharge', 'hospital stay',
            'inpatient', 'ipd', 'ward', 'bed number',
            'chief complaint', 'presenting complaint', 'history of present illness',
            'diagnosis', 'final diagnosis', 'provisional diagnosis',
            'treatment given', 'treatment', 'course in hospital',
            'condition at discharge', 'advice on discharge',
            'follow up', 'review after', 'discharge medication',
            'operative procedure', 'surgery', 'post operative'
        ],
        'patterns': [
            r'\bdischarge\s+summary\b',
            r'\bdate\s+of\s+(?:admission|discharge)\b',
            r'\badmitted\s+(?:on|to)\b',
        ]
    },
    'vaccination': {
        'label': 'Vaccination Record',
        'keywords': [
            'vaccination', 'vaccine', 'immunization', 'immunisation',
            'dose 1', 'dose 2', 'dose 3', 'booster', 'booster dose',
            'covishield', 'covaxin', 'pfizer', 'moderna', 'astrazeneca',
            'bcg', 'opv', 'ipv', 'dpt', 'mmr', 'hepatitis',
            'tetanus', 'influenza', 'pneumococcal', 'rotavirus',
            'covid-19', 'coronavirus', 'sars-cov-2',
            'vaccination certificate', 'vaccine certificate',
            'batch number', 'lot number', 'next dose due',
            'vaccination date', 'administered by', 'vaccination center'
        ],
        'patterns': [
            r'\bvaccin(?:e|ation|ated)\b',
            r'\bimmuni[sz]ation\b',
            r'\bdose\s*[123]\b',
            r'\bbooster\b',
        ]
    },
    'medical_certificate': {
        'label': 'General Medical Certificate',
        'keywords': [
            'medical certificate', 'fitness certificate', 'fit to work',
            'fit to join', 'medical fitness', 'health certificate',
            'certify', 'certified', 'hereby certify', 'to whom it may concern',
            'leave certificate', 'sick leave', 'medical leave',
            'examined', 'physically fit', 'medically fit',
            'unfit', 'rest advised', 'advised rest'
        ],
        'patterns': [
            r'\bmedical\s+certificate\b',
            r'\bfit(?:ness)?\s+certificate\b',
            r'\bhereby\s+certif(?:y|ied)\b',
        ]
    },
}


def classify_document(text):
    """
    Classify OCR text into a medical document type.

    Returns:
        dict: {
            'document_type': str (key from DOCUMENT_TYPES),
            'document_label': str (human-readable label),
            'classification_confidence': float (0-100),
            'matched_keywords': list[str],
            'all_scores': dict (scores for all types for debugging)
        }
    """
    if not text or len(text.strip()) < 5:
        return {
            'document_type': 'unknown',
            'document_label': 'Unknown / Unrecognized',
            'classification_confidence': 0.0,
            'matched_keywords': [],
            'all_scores': {}
        }

    text_lower = text.lower()
    scores = {}
    matches = {}

    for doc_type, config in DOCUMENT_TYPES.items():
        score = 0
        matched = []

        # Keyword matching (each keyword hit = +1 point)
        for keyword in config['keywords']:
            if keyword in text_lower:
                score += 1
                matched.append(keyword)

        # Regex pattern matching (each pattern hit = +2 points, stronger signal)
        for pattern in config.get('patterns', []):
            try:
                if re.search(pattern, text_lower):
                    score += 2
                    matched.append(f'[pattern:{pattern[:30]}]')
            except re.error:
                pass

        scores[doc_type] = score
        matches[doc_type] = matched

    # Find the top scoring type
    if not scores or max(scores.values()) == 0:
        return {
            'document_type': 'unknown',
            'document_label': 'Unknown / Unrecognized',
            'classification_confidence': 0.0,
            'matched_keywords': [],
            'all_scores': scores
        }

    best_type = max(scores, key=scores.get)
    best_score = scores[best_type]

    # Calculate confidence as percentage of matched keywords vs total possible
    total_possible = len(DOCUMENT_TYPES[best_type]['keywords']) + len(DOCUMENT_TYPES[best_type].get('patterns', [])) * 2
    raw_confidence = (best_score / total_possible) * 100 if total_possible > 0 else 0

    # Scale confidence: minimum useful score is ~3 keywords
    # Cap at 98% (never 100% certain with keyword matching)
    classification_confidence = min(98.0, max(10.0, raw_confidence * 3))

    # Check if runner-up is too close (ambiguous classification)
    sorted_scores = sorted(scores.values(), reverse=True)
    if len(sorted_scores) >= 2 and sorted_scores[0] > 0:
        gap_ratio = sorted_scores[1] / sorted_scores[0] if sorted_scores[0] > 0 else 0
        if gap_ratio > 0.8:
            # Runner-up is very close — reduce confidence
            classification_confidence *= 0.7

    classification_confidence = round(classification_confidence, 1)

    return {
        'document_type': best_type,
        'document_label': DOCUMENT_TYPES[best_type]['label'],
        'classification_confidence': classification_confidence,
        'matched_keywords': matches[best_type][:10],  # Top 10 matches
        'all_scores': scores
    }
