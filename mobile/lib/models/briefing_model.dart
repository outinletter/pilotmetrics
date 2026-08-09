class BriefingResponse {
  final FlightContext flightContext;
  final List<ThreatEvent> topThreats;
  final List<NotamThreat> notamThreats;

  BriefingResponse({
    required this.flightContext,
    required this.topThreats,
    required this.notamThreats,
  });

  factory BriefingResponse.fromJson(Map<String, dynamic> json) {
    return BriefingResponse(
      flightContext: FlightContext.fromJson(json['flight_context'] ?? {}),
      topThreats: (json['top_threats'] as List? ?? [])
          .map((e) => ThreatEvent.fromJson(e))
          .toList(),
      notamThreats: (json['notam_threats'] as List? ?? [])
          .map((e) => NotamThreat.fromJson(e))
          .toList(),
    );
  }
}

class FlightContext {
  final String flightNumber;
  final String route;
  final String aircraft;
  final String departureIcao;
  final String arrivalIcao;
  final String departureIata;
  final String arrivalIata;
  final int riskScore;
  final String riskLevel;
  final String riskSummary;
  final List<Map<String, dynamic>> riskBreakdown;
  final String arrivalWeatherBrief;
  final bool nightArrival;
  final int airportEventCount;
  final List<String> messages;
  final String metar;
  final String taf;
  final List<String> arrivalTags;
  final String? scheduledArrival;

  FlightContext({
    required this.flightNumber,
    required this.route,
    required this.aircraft,
    required this.departureIcao,
    required this.arrivalIcao,
    required this.departureIata,
    required this.arrivalIata,
    required this.riskScore,
    required this.riskLevel,
    required this.riskSummary,
    required this.riskBreakdown,  // List<{tag, score, label}>
    required this.arrivalWeatherBrief,
    required this.nightArrival,
    required this.airportEventCount,
    required this.messages,
    required this.metar,
    required this.taf,
    required this.arrivalTags,
    this.scheduledArrival,
  });

  factory FlightContext.fromJson(Map<String, dynamic> json) {
    return FlightContext(
      flightNumber: json['flight_number'] ?? '',
      route: json['route'] ?? '',
      aircraft: json['aircraft'] ?? '',
      departureIcao: json['departure_icao'] ?? '',
      arrivalIcao: json['arrival_icao'] ?? '',
      departureIata: json['departure_iata'] ?? '',
      arrivalIata: json['arrival_iata'] ?? '',
      riskScore: (json['risk_score'] as num?)?.toInt() ?? 0,
      riskLevel: json['risk_level'] ?? 'UNKNOWN',
      riskSummary: json['risk_summary'] ?? '',
      riskBreakdown: (json['risk_breakdown'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList(),
      arrivalWeatherBrief: json['arrival_weather_brief'] ?? '',
      nightArrival: json['night_arrival'] ?? false,
      airportEventCount: (json['airport_event_count'] as num?)?.toInt() ?? 0,
      messages: List<String>.from(json['messages'] ?? []),
      metar: json['metar'] ?? '',
      taf: json['taf'] ?? '',
      arrivalTags: List<String>.from(json['arrival_tags'] ?? []),
      scheduledArrival: json['scheduled_arrival'],
    );
  }
}

class ThreatEvent {
  final String eventId;
  final double score;
  final String headline;
  final String eventDate;
  final int severity;
  final String sourceName;
  final String? flightPhase;
  final String? aircraftType;
  final String? airportIcao;
  final String? coreEvent;

  ThreatEvent({
    required this.eventId,
    required this.score,
    required this.headline,
    required this.eventDate,
    required this.severity,
    required this.sourceName,
    this.flightPhase,
    this.aircraftType,
    this.airportIcao,
    this.coreEvent,
  });

  factory ThreatEvent.fromJson(Map<String, dynamic> json) {
    return ThreatEvent(
      eventId: json['event_id'] ?? json['id'] ?? '',
      score: (json['score'] as num?)?.toDouble() ?? 0,
      headline: json['headline'] ?? json['core_event'] ?? '',
      eventDate: json['event_date'] ?? '',
      severity: (json['severity'] as num?)?.toInt() ?? 0,
      sourceName: json['source_name'] ?? '',
      flightPhase: json['flight_phase'],
      aircraftType: json['aircraft_type'],
      airportIcao: json['airport_icao'],
      coreEvent: json['core_event'],
    );
  }
}

class NotamThreat {
  final String notamId;
  final String rawText;
  final String category;
  final String threatTag;
  final String headline;
  final String severity;
  final int riskScore;
  final String effectiveStart;
  final String effectiveEnd;
  final bool isActive;

  NotamThreat({
    required this.notamId,
    required this.rawText,
    required this.category,
    required this.threatTag,
    required this.headline,
    required this.severity,
    required this.riskScore,
    required this.effectiveStart,
    required this.effectiveEnd,
    required this.isActive,
  });

  factory NotamThreat.fromJson(Map<String, dynamic> json) {
    return NotamThreat(
      notamId: json['notamId'] ?? '',
      rawText: json['rawText'] ?? '',
      category: json['category'] ?? '',
      threatTag: json['threatTag'] ?? '',
      headline: json['headline'] ?? '',
      severity: json['severity'] ?? 'LOW',
      riskScore: (json['riskScore'] as num?)?.toInt() ?? 0,
      effectiveStart: json['effectiveStart'] ?? '',
      effectiveEnd: json['effectiveEnd'] ?? '',
      isActive: json['isActive'] ?? false,
    );
  }
}
