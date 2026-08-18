"""
Multi-Stage OCR Service for MediMate.

Pipeline:
1. Detect input type (PDF / image)
2. For PDFs: extract digital text first, then render to 300 DPI images if needed
3. Advanced image preprocessing (orientation, deskew, adaptive threshold, noise reduction)
4. Multi-attempt OCR with raw vs preprocessed comparison
5. Returns structured result
"""

import pytesseract
from PIL import Image, ImageEnhance, ImageOps, ImageFilter, ExifTags
import os
import logging
import numpy as np

logger = logging.getLogger('medimate.ocr')

def _log(msg):
    logger.info(msg)
    print(f"[PIPELINE LOG] {msg}")


def check_tesseract_availability():
    """Verify that Tesseract executable is installed and reachable by pytesseract."""
    try:
        ver = pytesseract.get_tesseract_version()
        _log(f"[OCR] Tesseract executable found. Version: {ver}")
        return True
    except Exception as e:
        _log(f"[OCR ERROR] Tesseract executable not found or failed: {e}")
        logger.exception("Tesseract executable check failed:")
        return False


# ============================================================
# IMAGE PREPROCESSING
# ============================================================

def _fix_orientation(image):
    """Fix image orientation using EXIF data (camera photos)."""
    try:
        exif = image._getexif()
        if exif is None:
            return image
        orientation_key = None
        for key, val in ExifTags.TAGS.items():
            if val == 'Orientation':
                orientation_key = key
                break
        if orientation_key is None or orientation_key not in exif:
            return image
        orientation = exif[orientation_key]
        if orientation == 3:
            image = image.rotate(180, expand=True)
        elif orientation == 6:
            image = image.rotate(270, expand=True)
        elif orientation == 8:
            image = image.rotate(90, expand=True)
    except Exception:
        pass
    return image


def _upscale_if_small(image, target_width=2000):
    """Upscale image if too small for reliable OCR."""
    w, h = image.size
    if w < target_width:
        scale = target_width / w
        image = image.resize(
            (int(w * scale), int(h * scale)),
            Image.Resampling.LANCZOS
        )
    return image


def _deskew(image):
    """Deskew a grayscale PIL image using OpenCV minAreaRect."""
    try:
        import cv2
        img_array = np.array(image)
        if len(img_array.shape) == 2:
            binary = cv2.threshold(img_array, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        else:
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

        coords = np.column_stack(np.where(binary > 0))
        if len(coords) < 50:
            return image

        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        if abs(angle) > 15 or abs(angle) < 0.3:
            return image

        (h, w) = img_array.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            img_array, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE
        )
        return Image.fromarray(rotated)
    except Exception as e:
        logger.debug(f"Deskew skipped: {e}")
        return image


def preprocess_standard(image):
    """
    Standard preprocessing: grayscale, upscale, autocontrast,
    adaptive threshold, light noise reduction.
    """
    try:
        image = _upscale_if_small(image)
        gray = image.convert('L')
        gray = _deskew(gray)
        gray = ImageOps.autocontrast(gray)

        try:
            import cv2
            img_array = np.array(gray)
            adaptive = cv2.adaptiveThreshold(
                img_array, 255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 31, 12
            )
            denoised = cv2.medianBlur(adaptive, 3)
            return Image.fromarray(denoised)
        except ImportError:
            enhancer = ImageEnhance.Contrast(gray)
            return enhancer.enhance(1.5)
    except Exception as e:
        logger.warning(f"Standard preprocessing error: {e}")
        return image


def preprocess_aggressive(image):
    """
    Aggressive preprocessing for difficult documents.
    """
    try:
        image = _upscale_if_small(image, target_width=2500)
        gray = image.convert('L')
        gray = _deskew(gray)

        gray = gray.filter(ImageFilter.SHARPEN)
        gray = ImageOps.autocontrast(gray, cutoff=2)

        try:
            import cv2
            img_array = np.array(gray)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(img_array)
            adaptive = cv2.adaptiveThreshold(
                enhanced, 255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 21, 8
            )
            denoised = cv2.medianBlur(adaptive, 3)
            return Image.fromarray(denoised)
        except ImportError:
            enhancer = ImageEnhance.Contrast(gray)
            enhanced = enhancer.enhance(2.0)
            enhanced = enhanced.filter(ImageFilter.SHARPEN)
            return enhanced
    except Exception as e:
        logger.warning(f"Aggressive preprocessing error: {e}")
        return image


