import os
import re
import requests

BASE = "https://oms.primesandzooms.com/pnz_internal/index.php"

OMS_USERNAME = os.environ.get("OMS_USERNAME", "kapil")
OMS_PASSWORD = os.environ.get("OMS_PASSWORD", "1DR37JWTZT")
FROM_NAME = "Kapil Thakare"
FROM_EMAIL = "kapil@primesandzooms.com"
CONTACT_NUMBER = "+919561616168"

session = requests.Session()

print("Step 1: Logging in...")
r = session.post(BASE, data={
    "-action": "login", "-redirect": "",
    "UserName": OMS_USERNAME,
    "Password": OMS_PASSWORD,
    "-submit": "Submit"
})
print(f"  Login response: {r.status_code}")

print("\nStep 2: Fetching new-inquiry form...")
r = session.get(f"{BASE}?-action=new&-table=inquiries")
html = r.text

csrf = re.search(r'name="--form-session-key"[^>]*value="([^"]+)"', html)
if not csrf:
    csrf = re.search(r'form.session.key[^>]*value="([^"]+)"', html)
csrf_token = csrf.group(1) if csrf else exit("ERROR: Could not extract CSRF token")
print(f"  CSRF token: {csrf_token}")

print("\nStep 3: Building form payload...")

form = {
    "-table": "inquiries",
    "-action": "new",
    "--form-session-key": csrf_token,
    "--no-query": "1",
    "_qf__new_inquiries_record_form": "1",
    "new_inquiries_record_form": "1",
    # Customer fields
    "inquiry_type": "Video",
    "from_name": FROM_NAME,
    "from_email": FROM_EMAIL,
    "contact_number": CONTACT_NUMBER,
    "from_company": "Production Shoot",
    "status": "New",
    "user_id": "2",
    "delivery": "2026-06-28",
    "return_time": "2026-06-28",
    "instructions_by_cust": "Camera & Lighting Package for 1-day shoot on 28 June 2026. Equipment for 3 camera operators with full lighting setup.",
    "notes_for_frontoffice": "Also needs: Skimmer 10x10 diffusion (x2), Camera trolley/cart (x1), Donkey stands (x4) — not in standard pricelist. Please check availability.",
}

lines = [
    (2564, 3, "Sony FX3 Cinema Camera"),
    (2774, 2, "Sony FE 24-70mm f/2.8 GM II"),
    (3453, 1, "Sony FE 16-35mm f/2.8 GM II"),
    (3346, 2, "Sony FE 50mm f/1.2 GM"),
    (2594, 2, "Sony FE 70-200mm f/2.8 GM OSS II"),
    (2477, 1, "Lilliput BM150-4KS Field Monitor"),
    (2588, 3, "82mm Variable ND Filter 1-5 Stops"),
    (3689, 1, "DJI RS4 Pro Gimbal Stabilizer"),
    (1401, 3, "Camera Attendant"),
    (2886, 1, "Hollyland Mars 4K Wireless Transmission System"),
    (2291, 1, "Blackmagic ATEM Mini Pro Switcher"),
    (3752, 3, "Aputure Nova P300C RGBWW LED Panel"),
    (4151, 1, "Godox AD600 Pro II Outdoor TTL Flash"),
    (3476, 2, "Godox Knowled F400Bi Bicolor Flexible LED Panel 2ft x 4ft"),
    (2815, 2, "Godox TL120 RGB Tubelight (Single)"),
]

for i, (item_id, qty, desc) in enumerate(lines):
    form[f"lines[{i}][item_id]"] = str(item_id)
    form[f"lines[{i}][item_quantity]"] = str(qty)
    form[f"lines[{i}][item_package_id]"] = ""
    form[f"lines[{i}][discount_id]"] = ""
    form[f"lines[{i}][line_status]"] = "Available"
    form[f"lines[{i}][__id__]"] = "new"

form["lines[__loaded__]"] = str(len(lines))

print(f"  Total line items: {len(lines)}")
print(f"  Total form fields: {len(form)}")

print("\nStep 4: Submitting inquiry...")
r2 = session.post(BASE, data=form)
resp_text = r2.text[:3000]

print(f"  Response status: {r2.status_code}")
print(f"  Response length: {len(r2.text)} chars")

if "Record successfully saved" in resp_text:
    print("\n✓ SUCCESS! Inquiry submitted.")
    match = re.search(r'inquiry_id[^"]*["\']?\s*[:=]\s*["\']?(\d+)', resp_text)
    if match:
        print(f"  Inquiry ID: {match.group(1)}")
elif "saved" in resp_text.lower()[:2000]:
    print("\n✓ SUCCESS (found 'saved' in response)")
else:
    print("\n⚠ Response (first 1000 chars):")
    print(resp_text[:1000])

print("\nStep 5: Verifying by fetching form...")
r3 = session.get(f"{BASE}?-action=new&-table=inquiries")
# Check for recent inquiries
r4 = session.get(f"{BASE}?-table=inquiries&-action=list&-skip=0&-limit=10")
list_html = r4.text
match = re.search(r'inquiry_id["\'][^>]*>(\d+)<', list_html)
if match:
    print(f"  Latest inquiry ID found in list: {match.group(1)}")

print("\nDone!")
