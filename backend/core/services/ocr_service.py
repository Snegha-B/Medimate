import pytesseract
from PIL import Image, ImageEnhance, ImageOps
import os

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
    Extract readable text from PDF streams using PyMuPDF (fitz) or fallback to
    rendering PDF pages to images and running pytesseract OCR.
    """
    import pymupdf
    try:
        doc = pymupdf.open(file_path)
        num_pages = min(len(doc), 10)  # Sensible limit of 10 pages
        
        # 1. Try to extract selectable text first
        selectable_texts = []
        for i in range(num_pages):
            page = doc[i]
            page_text = page.get_text()
            if page_text.strip():
                selectable_texts.append(page_text)
                
        combined_selectable = "\n".join(selectable_texts).strip()
        if len(combined_selectable) > 20:
            return {'text': combined_selectable, 'ocr_confidence': 95.0}
            
        # 2. Scanned PDF fallback: render each page to an image and run OCR
        page_texts = []
        confidences = []
        for i in range(num_pages):
            page = doc[i]
            # Render page to image (150 DPI)
            pix = page.get_pixmap(dpi=150)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            processed_img = preprocess_image(img)
            text = pytesseract.image_to_string(processed_img)
            conf = get_ocr_confidence(processed_img)
            
            page_texts.append(text.strip())
            confidences.append(conf)
            
        combined_text = "\n".join(page_texts).strip()
        avg_confidence = round(sum(confidences) / len(confidences), 1) if confidences else 0.0
        return {'text': combined_text, 'ocr_confidence': avg_confidence}
        
    except Exception as e:
        print(f"PDF Extraction Exception: {e}")
        
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
        return extract_pdf_text(file_path)

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

