import requests
import json
import time
import zipfile
import io
import re

# Config
NTSB_CAROL_URL = "https://data.ntsb.gov/carol-main-public/api/Query/FileExport"
INGEST_URL = "https://pilot-briefing.outinletter.workers.dev/api/ops-intel/ingest-events"

def get_carol_payload(country_name):
    # Field definitions based on CAROL API
    country_option = {
        "FieldName": "Country",
        "DisplayText": "Country",
        "Columns": ["Event.Country"],
        "Selectable": True,
        "InputType": "Dropdown",
        "RuleType": 0,
        "TargetCollection": "cases"
    }
    mode_option = {
        "FieldName": "Mode",
        "DisplayText": "Investigation mode",
        "Columns": ["Event.Mode"],
        "Selectable": True,
        "InputType": "Dropdown",
        "RuleType": 0,
        "TargetCollection": "cases"
    }
    
    return {
        "QueryGroups": [{
            "QueryRules": [
                {
                    "RuleType": "Simple",
                    "Values": [country_name],
                    "Columns": ["Event.Country"],
                    "Operator": "is",
                    "selectedOption": country_option
                },
                {
                    "RuleType": "Simple",
                    "Values": ["Aviation"],
                    "Columns": ["Event.Mode"],
                    "Operator": "is",
                    "selectedOption": mode_option
                }
            ],
            "AndOr": "and"
        }],
        "AndOr": "and",
        "TargetCollection": "cases",
        "ExportFormat": "data",
        "ResultSetSize": 1000,
        "SortDescending": True
    }

def collect_ntsb_pro():
    countries = ["Korea, Republic of", "Japan"]
    print(f"?? Starting NTSB CAROL Professional Harvester (Pro-grade Ingestion)...")
    
    for country in countries:
        print(f"\n[?] Querying NTSB for {country}...")
        payload = get_carol_payload(country)
        
        try:
            res = requests.post(NTSB_CAROL_URL, json=payload, timeout=60)
            if not res.ok:
                print(f"  [!] HTTP {res.status_code}")
                continue
                
            # Response is a ZIP file
            with zipfile.ZipFile(io.BytesIO(res.content)) as z:
                json_filename = next((f for f in z.namelist() if f.endswith(".json")), None)
                if not json_filename:
                    print("  [!] No JSON found in ZIP response")
                    continue
                    
                with z.open(json_filename) as f:
                    data = json.load(f)
                    
            print(f"  [+] Found {len(data)} records. Processing and uploading...")
            
            # Format for PilotBriefing ingest
            records = []
            for c in data:
                ntsb_num = c.get("cm_ntsbNum") or c.get("cm_NtsbNo")
                if not ntsb_num: continue
                
                date_raw = str(c.get("cm_eventDate", ""))
                date_iso = date_raw[:10]
                
                vehicles = c.get("cm_vehicles", [])
                # Filter for commercial aviation if possible, or take all as high-quality candidates
                is_commercial = False
                parts = ["121", "135", "129", "125"]
                for v in vehicles:
                    reg = str(v.get("regulationFlightConductedUnder", ""))
                    if any(p in reg for p in parts):
                        is_commercial = True
                        break
                
                # Narrative construction
                highest_injury = str(c.get("cm_highest_injury", "")).upper()
                city = c.get("cm_city", "")
                summary = f"NTSB case {ntsb_num} in {city}, {country}. Highest Injury: {highest_injury}."
                
                # Try to get factual summary if available
                # In CAROL data export, narratives are sometimes in sub-fields
                # For now, use basic info and tags
                
                ac_type = ""
                operator = ""
                if vehicles:
                    v = vehicles[0]
                    ac_type = f"{v.get('cm_make', '')} {v.get('cm_model', '')}".strip()
                    operator = v.get("operatorName", "") or v.get("registeredOwner", "")

                records.append({
                    "id": f"NTSB-{ntsb_num}",
                    "source_name": "NTSB CAROL",
                    "source_url": f"https://data.ntsb.gov/carol-main-public/query-builder?search={ntsb_num}",
                    "event_date": date_iso,
                    "summary": summary,
                    "aircraft_type": ac_type,
                    "operator": operator,
                    "severity": 4 if "FATAL" in highest_injury else 3,
                    "tags": ["NTSB", country.split(",")[0].upper(), "OFFICIAL_REPORT"] + (["COMMERCIAL"] if is_commercial else []),
                    "event_type": "Accident" if "Accident" in str(c.get("cm_event_type", "")) else "Incident"
                })
                
            # Upload in batches
            if records:
                batch_size = 50
                for i in range(0, len(records), batch_size):
                    batch = records[i:i+batch_size]
                    up_res = requests.post(INGEST_URL, json={"records": batch}, timeout=60)
                    if up_res.ok:
                        new_count = up_res.json().get("created", 0)
                        print(f"    - Uploaded batch {i//batch_size + 1}: {len(batch)} items (New: {new_count})")
                    else:
                        print(f"    - Upload failed for batch {i//batch_size + 1}: HTTP {up_res.status_code}")
                        
        except Exception as e:
            print(f"  [!] Error processing {country}: {e}")

if __name__ == "__main__":
    collect_ntsb_pro()
