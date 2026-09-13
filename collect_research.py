"""Resumable official-source research collection; never uploads automatically.

uv run --with requests --with beautifulsoup4 python collect_research.py --help
"""
import argparse
import calendar
import hashlib
import io
import json
import re
import sqlite3
import time
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit

import requests
from bs4 import BeautifulSoup

VERSION = '1.0.0'
COMMERCIAL_PARTS = {'121', '129'}
JET_TERMS = re.compile(r'\b(?:airbus|boeing|embraer|bombardier|comac|737|747|757|767|777|787|a3[0-9]{2}|e1[0-9]{2}|crj|erj|md-?\d+)\b', re.I)
JTSB = 'https://jtsb.mlit.go.jp/jtsb/aircraft/air-kensaku-list.php'
ARAIB = 'https://araib.molit.go.kr/USR/BORD0201/m_34591/LST.jsp'
ARAIB_KO = 'https://araib.molit.go.kr/USR/airboard0201/m_34497/lst.jsp'
NTSB = 'https://data.ntsb.gov/carol-main-public/api/Query/FileExport'


def iso_date(value):
    text = re.sub(r'\s+', '', str(value or ''))
    match = re.search(r'(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})', text)
    if match:
        try:
            return date(*map(int, match.groups())).isoformat()
        except ValueError:
            pass
    return None


def record(source, identity, url, raw, **values):
    return dict(source=source, source_record_id=str(identity), source_url=url,
                event_date=None, published_date=None, occurrence_country=None,
                investigation_authority_country={'jtsb': 'JP', 'araib': 'KR', 'araib-ko': 'KR', 'ntsb': 'US'}[source],
                record_status='metadata_only', raw=raw, **values)


def commercial_jet_eligibility(item):
    parts = {str(v).strip() for v in item.get('regulation_parts', [])}
    aircraft = str(item.get('aircraft_type') or '')
    if parts & COMMERCIAL_PARTS and JET_TERMS.search(aircraft):
        return True, 'commercial_part_and_jet_type'
    if JET_TERMS.search(aircraft):
        return True, 'jet_type_evidence_without_operation_part'
    return False, 'no_jet_type_evidence'


def parse_jtsb(html, url):
    soup = BeautifulSoup(html, 'html.parser')
    records = []
    for row in soup.select('tr'):
        link = row.select_one('a[href*="detail.php?id="]')
        if not link:
            continue
        cells = row.find_all('td', recursive=False)
        if len(cells) != 6:
            raise ValueError('JTSB table layout changed')
        texts = [c.get_text(' ', strip=True) for c in cells]
        event_date = iso_date(texts[0])
        if not event_date:
            raise ValueError('JTSB occurrence date missing')
        detail = urljoin(url, link['href'])
        identity = parse_qs(urlsplit(detail).query)['id'][0]
        aircraft = list(cells[2].stripped_strings)
        operator_copy = BeautifulSoup(str(cells[3]), 'html.parser')
        for div in operator_copy.select('.houjinNo'):
            div.decompose()
        item = record('jtsb', identity, detail, {'row_html': str(row), 'columns': texts})
        item.update(event_date=event_date, published_date=iso_date(texts[5]),
                    registration=aircraft[0] if aircraft else None,
                    aircraft_type=' '.join(aircraft[1:]) or None,
                    operator=operator_copy.get_text(' ', strip=True) or None,
                    location=texts[1] or None, summary=texts[4],
                    event_type='Serious incident' if '重大インシデント' in texts[4] else 'Accident' if '事故' in texts[4] else None,
                    report_urls=[urljoin(url, a['href']) for a in cells[5].select('a[href]')],
                    field_evidence={key: {'source_url': url, 'column': i, 'method': 'official_table'}
                                    for key, i in [('event_date', 0), ('location', 1), ('registration', 2),
                                                   ('aircraft_type', 2), ('operator', 3), ('event_type', 4), ('published_date', 5)]})
        item['commercial_jet_eligible'], item['eligibility_reason'] = commercial_jet_eligibility(item)
        records.append(item)
    if not records:
        raise ValueError('No JTSB records parsed; do not mark coverage complete')
    next_url = None
    current = int(parse_qs(urlsplit(url).query).get('page', ['1'])[0])
    for a in soup.select('a[href]'):
        candidate = urljoin(url, a['href'])
        page = parse_qs(urlsplit(candidate).query).get('page', ['0'])[0]
        if page.isdigit() and int(page) == current + 1 and urlsplit(candidate).path == urlsplit(url).path:
            # JTSB pagination relies on search cookies. Also preserve explicit filters.
            params = {k: v[-1] for k, v in parse_qs(urlsplit(url).query).items()}
            params['page'] = page
            next_url = JTSB + '?' + urlencode(params)
            break
    return records, next_url


