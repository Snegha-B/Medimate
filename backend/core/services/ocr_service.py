import pytesseract
from PIL import Image, ImageEnhance, ImageOps
import os
import re
import zlib

def preprocess_image(image):
    """
    Preprocess image to boost pytesseract OCR accuracy.
    Converts to grayscale, resizes if small, and enhances contrast.
    """
    try:
        # Convert to grayscale
        gray = image.convert('L')
        
        # Resize if small (< 1000px width)
        w, h = gray.size
        if w < 1000:
            scale = 1000 / w
            gray = gray.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

        # Autocontrast & Enhance Contrast
        gray = ImageOps.autocontrast(gray)
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(1.5)
        return enhanced
    except Exception as e:
        print(f"Image Preprocessing Error: {e}")
        return image

def get_ocr_confidence(file_path_or_image):
    """
    Compute average word-level OCR confidence using pytesseract.image_to_data().
    Returns a float 0-100 representing overall OCR quality.
    """
    try:
        if isinstance(file_path_or_image, str):
            image = Image.open(file_path_or_image)
        else:
            image = file_path_or_image
            
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        confidences = [int(c) for c in data.get('conf', []) if int(c) > -1]
        if confidences:
            return round(sum(confidences) / len(confidences), 1)
    except Exception as e:
        print(f"OCR Confidence Error: {e}")
    return 0.0

def extract_pdf_text(file_path):
    """
    Extract readable text from PDF streams using standard library zlib decompression
    and regex stream text parsing.
    """
    text_chunks = []
    try:
        with open(file_path, 'rb') as f:
            content = f.read()

        # Find FlateDecode streams
        stream_matches = re.findall(b'stream\r?\n(.*?)\r?\nendstream', content, re.DOTALL)
        for raw_stream in stream_matches:
            try:
                decompressed = zlib.decompress(raw_stream)
                # Find PDF text objects (between BT and ET, or (text) Tj)
                tj_matches = re.findall(r'\((.*?)\)\s*Tj', decompressed.decode('latin-1', errors='ignore'))
                if tj_matches:
                    text_chunks.extend(tj_matches)
                else:
                    # Generic string extraction from stream
                    str_matches = re.findall(r'\(([^()]{3,})\)', decompressed.decode('latin-1', errors='ignore'))
                    text_chunks.extend(str_matches)
            except Exception:
                continue

        if not text_chunks:
            # Fallback to direct raw text string matching
            raw_str = content.decode('latin-1', errors='ignore')
            text_chunks = re.findall(r'\(([^()]{4,})\)', raw_str)

        clean_text = ' '.join(text_chunks)
        # Clean control characters
        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
        if len(clean_text) > 10:
            return {'text': clean_text, 'ocr_confidence': 80.0}
    except Exception as e:
        print(f"PDF Parsing Exception: {e}")

    return {'text': '', 'ocr_confidence': 0.0}

def extract_text_from_file(file_path):
    """
    Extracts text from image or PDF file path using OCR / file parsing.
    Returns a dict: { 'text': str, 'ocr_confidence': float }
    """
    if not file_path or not os.path.exists(file_path):
        return {'text': '', 'ocr_confidence': 0.0}

    ext = os.path.splitext(file_path)[1].lower()

    if ext == '.pdf':
        pdf_res = extract_pdf_text(file_path)
        if pdf_res['text']:
            return pdf_res

    try:
        raw_image = Image.open(file_path)
        processed_img = preprocess_image(raw_image)
        text = pytesseract.image_to_string(processed_img)
        ocr_conf = get_ocr_confidence(processed_img)
        return {'text': text.strip(), 'ocr_confidence': ocr_conf}
    except Exception as e:
        print(f"OCR Exception: {e}")
        return {'text': '', 'ocr_confidence': 0.0}

def extract_text_from_image(image_path):
    """Backward-compatible wrapper. Returns the full dict now."""
    return extract_text_from_file(image_path)

