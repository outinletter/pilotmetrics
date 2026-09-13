"""Download and inspect the official NTSB aviation census export.

The CAROL API can return HTTP 500 or a 500-row cap. This adapter uses the
official bulk file, keeps the ZIP and manifest, and never writes to D1 itself.
"""
import argparse, hashlib, json, zipfile
from pathlib import Path
import requests

URL = 'https://data.ntsb.gov/avdata/FileDirectory/DownloadFile?fileID=C%3A%5Cavdata%5Cavall.zip'

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--output', default='work/ntsb-bulk')
    args = p.parse_args()
    root = Path(args.output); root.mkdir(parents=True, exist_ok=True)
    archive = root / 'avall.zip'
    if not archive.exists():
        with requests.get(URL, headers={'User-Agent':'PilotMetrics/1.0 (research)'}, stream=True, timeout=120) as r:
            r.raise_for_status()
            with archive.open('wb') as f:
                for chunk in r.iter_content(1024 * 1024):
                    if chunk: f.write(chunk)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    with zipfile.ZipFile(archive) as z:
        entries = [{'name': n, 'size': z.getinfo(n).file_size} for n in z.namelist()]
    manifest = {'source_url': URL, 'archive': str(archive), 'sha256': digest, 'entries': entries}
    (root / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False))

if __name__ == '__main__': main()