def parse_araib_list(html, url):
    soup = BeautifulSoup(html, 'html.parser')
    jobs = []
    for row in soup.select('tr'):
        link = row.select_one('td.tl a[href*="DTL.jsp"]')
        if link:
            detail = urljoin(url, link['href'])
            query = parse_qs(urlsplit(detail).query)
            if not query.get('idx') or not query.get('id'):
                raise ValueError('ARAIB report identity missing')
            jobs.append(ARAIB.replace('LST.jsp', 'DTL.jsp') + '?' + urlencode({
                'id': query['id'][0], 'mode': 'view', 'idx': query['idx'][0]}))
    if not jobs:
        raise ValueError('No ARAIB report links; layout or access failure')
    current = int(parse_qs(urlsplit(url).query).get('lcmspage', ['1'])[0])
    next_url = None
    for a in soup.select('a[href*="LST.jsp"]'):
        candidate = urljoin(url, a['href'].strip())
        page = parse_qs(urlsplit(candidate).query).get('lcmspage', ['0'])[0]
        if page.isdigit() and int(page) == current + 1:
            next_url = candidate
            break
    return jobs, next_url


def parse_araib_detail(html, url):
    soup = BeautifulSoup(html, 'html.parser')
    text = soup.get_text(' ', strip=True)
    rows = [r.get_text(' ', strip=True) for r in soup.select('tr')]
    titles = [r for r in rows if r.startswith('Title ')]
    if not titles:
        raise ValueError('ARAIB detail redirected to list or layout changed')
    identity = parse_qs(urlsplit(url).query)['idx'][0]
    event_date = None
    match = re.search(r'Accident date\s*:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})', text, re.I)
    if match:
        try:
            event_date = datetime.strptime(match[1].replace(',', ''), '%B %d %Y').date().isoformat()
        except ValueError:
            pass
    published = next((iso_date(r.split('Date', 1)[1]) for r in rows if 'Writer' in r and 'Date' in r), None)
    canonical = ARAIB.replace('LST.jsp', 'DTL.jsp') + '?' + urlencode({'id': 'eaib0401', 'mode': 'view', 'idx': identity})
    item = record('araib', identity, canonical, {'rows': rows, 'detail_html': str(soup.select_one('table'))})
    item.update(event_date=event_date, published_date=published, summary=titles[0][6:],
                registration=(re.search(r'\bHL\d{4}\b', text) or [None])[0],
                report_urls=[urljoin(url, a['href']) for a in soup.select('a[href]')
                             if re.search(r'\.pdf|download|Download', a['href'])],
                record_status='metadata_only' if event_date else 'needs_date_review',
                field_evidence={'event_date': {'source_url': url, 'quote': match[0] if match else None,
                                              'method': 'explicit_label' if event_date else 'unknown'},
                                'published_date': {'source_url': url, 'method': 'board_date'}})
    item['commercial_jet_eligible'], item['eligibility_reason'] = commercial_jet_eligibility(item)
    return item


