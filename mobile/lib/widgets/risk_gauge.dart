import 'package:flutter/material.dart';
import 'package:percent_indicator/circular_percent_indicator.dart';
import '../theme/app_theme.dart';

class RiskGauge extends StatelessWidget {
  final int score;
  final String level;

  const RiskGauge({super.key, required this.score, required this.level});

  String get _label {
    if (score >= 75) return 'VERY HIGH';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MODERATE';
    return 'LOW';
  }

  @override
  Widget build(BuildContext context) {
    final color = AppTheme.riskColor(score);
    return CircularPercentIndicator(
      radius: 64,
      lineWidth: 8,
      percent: (score / 100).clamp(0.0, 1.0),
      backgroundColor: color.withOpacity(0.12),
      progressColor: color,
      circularStrokeCap: CircularStrokeCap.round,
      center: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            score.toString(),
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.bold,
              color: color,
              height: 1.0,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            _label,
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 0.8,
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
