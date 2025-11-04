#!/usr/bin/env python3
"""
Create OCR Detection Results Folder
Input: PDF file
Output: Organized folder with OCR detection results and overlay visualizations
"""

import os
import sys
import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont
import httpx

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

class OCRResultsGenerator:
    """
    Creates comprehensive results folder with OCR detection outputs
    """
    
    def __init__(self, pdf_path: str):
        self.pdf_path = Path(pdf_path)
        self.service_url = "http://localhost:5113"
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Create main results directory
        pdf_name = self.pdf_path.stem
        self.results_dir = Path("test_output") / f"{pdf_name}_ocr_{self.timestamp}"
        
        # Create organized subdirectories
        self.dirs = {
            "input_images": self.results_dir / "01_original_images",
            "ocr_results": self.results_dir / "02_ocr_detection_results",
            "overlay_images": self.results_dir / "03_fields_overlay"
        }
        
        # Create all directories
        for dir_path in self.dirs.values():
            dir_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"📁 Created results directory: {self.results_dir}")
    
    async def generate(self) -> bool:
        """Generate complete OCR detection results"""
        try:
            logger.info("🚀 GENERATING OCR DETECTION RESULTS")
            logger.info("="*60)
            logger.info(f"📄 PDF: {self.pdf_path.name}")
            logger.info(f"📁 Output: {self.results_dir}")
            logger.info("="*60)
            
            # Check if service is running
            if not await self._check_service_health():
                logger.error("❌ OCR detection service not running!")
                logger.error("Start it with: cd backend && python3 -m uvicorn services.ocr_field_detection.api:app --port 8002")
                return False
            
            # Step 1: Extract images from PDF
            logger.info("📄 Step 1: Extracting original images...")
            input_images = self._extract_pdf_images()
            
            # Step 2: Get OCR field detection results
            logger.info("🔍 Step 2: Running OCR field detection...")
            detection_results = await self._get_detection_results()
            
            # Step 3: Save OCR detection results
            logger.info("💾 Step 3: Saving OCR detection results...")
            self._save_ocr_results(detection_results)
            
            # Step 4: Create overlay visualizations
            logger.info("🎨 Step 4: Creating field overlay visualizations...")
            self._create_overlay_images(input_images, detection_results)
            
            # Step 5: Create documentation
            self._create_documentation(detection_results)
            
            logger.info("="*60)
            logger.info("✅ OCR DETECTION COMPLETE!")
            logger.info(f"📁 Results saved in: {self.results_dir}")
            logger.info("📋 Check README.txt for details")
            logger.info("="*60)
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to generate results: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def _check_service_health(self) -> bool:
        """Check if OCR detection service is running"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.service_url}/health")
                return response.status_code == 200
        except:
            return False
    
    def _extract_pdf_images(self) -> list:
        """Extract images from PDF pages"""
        images = []
        
        try:
            # Try Poppler first for better quality
            import pdf2image
            logger.info("  ℹ️ Using Poppler for high-quality rendering")
            
            pdf_images = pdf2image.convert_from_path(
                self.pdf_path,
                dpi=200,
                fmt='png'
            )
            
            for i, img in enumerate(pdf_images, 1):
                img_path = self.dirs["input_images"] / f"page_{i:02d}_original.png"
                img.save(img_path, 'PNG')
                images.append(img)
                logger.info(f"  ✅ Page {i}: {img.width}x{img.height} → {img_path.name}")
            
        except ImportError:
            # Fallback to PyMuPDF
            logger.info("  ℹ️ Using PyMuPDF for rendering")
            pdf_doc = fitz.open(self.pdf_path)
            
            for i, page in enumerate(pdf_doc, 1):
                mat = fitz.Matrix(200/72, 200/72)  # 200 DPI
                pix = page.get_pixmap(matrix=mat)
                img_data = pix.tobytes("png")
                
                img = Image.open(io.BytesIO(img_data))
                img_path = self.dirs["input_images"] / f"page_{i:02d}_original.png"
                img.save(img_path)
                images.append(img)
                logger.info(f"  ✅ Page {i}: {img.width}x{img.height} → {img_path.name}")
            
            pdf_doc.close()
        
        return images
    
    async def _get_detection_results(self) -> dict:
        """Get field detection results from OCR service"""
        async with httpx.AsyncClient(timeout=120.0) as client:
            with open(self.pdf_path, 'rb') as f:
                files = {"file": (self.pdf_path.name, f, "application/pdf")}
                response = await client.post(
                    f"{self.service_url}/detect-fields",
                    files=files
                )
            
            if response.status_code == 200:
                results = response.json()
                logger.info(f"  ✅ Detection complete: {results.get('total_fields', 0)} fields found")
                return results
            else:
                raise Exception(f"Detection failed: {response.text}")
    
    def _save_ocr_results(self, detection_results):
        """Save OCR detection results"""
        # Save complete results
        results_path = self.dirs["ocr_results"] / "complete_results.json"
        with open(results_path, 'w', encoding='utf-8') as f:
            json.dump(detection_results, f, indent=2, ensure_ascii=False)
        logger.info(f"  💾 Complete results: {results_path.name}")
        
        # Save summary
        if "analysis_results" in detection_results:
            summary = {
                "total_pages": detection_results.get("total_pages", 0),
                "total_fields": detection_results.get("total_fields", 0),
                "method": detection_results.get("method", "OCR"),
                "processing_time_ms": detection_results.get("processing_time_ms", 0),
                "fields_per_page": {}
            }
            
            for page_data in detection_results["analysis_results"]:
                page_num = page_data["page"]
                summary["fields_per_page"][f"page_{page_num}"] = len(page_data.get("fields", []))
            
            summary_path = self.dirs["ocr_results"] / "summary.json"
            with open(summary_path, 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2)
            logger.info(f"  💾 Summary: {summary_path.name}")
    
    def _create_overlay_images(self, images, detection_results):
        """Create overlay images showing detected fields"""
        if "analysis_results" not in detection_results:
            logger.warning("  ⚠️ No analysis results to visualize")
            return
        
        for page_data in detection_results["analysis_results"]:
            page_num = page_data["page"]
            fields = page_data.get("fields", [])
            
            if page_num <= len(images):
                img = images[page_num - 1].copy()
                draw = ImageDraw.Draw(img, 'RGBA')
                
                # Get source and target dimensions
                source_res = page_data.get("source_image_resolution", {})
                source_width = source_res.get("width", 1275)
                source_height = source_res.get("height", 1650)
                
                # Calculate scaling factors
                scale_x = img.width / source_width
                scale_y = img.height / source_height
                
                logger.info(f"  🎨 Page {page_num}: Drawing {len(fields)} field overlays")
                logger.info(f"    📏 Scaling: {source_width}x{source_height} → {img.width}x{img.height} (scale: {scale_x:.2f}x)")
                
                # Draw each field
                for i, field in enumerate(fields, 1):
                    bbox = field.get("bounding_box", {})
                    x = int(bbox.get("x", 0) * scale_x)
                    y = int(bbox.get("y", 0) * scale_y)
                    width = int(bbox.get("width", 0) * scale_x)
                    height = int(bbox.get("height", 0) * scale_y)
                    
                    # Draw semi-transparent blue rectangle
                    draw.rectangle(
                        [(x, y), (x + width, y + height)],
                        outline=(0, 100, 255, 255),
                        fill=(0, 100, 255, 30),
                        width=2
                    )
                    
                    # Add field number label
                    try:
                        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
                    except:
                        font = ImageFont.load_default()
                    
                    label = f"{i}"
                    label_bbox = draw.textbbox((0, 0), label, font=font)
                    label_width = label_bbox[2] - label_bbox[0]
                    label_height = label_bbox[3] - label_bbox[1]
                    
                    # Orange label background
                    label_x = x + width - label_width - 4
                    label_y = y - label_height - 4
                    draw.rectangle(
                        [(label_x - 2, label_y - 2), 
                         (label_x + label_width + 2, label_y + label_height + 2)],
                        fill=(255, 140, 0, 255)
                    )
                    draw.text((label_x, label_y), label, fill=(255, 255, 255, 255), font=font)
                    
                    # Add field type below if available
                    field_type = field.get("type", "text_input")
                    confidence = field.get("confidence", 0) * 100
                    info_text = f"{field_type}\n{confidence:.0f}%"
                    draw.text((x, y + height + 2), info_text, 
                             fill=(255, 140, 0, 255), font=font)
                
                # Save overlay image
                overlay_path = self.dirs["overlay_images"] / f"page_{page_num:02d}_overlay.png"
                img.save(overlay_path)
                logger.info(f"    ✅ Overlay saved: {overlay_path.name}")
    
    def _create_documentation(self, detection_results):
        """Create README documentation"""
        readme_content = f"""OCR FIELD DETECTION RESULTS
