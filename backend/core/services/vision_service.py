"""
Vision-based Document Analysis Service for MediMate.

Uses Google Gemini's vision capabilities to analyze medical documents
when OCR fails or handwriting is detected.

Key principles:
- Conservative extraction: never guess ambiguous handwriting
- Mark uncertain fields with needs_review=True
- Graceful degradation: returns None if API unavailable
"""

import logging
import os

logger = logging.getLogger('medimate.vision')


def _get_gemini_client():
    """Get a configured Gemini client. Returns None if API key not set."""
    try:
        from django.conf import settings
        api_key = getattr(settings, 'GEMINI_API_KEY', '') or os.environ.get('GEMINI_API_KEY', '')
        if not api_key or api_key == 'your-gemini-api-key':
            logger.info("[VISION] GEMINI_API_KEY not configured — vision fallback unavailable")
            return None

        from google import genai
        client = genai.Client(api_key=api_key)
        return client
    except ImportError:
        logger.warning("[VISION] google-genai package not installed")
        return None
    except Exception as e:
        logger.exception(f"[VISION] Failed to initialize Gemini client: {e}")
        return None


MEDICAL_DOCUMENT_PROMPT = """You are a medical document analysis assistant. Analyze this medical document image carefully.

IMPORTANT RULES:
1. NEVER invent or guess information that is not clearly visible in the document.
2. If handwriting is ambiguous, mark that field as uncertain. Do NOT choose one interpretation.
3. If a value could be read as multiple things (e.g., "5 mg" or "15 mg"), note the ambiguity.
4. Only extract information you can actually see in the document.

First, determine the document type. Is this:
- A prescription (medicine names, dosages, instructions)
- A blood test / lab report (test names, values, units, ranges)
- An imaging report (X-ray, MRI, CT, ultrasound findings)
- A discharge summary
- A vaccination record
- Another type of medical document

Then extract the relevant information based on document type.

For PRESCRIPTIONS, extract:
- medicine_name (exact name as written)
- dosage (e.g., "500mg", "5ml")
- frequency (e.g., "1-0-1", "twice daily", "once daily")
- duration (number of days, e.g., "7" or "5 days")
- timing: before_food or after_food
- time_slots: morning, afternoon, evening, night (true/false)
- doctor_instructions (any special notes)
- confidence: your confidence 0.0-1.0 for each field
- needs_review: true if the value is uncertain or ambiguous

For LAB REPORTS, extract test results as a list:
- test_name, value (numeric), unit, status (normal/high/low)
- confidence for each value

Respond ONLY with valid JSON in this exact format:

{
  "document_type": "prescription" or "blood_test" or "imaging" or "discharge_summary" or "vaccination" or "other",
  "overall_confidence": 0.0 to 1.0,
  "needs_review": true or false,
  "extracted_data": { ... },
  "notes": "any important observations about document quality"
}

For prescriptions, extracted_data should be:
{
  "medicines": [
    {
      "name": "...",
      "dosage": "...",
      "frequency": "...",
      "duration": "...",
      "before_food": true/false,
      "after_food": true/false,
      "morning": true/false,
      "afternoon": true/false,
      "evening": true/false,
      "night": true/false,
      "confidence": 0.0-1.0,
      "needs_review": true/false
    }
  ],
  "doctor_instructions": "...",
  "doctor_notes": "..."
}

For lab reports, extracted_data should be:
{
  "tests": [
    {
      "test_name": "...",
      "value": number,
      "unit": "...",
      "status": "normal" or "high" or "low",
      "confidence": 0.0-1.0
    }
  ]
}

If you cannot read the document at all, return:
{
  "document_type": "unknown",
  "overall_confidence": 0.0,
  "needs_review": true,
  "extracted_data": {},
  "notes": "Unable to read document content"
}
"""


