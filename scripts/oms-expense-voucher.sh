#!/usr/bin/env bash
# OMS Expense Voucher Flow
# Requires: curl, jq (optional)
#
# Usage:
#   ./oms-expense-voucher.sh new <json-file>      # Create new voucher
#   ./oms-expense-voucher.sh edit <id> <field>=<value>  # Edit voucher field
#   ./oms-expense-voucher.sh add-line <id> <json-file>   # Add expense line
#
# Examples:
#   ./oms-expense-voucher.sh new voucher.json
#   ./oms-expense-voucher.sh edit 6129 description="Color prints for noticeboard"
#   ./oms-expense-voucher.sh add-line 6129 line.json

set -euo pipefail

: "${OMS_USERNAME:?OMS_USERNAME env var must be set}"
: "${OMS_PASSWORD:?OMS_PASSWORD env var must be set}"

BASE="https://oms.primesandzooms.com/pnz_internal"
COOKIE_FILE=$(mktemp /tmp/oms_cookies.XXXXXX)
trap 'rm -f "$COOKIE_FILE"' EXIT

die() { echo "Error: $*" >&2; exit 1; }

login() {
  curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
    -X POST "$BASE/index.php" \
    -d "-action=login&-redirect=&UserName=${OMS_USERNAME}&Password=${OMS_PASSWORD}&-submit=Submit" \
    -o /dev/null
  echo "Logged in"
}

# ----- CREATE NEW VOUCHER -----
create_new_voucher() {
  local data_file="$1"
  test -f "$data_file" || die "File not found: $data_file"

  login

  echo "Fetching new record form..."
  local form_html
  form_html=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
    -G "$BASE/index.php" --data-urlencode "-action=new" --data-urlencode "-table=expense_vouchers")

  local csrf
  csrf=$(echo "$form_html" | grep -oP 'name="--form-session-key"\s+value="\K[^"]+') \
    || die "Could not extract CSRF token"

  local fields
  fields=$(cat "$data_file")

  local expense_date ledger_date employee_id charge_to_customer customer_id order_id default_expense_category description
  expense_date=$(echo "$fields" | jq -r '.expense_date // ""')
  ledger_date=$(echo "$fields" | jq -r '.ledger_date // ""')
  employee_id=$(echo "$fields" | jq -r '.employee_id // ""')
  charge_to_customer=$(echo "$fields" | jq -r '.charge_to_customer // "No"')
  customer_id=$(echo "$fields" | jq -r '.customer_id // ""')
  order_id=$(echo "$fields" | jq -r '.order_id // ""')
  default_expense_category=$(echo "$fields" | jq -r '.default_expense_category // ""')
  description=$(echo "$fields" | jq -r '.description // ""')

  echo "Submitting new expense voucher..."
  local result
  result=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
    -X POST "$BASE/index.php" \
    --data-urlencode "-table=expense_vouchers" \
    --data-urlencode "-action=new" \
    --data-urlencode "--form-session-key=$csrf" \
    --data-urlencode "--no-query=1" \
    --data-urlencode "_qf__new_expense_vouchers_record_form=1" \
    --data-urlencode "new_expense_vouchers_record_form=1" \
    --data-urlencode "expense_date=$expense_date" \
    --data-urlencode "ledger_date=$ledger_date" \
    --data-urlencode "employee_id=$employee_id" \
    --data-urlencode "charge_to_customer=$charge_to_customer" \
    --data-urlencode "customer_id=$customer_id" \
    --data-urlencode "order_id=$order_id" \
    --data-urlencode "default_expense_category=$default_expense_category" \
    --data-urlencode "description=$description" \
    --data-urlencode "lines[__loaded__]=1" \
    --data-urlencode "lines[0][__id__]=new" \
    -o /tmp/oms_new_result.html \
    -w "%{http_code}")

  echo "Result: HTTP $result"
  if grep -q 'expense_voucher_id=' /tmp/oms_new_result.html 2>/dev/null; then
    local vid
    vid=$(grep -oP 'expense_voucher_id=\K\d+' /tmp/oms_new_result.html | head -1)
    echo "Voucher created: ID=$vid"
  else
    echo "Response preview:"
    head -c 300 /tmp/oms_new_result.html
    echo
  fi
}

