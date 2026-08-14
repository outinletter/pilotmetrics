import 'package:flutter/material.dart';
import '../models/briefing_model.dart';
import '../theme/app_theme.dart';

class ThreatCard extends StatefulWidget {
  final ThreatEvent threat;
  final int rank;

  const ThreatCard({super.key, required this.threat, required this.rank});

  @override
  State<ThreatCard> createState() => _ThreatCardState();
}

class _ThreatCardState extends State<ThreatCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final score = widget.threat.score;
    Color dot;
    if (score >= 75) dot = AppTheme.critical;
    else if (score >= 50) dot = AppTheme.high;
    else if (score >= 25) dot = AppTheme.medium;
    else dot = AppTheme.low;

    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(8),
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
                      '#${widget.rank}',
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
                          widget.threat.headline,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            height: 1.3,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            if (widget.threat.flightPhase != null)
                              _Chip(widget.threat.flightPhase!),
                            if (widget.threat.aircraftType != null)
                              _Chip(widget.threat.aircraftType!),
                            if (widget.threat.airportIcao != null)
                              _Chip(widget.threat.airportIcao!),
                            if (widget.threat.eventDate.isNotEmpty)
                              _Chip(widget.threat.eventDate.length > 10
                                  ? widget.threat.eventDate.substring(0, 10)
                                  : widget.threat.eventDate),
                            for (var kw in widget.threat.briefingKeywords)
                              _Chip(kw, isKeyword: true),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Text(
                              'Similarity: ',
                              style: TextStyle(
                                fontSize: 11,
                                color: Theme.of(context).colorScheme.onSurface.withOpacity(0.55),
                              ),
                            ),
                            Text(
                              score.toStringAsFixed(0),
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: dot,
                                fontFeatures: const [FontFeature.tabularFigures()],
                              ),
                            ),
                            Text(
                              '%',
                              style: TextStyle(
                                fontSize: 11,
                                color: Theme.of(context).colorScheme.onSurface.withOpacity(0.55),
                              ),
                            ),
                            const Spacer(),
                            Icon(
                              _expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                              size: 16,
                              color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_expanded) ...[
            const Divider(height: 1, indent: 12, endIndent: 12),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Contributing Factors (Bullets)
                  if (widget.threat.contributingFactors.isNotEmpty) ...[
                    _DetailHeader('Contributing Factors'),
                    const SizedBox(height: 4),
                    ...widget.threat.contributingFactors.map((f) => _BulletItem(f)),
                    const SizedBox(height: 10),
                  ],

                  // Operational Lessons (Bullets)
                  if (widget.threat.operationalLessons.isNotEmpty) ...[
                    _DetailHeader('Operational Lessons'),
                    const SizedBox(height: 4),
                    ...widget.threat.operationalLessons.map((l) => _BulletItem(l, color: AppTheme.primary)),
                    const SizedBox(height: 10),
                  ],

                  // Fuel Advisory
                  if (widget.threat.fuelAdvisory != null) ...[
                    _DetailHeader('Fuel / Decision Support'),
                    const SizedBox(height: 4),
                    _InfoBox(widget.threat.fuelAdvisory!, icon: Icons.local_gas_station, color: AppTheme.medium),
                    const SizedBox(height: 10),
                  ],

                  // Recommended Action
                  if (widget.threat.recommendedAction != null) ...[
                    _DetailHeader('Recommended Action'),
                    const SizedBox(height: 4),
                    Text(
                      widget.threat.recommendedAction!,
                      style: const TextStyle(fontSize: 12, height: 1.4),
                    ),
                    const SizedBox(height: 10),
                  ],

                  // Summary
                  _DetailHeader('Narrative Summary'),
                  const SizedBox(height: 4),
                  Text(
                    widget.threat.summary,
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.5,
                      color: Theme.of(context).colorScheme.onSurface.withOpacity(0.8),
                    ),
                  ),

                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Text(
                        widget.threat.sourceName,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                          color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4),
                        ),
                      ),
                      const Spacer(),
                      Text(
                        'ID: ${widget.threat.eventId}',
                        style: TextStyle(
                          fontSize: 10,
                          fontFamily: 'monospace',
                          color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailHeader extends StatelessWidget {
  final String title;
  const _DetailHeader(this.title);

  @override
  Widget build(BuildContext context) {
    return Text(
      title.toUpperCase(),
      style: TextStyle(
        fontSize: 9,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.5,
        color: Theme.of(context).colorScheme.onSurface.withOpacity(0.45),
      ),
    );
  }
}

class _BulletItem extends StatelessWidget {
  final String text;
  final Color? color;
  const _BulletItem(this.text, {this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 6, right: 8),
            child: Container(
              width: 4,
              height: 4,
              decoration: BoxDecoration(
                color: color ?? Theme.of(context).colorScheme.onSurface.withOpacity(0.3),
                shape: BoxShape.circle,
              ),
            ),
          ),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12,
                height: 1.4,
                color: color,
                fontWeight: color != null ? FontWeight.w500 : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoBox extends StatelessWidget {
  final String text;
  final IconData icon;
  final Color color;
  const _InfoBox(this.text, {required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.06),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.2), width: 0.5),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text.replaceAll(' | ', '\n'),
              style: TextStyle(
                fontSize: 11,
                height: 1.4,
                color: color.withOpacity(0.9),
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool isKeyword;
  const _Chip(this.label, {this.isKeyword = false});

  @override
  Widget build(BuildContext context) {
    final bg = isKeyword 
      ? AppTheme.primary.withOpacity(0.08)
      : Theme.of(context).colorScheme.onSurface.withOpacity(0.06);
    final text = isKeyword 
      ? AppTheme.primary.withOpacity(0.8)
      : Theme.of(context).colorScheme.onSurface.withOpacity(0.65);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
        border: isKeyword ? Border.all(color: AppTheme.primary.withOpacity(0.2), width: 0.5) : null,
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: isKeyword ? FontWeight.w500 : null,
          color: text,
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
