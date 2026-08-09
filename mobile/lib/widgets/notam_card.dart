import 'package:flutter/material.dart';
import '../models/briefing_model.dart';
import '../theme/app_theme.dart';

class NotamCard extends StatefulWidget {
  final NotamThreat notam;
  const NotamCard({super.key, required this.notam});

  @override
  State<NotamCard> createState() => _NotamCardState();
}

class _NotamCardState extends State<NotamCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final sev = widget.notam.severity;
    final color = AppTheme.severityColor(sev);
    final score = widget.notam.riskScore;

    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  // Severity stripe
                  Container(
                    width: 4,
                    height: 36,
                    margin: const EdgeInsets.only(right: 10),
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            _SevBadge(sev, color),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                widget.notam.category,
                                style: TextStyle(
                                  fontSize: 10,
                                  letterSpacing: 0.5,
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurface
                                      .withOpacity(0.5),
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(
                                color: color.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                '+$score',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: color,
                                  fontFeatures: const [
                                    FontFeature.tabularFigures()
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          widget.notam.headline,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    _expanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    size: 18,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withOpacity(0.4),
                  ),
                ],
              ),
            ),
          ),

          if (_expanded) ...[
            Divider(height: 1, indent: 12, endIndent: 12),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Row(
                    label: 'NOTAM ID',
                    value: widget.notam.notamId,
                  ),
                  const SizedBox(height: 4),
                  _Row(
                    label: 'Effective',
                    value: _formatRange(
                        widget.notam.effectiveStart,
                        widget.notam.effectiveEnd),
                  ),
                  const SizedBox(height: 4),
                  _Row(
                    label: 'Status',
                    value: widget.notam.isActive ? 'ACTIVE' : 'INACTIVE',
                    valueColor: widget.notam.isActive
                        ? AppTheme.critical
                        : AppTheme.low,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Raw NOTAM',
                    style: TextStyle(
                      fontSize: 10,
                      letterSpacing: 0.5,
                      color: Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withOpacity(0.5),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withOpacity(0.05),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      widget.notam.rawText,
                      style: const TextStyle(
                        fontSize: 11,
                        fontFamily: 'monospace',
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _formatRange(String start, String end) {
    final s = start.length > 16 ? start.substring(0, 16) : start;
    final e = end.length > 16 ? end.substring(0, 16) : end;
    return '$s → $e';
  }
}

class _SevBadge extends StatelessWidget {
  final String label;
  final Color color;
  const _SevBadge(this.label, this.color);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withOpacity(0.4), width: 0.5),
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
          color: color,
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _Row({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 80,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: Theme.of(context).colorScheme.onSurface.withOpacity(0.5),
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: valueColor,
            ),
          ),
        ),
      ],
    );
  }
}
