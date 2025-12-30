# OCR Service for Lyvo
# Aadhar Card Text Extraction and Validation using OCR.space API

## Overview
This service provides OCR (Optical Character Recognition) functionality specifically designed for Aadhar card processing. It uses OCR.space API to extract text from images and validates the extracted data against Aadhar card patterns.

## Features
- **Text Extraction**: Extract text from Aadhar card images using OCR.space API
- **Structured Data Extraction**: Extract specific fields like name, Aadhar number, DOB, gender, etc.
- **Aadhar Card Validation**: Validate if the uploaded image is actually an Aadhar card
- **Pattern Recognition**: Use regex patterns to identify and validate Aadhar card fields
- **Confidence Scoring**: Provide confidence scores for extracted data
- **Cloud-based OCR**: No local dependencies, uses reliable OCR.space service

## Installation

### Prerequisites
1. **Python 3.8+**
2. **OCR.space API Key**: Get your free API key from [OCR.space](https://ocr.space/)

### Setup
1. **Clone and navigate to OCR-services directory**
2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Configure environment**:
   ```bash
   cp env.example .env
   # Edit .env with your OCR.space API key
   ```
4. **Run the service**:
   ```bash
   python app.py
   ```

## API Endpoints

### 1. Health Check
```
GET /health
```
Returns service health status.

### 2. Extract Text from Any Image
```
POST /ocr/extract-text
Content-Type: multipart/form-data

Form Data:
- image: Image file (PNG, JPG, JPEG, BMP, TIFF)
```

**Response**:
```json
{
  "success": true,
  "text": "Extracted text content",
  "confidence": 85.5,
  "word_count": 150
}
```

### 3. Process Aadhar Card (File Upload)
```
POST /ocr/aadhar
Content-Type: multipart/form-data

Form Data:
- image: Aadhar card image file
```

**Response**:
```json
{
  "success": true,
  "extracted_data": {
    "aadhar_number": "123456789012",
    "name": "John Doe",
    "date_of_birth": "01/01/1990",
    "gender": "Male",
    "mobile": "9876543210",
    "address": "123 Main Street, City, State",
    "father_name": "Robert Doe",
    "mother_name": "Jane Doe"
  },
  "validation": {
    "is_aadhar_card": true,
    "has_aadhar_keywords": true,
    "has_aadhar_number": true,
    "has_name": true,
    "has_dob": true,
    "has_gender": true,
    "confidence_score": 85.5
  },
  "raw_text": "Full extracted text...",
  "confidence": 85.5,
  "ocr_details": {
    "text_confidence": 80.0,
    "field_extraction_confidence": 90.0,
    "validation_confidence": 85.5
  }
}
```

### 4. Process Aadhar Card (Base64)
```
POST /ocr/aadhar/base64
Content-Type: application/json

Body:
{
  "image": "base64_encoded_image_data"
}
```

**Response**: Same as above endpoint.

### 5. Validate Aadhar Card
```
POST /ocr/validate-aadhar
Content-Type: multipart/form-data

Form Data:
- image: Image file to validate
```

**Response**:
```json
{
  "success": true,
  "is_aadhar_card": true,
  "confidence": 85.5,
  "validation_details": {
    "is_aadhar_card": true,
    "has_aadhar_keywords": true,
    "has_aadhar_number": true,
    "has_name": true,
    "has_dob": true,
    "has_gender": true,
    "confidence_score": 85.5
  },
  "extracted_text": "Sample of extracted text..."
}
```

## Configuration

### Environment Variables
- `PORT`: Service port (default: 5003)
- `FLASK_DEBUG`: Debug mode (default: False)
- `OCR_SPACE_API_KEY`: Your OCR.space API key
- `MAX_IMAGE_SIZE`: Maximum image size (default: 10MB)
- `SUPPORTED_FORMATS`: Supported image formats

### OCR.space API Configuration
The service uses OCR.space API with the following settings:
- **Engine**: OCR Engine 2 (best accuracy)
- **Language**: English
- **Orientation Detection**: Enabled
- **Scale**: Enabled for better text recognition
- **Overlay**: Disabled (no bounding boxes needed)

### Aadhar Card Patterns
The service uses regex patterns to identify and validate Aadhar card fields:
- **Aadhar Number**: 12-digit number (XXXX XXXX XXXX format)
- **Name**: 2-50 characters, letters and spaces only
- **Date of Birth**: DD/MM/YYYY or DD-MM-YYYY format
- **Gender**: MALE/FEMALE or M/F
- **Mobile**: 10-digit number
- **Address**: 10-100 characters with alphanumeric content

## Integration with User Service

The OCR service is designed to integrate with the existing user service. Update the user service's `uploadKycDocuments` function to call this OCR service:

```javascript
// In user-service controller.js
const ocrServiceUrl = 'http://localhost:5003/ocr/aadhar';

// After uploading to Cloudinary, call OCR service
const ocrResponse = await axios.post(ocrServiceUrl, {
    image: frontImage.buffer.toString('base64')
}, {
    headers: {
        'Content-Type': 'application/json'
    }
});

const ocrResult = ocrResponse.data;
```

## Error Handling

The service provides comprehensive error handling:
- **File validation**: Checks file type and size
- **OCR errors**: Handles Tesseract processing errors
- **Image preprocessing**: Fallback for preprocessing failures
- **Pattern matching**: Graceful handling of regex errors

## Performance Considerations

- **Image preprocessing**: Optimizes images for better OCR accuracy
- **Confidence scoring**: Provides reliability metrics
- **Error recovery**: Continues processing even if some steps fail
- **Memory management**: Efficient handling of image data

## Testing

Test the service using curl or Postman:

```bash
# Health check
curl http://localhost:5003/health

# Process Aadhar card
curl -X POST -F "image=@aadhar_card.jpg" http://localhost:5003/ocr/aadhar
```

## Troubleshooting

### Common Issues
1. **OCR.space API key invalid**: Ensure your API key is correct and active
2. **API rate limits**: OCR.space has rate limits, check your usage
3. **Low confidence scores**: Try better quality images or different image formats
4. **Missing fields**: Check if image contains all required Aadhar card elements
5. **Network issues**: Ensure stable internet connection for API calls

### Logs
The service logs all operations. Check logs for detailed error information:
- OCR.space API calls and responses
- Pattern matching results
- Confidence scores
- Error details

### OCR.space API Limits
- **Free tier**: 25,000 requests per month
- **Rate limit**: 2 requests per second
- **File size**: Max 10MB per image
- **Supported formats**: JPG, PNG, GIF, PDF
