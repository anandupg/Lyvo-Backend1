const Tesseract = require('tesseract.js');
const { createWorker } = Tesseract;

class OCRService {
    constructor() {
        this.patterns = {
            aadhar_number: /\b\d{4}\s?\d{4}\s?\d{4}\b/,
            name: /^[A-Za-z\s\.\u0900-\u097F]{2,50}$/m,
            dob: /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/,
            gender: /\b(MALE|FEMALE|M|F|पुरुष|महिला|पु|महि)\b/i,
            mobile: /(?:Mobile|Mobile No|Phone|Contact)\s*:?\s*(\d{10})/i,
            address: /[A-Za-z0-9\s,.-\u0900-\u097F]{10,100}/,
            father_name: /(?:Father|Father's|Fathers|पिता|पिता का नाम)\s*:?\s*([A-Za-z\s\.\u0900-\u097F]{2,50})/i,
            mother_name: /(?:Mother|Mother's|Mothers|माता|माता का नाम)\s*:?\s*([A-Za-z\s\.\u0900-\u097F]{2,50})/i
        };

        this.aadhar_keywords = [
            'GOVERNMENT OF INDIA', 'AADHAAR', 'UIDAI', 'Unique Identification Authority',
            'Government of India', 'aadhaar', 'uidai', 'unique identification authority',
            'AADHAR', 'aadhar', 'GOVT OF INDIA', 'AADHAAR CARD', 'AADHAR CARD',
            'भारत सरकार', 'आधार', 'यूआईडीएआई', 'भारतीय विशिष्ट पहचान प्राधिकरण', 'आधार संख्या',
            'नाम', 'जन्म तिथि', 'लिंग', 'पिता का नाम', 'माता का नाम', 'पता', 'मोबाइल'
        ];
    }

    async extractText(imageBuffer) {
        try {
            console.log('Starting Tesseract OCR...');
            const { data: { text, confidence } } = await Tesseract.recognize(
                imageBuffer,
                'eng+hin', // English + Hindi
                { logger: m => console.log(m) } // Optional logger
            );

            console.log(`OCR Completed. Confidence: ${confidence}`);
            return { success: true, text, confidence };
        } catch (error) {
            console.error('Tesseract OCR error:', error);
            return { success: false, error: error.message };
        }
    }

    async processAadhar(imageBuffer) {
        const ocrResult = await this.extractText(imageBuffer);

        if (!ocrResult.success) {
            return { success: false, error: ocrResult.error };
        }

        const text = ocrResult.text;
        const extractedData = {
            aadhar_number: this.extractAadharNumber(text),
            name: this.extractName(text),
            date_of_birth: this.extractDOB(text),
            gender: this.extractGender(text),
            mobile: this.extractMobile(text),
            address: this.extractAddress(text),
            ...this.extractParentNames(text)
        };

        const validation = this.validateAadharCard(text, extractedData);

        const fieldCount = Object.values(extractedData).filter(v => v !== null).length;
        const fieldConfidence = (fieldCount / Object.keys(extractedData).length) * 100;
        const overallConfidence = (ocrResult.confidence + fieldConfidence + validation.confidence_score) / 3;

        return {
            success: true,
            extracted_data: extractedData,
            validation: validation,
            raw_text: text,
            confidence: overallConfidence,
            ocr_details: {
                api_confidence: ocrResult.confidence,
                field_extraction_confidence: fieldConfidence,
                validation_confidence: validation.confidence_score,
                api_used: 'Tesseract.js (Local)'
            }
        };
    }

    extractAadharNumber(text) {
        const match = text.match(this.patterns.aadhar_number);
        if (match) {
            const num = match[0].replace(/\s+/g, '');
            if (num.length === 12 && /^\d+$/.test(num)) return num;
        }
        return null;
    }

    extractName(text) {
        const lines = text.split('\n');
        const skipWords = ['GOVERNMENT', 'INDIA', 'AADHAAR', 'AADHAR', 'UIDAI', 'MALE', 'FEMALE', 'GOVT', 'OF',
            'भारत', 'सरकार', 'आधार', 'यूआईडीएआई', 'नाम', 'जन्म', 'तिथि', 'लिंग', 'पिता', 'माता', 'पता', 'मोबाइल'];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 2 && this.patterns.name.test(trimmed)) {
                if (!skipWords.some(word => trimmed.toUpperCase().includes(word) || trimmed.includes(word))) {
                    // Simple title case implementation
                    return trimmed.replace(/\w\S*/g, (w) => (w.replace(/^\w/, (c) => c.toUpperCase())));
                }
            }
        }
        return null;
    }

    extractDOB(text) {
        const match = text.match(this.patterns.dob);
        return match ? match[0] : null;
    }

    extractGender(text) {
        const match = text.match(this.patterns.gender);
        if (match) {
            const g = match[0].toUpperCase();
            if (['M', 'MALE'].includes(g)) return 'Male';
            if (['F', 'FEMALE'].includes(g)) return 'Female';
        }
        return null;
    }

    extractMobile(text) {
        const match = text.match(this.patterns.mobile);
        return match ? match[1] : null;
    }

    extractParentNames(text) {
        const fatherMatch = text.match(this.patterns.father_name);
        const motherMatch = text.match(this.patterns.mother_name);
        return {
            father_name: fatherMatch ? fatherMatch[1].trim() : null,
            mother_name: motherMatch ? motherMatch[1].trim() : null
        };
    }

    extractAddress(text) {
        const lines = text.split('\n');
        const addressLines = [];
        const skipPatterns = ['GOVERNMENT', 'INDIA', 'AADHAAR', 'AADHAR', 'UIDAI', 'MALE', 'FEMALE', 'GOVT', 'OF'];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 10 && this.patterns.address.test(trimmed)) {
                if (!skipPatterns.some(p => trimmed.toUpperCase().includes(p))) {
                    addressLines.push(trimmed);
                }
            }
        }
        return addressLines.length > 0 ? addressLines.join(', ') : null;
    }

    validateAadharCard(text, extractedData) {
        const textUpper = text.toUpperCase();
        let keywordCount = 0;

        const keywords = [
            'GOVERNMENT OF INDIA', 'AADHAAR', 'AADHAR', 'UIDAI', 'GOVT OF INDIA',
            'भारत सरकार', 'आधार', 'यूआईडीएआई'
        ];

        keywords.forEach(k => {
            if (textUpper.includes(k) || text.includes(k)) keywordCount++;
        });

        const coreFields = ['aadhar_number', 'name', 'date_of_birth', 'gender', 'mobile'];
        let fieldScore = 0;
        let coreFieldsCount = 0;

        coreFields.forEach(field => {
            if (extractedData[field]) {
                fieldScore += 20;
                coreFieldsCount++;
            }
        });

        const keywordScore = Math.min(keywordCount * 5, 20);
        const confidenceScore = fieldScore + keywordScore;

        return {
            is_aadhar_card: coreFieldsCount === 5, // Strict check? Python said 5
            has_aadhar_keywords: keywordCount >= 1,
            confidence_score: confidenceScore,
            core_fields_count: coreFieldsCount
        };
    }
}

module.exports = new OCRService();
