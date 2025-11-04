# SignaAI Makefile
.PHONY: help test-ocr gatekeeper ocr-service clean

help:
	@echo "Available commands:"
	@echo "  make ocr-service  - Start OCR service"
	@echo "  make test-ocr     - Run OCR test with heskem.pdf"
	@echo "  make gatekeeper   - Run gatekeeper test (must pass before push)"
	@echo "  make clean        - Clean test outputs"

# Start OCR service
ocr-service:
	@echo "Starting OCR service on port 8002..."
	cd backend/services/ocr_field_detection && python3 start_ocr.py

# Run OCR test
test-ocr:
	@echo "Running OCR test..."
	python3 create_ocr_results.py heskem.pdf

# Run gatekeeper test - MUST pass before pushing
gatekeeper:
	@echo "Running gatekeeper test..."
	@python3 gatekeeper_ocr_test.py

# Clean test outputs
clean:
	@echo "Cleaning test outputs..."
	rm -rf test_output/
	rm -rf ocr_test_results_*/
	rm -f ocr_test_results.json
	rm -f test_ocr_clean.py
	rm -f ocr_comprehensive_test.py
	@echo "Clean complete"