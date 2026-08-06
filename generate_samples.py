from PIL import Image, ImageDraw, ImageFont
import os

def create_prescription_image(filename, text):
    # Create a white image
    img = Image.new('RGB', (600, 400), color='white')
    d = ImageDraw.Draw(img)
    
    # Try to load a font, otherwise use default
    try:
        font = ImageFont.truetype("arial.ttf", 24)
    except IOError:
        font = ImageFont.load_default()
        
    d.text((20, 20), text, fill="black", font=font)
    img.save(filename)

if __name__ == "__main__":
    os.makedirs('sample_prescriptions', exist_ok=True)
    
    # Sample 1
    text1 = """
    Dr. Smith's Clinic
    Patient: John Doe
    
    Rx:
    Amoxicillin 500mg
    Take 1-0-1 (twice daily)
    Duration: 5 days
    """
    create_prescription_image('sample_prescriptions/sample1.png', text1)
    
    # Sample 2
    text2 = """
    City Hospital
    
    Medication: Paracetamol 650mg
    Frequency: 1-1-1 (thrice daily)
    For 3 days
    """
    create_prescription_image('sample_prescriptions/sample2.png', text2)
    
    print("Sample prescriptions generated in 'sample_prescriptions' directory.")
