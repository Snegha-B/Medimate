"""
Vision-based Document Analysis Service for MediMate.

Uses Google Gemini's vision capabilities to analyze medical documents
when OCR fails or handwriting is detected.

Key principles:
- Conservative extraction: never guess ambiguous handwriting
- Mark uncertain fields with needs_review=True
- Comprehensive diagnostic logging
"""

import logging
import os

logger = logging.getLogger('medimate.vision')

def _log(msg):
    logger.info(msg)
    print(f"[PIPELINE LOG] {msg}")


def _get_gemini_client():
    """Get a configured Gemini client. Returns (client, error_msg)."""
    try:
        from django.conf import settings
        api_key = getattr(settings, 'GEMINI_API_KEY', '') or os.environ.get('GEMINI_API_KEY', '')
        if not api_key or api_key == 'your-gemini-api-key':
            _log("[VISION] ERROR: GEMINI_API_KEY is missing or unconfigured on environment variables.")
            return None, "GEMINI_API_KEY missing"

        from google import genai
        client = genai.Client(api_key=api_key)
        return client, None
    except ImportError as ie:
        _log(f"[VISION] ERROR: google-genai package not installed: {ie}")
        return None, "google-genai not installed"
    except Exception as e:
        _log(f"[VISION] ERROR: Failed to initialize Gemini client: {e}")
        logger.exception("Gemini client initialization failed:")
        return None, str(e)


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
    """
    _log("[VISION] Vision request started")
    _log("[VISION] Provider/model: google-genai / gemini-2.0-flash")

    client, err = _get_gemini_client()
    if client is None:
        _log(f"[VISION] Response status: FAILED ({err})")
        _log("[VISION] Response contained usable content: NO")
        return None

    if not image_path or not os.path.exists(image_path):
        _log("[VISION] Image attached: NO")
        _log("[VISION] Response status: FAILED (file not found)")
        _log("[VISION] Response contained usable content: NO")
        return None

    try:
        from google.genai import types
        import json
        from PIL import Image

        _log("[VISION] Image attached: YES")
        ext = os.path.splitext(image_path)[1].lower()

        # Handle PDF vs Image
        image_bytes = None
        mime_type = 'image/jpeg'
        dimensions = "unknown"

        if ext == '.pdf':
            import pymupdf
            doc = pymupdf.open(image_path)
            page = doc[0]
            pix = page.get_pixmap(dpi=300)
            image_bytes = pix.tobytes("png")
            mime_type = 'image/png'
            dimensions = f"{pix.width}x{pix.height}"
            _log("[VISION] PDF converted to high-res PNG for vision analysis")
        else:
            with open(image_path, 'rb') as f:
                image_bytes = f.read()
            mime_map = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.png': 'image/png', '.bmp': 'image/bmp',
                '.webp': 'image/webp',
            }
            mime_type = mime_map.get(ext, 'image/jpeg')
            try:
                pil_img = Image.open(image_path)
                dimensions = f"{pil_img.size[0]}x{pil_img.size[1]}"
            except Exception:
                pass

        _log(f"[VISION] Image format: {mime_type}")
        _log(f"[VISION] Image dimensions: {dimensions}")
        _log(f"[VISION] Image bytes/size: {len(image_bytes)} bytes")

        # Call Gemini Vision API
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                MEDICAL_DOCUMENT_PROMPT,
            ],
        )

        _log("[VISION] Response received: YES")
        response_text = response.text.strip() if response.text else ''
        _log(f"[VISION] Response length: {len(response_text)} chars")

        if not response_text:
            _log("[VISION] Response status: HTTP 200 (empty response)")
            _log("[VISION] Response contained usable content: NO")
            return None

        # Clean markdown wrappers if present
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

        doc_type = result.get('document_type', 'unknown')
        conf = result.get('overall_confidence', 0.0)
        _log(f"[VISION] Response status: HTTP 200 OK")
        _log(f"[VISION] Response contained usable content: YES (type={doc_type}, confidence={conf})")

        return result

    except json.JSONDecodeError as e:
        _log(f"[VISION] ERROR: Failed to parse Gemini JSON response: {e}")
        logger.exception("Gemini JSON parse error:")
        _log("[VISION] Response contained usable content: NO")
        return None
    except Exception as e:
        _log(f"[VISION] ERROR: Vision request exception: {e}")
        logger.exception("Vision request exception:")
        _log("[VISION] Response status: FAILED")
        _log("[VISION] Response contained usable content: NO")
        return None


def vision_result_to_prescription_data(vision_result):
    """
    Convert vision analysis result to standard MediMate format.
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

        med = medicines[0]
        confidence_score = med.get('confidence', overall_conf) * 100
        frequency = med.get('frequency', '')

        morning = med.get('morning', False)
        afternoon = med.get('afternoon', False)
        evening = med.get('evening', False)
        night = med.get('night', False)

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
                morning = True

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
