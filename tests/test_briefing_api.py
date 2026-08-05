from fastapi.testclient import TestClient

from src.main import app


def test_ke629_briefing_demo():
    client = TestClient(app)
    response = client.get("/api/briefing/KE629")
    assert response.status_code == 200
    data = response.json()
    assert data["flight_context"]["route"] == "ICN-DPS"
    assert data["flight_context"]["arrival_icao"] == "WADD"
    assert data["top_threats"]
    assert len(data["top_threats"]) <= 5
    assert data["top_threats"][0]["events"]
    event = data["top_threats"][0]["events"][0]
    assert event["category"]
    assert event["severity"] in {"Low", "Medium", "High", "Critical"}
    assert event["a350_b787_applicability"]
    assert event["recommended_action"]


def test_unknown_korean_air_flight_is_accepted():
    client = TestClient(app)
    response = client.get("/api/briefing/KAL9999")
    assert response.status_code == 200
    data = response.json()
    assert data["flight_context"]["flight_number"] == "KE9999"
    assert data["flight_context"]["route"] == "UNKNOWN-UNKNOWN"
    assert data["flight_context"]["flight_search_links"]


def test_ke081_uses_local_flight_route_database():
    client = TestClient(app)
    response = client.get("/api/briefing/KE081")
    assert response.status_code == 200
    data = response.json()
    assert data["flight_context"]["flight_number"] == "KE081"
    assert data["flight_context"]["route"] == "ICN-JFK"
    assert data["flight_context"]["arrival_icao"] == "KJFK"