def parse_araib_ko(html, url):
    soup = BeautifulSoup(html, 'html.parser')
    records = []
    for row in soup.select('tr'):
        link = row.select_one('a[href^="javascript:dtl"]')
        if not link:
            continue
        match = re.search(r"dtl\('([0-9]+)'\)", link['href'])
        cells = row.find_all('td', recursive=False)
        if not match or len(cells) != 8:
            raise ValueError('ARAIB Korean table layout changed')
        texts = [c.get_text(' ', strip=True) for c in cells]
        if not iso_date(texts[1]):
            raise ValueError('ARAIB Korean occurrence date missing')
        identity = match[1]
        item = record('araib-ko', identity, ARAIB_KO.replace('lst.jsp', 'dtl.jsp') + '?r_id=' + identity,
                      {'columns': texts, 'row_html': str(row)})
        item.update(event_date=iso_date(texts[1]), published_date=iso_date(texts[2]),
                    event_type='Serious incident' if '준사고' in texts[3] else 'Accident' if '사고' in texts[3] else None,
                    event_type_original=texts[3], operator=texts[4] or None, aircraft_type=texts[5] or None,
                    registration=texts[6] if texts[6] not in ('', '해당 없음') else None,
                    location=texts[7] or None, summary=' / '.join(texts[3:]),
                    field_evidence={key: {'source_url': url, 'column': i, 'method': 'official_table'}
                                   for key, i in [('event_date', 1), ('published_date', 2), ('event_type', 3),
                                                   ('operator', 4), ('aircraft_type', 5), ('registration', 6), ('location', 7)]})
        item['commercial_jet_eligible'], item['eligibility_reason'] = commercial_jet_eligibility(item)
        records.append(item)
    if not records:
        raise ValueError('No ARAIB Korean records; do not mark coverage complete')
    current = int(parse_qs(urlsplit(url).query).get('lcmspage', ['1'])[0])
    next_url = None
    for a in soup.select('a[href*="lst.jsp"]'):
        candidate = urljoin(url, a['href'].strip())
        page = parse_qs(urlsplit(candidate).query).get('lcmspage', ['0'])[0]
        if page.isdigit() and int(page) == current + 1:
            next_url = candidate
            break
    return records, next_url


def ntsb_payload(start, end):
    rules = []
    for column, value, operator in [('EventDate', start, 'is on or after'), ('EventDate', end, 'is on or before'), ('Mode', 'Aviation', 'is')]:
        rules.append({'RuleType': 'Simple', 'Values': [value], 'Columns': ['Event.' + column], 'Operator': operator, 'overrideColumn': '',
                      'selectedOption': {'FieldName': column, 'DisplayText': column, 'Columns': ['Event.' + column],
                                         'Selectable': True, 'InputType': 'Date' if column == 'EventDate' else 'Dropdown',
                                         'RuleType': 0, 'Options': None, 'TargetCollection': 'cases', 'UnderDevelopment': True}})
    return {'QueryGroups': [{'QueryRules': rules, 'AndOr': 'and', 'inLastSearch': False, 'editedSinceLastSearch': False}], 'AndOr': 'and',
            'TargetCollection': 'cases', 'ExportFormat': 'data', 'SessionId': 227230, 'ResultSetSize': 500, 'SortDescending': True}


