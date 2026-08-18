"""
Multi-Stage Memory-Safe OCR Service for MediMate.

Pipeline & Resource Optimization:
1. Detect input type (PDF / image)
2. Process PDF pages ONE AT A TIME with explicit memory cleanup
3. Render PDF at 180 DPI (memory-safe, high-clarity)
4. Limit image size (max 1600px, 1-channel grayscale)
5. Max 2 OCR attempts per page (release images after each attempt)
6. Explicit garbage collection (gc.collect())
"""

import pytesseract
from PIL import Image, ImageEnhance, ImageOps, ImageFilter, ExifTags
import os
import logging
import gc
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
# MEMORY-SAFE IMAGE PREPROCESSING
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
            return image.rotate(180, expand=True)
        elif orientation == 6:
            return image.rotate(270, expand=True)
        elif orientation == 8:
            return image.rotate(90, expand=True)
    except Exception:
        pass
    return image


def _limit_image_size(image, max_dim=1600):
    """
    Downscale image if larger than max_dim to keep memory usage low.
    Convert to 1-channel Grayscale ('L').
    Do NOT upscale already large images.
    """
    if image.mode != 'L':
        image = image.convert('L')
        
    w, h = image.size
    if w > max_dim or h > max_dim:
        if w >= h:
            new_w = max_dim
            new_h = int(h * (max_dim / w))
        else:
            new_h = max_dim
            new_w = int(w * (max_dim / h))
        image = image.resize((new_w, new_h), Image.Resampling.BILINEAR)
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
        res = Image.fromarray(rotated)
        del img_array, binary, coords, M, rotated
        return res
    except Exception as e:
        logger.debug(f"Deskew skipped: {e}")
        return image


def preprocess_standard(image):
    """
    Standard preprocessing: grayscale, resize-limit, deskew, autocontrast.
    """
    try:
        gray = _limit_image_size(image, max_dim=1600)
        gray = _deskew(gray)
        gray = ImageOps.autocontrast(gray)
        enhancer = ImageEnhance.Contrast(gray)
        res = enhancer.enhance(1.4)
        return res
    except Exception as e:
        logger.warning(f"Standard preprocessing error: {e}")
        return image


def preprocess_adaptive(image):
    """
    Adaptive thresholding preprocessing for difficult images.
    """
    try:
        gray = _limit_image_size(image, max_dim=1600)
        gray = _deskew(gray)
        try:
            import cv2
            img_array = np.array(gray)
            adaptive = cv2.adaptiveThreshold(
                img_array, 255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 25, 10
            )
            res = Image.fromarray(adaptive)
            del img_array, adaptive
            return res
        except ImportError:
            enhancer = ImageEnhance.Contrast(gray)
            return enhancer.enhance(1.8)
    except Exception as e:
        logger.warning(f"Adaptive preprocessing error: {e}")
        return image


# ============================================================
# OCR CONFIDENCE
# ============================================================

def get_ocr_confidence(image):
    """Compute average word-level OCR confidence."""
    try:
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        confidences = [int(c) for c in data.get('conf', []) if int(c) > -1]
        if confidences:
            return round(sum(confidences) / len(confidences), 1)
    except Exception as e:
        logger.debug(f"OCR confidence error: {e}")
    return 0.0


def _clean_ocr_text(text):
    """Remove excessive whitespace/junk from OCR output."""
    if not text:
        return ''
    import re
    text = re.sub(r'\n{3,}', '\n\n', text)
    lines = text.split('\n')
    cleaned = [l for l in lines if len(l.strip()) == 0 or any(c.isalnum() for c in l)]
    return '\n'.join(cleaned).strip()


# ============================================================
# MEMORY-SAFE OCR (MAX 2 ATTEMPTS)
# ============================================================

def multi_attempt_ocr(image):
    """
    Memory-safe OCR with max 2 attempts. Releases intermediate images immediately.
    """
    check_tesseract_availability()

    # Ensure memory-safe image size
    img_work = _limit_image_size(image, max_dim=1600)

    best_text = ''
    best_confidence = 0.0

    # --- Attempt 1: Standard Preprocessing ---
    _log("[RESOURCE] OCR attempt 1")
    try:
        proc1 = preprocess_standard(img_work)
        t1 = pytesseract.image_to_string(proc1, config='--psm 6 --oem 3')
        t1 = _clean_ocr_text(t1)
        conf1 = get_ocr_confidence(proc1)
        
        _log(f"[OCR TEST] OCR attempt 1 text length: {len(t1)}, confidence: {conf1}%")
        
        if len(t1.strip()) > 30 and conf1 > 40:
            proc1.close()
            del proc1
            gc.collect()
            return {
                'text': t1,
                'ocr_confidence': conf1,
                'attempt': 1,
                'handwriting_detected': False,
            }
        
        best_text = t1
        best_confidence = conf1
        proc1.close()
        del proc1
        gc.collect()
    except Exception as e:
        _log(f"[OCR ERROR] OCR attempt 1 failed: {e}")

    # --- Attempt 2: Adaptive Thresholding (Only if Attempt 1 insufficient) ---
    _log("[RESOURCE] OCR attempt 2")
    try:
        proc2 = preprocess_adaptive(img_work)
        t2 = pytesseract.image_to_string(proc2, config='--psm 3 --oem 3')
        t2 = _clean_ocr_text(t2)
        conf2 = get_ocr_confidence(proc2)
        
        _log(f"[OCR TEST] OCR attempt 2 text length: {len(t2)}, confidence: {conf2}%")
        
        if len(t2.strip()) > len(best_text.strip()):
            best_text = t2
            best_confidence = conf2

        proc2.close()
        del proc2
        gc.collect()
    except Exception as e:
        _log(f"[OCR ERROR] OCR attempt 2 failed: {e}")

    return {
        'text': best_text,
        'ocr_confidence': best_confidence,
        'attempt': 2,
        'handwriting_detected': False,
    }