def preprocess_minimal(image):
    """
    Minimal preprocessing: just grayscale, upscale, autocontrast.
    """
    try:
        image = _upscale_if_small(image)
        gray = image.convert('L')
        gray = ImageOps.autocontrast(gray)
        enhancer = ImageEnhance.Contrast(gray)
        return enhancer.enhance(1.3)
    except Exception as e:
        logger.warning(f"Minimal preprocessing error: {e}")
        return image


# ============================================================
# OCR CONFIDENCE
# ============================================================

def get_ocr_confidence(image):
    """
    Compute average word-level OCR confidence using pytesseract.image_to_data().
    Returns a float 0-100.
    """
    try:
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        confidences = [int(c) for c in data.get('conf', []) if int(c) > -1]
        if confidences:
            return round(sum(confidences) / len(confidences), 1)
    except Exception as e:
        logger.debug(f"OCR confidence calculation error: {e}")
    return 0.0


# ============================================================
# MULTI-ATTEMPT OCR
# ============================================================

def _clean_ocr_text(text):
    """Remove excessive whitespace/junk from OCR output."""
    if not text:
        return ''
    import re
    text = re.sub(r'\n{3,}', '\n\n', text)
    lines = text.split('\n')
    cleaned = [l for l in lines if len(l.strip()) == 0 or any(c.isalnum() for c in l)]
    return '\n'.join(cleaned).strip()


def multi_attempt_ocr(image):
    """
    Run OCR with multiple preprocessing + config combinations.
    Includes raw image test vs preprocessed image test logging.
    Returns dict: { 'text': str, 'ocr_confidence': float, 'attempt': int, 'handwriting_detected': bool }
    """
    check_tesseract_availability()

    best_text = ''
    best_confidence = 0.0
    best_attempt = 0

    # --- Test 1: Raw Unprocessed High-Res Image ---
    try:
        raw_text = pytesseract.image_to_string(image, config='--psm 3 --oem 3')
        raw_text = _clean_ocr_text(raw_text)
        raw_conf = get_ocr_confidence(image)
        _log(f"[OCR TEST] Raw image OCR text length: {len(raw_text)}")
        _log(f"[OCR TEST] Raw image OCR confidence: {raw_conf}%")
        
        if len(raw_text) > 0:
            best_text = raw_text
            best_confidence = raw_conf
            best_attempt = 0
    except Exception as e:
        _log(f"[OCR ERROR] Raw image OCR attempt failed: {e}")
        logger.exception("Raw image OCR error:")

    # --- Multi-attempt with Preprocessing ---
    attempts = [
        {
            'name': 'Standard (PSM 6)',
            'preprocess': preprocess_standard,
            'config': '--psm 6 --oem 3',
        },
        {
            'name': 'Aggressive (PSM 3)',
            'preprocess': preprocess_aggressive,
            'config': '--psm 3 --oem 3',
        },
        {
            'name': 'Minimal (PSM 1)',
            'preprocess': preprocess_minimal,
            'config': '--psm 1 --oem 3',
        },
    ]

    for i, attempt in enumerate(attempts, 1):
        try:
            processed = attempt['preprocess'](image.copy())
            text = pytesseract.image_to_string(processed, config=attempt['config'])
            text = _clean_ocr_text(text)
            conf = get_ocr_confidence(processed)

            _log(f"[OCR TEST] Preprocessed image OCR attempt {i} ({attempt['name']}) text length: {len(text)}")
            _log(f"[OCR TEST] Preprocessed image OCR attempt {i} confidence: {conf}%")

            text_quality = len(text.strip()) * (conf / 100.0 if conf > 0 else 0.5)
            best_quality = len(best_text.strip()) * (best_confidence / 100.0 if best_confidence > 0 else 0.5)

            if text_quality > best_quality:
                best_text = text
                best_confidence = conf
                best_attempt = i

            if len(text.strip()) > 50 and conf > 60:
                _log(f"[OCR] Attempt {i} sufficient — skipping remaining attempts")
                break

        except Exception as e:
            _log(f"[OCR ERROR] Preprocessed attempt {i} ({attempt['name']}) failed: {e}")
            logger.exception(f"OCR attempt {i} failed:")
            continue

    return {
        'text': best_text,
        'ocr_confidence': best_confidence,
        'attempt': best_attempt,
        'handwriting_detected': False,  # Do not force-flag low confidence as handwriting
    }