===========================
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
PDF: {self.pdf_path.name}

SUMMARY
-------
Total Pages: {detection_results.get('total_pages', 0)}
Total Fields Detected: {detection_results.get('total_fields', 0)}
Detection Method: {detection_results.get('method', 'Pure OCR (OpenCV + Tesseract)')}
Processing Time: {detection_results.get('processing_time_ms', 0)}ms

DIRECTORY STRUCTURE
------------------
### 01_original_images/
Original pages extracted from PDF at 200 DPI
  - page_XX_original.png: High-quality page renders

### 02_ocr_detection_results/
OCR field detection data
  - complete_results.json: Full detection response
  - summary.json: Simplified summary of results

### 03_fields_overlay/
Visualizations showing detected fields
  - page_XX_overlay.png: Original page with field overlays
  - Blue boxes: Detected fillable fields
  - Orange labels: Field numbers and confidence scores

FIELD DETECTION DETAILS
----------------------
"""
        
        if "analysis_results" in detection_results:
            for page_data in detection_results["analysis_results"]:
                page_num = page_data["page"]
                fields = page_data.get("fields", [])
                readme_content += f"\nPage {page_num}: {len(fields)} fields\n"
                for i, field in enumerate(fields, 1):
                    bbox = field.get("bounding_box", {})
                    readme_content += f"  Field {i}: {field.get('type', 'unknown')} at ({bbox.get('x', 0)}, {bbox.get('y', 0)})\n"
        
        readme_content += f"""