def analyze_document_image(image_path):
    """
    Analyze a medical document image using Google Gemini vision.

    Args:
        image_path: Absolute path to the image file

    Returns:
        dict with vision analysis results, or None if unavailable/failed.
        {
            'document_type': str,
            'overall_confidence': float,
            'needs_review': bool,
            'extracted_data': dict,
            'notes': str,
            'raw_text': str (extracted text from vision)
        }
    """
    client = _get_gemini_client()
    if client is None:
        return None

    try:
        from google.genai import types
        import json

        logger.info(f"[VISION] Analyzing document image: {os.path.basename(image_path)}")

        # Upload the image file
        with open(image_path, 'rb') as f:
            image_bytes = f.read()

        # Determine MIME type
        ext = os.path.splitext(image_path)[1].lower()
        mime_map = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.bmp': 'image/bmp',
            '.webp': 'image/webp', '.pdf': 'application/pdf',
        }
        mime_type = mime_map.get(ext, 'image/jpeg')

        # For PDFs, we need to convert to image first
        if ext == '.pdf':
            try:
                import pymupdf
                doc = pymupdf.open(image_path)
                page = doc[0]
                pix = page.get_pixmap(dpi=300)
                image_bytes = pix.tobytes("png")
                mime_type = 'image/png'
                logger.info("[VISION] Converted PDF page 1 to PNG for vision analysis")
            except Exception as e:
                logger.warning(f"[VISION] PDF to image conversion failed: {e}")
                return None

        # Call Gemini
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                MEDICAL_DOCUMENT_PROMPT,
            ],
        )

        response_text = response.text.strip()
        logger.info(f"[VISION] Gemini response received: {len(response_text)} chars")

        # Parse the JSON response
        # Handle markdown code blocks
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            json_lines = []
            in_block = False
            for line in lines:
                if line.strip().startswith('```'):
                    in_block = not in_block
                    continue
                if in_block:
                    json_lines.append(line)
            response_text = '\n'.join(json_lines)

        result = json.loads(response_text)

        logger.info(f"[VISION] Document type detected: {result.get('document_type', 'unknown')}")
        logger.info(f"[VISION] Overall confidence: {result.get('overall_confidence', 0)}")
        logger.info(f"[VISION] Needs review: {result.get('needs_review', True)}")

        return result

    except json.JSONDecodeError as e:
        logger.warning(f"[VISION] Failed to parse Gemini JSON response: {e}")
        logger.debug(f"[VISION] Raw response: {response_text[:500]}")
        return None
    except Exception as e:
        logger.exception(f"[VISION] Vision analysis failed: {e}")
        return None


def vision_result_to_prescription_data(vision_result):
    """
    Convert vision analysis result to the standard MediMate prescription format
    compatible with the existing confirm_prescription flow.

    Returns dict matching parse_prescription_text output format.
    """
    if not vision_result or not isinstance(vision_result, dict):
        return None

    doc_type = vision_result.get('document_type', 'unknown')
    extracted = vision_result.get('extracted_data', {})
    overall_conf = vision_result.get('overall_confidence', 0.0)

    if doc_type == 'prescription':
        medicines = extracted.get('medicines', [])
        if not medicines:
            return None

        # Use the first medicine for the primary extraction
        # (the existing flow handles one medicine at a time)
        med = medicines[0]
        confidence_score = med.get('confidence', overall_conf) * 100

        # Map frequency to standard format
        frequency = med.get('frequency', '')

        # Determine timing
        morning = med.get('morning', False)
        afternoon = med.get('afternoon', False)
        evening = med.get('evening', False)
        night = med.get('night', False)

        # If no timing specified, derive from frequency
        if not any([morning, afternoon, evening, night]):
            freq_lower = (frequency or '').lower()
            if '1-0-1' in freq_lower or 'twice' in freq_lower:
                morning, night = True, True
            elif '1-1-1' in freq_lower or 'thrice' in freq_lower:
                morning, afternoon, night = True, True, True
            elif '1-0-0' in freq_lower:
                morning = True
            elif '0-0-1' in freq_lower:
                night = True
            else:
                morning = True  # Safe default

        # Calculate total tablets
        try:
            duration_days = int(med.get('duration', '7') or '7')
        except (ValueError, TypeError):
            duration_days = 7

        daily_doses = sum([morning, afternoon, evening, night]) or 1
        total_tablets = daily_doses * duration_days

        needs_review = med.get('needs_review', False) or vision_result.get('needs_review', False)
        if confidence_score < 70:
            needs_review = True

        return {
            'name': med.get('name', 'Unspecified Medicine') or 'Unspecified Medicine',
            'dosage': med.get('dosage', '') or '',
            'frequency': frequency or '',
            'duration': str(duration_days),
            'before_food': bool(med.get('before_food', False)),
            'after_food': bool(med.get('after_food', False)),
            'morning': morning,
            'afternoon': afternoon,
            'evening': evening,
            'night': night,
            'category': 'General',
            'total_tablets': total_tablets,
            'doctor_instructions': extracted.get('doctor_instructions', '') or '',
            'doctor_notes': extracted.get('doctor_notes', '') or '',
            'confidence_score': confidence_score,
            'needs_review': needs_review,
            'vision_extracted': True,
        }

    elif doc_type == 'blood_test':
        tests = extracted.get('tests', [])
        if not tests:
            return None

        # Convert to the lab report format (list of dicts)
        lab_values = []
        for test in tests:
            lab_values.append({
                'test_name': test.get('test_name', ''),
                'value': test.get('value', 0),
                'unit': test.get('unit', ''),
                'status': test.get('status', 'normal'),
            })

        return {
            '_type': 'blood_test',
            '_values': lab_values,
            'confidence_score': overall_conf * 100,
            'needs_review': vision_result.get('needs_review', True),
            'vision_extracted': True,
        }

    return None
