from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import base64
import logging
from ocr_processor import ocr_processor
import traceback
from dotenv import load_dotenv

# Load environment variables from .env file (searches up directories)
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB max file size

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'OCR Service',
        'version': '1.0.0'
    })

@app.route('/ocr/extract-text', methods=['POST'])
def extract_text():
    """Extract text from any image using OCR.space API"""
    try:
        if 'image' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No image file provided'
            }), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No image file selected'
            }), 400
        
        # Read image data
        image_data = file.read()
        
        # Process with OCR.space API
        ocr_result = ocr_processor.call_ocr_space_api(image_data)
        
        if not ocr_result['success']:
            return jsonify({
                'success': False,
                'error': ocr_result['error']
            }), 500
        
        text = ocr_result['text']
        confidence = ocr_result['confidence']
        
        return jsonify({
            'success': True,
            'text': text,
            'confidence': confidence,
            'word_count': len(text.split()) if text else 0
        })
        
    except Exception as e:
        logger.error(f"Error in extract_text: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Text extraction failed: {str(e)}'
        }), 500

@app.route('/ocr/aadhar', methods=['POST'])
def process_aadhar():
    """Process Aadhar card image and extract structured data"""
    try:
        # Check if image is provided
        if 'image' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No image file provided'
            }), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No image file selected'
            }), 400
        
        # Validate file type
        allowed_extensions = {'png', 'jpg', 'jpeg', 'bmp', 'tiff'}
        if not ('.' in file.filename and 
                file.filename.rsplit('.', 1)[1].lower() in allowed_extensions):
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Only image files are allowed.'
            }), 400
        
        # Read image data
        image_data = file.read()
        
        # Process Aadhar card with timeout handling
        try:
            result = ocr_processor.process_aadhar_image(image_data)
            
            # If OCR.space API timed out, provide fallback response
            if not result['success'] and 'timeout' in result.get('error', '').lower():
                logger.warning("OCR.space API timeout - providing fallback response")
                return jsonify({
                    'success': False,
                    'error': 'OCR processing timeout - please try with a smaller image or try again later',
                    'timeout': True,
                    'suggestion': 'Try uploading a smaller image (under 1MB) or retry in a few minutes'
                }), 408  # Request Timeout status code
            
            return jsonify(result)
            
        except Exception as ocr_error:
            logger.error(f"OCR processing error: {str(ocr_error)}")
            return jsonify({
                'success': False,
                'error': f'OCR processing failed: {str(ocr_error)}',
                'suggestion': 'Please try with a smaller image or check your internet connection'
            }), 500
        
    except Exception as e:
        logger.error(f"Error in process_aadhar: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Aadhar processing failed: {str(e)}'
        }), 500

@app.route('/ocr/aadhar/base64', methods=['POST'])
def process_aadhar_base64():
    """Process Aadhar card from base64 encoded image"""
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({
                'success': False,
                'error': 'No image data provided'
            }), 400
        
        # Decode base64 image
        try:
            # Handle data URL format (data:image/jpeg;base64,...)
            if data['image'].startswith('data:'):
                image_data = base64.b64decode(data['image'].split(',')[1])
            else:
                image_data = base64.b64decode(data['image'])
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid base64 image data: {str(e)}'
            }), 400
        
        # Process Aadhar card with timeout handling
        try:
            result = ocr_processor.process_aadhar_image(image_data)
            
            # If OCR.space API timed out, provide fallback response
            if not result['success'] and 'timeout' in result.get('error', '').lower():
                logger.warning("OCR.space API timeout - providing fallback response")
                return jsonify({
                    'success': False,
                    'error': 'OCR processing timeout - please try with a smaller image or try again later',
                    'timeout': True,
                    'suggestion': 'Try uploading a smaller image (under 1MB) or retry in a few minutes'
                }), 408  # Request Timeout status code
            
            return jsonify(result)
            
        except Exception as ocr_error:
            logger.error(f"OCR processing error: {str(ocr_error)}")
            return jsonify({
                'success': False,
                'error': f'OCR processing failed: {str(ocr_error)}',
                'suggestion': 'Please try with a smaller image or check your internet connection'
            }), 500
        
    except Exception as e:
        logger.error(f"Error in process_aadhar_base64: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Aadhar processing failed: {str(e)}'
        }), 500

