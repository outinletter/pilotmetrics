import 'package:flutter/material.dart';
import '../models/briefing_model.dart';
import '../theme/app_theme.dart';

class ThreatCard extends StatelessWidget {
  final ThreatEvent threat;
  final int rank;

  const ThreatCard({super.key, required this.threat, required this.rank});

  @override
  Widget build(BuildContext context) {
    final score = threat.score;
    Color dot;
    if (score >= 0.75) dot = AppTheme.critical;
    else if (score >= 0.5) dot = AppTheme.high;
    else if (score >= 0.25) dot = AppTheme.medium;
    else dot = AppTheme.low;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Rank badge
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: dot.withOpacity(0.12),
                borderRadius: BorderRadius.circular(6),
              ),
              alignment: Alignment.center,
              child: Text(
                '#$rank',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: dot,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    threat.headline,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      height: 1.3,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    children: [
                      if (threat.flightPhase != null)
                        _Chip(threat.flightPhase!),
                      if (threat.aircraftType != null)
                        _Chip(threat.aircraftType!),
                      if (threat.airportIcao != null)
                        _Chip(threat.airportIcao!),
                      if (threat.eventDate.isNotEmpty)
                        _Chip(threat.eventDate.length > 10
                            ? threat.eventDate.substring(0, 10)
                            : threat.eventDate),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Text(
                        'Similarity score: ',
                        style: TextStyle(
                          fontSize: 11,
                          color: Theme.of(context).colorScheme.onSurface.withOpacity(0.55),
                        ),
                      ),
                      Text(
                        (score * 100).toStringAsFixed(0),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: dot,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      Text(
                        ' / 100',
                        style: TextStyle(
                          fontSize: 11,
                          color: Theme.of(context).colorScheme.onSurface.withOpacity(0.55),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    threat.sourceName,
                    style: TextStyle(
                      fontSize: 11,
                      color: Theme.of(context).colorScheme.onSurface.withOpacity(0.45),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  const _Chip(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.onSurface.withOpacity(0.07),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          color: Theme.of(context).colorScheme.onSurface.withOpacity(0.65),
        ),
      ),
    );
  }
}