def parse_ntsb(case):
    identity = case.get('cm_ntsbNum') or case.get('cm_NtsbNo')
    event_date = iso_date(case.get('cm_eventDate'))
    if not identity or not event_date:
        raise ValueError('NTSB identity/date missing')
    vehicles = case.get('cm_vehicles') or []
    first = vehicles[0] if vehicles else {}
    item = record('ntsb', identity, 'https://data.ntsb.gov/carol-main-public/query-builder?search=' + str(identity), case)
    item.update(event_date=event_date, occurrence_country=case.get('cm_country') or None,
                location=case.get('cm_city') or None, event_type=case.get('cm_eventType') or case.get('cm_event_type'),
                aircraft_type=' '.join(str(first.get(k) or '') for k in ('cm_make', 'cm_model')).strip() or None,
                operator=first.get('operatorName') or None, aircraft=vehicles,
                regulation_parts=sorted({str(v.get('regulationFlightConductedUnder') or '').strip() for v in vehicles if str(v.get('regulationFlightConductedUnder') or '').strip()}),
                highest_injury=case.get('cm_highestInjury') or case.get('cm_highest_injury'),
                field_evidence={'event_date': {'source_url': NTSB, 'path': 'cm_eventDate', 'method': 'official_export'},
                                'aircraft': {'source_url': NTSB, 'path': 'cm_vehicles', 'method': 'official_export'}})
    item['commercial_jet_eligible'], item['eligibility_reason'] = commercial_jet_eligibility(item)
    return item


