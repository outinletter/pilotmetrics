import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import '../models/briefing_model.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  final http.Client _client = http.Client();

  Future<BriefingResponse> getBriefing(String flightNumber) async {
    final uri = Uri.parse(
      '${AppConfig.baseUrl}/api/briefing/${Uri.encodeComponent(flightNumber.trim().toUpperCase())}',
    );

    final response = await _client
        .get(uri, headers: {'Accept': 'application/json'})
        .timeout(AppConfig.requestTimeout);

    if (response.statusCode != 200) {
      throw ApiException(
        'Server returned ${response.statusCode}',
        response.statusCode,
      );
    }

    final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    return BriefingResponse.fromJson(json);
  }

  Future<Map<String, dynamic>> getStats() async {
    final uri = Uri.parse('${AppConfig.baseUrl}/api/stats');
    final response = await _client
        .get(uri, headers: {'Accept': 'application/json'})
        .timeout(AppConfig.requestTimeout);

    if (response.statusCode != 200) {
      throw ApiException('Stats fetch failed', response.statusCode);
    }
    return jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
  }
}

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, [this.statusCode]);

  @override
  String toString() => 'ApiException: $message${statusCode != null ? ' (HTTP $statusCode)' : ''}';
}
