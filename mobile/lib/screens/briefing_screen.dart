import 'package:flutter/material.dart';
import '../models/briefing_model.dart';
import '../theme/app_theme.dart';
import '../widgets/risk_gauge.dart';
import '../widgets/threat_card.dart';
import '../widgets/notam_card.dart';

class BriefingScreen extends StatelessWidget {
  final BriefingResponse data;

  const BriefingScreen({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    final ctx = data.flightContext;
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(ctx.flightNumber),
          bottom: const TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: 'Risk Overview'),
              Tab(text: 'Historical'),
              Tab(text: 'NOTAMs'),
              Tab(text: 'Weather'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _RiskTab(ctx: ctx),
            _HistoricalTab(threats: data.topThreats),
            _NotamTab(notams: data.notamThreats),
            _WeatherTab(ctx: ctx),
          ],
        ),
      ),
    );
  }
}

// ─── Risk Overview ──────────────────────────────────────────────────────────

class _RiskTab extends StatelessWidget {
  final FlightContext ctx;
  const _RiskTab({required this.ctx});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Route + score card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          ctx.route,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          ctx.aircraft,
                          style: TextStyle(
                            fontSize: 13,
                            color: Theme.of(context)
                                .colorScheme
                                .onSurface
                                .withOpacity(0.55),
                          ),
                        ),
                        if (ctx.scheduledArrival != null) ...[
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Icon(Icons.schedule,
                                  size: 13,
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurface
                                      .withOpacity(0.45)),
                              const SizedBox(width: 4),
                              Text(
                                'Arrival ${_formatTime(ctx.scheduledArrival!)}',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurface
                                      .withOpacity(0.55),
                                ),
                              ),
                            ],
                          ),
                        ],
                        if (ctx.nightArrival) ...[
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Icon(Icons.nights_stay,
                                  size: 13, color: AppTheme.medium),
                              const SizedBox(width: 4),
                              Text(
                                'Night arrival',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.medium,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  RiskGauge(score: ctx.riskScore, level: ctx.riskLevel),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Tags
          if (ctx.arrivalTags.isNotEmpty) ...[
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: ctx.arrivalTags.map((t) => _Tag(t)).toList(),
            ),
            const SizedBox(height: 12),
          ],

          // Summary
          _SectionHeader('Risk Summary'),
          const SizedBox(height: 6),
          Text(ctx.riskSummary,
              style: const TextStyle(fontSize: 13, height: 1.55)),
          const SizedBox(height: 16),

          // Breakdown
          if (ctx.riskBreakdown.isNotEmpty) ...[
            _SectionHeader('Risk Breakdown'),
            const SizedBox(height: 6),
            ...ctx.riskBreakdown.entries.map(
              (e) => _BreakdownRow(
                label: _breakdownLabel(e.key),
                value: (e.value as num?)?.toInt() ?? 0,
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Alerts
          if (ctx.messages.isNotEmpty) ...[
            _SectionHeader('Alerts'),
            const SizedBox(height: 6),
            ...ctx.messages.map((m) => _AlertRow(m)),
          ],

          // Airport history
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              children: [
                const Icon(Icons.history, size: 15),
                const SizedBox(width: 6),
                Text(
                  '${ctx.airportEventCount} historical events at ${ctx.arrivalIcao}',
                  style: const TextStyle(fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      return '$h:$m LT';
    } catch (_) {
      return iso.length > 16 ? iso.substring(11, 16) : iso;
    }
  }

  String _breakdownLabel(String key) {
    const map = {
      'base': 'Base score',
      'b_hist': 'Historical events',
      'b_night': 'Night arrival',
      'b_notam': 'Active NOTAMs',
      'b_weather': 'Weather conditions',
    };
    return map[key] ?? key;
  }
}

class _BreakdownRow extends StatelessWidget {
  final String label;
  final int value;
  const _BreakdownRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final color = value >= 20
        ? AppTheme.critical
        : value >= 10
            ? AppTheme.high
            : value >= 5
                ? AppTheme.medium
                : AppTheme.low;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: const TextStyle(fontSize: 13)),
          ),
          Text(
            '+$value',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: color,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _AlertRow extends StatelessWidget {
  final String message;
  const _AlertRow(this.message);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 3),
            child: Icon(Icons.warning_amber_rounded,
                size: 14, color: AppTheme.high),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(message,
                style: const TextStyle(fontSize: 13, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  final String label;
  const _Tag(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppTheme.primary.withOpacity(0.08),
        borderRadius: BorderRadius.circular(4),
        border:
            Border.all(color: AppTheme.primary.withOpacity(0.25), width: 0.5),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 11,
          color: AppTheme.primary,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

// ─── Historical ─────────────────────────────────────────────────────────────

class _HistoricalTab extends StatelessWidget {
  final List<ThreatEvent> threats;
  const _HistoricalTab({required this.threats});

  @override
  Widget build(BuildContext context) {
    if (threats.isEmpty) {
      return const Center(
        child: Text('No historical events found.',
            style: TextStyle(fontSize: 14)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: threats.length,
      separatorBuilder: (_, __) => const SizedBox(height: 4),
      itemBuilder: (_, i) => ThreatCard(threat: threats[i], rank: i + 1),
    );
  }
}

// ─── NOTAMs ─────────────────────────────────────────────────────────────────

class _NotamTab extends StatelessWidget {
  final List<NotamThreat> notams;
  const _NotamTab({required this.notams});

  @override
  Widget build(BuildContext context) {
    if (notams.isEmpty) {
      return const Center(
        child: Text('No active NOTAMs for this arrival.',
            style: TextStyle(fontSize: 14)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: notams.length,
      separatorBuilder: (_, __) => const SizedBox(height: 4),
      itemBuilder: (_, i) => NotamCard(notam: notams[i]),
    );
  }
}

// ─── Weather ────────────────────────────────────────────────────────────────

class _WeatherTab extends StatelessWidget {
  final FlightContext ctx;
  const _WeatherTab({required this.ctx});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Summary
          if (ctx.arrivalWeatherBrief.isNotEmpty) ...[
            _SectionHeader('Arrival Weather Summary'),
            const SizedBox(height: 6),
            Text(ctx.arrivalWeatherBrief,
                style: const TextStyle(fontSize: 13, height: 1.55)),
            const SizedBox(height: 16),
          ],

          // METAR
          if (ctx.metar.isNotEmpty) ...[
            _SectionHeader('METAR'),
            const SizedBox(height: 6),
            _RawBlock(ctx.metar),
            const SizedBox(height: 16),
          ],

          // TAF
          if (ctx.taf.isNotEmpty) ...[
            _SectionHeader('TAF'),
            const SizedBox(height: 6),
            _RawBlock(ctx.taf),
          ],

          if (ctx.metar.isEmpty && ctx.taf.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.only(top: 40),
                child: Text('Weather data unavailable.',
                    style: TextStyle(fontSize: 14)),
              ),
            ),
        ],
      ),
    );
  }
}

class _RawBlock extends StatelessWidget {
  final String text;
  const _RawBlock(this.text);

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.onSurface.withOpacity(0.05),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 12,
          fontFamily: 'monospace',
          height: 1.6,
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader(this.title);

  @override
  Widget build(BuildContext context) {
    return Text(
      title.toUpperCase(),
      style: TextStyle(
        fontSize: 10,
        letterSpacing: 0.8,
        fontWeight: FontWeight.w600,
        color: Theme.of(context).colorScheme.onSurface.withOpacity(0.45),
      ),
    );
  }
}