# ----- EDIT VOUCHER -----
edit_voucher() {
  local voucher_id="$1"
  local field="$2"
  local value="${field#*=}"
  local field_name="${field%%=*}"

  login

  echo "Fetching edit form for voucher $voucher_id..."
  local edit_html
  edit_html=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
    -G "$BASE/index.php" \
    --data-urlencode "-table=expense_vouchers" \
    --data-urlencode "-action=edit" \
    --data-urlencode "expense_voucher_id=$voucher_id")

  local csrf
  csrf=$(echo "$edit_html" | grep -oP 'name="--form-session-key"\s+value="\K[^"]+') \
    || die "Could not extract CSRF from edit form"

  local orig_action
  orig_action=$(echo "$edit_html" | grep -oP 'name="--original_action"[^>]*value="\K[^"]+' || echo "edit")

  echo "Submitting edit..."
  local result
  result=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
    -X POST "$BASE/index.php" \
    --data-urlencode "-table=expense_vouchers" \
    --data-urlencode "-action=edit" \
    --data-urlencode "expense_voucher_id=$voucher_id" \
    --data-urlencode "__keys__[expense_voucher_id]=$voucher_id" \
    --data-urlencode "--original_action=$orig_action" \
    --data-urlencode "--form-session-key=$csrf" \
    --data-urlencode "_qf__existing_expense_vouchers_record_form=1" \
    --data-urlencode "$field_name=$value" \
    -o /tmp/oms_edit_result.html \
    -w "%{http_code}")

  echo "Result: HTTP $result"
  if grep -q 'saved' /tmp/oms_edit_result.html 2>/dev/null; then
    echo "Voucher $voucher_id updated: $field_name = $value"
  else
    echo "Response:"
    head -c 300 /tmp/oms_edit_result.html
    echo
  fi
}

# ----- ADD EXPENSE LINE -----
add_expense_line() {
  local voucher_id="$1"
  local data_file="$2"
  test -f "$data_file" || die "File not found: $data_file"

  login

  local fields
  fields=$(cat "$data_file")
  local expense_type_id amount description trip_id bill_details
  expense_type_id=$(echo "$fields" | jq -r '.expense_type_id // "3"')
  amount=$(echo "$fields" | jq -r '.amount // ""')
  description=$(echo "$fields" | jq -r '.description // ""')
  trip_id=$(echo "$fields" | jq -r '.trip_id // ""')
  bill_details=$(echo "$fields" | jq -r '.bill_details // ""')

  echo "Adding expense line to voucher $voucher_id..."

  local result
  result=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" \
    -X POST "$BASE/index.php" \
    --data-urlencode "-table=expense_vouchers" \
    --data-urlencode "-relationship=expense_lines" \
    --data-urlencode "-action=new_related_record" \
    --data-urlencode "expense_voucher_id=$voucher_id" \
    --data-urlencode "__keys__[expense_voucher_id]=$voucher_id" \
    --data-urlencode "line_id=" \
    --data-urlencode "expense_type_id=$expense_type_id" \
    --data-urlencode "description=$description" \
    --data-urlencode "amount=$amount" \
    --data-urlencode "trip_id=$trip_id" \
    --data-urlencode "bill_details=$bill_details" \
    --data-urlencode "_qf__expense_vouchers_expense_lines=" \
    --data-urlencode "--original_action=new_related_record" \
    --data-urlencode "-Save=Save" \
    -o /tmp/oms_line_result.html \
    -w "%{http_code}")

  echo "Result: HTTP $result"
  if grep -q 'Record successfully saved' /tmp/oms_line_result.html 2>/dev/null; then
    echo "Expense line added to voucher $voucher_id"
  else
    echo "Response:"
    head -c 300 /tmp/oms_line_result.html
    echo
  fi
}

# ----- MAIN -----
main() {
  local action="${1:-}"
  shift || die "Usage: $0 {new|edit|add-line} [args...]"

  case "$action" in
    new)       create_new_voucher "$@" ;;
    edit)      edit_voucher "$@" ;;
    add-line)  add_expense_line "$@" ;;
    *)         die "Unknown action: $action. Use {new|edit|add-line}" ;;
  esac
}

main "$@"