# ============================================================
# MEMORY-SAFE PDF TEXT EXTRACTION (ONE PAGE AT A TIME)
# ============================================================

def extract_pdf_text(file_path):
    """
    Extract text from PDF:
    1. Try digital text first
    2. Process scanned PDF pages ONE AT A TIME at 180 DPI with immediate cleanup
    """
    import pymupdf
    try:
        doc = pymupdf.open(file_path)
        num_pages = min(len(doc), 5)  # Limit to max 5 pages for memory safety
        _log(f"[RESOURCE] PDF pages: {num_pages}")
        _log(f"[OCR] Input type: PDF ({num_pages} page(s))")

        # Stage 1: Try digital selectable text
        selectable_texts = []
        for i in range(num_pages):
            page_text = doc[i].get_text()
            if page_text.strip():
                selectable_texts.append(page_text)

        combined_selectable = "\n".join(selectable_texts).strip()
        _log(f"[OCR] Direct PDF text extraction length: {len(combined_selectable)}")

        if len(combined_selectable) > 20:
            _log("[OCR] Direct extraction sufficient: YES")
            doc.close()
            return {
                'text': combined_selectable,
                'ocr_confidence': 95.0,
                'handwriting_detected': False,
                'method': 'digital_text',
            }

        _log("[OCR] Direct extraction insufficient")
        _log("[OCR] Falling back to PDF page rendering (Memory-Safe Sequential Mode)")

        # Stage 2: Render & process ONE PAGE AT A TIME
        all_page_texts = []
        all_confidences = []

        for i in range(num_pages):
            _log(f"[RESOURCE] Processing page: {i + 1}")
            _log("[RESOURCE] Render DPI: 180")
            
            page = doc[i]
            pix = page.get_pixmap(dpi=180)
            
            # Convert pixmap directly to 1-channel Grayscale PIL Image
            if pix.colorspace and pix.colorspace.n == 1:
                img = Image.frombytes("L", [pix.width, pix.height], pix.samples)
            else:
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples).convert("L")
                
            _log(f"[RESOURCE] Rendered image dimensions: {img.size[0]} x {img.size[1]}")

            # Release pixmap immediately
            del pix

            # Perform OCR on page image
            res = multi_attempt_ocr(img)
            all_page_texts.append(res['text'])
            all_confidences.append(res['ocr_confidence'])

            # Clean up page image immediately
            img.close()
            del img
            _log("[RESOURCE] Image released")
            _log(f"[RESOURCE] Page processing complete: page {i + 1}")
            
            # Explicit garbage collection after each page
            gc.collect()

        doc.close()

        combined_text = "\n".join(all_page_texts).strip()
        avg_conf = round(sum(all_confidences) / len(all_confidences), 1) if all_confidences else 0.0

        _log(f"[OCR] Final OCR text length: {len(combined_text)}")
        _log(f"[OCR] Final OCR confidence: {avg_conf}%")

        return {
            'text': combined_text,
            'ocr_confidence': avg_conf,
            'handwriting_detected': False,
            'method': 'pdf_ocr',
        }

    except Exception as e:
        _log(f"[OCR ERROR] PDF extraction exception: {e}")
        logger.exception("PDF extraction error:")

    return {'text': '', 'ocr_confidence': 0.0, 'handwriting_detected': False, 'method': 'failed'}


# ============================================================
# MEMORY-SAFE IMAGE TEXT EXTRACTION
# ============================================================

def extract_text_from_file(file_path):
    """
    Extract text from image or PDF file path.
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
        raw_image = _limit_image_size(raw_image, max_dim=1600)
        
        _log(f"[RESOURCE] Rendered image dimensions: {raw_image.size[0]} x {raw_image.size[1]}")

        result = multi_attempt_ocr(raw_image)

        raw_image.close()
        del raw_image
        _log("[RESOURCE] Image released")
        gc.collect()

        _log(f"[OCR] Final OCR text length: {len(result['text'])}")
        _log(f"[OCR] Final OCR confidence: {result['ocr_confidence']}%")

        result['method'] = 'image_ocr'
        return result

    except Exception as e:
        _log(f"[OCR ERROR] Image OCR exception: {e}")
        logger.exception("Image OCR error:")
        return {'text': '', 'ocr_confidence': 0.0, 'handwriting_detected': False, 'method': 'failed'}


def extract_text_from_image(image_path):
    """Backward-compatible wrapper."""
    return extract_text_from_file(image_path)