class Collector:
    def __init__(self, state, max_seconds=120, delay=1, commercial_jet_only=True):
        self.root = Path(state)
        self.root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.root / 'checkpoint.sqlite')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS jobs (key TEXT PRIMARY KEY, source TEXT, payload TEXT,
            status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, next_attempt REAL DEFAULT 0, error TEXT);
          CREATE TABLE IF NOT EXISTS records (source TEXT, id TEXT, data TEXT, PRIMARY KEY(source,id));
          CREATE TABLE IF NOT EXISTS pages (sha TEXT PRIMARY KEY, job_key TEXT);
        ''')
        self.session = requests.Session()
        self.session.headers['User-Agent'] = 'PilotMetrics/1.0 (aviation research)'
        self.deadline = time.monotonic() + max_seconds
        self.delay = delay
        self.commercial_jet_only = commercial_jet_only

    def enqueue(self, source, payload):
        key = source + ':' + json.dumps(payload, sort_keys=True)
        self.db.execute('INSERT OR IGNORE INTO jobs(key,source,payload) VALUES(?,?,?)',
                        (key, source, json.dumps(payload)))

    def request(self, url, payload=None):
        remaining = self.deadline - time.monotonic()
        if remaining <= 1:
            raise TimeoutError('Run budget exhausted; resume next run')
        response = self.session.request('POST' if payload else 'GET', url, json=payload,
                                        timeout=min(30, remaining))
        response.raise_for_status()
        digest = hashlib.sha256(response.content).hexdigest()
        (self.root / (digest + '.raw')).write_bytes(response.content)
        response.encoding = response.apparent_encoding if 'charset' not in response.headers.get('Content-Type', '') else response.encoding
        return response, digest

    def save(self, item, digest):
        item.update(content_sha256=digest, parser_version=VERSION,
                    retrieved_at=datetime.now(timezone.utc).isoformat())
        self.db.execute('INSERT INTO records VALUES(?,?,?) ON CONFLICT(source,id) DO UPDATE SET data=excluded.data',
                        (item['source'], item['source_record_id'], json.dumps(item, ensure_ascii=False)))

    def run(self, max_jobs, start, end):
        done = 0
        while done < max_jobs and time.monotonic() < self.deadline - 1:
            row = self.db.execute("SELECT key,source,payload,attempts FROM jobs WHERE status='pending' AND next_attempt<=? ORDER BY rowid LIMIT 1", (time.time(),)).fetchone()
            if not row:
                break
            key, source, payload, attempts = row
            job = json.loads(payload)
            try:
                with self.db:
                    if source == 'ntsb':
                        response, digest = self.request(NTSB, ntsb_payload(job['start'], job['end']))
                        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
                            cases = json.loads(archive.read(next(n for n in archive.namelist() if n.endswith('.json'))))
                        if not isinstance(cases, list):
                            raise ValueError('NTSB export must contain a list')
                        if len(cases) >= 500:
                            left, right = date.fromisoformat(job['start']), date.fromisoformat(job['end'])
                            if left == right:
                                raise ValueError('Single day at export cap; needs bulk download')
                            mid = left + (right - left) // 2
                            self.enqueue(source, {'start': left.isoformat(), 'end': mid.isoformat()})
                            self.enqueue(source, {'start': (mid + timedelta(days=1)).isoformat(), 'end': right.isoformat()})
                            items = []
                        else:
                            items = [parse_ntsb(case) for case in cases]
                            if any(not job['start'] <= item['event_date'] <= job['end'] for item in items):
                                raise ValueError('NTSB ignored date filter')
                    else:
                        response, digest = self.request(job['url'])
                        items = []
                        if job['kind'] == 'detail':
                            items = [parse_araib_detail(response.text, job['url'])]
                        else:
                            previous = self.db.execute('SELECT job_key FROM pages WHERE sha=?', (digest,)).fetchone()
                            if previous and previous[0] != key:
                                raise ValueError('Repeated page: pagination ignored; coverage not complete')
                            self.db.execute('INSERT OR IGNORE INTO pages VALUES(?,?)', (digest, key))
                            if source == 'jtsb':
                                items, next_url = parse_jtsb(response.text, job['url'])
                            elif source == 'araib-ko':
                                items, next_url = parse_araib_ko(response.text, job['url'])
                            else:
                                details, next_url = parse_araib_list(response.text, job['url'])
                                fingerprint = source + ':' + hashlib.sha256(json.dumps(sorted(details)).encode()).hexdigest()
                                seen = self.db.execute('SELECT job_key FROM pages WHERE sha=?', (fingerprint,)).fetchone()
                                if seen and seen[0] != key:
                                    raise ValueError('Repeated ARAIB report IDs; pagination failure')
                                self.db.execute('INSERT OR IGNORE INTO pages VALUES(?,?)', (fingerprint, key))
                                for url in details:
                                    self.enqueue(source, {'kind': 'detail', 'url': url})
                            if next_url:
                                self.enqueue(source, {'kind': 'list', 'url': next_url})
                            if items:
                                fingerprint = source + ':' + hashlib.sha256(json.dumps(sorted(i['source_record_id'] for i in items)).encode()).hexdigest()
                                seen = self.db.execute('SELECT job_key FROM pages WHERE sha=?', (fingerprint,)).fetchone()
                                if seen and seen[0] != key:
                                    raise ValueError('Repeated record IDs on another page; pagination failure')
                                self.db.execute('INSERT OR IGNORE INTO pages VALUES(?,?)', (fingerprint, key))
                    for item in items:
                        if self.commercial_jet_only and not item.get('commercial_jet_eligible', False):
                            continue
                        if item['event_date'] is None or start <= item['event_date'] <= end:
                            self.save(item, digest)
                    self.db.execute("UPDATE jobs SET status='complete',attempts=attempts+1,error=NULL WHERE key=?", (key,))
                print(json.dumps({'source': source, 'status': 'complete', 'records': len(items)}, ensure_ascii=True), flush=True)
            except Exception as error:
                status = 'blocked' if isinstance(error, requests.HTTPError) and error.response.status_code in (401, 403) else 'failed' if attempts >= 4 else 'pending'
                delay = min(3600, 30 * 2 ** attempts)
                if isinstance(error, requests.HTTPError) and error.response.status_code == 429:
                    retry = error.response.headers.get('Retry-After', '')
                    if retry.isdigit():
                        delay = max(delay, int(retry))
                with self.db:
                    self.db.execute('UPDATE jobs SET status=?,attempts=attempts+1,next_attempt=?,error=? WHERE key=?',
                                    (status, time.time() + delay, str(error)[:500], key))
                print(json.dumps({'source': source, 'status': status, 'error': str(error)[:250]}), flush=True)
            done += 1
            time.sleep(max(0, min(self.delay, self.deadline - time.monotonic())))
        return dict(self.db.execute('SELECT status,COUNT(*) FROM jobs GROUP BY status').fetchall())

    def export(self, folder):
        folder = Path(folder)
        folder.mkdir(parents=True, exist_ok=True)
        def quote(value):
            return 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"
        columns = ['source', 'source_record_id', 'source_url', 'event_date', 'published_date',
                   'investigation_authority_country', 'occurrence_country', 'record_status',
                   'normalized_json', 'raw_json', 'content_sha256', 'parser_version', 'retrieved_at']
        count = 0
        with (folder / 'research-records.jsonl').open('w', encoding='utf-8') as out, (folder / 'research-records.sql').open('w', encoding='utf-8') as sql:
            for (data,) in self.db.execute('SELECT data FROM records ORDER BY source,id'):
                out.write(data + '\n')
                item = json.loads(data)
                item['raw_json'] = json.dumps(item.pop('raw'), ensure_ascii=False)
                item['normalized_json'] = json.dumps({k: v for k, v in item.items() if k != 'raw_json'}, ensure_ascii=False)
                sql.write('INSERT INTO research_source_records (' + ','.join(columns) + ') VALUES (' + ','.join(quote(item.get(c)) for c in columns) + ') ON CONFLICT(source,source_record_id) DO UPDATE SET ' + ','.join(c + '=excluded.' + c for c in columns[2:]) + ';\n')
                count += 1
        return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', choices=['jtsb', 'araib', 'araib-ko', 'ntsb', 'all'], default='all')
    parser.add_argument('--start', default='2000-01-01')
    parser.add_argument('--end', default=date.today().isoformat())
    parser.add_argument('--state', default='work/research')
    parser.add_argument('--output', default='work/research/export')
    parser.add_argument('--max-jobs', type=int, default=10)
    parser.add_argument('--max-seconds', type=int, default=120)
    parser.add_argument('--export-only', action='store_true')
    parser.add_argument('--include-non-commercial', action='store_true', help='Disable commercial jet qualification filter')
    args = parser.parse_args()
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    if start < date(2000, 1, 1) or end < start or end > date.today():
        parser.error('Require 2000-01-01 <= start <= end <= today')
    if args.max_jobs < 1 or args.max_seconds < 1:
        parser.error('Budgets must be positive')
    collector = Collector(args.state, args.max_seconds, commercial_jet_only=not args.include_non_commercial)
    # Separate state by date interval: old completion markers must not hide backfills.
    scope = collector.root / 'scope.json'
    expected = {'start': args.start, 'end': args.end, 'parser_version': VERSION}
    if scope.exists() and json.loads(scope.read_text()) != expected:
        parser.error('State belongs to another date range/version; use another --state directory')
    scope.write_text(json.dumps(expected), encoding='utf-8')
    if not args.export_only:
        with collector.db:
            for source in (['jtsb', 'araib', 'araib-ko', 'ntsb'] if args.source == 'all' else [args.source]):
                if source == 'ntsb':
                    current = start
                    while current <= end:
                        last = min(end, date(current.year, current.month, calendar.monthrange(current.year, current.month)[1]))
                        collector.enqueue(source, {'start': current.isoformat(), 'end': last.isoformat()})
                        current = last + timedelta(days=1)
                else:
                    url = JTSB + '?' + urlencode({'init': 1, 'occ_year_from': start.year, 'occ_month_from': start.month,
                                                  'occ_year_to': end.year, 'occ_month_to': end.month, 'page': 1}) if source == 'jtsb' else ARAIB + '?id=eaib0401&lcmspage=1'
                    if source == 'araib-ko':
                        url = ARAIB_KO + '?psize=50&lcmspage=1'
                    collector.enqueue(source, {'kind': 'list', 'url': url})
        print(json.dumps({'jobs': collector.run(args.max_jobs, args.start, args.end)}))
    print(json.dumps({'exported': collector.export(args.output), 'output': args.output}))


if __name__ == '__main__':
    main()
