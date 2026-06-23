import os
import requests
import re
import sys

BASE = "https://oms.primesandzooms.com/pnz_internal/index.php"

if len(sys.argv) < 2:
    print(f"Usage: python {sys.argv[0]} <inquiry_id>")
    sys.exit(1)

INQUIRY_ID = int(sys.argv[1])

OMS_USERNAME = os.environ.get("OMS_USERNAME")
OMS_PASSWORD = os.environ.get("OMS_PASSWORD")
if not OMS_USERNAME or not OMS_PASSWORD:
    print("Error: OMS_USERNAME and OMS_PASSWORD environment variables must be set")
    sys.exit(1)

session = requests.Session()

print("Logging in...")
session.post(BASE, data={
    "-action": "login", "-redirect": "", "UserName": OMS_USERNAME,
    "Password": OMS_PASSWORD, "-submit": "Submit"
})

print(f"Fetching edit form for inquiry {INQUIRY_ID}...")
r = session.get(f"{BASE}?-action=edit&-table=inquiries&inquiry_id={INQUIRY_ID}")
html = r.text

# Extract CSRF
csrf = re.search(r'name="--form-session-key"[^>]*value="([^"]+)"', html)
csrf_token = csrf.group(1) if csrf else exit("No CSRF")
print(f"CSRF: {csrf_token}")

# Extract ALL form field values from the HTML
fields = {}

# Find all input elements with values
for m in re.finditer(r'<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>', html):
    name, value = m.groups()
    if name not in fields:
        fields[name] = value

# Also find select elements and their selected values
# Find select elements with their values
select_pattern = re.compile(r'<select[^>]*name="([^"]+)"[^>]*>.*?</select>', re.DOTALL)
for m in select_pattern.finditer(html):
    name = m.group(1)
    select_html = m.group(0)
    selected = re.search(r'<option[^>]*selected[^>]*value="([^"]*)"', select_html)
    if selected:
        fields[name] = selected.group(1)
    else:
        # Get first option value
        first = re.search(r'<option[^>]*value="([^"]*)"', select_html)
        if first and name not in fields:
            fields[name] = first.group(1)

print(f"Extracted {len(fields)} form fields")

# Build form data - include ALL existing fields
form_data = {}
for name, value in fields.items():
    if name in ['-action', '-table', '-search']:
        continue
    form_data[name] = value

# Override with our required values
form_data['-table'] = 'inquiries'
form_data['-action'] = 'edit'
form_data['--form-session-key'] = csrf_token
form_data['--session:save'] = 'Save'

# Add line items
lines_data = [
    (3752, 2, "Aputure Nova P300C RGBWW LED Panel"),
    (2717, 2, "Aputure LS600d Daylight LED"),
    (2816, 1, "Godox TL120 RGB Tubelight Four-Light Kit"),
    (2278, 2, "Godox BD-04 Barndoor Kit"),
    (4280, 1, "Godox TLB4 Bracket for 4 Tube lights"),
    (2460, 5, "Godox 270CS C-Stand with Grip Arm Kit"),
    (2436, 1, "Tilta Nucleus-M Wireless Follow Focus"),
    (2886, 1, "Hollyland Mars 4K Wireless Transmitter"),
    (2477, 1, "Lilliput BM150-4KS Field Monitor"),
    (1085, 1, "Lanparte Matte Box"),
    (2742, 1, "100x100 ND and Polariser Filter Kit"),
    (3123, 1, "StudioAssist Video Tripod 100mm + Baby Legs"),
    (2435, 1, "Tilta DSLR Shoulder Rig Pro"),
    (1401, 1, "Camera Attendant"),
]

for i, (item_id, qty, desc) in enumerate(lines_data):
    form_data[f"lines[{i}][item_id]"] = str(item_id)
    form_data[f"lines[{i}][item_quantity]"] = str(qty)
    form_data[f"lines[{i}][item_package_id]"] = ""
    form_data[f"lines[{i}][discount_id]"] = ""
    form_data[f"lines[{i}][line_status]"] = "Available"
    form_data[f"lines[{i}][__id__]"] = "new"

form_data["lines[__loaded__]"] = str(len(lines_data))

# Remove the old empty template line if present
if "lines[0][__id__]" in form_data and "lines[0][item_id]" not in form_data:
    form_data.pop("lines[0][__id__]", None)

print(f"Submitting {len(lines_data)} line items with {len(form_data)} fields...")
r2 = session.post(BASE, data=form_data)
resp = r2.text

if "Record successfully saved" in resp:
    print("SUCCESS! Line items added.")
elif "saved" in resp.lower()[:2000]:
    print("SUCCESS (found 'saved' in response)")
else:
    # Check for known errors
    if "Please correct" in resp:
        errors = re.findall(r"- ([^\n]+)", resp[resp.find("alert("):resp.find("alert(")+500] if "alert(" in resp else resp)
        print(f"Validation errors: {errors[:5]}")
    print("\nResponse contains 'saved':", "saved" in resp.lower()[:5000])
    print("Response contains error:", "error" in resp.lower()[:2000])

# Verify
print("\nVerifying...")
r3 = session.get(f"{BASE}?-action=edit&-table=inquiries&inquiry_id={INQUIRY_ID}")
html3 = r3.text
items = re.findall(r'name="lines\[\d+\]\[item_id\]"[^>]*value="(\d*)"', html3)
print(f"Lines found: {len(items)}")
for i, val in enumerate(items):
    print(f"  line[{i}]: item_id={val}")