@app.route('/ocr/test-aadhar', methods=['POST'])
def test_aadhar_processing():
    """Test Aadhar card processing without database storage - just return verification results"""
    try:
        # Check if image is provided
        if 'image' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No image file provided'
            }), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No image file selected'
            }), 400
        
        # Validate file type
        allowed_extensions = {'png', 'jpg', 'jpeg', 'bmp', 'tiff'}
        if not ('.' in file.filename and 
                file.filename.rsplit('.', 1)[1].lower() in allowed_extensions):
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Only image files are allowed.'
            }), 400
        
        # Read image data
        image_data = file.read()
        
        # Process Aadhar card
        result = ocr_processor.process_aadhar_image(image_data)
        
        # Add test mode indicator
        result['test_mode'] = True
        result['message'] = 'This is a test result - no data was saved to database'
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in test_aadhar_processing: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Test processing failed: {str(e)}'
        }), 500

@app.route('/ocr/test-aadhar-base64', methods=['POST'])
def test_aadhar_base64_processing():
    """Test Aadhar card processing from base64 without database storage"""
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({
                'success': False,
                'error': 'No image data provided'
            }), 400
        
        # Decode base64 image
        try:
            # Handle data URL format (data:image/jpeg;base64,...)
            if data['image'].startswith('data:'):
                image_data = base64.b64decode(data['image'].split(',')[1])
            else:
                image_data = base64.b64decode(data['image'])
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid base64 image data: {str(e)}'
            }), 400
        
        # Process Aadhar card
        result = ocr_processor.process_aadhar_image(image_data)
        
        # Add test mode indicator
        result['test_mode'] = True
        result['message'] = 'This is a test result - no data was saved to database'
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in test_aadhar_base64_processing: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Test processing failed: {str(e)}'
        }), 500

@app.route('/ocr/debug-text', methods=['POST'])
def debug_text_validation():
    """Debug text validation without OCR - for testing validation logic"""
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({
                'success': False,
                'error': 'No text data provided'
            }), 400
        
        text = data['text']
        
        # Process the text directly using validation methods
        extracted_data = {
            'aadhar_number': ocr_processor.extract_aadhar_number(text),
            'name': ocr_processor.extract_name(text),
            'date_of_birth': ocr_processor.extract_dob(text),
            'gender': ocr_processor.extract_gender(text),
            'mobile': ocr_processor.extract_mobile(text),
            'address': ocr_processor.extract_address(text),
            **ocr_processor.extract_parent_names(text)
        }
        
        # Validate Aadhar card
        validation = ocr_processor.validate_aadhar_card(text)
        
        # Calculate overall confidence
        field_count = sum(1 for value in extracted_data.values() if value is not None)
        field_confidence = (field_count / len(extracted_data)) * 100
        overall_confidence = (field_confidence + validation['confidence_score']) / 2
        
        result = {
            'success': True,
            'extracted_data': extracted_data,
            'validation': validation,
            'raw_text': text,
            'confidence': overall_confidence,
            'ocr_details': {
                'api_confidence': 100,  # Direct text processing
                'field_extraction_confidence': field_confidence,
                'validation_confidence': validation['confidence_score'],
                'api_used': 'Direct Text Processing'
            },
            'debug_mode': True,
            'input_text': text,
            'message': 'This is a debug result - text processed directly'
        }
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in debug_text_validation: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Debug processing failed: {str(e)}'
        }), 500

@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({
        'success': False,
        'error': 'File too large. Maximum size is 10MB.'
    }), 413

@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(e):
    """Handle internal server errors"""
    logger.error(f"Internal server error: {str(e)}")
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

if __name__ == '__main__':
    # Use OCR_PORT if available, otherwise default to 5003
    # Avoid using generic 'PORT' as it may conflict with the main Node.js server
    # Force port 5003 to avoid conflict with main server on 5000
    # Use generic PORT for Render/Heroku compatibility
    port = int(os.getenv('PORT', 5003))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting OCR Service on port {port}")
    logger.info(f"Debug mode: {debug}")
    
    app.run(host='0.0.0.0', port=port, debug=debug)
