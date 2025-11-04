"""
PDF Extraction Service - Convert PDF pages to PNG images
"""
import base64
import io
import logging
from typing import List, Dict, Any
from PIL import Image
import fitz  # PyMuPDF
import numpy as np

logger = logging.getLogger(__name__)

class PDFExtractionService:
    """Extract all pages from PDF as high-resolution PNG images"""
    
    def __init__(self, dpi: int = 300):
        self.dpi = dpi
        self.matrix = fitz.Matrix(dpi/72.0, dpi/72.0)  # 72 is default PDF DPI
        
    def extract_all_pages(self, pdf_data: bytes) -> List[Dict[str, Any]]:
        """
        Extract all pages from PDF as PNG images
        
        Args:
            pdf_data: PDF file as bytes
            
        Returns:
            List of page data with base64 encoded PNG images
        """
        try:
            # Open PDF from bytes
            pdf_document = fitz.open(stream=pdf_data, filetype="pdf")
            pages = []
            
            logger.info(f"📄 Extracting {pdf_document.page_count} pages from PDF")
            
            for page_num in range(pdf_document.page_count):
                # Get page
                page = pdf_document[page_num]
                
                # Render page to pixmap (raster image)
                pixmap = page.get_pixmap(matrix=self.matrix, alpha=False)
                
                # Convert to PIL Image
                img_data = pixmap.tobytes("png")
                img = Image.open(io.BytesIO(img_data))
                
                # Convert to base64
                buffer = io.BytesIO()
                img.save(buffer, format="PNG")
                img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                
                # Get page dimensions
                width, height = img.size
                
                pages.append({
                    "page_num": page_num + 1,
                    "width": width,
                    "height": height,
                    "dpi": self.dpi,
                    "format": "png",
                    "image_base64": f"data:image/png;base64,{img_base64}"
                })
                
                logger.info(f"✅ Extracted page {page_num + 1}: {width}x{height}px")
            
            pdf_document.close()
            return pages
            
        except Exception as e:
            logger.error(f"❌ PDF extraction failed: {str(e)}")
            raise
    
    def extract_page_as_numpy(self, pdf_data: bytes, page_num: int = 0) -> np.ndarray:
        """
        Extract a specific page as numpy array for OpenCV processing
        
        Args:
            pdf_data: PDF file as bytes
            page_num: Page number (0-indexed)
            
        Returns:
            Numpy array of the page image
        """
        try:
            pdf_document = fitz.open(stream=pdf_data, filetype="pdf")
            
            if page_num >= pdf_document.page_count:
                raise ValueError(f"Page {page_num} does not exist in PDF")
            
            page = pdf_document[page_num]
            pixmap = page.get_pixmap(matrix=self.matrix, alpha=False)
            
            # Convert to numpy array
            img_data = pixmap.samples
            img_array = np.frombuffer(img_data, dtype=np.uint8)
            img_array = img_array.reshape(pixmap.height, pixmap.width, pixmap.n)
            
            # Convert RGB to BGR for OpenCV
            if pixmap.n == 3:
                img_array = img_array[:, :, ::-1]
            
            pdf_document.close()
            return img_array
            
        except Exception as e:
            logger.error(f"❌ Failed to extract page as numpy: {str(e)}")
            raise
    
    def get_pdf_info(self, pdf_data: bytes) -> Dict[str, Any]:
        """Get PDF metadata and information"""
        try:
            pdf_document = fitz.open(stream=pdf_data, filetype="pdf")
            
            info = {
                "page_count": pdf_document.page_count,
                "metadata": pdf_document.metadata,
                "is_encrypted": pdf_document.is_encrypted,
                "pages": []
            }
            
            for page_num in range(pdf_document.page_count):
                page = pdf_document[page_num]
                rect = page.rect
                info["pages"].append({
                    "page_num": page_num + 1,
                    "width": rect.width,
                    "height": rect.height,
                    "rotation": page.rotation
                })
            
            pdf_document.close()
            return info
            
        except Exception as e:
            logger.error(f"❌ Failed to get PDF info: {str(e)}")
            raise


# Test function
def test_pdf_extraction():
    """Test PDF extraction with a sample PDF"""
    import os
    
    # Create a simple test PDF if it doesn't exist
    test_pdf_path = "test_extraction.pdf"
    
    if not os.path.exists(test_pdf_path):
        # Create a simple 2-page PDF for testing
        doc = fitz.open()
        
        # Page 1
        page1 = doc.new_page(width=612, height=792)  # Letter size
        text1 = "Test Document - Page 1\n\nSignature: _________________\n\nDate: _________________"
        page1.insert_text((50, 50), text1, fontsize=12)
        
        # Page 2
        page2 = doc.new_page(width=612, height=792)
        text2 = "Test Document - Page 2\n\nחתימה: _________________\n\nتوقيع: _________________"
        page2.insert_text((50, 50), text2, fontsize=12)
        
        doc.save(test_pdf_path)
        doc.close()
        print(f"✅ Created test PDF: {test_pdf_path}")
    
    # Test extraction
    with open(test_pdf_path, "rb") as f:
        pdf_data = f.read()
    
    service = PDFExtractionService(dpi=150)  # Lower DPI for testing
    
    # Test 1: Get PDF info
    print("\n📊 PDF Info:")
    info = service.get_pdf_info(pdf_data)
    print(f"  Pages: {info['page_count']}")
    for page in info['pages']:
        print(f"  Page {page['page_num']}: {page['width']}x{page['height']}")
    
    # Test 2: Extract all pages
    print("\n📄 Extracting all pages...")
    pages = service.extract_all_pages(pdf_data)
    print(f"✅ Extracted {len(pages)} pages")
    
    for page in pages:
        print(f"  Page {page['page_num']}: {page['width']}x{page['height']} @ {page['dpi']} DPI")
        print(f"  Base64 length: {len(page['image_base64'])} chars")
    
    # Test 3: Extract as numpy for OpenCV
    print("\n🔬 Extracting page 1 as numpy array...")
    img_array = service.extract_page_as_numpy(pdf_data, 0)
    print(f"✅ Numpy array shape: {img_array.shape}")
    print(f"  Dtype: {img_array.dtype}")
    
    return pages


if __name__ == "__main__":
    test_pdf_extraction()