"""Find CAT sections and extract all data from EASA ASR Appendix 1"""
import pdfplumber, re

dest = "easa_app1_2024.pdf"

with pdfplumber.open(dest) as pdf:
    print(f"Total pages: {len(pdf.pages)}")
    # Print ALL page text to find CAT sections
    for i, page in enumerate(pdf.pages[:10]):
        text = page.extract_text() or ""
        print(f"\n=== PAGE {i+1} ===")
        print(text[:1000])
        print("---")