NOTES
-----
- OCR detection uses computer vision to identify form fields
- Detects horizontal lines, boxes, and checkboxes
- No AI/ML models used - pure image processing
- Optimized for speed and accuracy

USAGE
-----
1. View original images in 01_original_images/
2. Check detection results in 02_ocr_detection_results/
3. Review field visualizations in 03_fields_overlay/

Detection powered by:
- OpenCV for computer vision
- Tesseract for OCR (if needed)
- No external AI services required
"""
        
        readme_path = self.results_dir / "README.txt"
        with open(readme_path, 'w', encoding='utf-8') as f:
            f.write(readme_content)
        logger.info(f"  ✅ Documentation created: README.txt")

async def main():
    """Main entry point"""
    print("📁 OCR DETECTION RESULTS GENERATOR")
    print("="*60)
    print("📥 Input: PDF document")
    print("📤 Output: OCR detection results with visualizations")
    print("="*60)
    print()
    
    if len(sys.argv) != 2:
        print("Usage: python3 create_ocr_results.py <pdf_file>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    if not Path(pdf_path).exists():
        print(f"❌ PDF file not found: {pdf_path}")
        sys.exit(1)
    
    generator = OCRResultsGenerator(pdf_path)
    success = await generator.generate()
    
    if success:
        print()
        print("🎉 SUCCESS! OCR detection results generated.")
        print(f"📁 Open folder: {generator.results_dir}")
        print("📋 Start with README.txt for details")
    else:
        print()
        print("💥 Failed to generate results!")

if __name__ == "__main__":
    asyncio.run(main())