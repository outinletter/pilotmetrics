import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('collector', ROOT / 'collect_research.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

JTSB = '''<table><tr><td><a href="/jtsb/aircraft/detail.php?id=42">2022年<br>03月07日</a></td>
<td>airport</td><td>JA001<br>Model</td><td>Operator<div class="houjinNo">123456</div></td>
<td>重大インシデント<br>Runway</td><td>2023年07月27日<a href="/report.pdf">PDF</a></td></tr></table>
<a href="?page=2">next</a>'''
ARAIB = '''<table><tr><td>Title Helicopter crash</td></tr>
<tr><td>Writer webmaster Date 2025.12.15</td></tr>
<tr><td>Accident date: November 27, 2022</td></tr></table>'''


class ResearchTests(unittest.TestCase):
    def test_invalid_and_unknown_dates(self):
        self.assertIsNone(m.iso_date('2025-02-30'))
        self.assertIsNone(m.iso_date('2025'))
        self.assertEqual(m.iso_date('2024年 02月29日'), '2024-02-29')

    def test_jtsb_columns_pagination_and_identity(self):
        records, next_url = m.parse_jtsb(JTSB, m.JTSB + '?occ_year_from=2000&page=1')
        r = records[0]
        self.assertEqual((r['source_record_id'], r['event_date'], r['published_date']), ('42', '2022-03-07', '2023-07-27'))
        self.assertEqual(r['operator'], 'Operator')
        self.assertEqual(r['event_type'], 'Serious incident')
        self.assertIsNone(r['occurrence_country'])
        self.assertIn('occ_year_from=2000', next_url)
        self.assertIn('page=2', next_url)

    def test_layout_failure_is_not_empty_success(self):
        with self.assertRaises(ValueError):
            m.parse_jtsb('<html>Access denied</html>', m.JTSB)
        with self.assertRaises(ValueError):
            m.parse_araib_list('<html>Maintenance</html>', m.ARAIB)

    def test_araib_does_not_use_publication_as_occurrence(self):
        url = m.ARAIB.replace('LST', 'DTL') + '?id=eaib0401&mode=view&idx=123'
        r = m.parse_araib_detail(ARAIB, url)
        self.assertEqual(r['event_date'], '2022-11-27')
        self.assertEqual(r['published_date'], '2025-12-15')
        unknown = m.parse_araib_detail(ARAIB.replace('Accident date:', 'Unknown:'), url)
        self.assertIsNone(unknown['event_date'])
        self.assertEqual(unknown['record_status'], 'needs_date_review')

    def test_araib_page_variants_share_one_detail_job_identity(self):
        def html(page):
            return f'<table><tr><td class="tl"><a href="./DTL.jsp?id=eaib0401&mode=view&idx=42&lcmspage={page}">Report</a></td></tr></table>'
        first, _ = m.parse_araib_list(html(6), m.ARAIB)
        later, _ = m.parse_araib_list(html(6158), m.ARAIB)
        self.assertEqual(first, later)
        self.assertNotIn('lcmspage', first[0])

    def test_ntsb_all_aircraft_and_raw_parameters_retained(self):
        case = {'cm_ntsbNum': 'N1', 'cm_eventDate': '2000-01-02T12:45:00',
                'custom_parameter': 0, 'cm_vehicles': [{'regulationFlightConductedUnder': '91'}, {'cm_model': 'B'}]}
        r = m.parse_ntsb(case)
        self.assertEqual(len(r['aircraft']), 2)
        self.assertEqual(r['raw']['custom_parameter'], 0)

    def test_commercial_jet_qualification_requires_part_and_jet_evidence(self):
        jet = m.parse_ntsb({'cm_ntsbNum': 'J1', 'cm_eventDate': '2000-01-02', 'cm_vehicles': [{'regulationFlightConductedUnder': '121', 'cm_make': 'Boeing', 'cm_model': '737'}]})
        turboprop = m.parse_ntsb({'cm_ntsbNum': 'T1', 'cm_eventDate': '2000-01-02', 'cm_vehicles': [{'regulationFlightConductedUnder': '121', 'cm_make': 'ATR', 'cm_model': '72'}]})
        ga_jet = m.parse_ntsb({'cm_ntsbNum': 'G1', 'cm_eventDate': '2000-01-02', 'cm_vehicles': [{'regulationFlightConductedUnder': '91', 'cm_make': 'Boeing', 'cm_model': '737'}]})
        self.assertTrue(jet['commercial_jet_eligible'])
        self.assertFalse(turboprop['commercial_jet_eligible'])
        self.assertTrue(ga_jet['commercial_jet_eligible'])
        self.assertEqual(ga_jet['eligibility_reason'], 'jet_type_evidence_without_operation_part')

    def test_korean_catalogue_has_independent_dates_and_namespace(self):
        html = '''<table><tr><td>1</td><td><a href="javascript:dtl('352');">2024/09/16</a></td>
        <td>2025/10/02</td><td>항공기 준사고</td><td>Operator</td><td>C172S</td><td>HL1155</td><td>Airport</td></tr></table>'''
        records, next_url = m.parse_araib_ko(html, m.ARAIB_KO)
        self.assertEqual(records[0]['event_date'], '2024-09-16')
        self.assertEqual(records[0]['source'], 'araib-ko')
        self.assertEqual(records[0]['event_type'], 'Serious incident')
        self.assertIsNone(next_url)

    def test_ntsb_capped_export_splits_without_claiming_records(self):
        import io
        import zipfile
        from types import SimpleNamespace
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr('cases.json', json.dumps([{}] * 500))
        with tempfile.TemporaryDirectory() as d:
            c = m.Collector(d, delay=0)
            with c.db:
                c.enqueue('ntsb', {'start': '2000-01-01', 'end': '2000-01-31'})
            with patch.object(c, 'request', return_value=(SimpleNamespace(content=stream.getvalue()), 'hash')):
                c.run(1, '2000-01-01', '2000-01-31')
            children = [json.loads(row[0]) for row in c.db.execute("SELECT payload FROM jobs WHERE status='pending'")]
            self.assertEqual(children, [{'start': '2000-01-01', 'end': '2000-01-16'}, {'start': '2000-01-17', 'end': '2000-01-31'}])
            self.assertEqual(c.db.execute('SELECT COUNT(*) FROM records').fetchone()[0], 0)
            c.db.close()

    def test_checkpoint_export_idempotence_and_quotes(self):
        with tempfile.TemporaryDirectory() as d:
            c = m.Collector(d)
            r = m.parse_ntsb({'cm_ntsbNum': 'N1', 'cm_eventDate': '2000-01-01', 'cm_city': "O'Hare"})
            with c.db:
                c.save(r, 'hash')
                c.save(r, 'hash')
                c.enqueue('ntsb', {'start': '2000-01-01', 'end': '2000-01-01'})
                c.enqueue('ntsb', {'start': '2000-01-01', 'end': '2000-01-01'})
            self.assertEqual(c.db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0], 1)
            self.assertEqual(c.export(Path(d) / 'export'), 1)
            db = sqlite3.connect(':memory:')
            db.executescript((ROOT / 'worker/schema.sql').read_text())
            db.executescript((ROOT / 'worker/research_schema.sql').read_text())
            sql = (Path(d) / 'export/research-records.sql').read_text(encoding='utf-8')
            db.executescript(sql)
            db.executescript(sql)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM research_source_records').fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT json_extract(raw_json,'$.cm_city') FROM research_source_records").fetchone()[0], "O'Hare")
            db.close()
            c.db.close()

    def test_failed_job_survives_restart(self):
        with tempfile.TemporaryDirectory() as d:
            c = m.Collector(d, delay=0)
            with c.db:
                c.enqueue('ntsb', {'start': '2000-01-01', 'end': '2000-01-02'})
            with patch.object(c, 'request', side_effect=TimeoutError('temporary timeout')):
                c.run(1, '2000-01-01', '2000-01-02')
            c.db.close()
            resumed = m.Collector(d)
            self.assertEqual(resumed.db.execute('SELECT status,attempts FROM jobs').fetchone(), ('pending', 1))
            resumed.db.close()


if __name__ == '__main__':
    unittest.main()
