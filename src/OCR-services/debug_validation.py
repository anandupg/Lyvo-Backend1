import requests
import json

def debug_validation():
    """Debug the validation logic"""
    
    print("🔍 DEBUGGING VALIDATION LOGIC")
    print("=" * 50)
    
    # Test with your exact Aadhar details
    test_text = """ANANDU P GANESH
DOB: 27/10/2002
MALE
Mobile No: 7306080450
3621 8443 8575
VID: 9160 1699 3333 9777"""
    
    try:
        response = requests.post(
            'http://localhost:5003/ocr/debug-text',
            json={'text': test_text},
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            
            print("📊 VALIDATION RESULTS:")
            print("-" * 30)
            validation = result.get('validation', {})
            
            print(f"✓ Has Keywords: {validation.get('has_aadhar_keywords', False)}")
            print(f"✓ Has Aadhar Number: {validation.get('has_aadhar_number', False)}")
            print(f"✓ Has Name: {validation.get('has_name', False)}")
            print(f"✓ Has DOB: {validation.get('has_dob', False)}")
            print(f"✓ Has Gender: {validation.get('has_gender', False)}")
            print(f"✓ Has Mobile: {validation.get('has_mobile', False)}")
            print(f"📈 Confidence: {validation.get('confidence_score', 0):.1f}%")
            print(f"🎯 Is Valid: {validation.get('is_aadhar_card', False)}")
            print(f"📊 Core Fields Count: {validation.get('core_fields_count', 0)}")
            print(f"📊 Total Core Fields: {validation.get('total_core_fields', 0)}")
            
            print()
            
            print("📋 EXTRACTED DATA:")
            print("-" * 30)
            extracted = result.get('extracted_data', {})
            for field, value in extracted.items():
                status = "✅" if value else "❌"
                print(f"  {status} {field.replace('_', ' ').title()}: {value if value else 'Not found'}")
            
            print()
            
            # Check core fields manually
            core_fields = ['aadhar_number', 'name', 'date_of_birth', 'gender', 'mobile']
            core_field_count = sum(1 for field in core_fields if extracted.get(field))
            
            print("🔍 MANUAL CHECK:")
            print("-" * 30)
            print(f"Core fields present: {core_field_count}/5")
            print(f"Should be valid: {core_field_count == 5}")
            
            if core_field_count == 5:
                print("✅ This should be VALID!")
            else:
                print("❌ This should be INVALID!")
                missing = [field for field in core_fields if not extracted.get(field)]
                print(f"Missing fields: {missing}")
                
        else:
            print(f"❌ API Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    debug_validation()
