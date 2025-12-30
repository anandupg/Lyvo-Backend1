import os
import re
import requests
import base64
import logging
from typing import Dict, List, Tuple, Optional
from io import BytesIO
from PIL import Image

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AadharCardOCR:
    """OCR service for Aadhar card text extraction and validation using OCR.space API"""
    
    def __init__(self):
        # OCR.space API configuration
        self.api_key = os.getenv('OCR_SPACE_API_KEY', 'K86000038088957')
        self.api_url = 'https://api.ocr.space/parse/image'
        
        # Aadhar card patterns (case-insensitive + Hindi support)
        self.patterns = {
            'aadhar_number': re.compile(r'\b\d{4}\s?\d{4}\s?\d{4}\b'),
            'name': re.compile(r'^[A-Za-z\s\.\u0900-\u097F]{2,50}$', re.MULTILINE),  # Added Hindi Unicode range
            'dob': re.compile(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b'),
            'gender': re.compile(r'\b(MALE|FEMALE|M|F|पुरुष|महिला|पु|महि)\b', re.IGNORECASE),
            'mobile': re.compile(r'(?:Mobile|Mobile No|Phone|Contact)\s*:?\s*(\d{10})', re.IGNORECASE),
            'address': re.compile(r'[A-Za-z0-9\s,.-\u0900-\u097F]{10,100}'),  # Added Hindi Unicode range
            'father_name': re.compile(r'(Father|Father\'s|Fathers|पिता|पिता का नाम)\s*:?\s*([A-Za-z\s\.\u0900-\u097F]{2,50})', re.IGNORECASE),
            'mother_name': re.compile(r'(Mother|Mother\'s|Mothers|माता|माता का नाम)\s*:?\s*([A-Za-z\s\.\u0900-\u097F]{2,50})', re.IGNORECASE)
        }
        
        # Keywords to identify Aadhar card sections (case-insensitive + Hindi)
        self.aadhar_keywords = [
            # English keywords
            'GOVERNMENT OF INDIA',
            'AADHAAR',
            'UIDAI',
            'Unique Identification Authority',
            'Government of India',
            'government of india',
            'aadhaar',
            'uidai',
            'unique identification authority',
            'Government of india',
            'GOVERNMENT OF india',
            'Aadhaar',
            'Uidai',
            'AADHAR',
            'aadhar',
            'Aadhar',
            'GOVT OF INDIA',
            'govt of india',
            'AADHAAR CARD',
            'AADHAR CARD',
            'aadhaar card',
            'aadhar card',
            'Aadhaar Card',
            'Aadhar Card',
            # Hindi keywords (common Hindi text on Aadhar cards)
            'भारत सरकार',
            'आधार',
            'यूआईडीएआई',
            'भारतीय विशिष्ट पहचान प्राधिकरण',
            'आधार संख्या',
            'नाम',
            'जन्म तिथि',
            'लिंग',
            'पिता का नाम',
            'माता का नाम',
            'पता',
            'मोबाइल',
            'MALE', 'FEMALE', 'M', 'F',
            'male', 'female', 'm', 'f',
            'Male', 'Female'
        ]
    
    def call_ocr_space_api(self, image_data: bytes) -> Dict:
        """Call OCR.space API to extract text from image with retry logic"""
        max_retries = 2
        retry_delay = 3
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Calling OCR.space API... (Attempt {attempt + 1}/{max_retries})")
                
                # Convert image to base64
                image_base64 = base64.b64encode(image_data).decode('utf-8')
                
                # Prepare API request with optimized settings
                payload = {
                    'apikey': self.api_key,
                    'base64Image': f'data:image/jpeg;base64,{image_base64}',
                    'language': 'eng',
                    'isOverlayRequired': False,
                    'detectOrientation': False,  # Disable to reduce processing time
                    'scale': False,  # Disable to reduce processing time
                    'OCREngine': 1  # Use Engine 1 for faster processing
                }
                
                # Make API request with shorter timeout
                response = requests.post(
                    self.api_url,
                    data=payload,
                    timeout=15  # Reduced timeout
                )
                
                if response.status_code == 200:
                    result = response.json()
                    
                    if result.get('IsErroredOnProcessing', False):
                        error_message = result.get('ErrorMessage', 'Unknown OCR error')
                        logger.error(f"OCR.space API error: {error_message}")
                        if attempt < max_retries - 1:
                            logger.info(f"Retrying in {retry_delay} seconds...")
                            import time
                            time.sleep(retry_delay)
                            continue
                        return {
                            'success': False,
                            'error': f'OCR API error: {error_message}',
                            'text': '',
                            'confidence': 0
                        }
                    
                    # Extract text and confidence
                    parsed_results = result.get('ParsedResults', [])
                    if parsed_results:
                        parsed_result = parsed_results[0]
                        extracted_text = parsed_result.get('ParsedText', '')
                        
                        # Calculate confidence score
                        confidence_score = self.calculate_confidence_score(extracted_text)
                        
                        logger.info(f"OCR.space API success. Text length: {len(extracted_text)}")
                        
                        return {
                            'success': True,
                            'text': extracted_text,
                            'confidence': confidence_score,
                            'raw_response': result
                        }
                    else:
                        logger.error("No parsed results from OCR.space API")
                        if attempt < max_retries - 1:
                            logger.info(f"Retrying in {retry_delay} seconds...")
                            import time
                            time.sleep(retry_delay)
                            continue
                        return {
                            'success': False,
                            'error': 'No text extracted from image',
                            'text': '',
                            'confidence': 0
                        }
                else:
                    logger.error(f"OCR.space API HTTP error: {response.status_code}")
                    if attempt < max_retries - 1:
                        logger.info(f"Retrying in {retry_delay} seconds...")
                        import time
                        time.sleep(retry_delay)
                        continue
                    return {
                        'success': False,
                        'error': f'HTTP error: {response.status_code}',
                        'text': '',
                        'confidence': 0
                    }
                
            except requests.exceptions.Timeout:
                logger.error(f"OCR.space API timeout (Attempt {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    logger.info(f"Retrying in {retry_delay} seconds...")
                    import time
                    time.sleep(retry_delay)
                    continue
                return {
                    'success': False,
                    'error': 'OCR API timeout after retries',
                    'text': '',
                    'confidence': 0
                }
            except Exception as e:
                logger.error(f"Error calling OCR.space API (Attempt {attempt + 1}/{max_retries}): {str(e)}")
                if attempt < max_retries - 1:
                    logger.info(f"Retrying in {retry_delay} seconds...")
                    import time
                    time.sleep(retry_delay)
                    continue
                return {
                    'success': False,
                    'error': f'OCR API error: {str(e)}',
                    'text': '',
                    'confidence': 0
                }
        
        # If we get here, all retries failed
        logger.error("All OCR.space API attempts failed")
        return {
            'success': False,
            'error': 'OCR API failed after all retries',
            'text': '',
            'confidence': 0
        }
    
    def provide_fallback_response(self, error_message: str) -> Dict:
        """Provide a fallback response when OCR.space API fails"""
        logger.info("Providing fallback response for failed OCR")
        
        # Create a basic response structure
        fallback_data = {
            'aadhar_number': None,
            'name': None,
            'date_of_birth': None,
            'gender': None,
            'mobile': None,
            'address': None,
            'father_name': None,
            'mother_name': None
        }
        
        fallback_validation = {
            'has_aadhar_keywords': False,
            'has_aadhar_number': False,
            'has_name': False,
            'has_dob': False,
            'has_gender': False,
            'confidence_score': 0.0,
            'is_aadhar_card': False,
            'validation_details': 'OCR service unavailable - manual verification required'
        }
        
        return {
            'success': False,
            'extracted_data': fallback_data,
            'validation': fallback_validation,
            'raw_text': '',
            'confidence': 0,
            'error': f'OCR service unavailable: {error_message}',
            'fallback_mode': True,
            'ocr_details': {
                'api_confidence': 0,
                'field_extraction_confidence': 0,
                'validation_confidence': 0,
                'api_used': 'Fallback Mode (OCR.space API failed)'
            },
            'suggestion': 'Please try uploading a smaller image or try again later. For immediate processing, contact support.'
        }
    
    def calculate_confidence_score(self, text: str) -> float:
        """Calculate confidence score based on text quality"""
        if not text.strip():
            return 0.0
        
        # Basic confidence calculation based on text characteristics
        confidence = 50.0  # Base confidence
        
        # Increase confidence for longer text
        if len(text) > 100:
            confidence += 20
        elif len(text) > 50:
            confidence += 10
        
        # Increase confidence for structured text (lines)
        lines = text.split('\n')
        if len(lines) > 5:
            confidence += 15
        
        # Increase confidence for common Aadhar keywords
        text_upper = text.upper()
        keyword_count = sum(1 for keyword in self.aadhar_keywords if keyword in text_upper)
        confidence += keyword_count * 5
        
        # Increase confidence for numbers (Aadhar numbers, dates)
        number_count = len(re.findall(r'\d+', text))
        if number_count > 3:
            confidence += 10
        
        # Cap at 95%
        return min(confidence, 95.0)
    
    def extract_aadhar_number(self, text: str) -> Optional[str]:
        """Extract Aadhar number from text"""
        matches = self.patterns['aadhar_number'].findall(text)
        if matches:
            # Clean and format Aadhar number
            aadhar = re.sub(r'\s+', '', matches[0])
            if len(aadhar) == 12 and aadhar.isdigit():
                return aadhar
        return None
    
    def extract_name(self, text: str) -> Optional[str]:
        """Extract name from text (case-insensitive + Hindi support)"""
        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if self.patterns['name'].match(line) and len(line) > 2:
                # Skip common non-name words (case-insensitive + Hindi)
                skip_words = ['GOVERNMENT', 'INDIA', 'AADHAAR', 'AADHAR', 'UIDAI', 'MALE', 'FEMALE', 'GOVT', 'OF',
                             'भारत', 'सरकार', 'आधार', 'यूआईडीएआई', 'नाम', 'जन्म', 'तिथि', 'लिंग', 'पिता', 'माता', 'पता', 'मोबाइल']
                if not any(word in line.upper() or word in line for word in skip_words):
                    return line.title() if line.isascii() else line  # Keep original case for Hindi
        return None
    
    def extract_dob(self, text: str) -> Optional[str]:
        """Extract date of birth from text"""
        matches = self.patterns['dob'].findall(text)
        if matches:
            return matches[0]
        return None
    
    def extract_gender(self, text: str) -> Optional[str]:
        """Extract gender from text"""
        matches = self.patterns['gender'].findall(text)
        if matches:
            gender = matches[0].upper()
            if gender in ['M', 'MALE']:
                return 'Male'
            elif gender in ['F', 'FEMALE']:
                return 'Female'
        return None
    
    def extract_mobile(self, text: str) -> Optional[str]:
        """Extract mobile number from text"""
        match = self.patterns['mobile'].search(text)
        if match:
            return match.group(1)  # Return the captured group (the 10-digit number)
        return None
    
    def extract_parent_names(self, text: str) -> Dict[str, Optional[str]]:
        """Extract father and mother names"""
        father_match = self.patterns['father_name'].search(text)
        mother_match = self.patterns['mother_name'].search(text)
        
        return {
            'father_name': father_match.group(2).strip() if father_match else None,
            'mother_name': mother_match.group(2).strip() if mother_match else None
        }
    
    def extract_address(self, text: str) -> Optional[str]:
        """Extract address from text (case-insensitive)"""
        lines = text.split('\n')
        address_lines = []
        
        for line in lines:
            line = line.strip()
            if len(line) > 10 and self.patterns['address'].match(line):
                # Skip lines that are likely not address (case-insensitive)
                skip_patterns = ['GOVERNMENT', 'INDIA', 'AADHAAR', 'AADHAR', 'UIDAI', 'MALE', 'FEMALE', 'GOVT', 'OF']
                if not any(pattern in line.upper() for pattern in skip_patterns):
                    address_lines.append(line)
        
        return ', '.join(address_lines) if address_lines else None
    
    def validate_aadhar_card(self, text: str) -> Dict[str, bool]:
        """Validate if the document is an Aadhar card (case-insensitive + Hindi support)"""
        validation_results = {
            'is_aadhar_card': False,
            'has_aadhar_keywords': False,
            'has_aadhar_number': False,
            'has_name': False,
            'has_dob': False,
            'has_gender': False,
            'has_mobile': False,
            'confidence_score': 0,
            'core_fields_count': 0,
            'total_core_fields': 5
        }
        
        # Check for Aadhar keywords (case-insensitive + Hindi)
        text_upper = text.upper()
        keyword_count = 0
        
        # Check for various case combinations and Hindi text
        keyword_variations = [
            # English variations
            'GOVERNMENT OF INDIA',
            'AADHAAR', 'AADHAR', 'AADHAAR CARD', 'AADHAR CARD',
            'UIDAI', 'UNIQUE IDENTIFICATION AUTHORITY',
            'GOVT OF INDIA', 'GOVERNMENT OF INDIA',
            'AADHAAR NUMBER', 'AADHAR NUMBER',
            'AADHAAR CARD NUMBER', 'AADHAR CARD NUMBER',
            'UNIQUE IDENTIFICATION', 'IDENTIFICATION AUTHORITY',
            # Hindi variations (check in original text, not uppercase)
            'भारत सरकार',
            'आधार',
            'यूआईडीएआई',
            'भारतीय विशिष्ट पहचान प्राधिकरण',
            'आधार संख्या',
            'नाम',
            'जन्म तिथि',
            'लिंग',
            'पिता का नाम',
            'माता का नाम',
            'पता',
            'मोबाइल'
        ]
        
        for keyword in keyword_variations:
            if keyword in text_upper or keyword in text:
                keyword_count += 1
        
        # Check for required fields first
        validation_results['has_aadhar_number'] = bool(self.extract_aadhar_number(text))
        
        # Keyword check: True if keywords found OR if Aadhar number found (implicit keyword)
        validation_results['has_aadhar_keywords'] = keyword_count >= 1 or validation_results['has_aadhar_number']
        validation_results['has_name'] = bool(self.extract_name(text))
        validation_results['has_dob'] = bool(self.extract_dob(text))
        validation_results['has_gender'] = bool(self.extract_gender(text))
        validation_results['has_mobile'] = bool(self.extract_mobile(text))
        
        # Calculate confidence score based on field completeness
        core_fields = ['has_aadhar_number', 'has_name', 'has_dob', 'has_gender', 'has_mobile']
        field_score = sum(validation_results[field] for field in core_fields) * 20  # 20 points per field
        keyword_score = min(keyword_count * 5, 20)  # Max 20 points for keywords
        confidence_score = field_score + keyword_score
        validation_results['confidence_score'] = confidence_score
        
        # Determine if it's an Aadhar card
        # Must have ALL core fields (name, DOB, gender, mobile, aadhar_number)
        core_field_count = sum(validation_results[field] for field in core_fields)
        validation_results['is_aadhar_card'] = core_field_count == 5  # All 5 core fields must be present
        validation_results['core_fields_count'] = core_field_count
        
        return validation_results
    
    def process_aadhar_image(self, image_data: bytes) -> Dict:
        """Main method to process Aadhar card image using OCR.space API"""
        try:
            logger.info("Starting Aadhar card OCR processing with OCR.space API")
            
            # Call OCR.space API
            ocr_result = self.call_ocr_space_api(image_data)
            
            if not ocr_result['success']:
                # If OCR.space API fails, provide a fallback response
                logger.warning("OCR.space API failed, providing fallback response")
                return self.provide_fallback_response(ocr_result['error'])
            
            text = ocr_result['text']
            api_confidence = ocr_result['confidence']
            
            if not text.strip():
                return {
                    'success': False,
                    'error': 'No text could be extracted from the image',
                    'confidence': 0
                }
            
            # Extract specific fields
            extracted_data = {
                'aadhar_number': self.extract_aadhar_number(text),
                'name': self.extract_name(text),
                'date_of_birth': self.extract_dob(text),
                'gender': self.extract_gender(text),
                'mobile': self.extract_mobile(text),
                'address': self.extract_address(text),
                **self.extract_parent_names(text)
            }
            
            # Validate Aadhar card
            validation = self.validate_aadhar_card(text)
            
            # Calculate overall confidence
            field_count = sum(1 for value in extracted_data.values() if value is not None)
            field_confidence = (field_count / len(extracted_data)) * 100
            overall_confidence = (api_confidence + field_confidence + validation['confidence_score']) / 3
            
            result = {
                'success': True,
                'extracted_data': extracted_data,
                'validation': validation,
                'raw_text': text,
                'confidence': overall_confidence,
                'ocr_details': {
                    'api_confidence': api_confidence,
                    'field_extraction_confidence': field_confidence,
                    'validation_confidence': validation['confidence_score'],
                    'api_used': 'OCR.space'
                }
            }
            
            logger.info(f"OCR processing completed. Confidence: {overall_confidence:.2f}%")
            return result
            
        except Exception as e:
            logger.error(f"Error processing Aadhar image: {str(e)}")
            return {
                'success': False,
                'error': f'OCR processing failed: {str(e)}',
                'confidence': 0
            }

# Global OCR instance
ocr_processor = AadharCardOCR()