# ============================================================
# PDF TEXT EXTRACTION
# ============================================================

def extract_pdf_text(file_path):
    """
    Extract text from PDF:
    1. Try digital/selectable text first (PyMuPDF)
    2. If insufficient, render pages at 300 DPI and run multi-attempt OCR
    """
    import pymupdf
    try:
        doc = pymupdf.open(file_path)
        num_pages = min(len(doc), 10)
        _log(f"[OCR] Input type: PDF ({num_pages} page(s))")

        selectable_texts = []
        for i in range(num_pages):
            page = doc[i]
            page_text = page.get_text()
            if page_text.strip():
                selectable_texts.append(page_text)

        combined_selectable = "\n".join(selectable_texts).strip()
        _log(f"[OCR] Direct PDF text extraction length: {len(combined_selectable)}")

        if len(combined_selectable) > 20:
            _log("[OCR] Direct extraction sufficient: YES")
            return {
                'text': combined_selectable,
                'ocr_confidence': 95.0,
                'handwriting_detected': False,
                'method': 'digital_text',
            }

        _log("[OCR] Direct extraction insufficient")
        _log("[OCR] Falling back to PDF page rendering")

        all_page_texts = []
        all_confidences = []

        for i in range(num_pages):
            page = doc[i]
            _log(f"[OCR] Rendering page {i + 1} at high resolution (300 DPI)")

            pix = page.get_pixmap(dpi=300)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            _log(f"[OCR] Page {i + 1} image created successfully (Dimensions: {img.size[0]}x{img.size[1]})")

            _log("[OCR] Image preprocessing completed")
            result = multi_attempt_ocr(img)
            all_page_texts.append(result['text'])
            all_confidences.append(result['ocr_confidence'])

        combined_text = "\n".join(all_page_texts).strip()
        avg_confidence = round(sum(all_confidences) / len(all_confidences), 1) if all_confidences else 0.0

        _log(f"[OCR] Final OCR text length: {len(combined_text)}")
        _log(f"[OCR] Final OCR confidence: {avg_confidence}%")

        return {
            'text': combined_text,
            'ocr_confidence': avg_confidence,
            'handwriting_detected': False,
            'method': 'pdf_ocr',
        }

    except Exception as e:
        _log(f"[OCR ERROR] PDF extraction exception: {e}")
        logger.exception("PDF extraction error:")

    return {'text': '', 'ocr_confidence': 0.0, 'handwriting_detected': False, 'method': 'failed'}


# ============================================================
# IMAGE TEXT EXTRACTION
# ============================================================

def extract_text_from_file(file_path):
    """
    Extract text from image or PDF file.
    Returns dict: { 'text': str, 'ocr_confidence': float, 'handwriting_detected': bool, 'method': str }
    """
    if not file_path or not os.path.exists(file_path):
        _log(f"[OCR WARNING] File not found: {file_path}")
        return {'text': '', 'ocr_confidence': 0.0, 'handwriting_detected': False, 'method': 'missing'}

    ext = os.path.splitext(file_path)[1].lower()

    if ext == '.pdf':
        return extract_pdf_text(file_path)

    _log(f"[OCR] Input type: Image ({ext})")

    try:
        raw_image = Image.open(file_path)

        raw_image = _fix_orientation(raw_image)
        _log(f"[OCR] Image preprocessing completed (Dimensions: {raw_image.size[0]}x{raw_image.size[1]})")

        result = multi_attempt_ocr(raw_image)

        _log(f"[OCR] Final OCR text length: {len(result['text'])}")
        _log(f"[OCR] Final OCR confidence: {result['ocr_confidence']}%")

        result['method'] = 'image_ocr'
        return result

    except Exception as e:
        _log(f"[OCR ERROR] Image OCR exception: {e}")
        logger.exception("Image OCR error:")
        return {'text': '', 'ocr_confidence': 0.0, 'handwriting_detected': False, 'method': 'failed'}


def extract_text_from_image(image_path):
    """Backward-compatible wrapper. Returns the full dict now."""
    return extract_text_from_file(image_path)
