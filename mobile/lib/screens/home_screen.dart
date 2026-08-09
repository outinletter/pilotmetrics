import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import 'briefing_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _controller = TextEditingController();
  final _api = ApiService();
  bool _loading = false;
  String? _error;
  List<String> _recent = [];
  Map<String, dynamic>? _stats;

  @override
  void initState() {
    super.initState();
    _loadRecent();
    _fetchStats();
  }

  Future<void> _loadRecent() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _recent = prefs.getStringList('recent_flights') ?? [];
    });
  }

  Future<void> _saveRecent(String fn) async {
    final prefs = await SharedPreferences.getInstance();
    final list = [fn, ..._recent.where((e) => e != fn)].take(8).toList();
    await prefs.setStringList('recent_flights', list);
    setState(() => _recent = list);
  }

  Future<void> _fetchStats() async {
    try {
      final stats = await _api.getStats();
      if (mounted) setState(() => _stats = stats);
    } catch (_) {}
  }

  Future<void> _search(String raw) async {
    final fn = raw.trim().toUpperCase();
    if (fn.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _api.getBriefing(fn);
      await _saveRecent(fn);
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => BriefingScreen(data: data),
        ),
      );
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Unexpected error. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pilot Briefing'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const SizedBox(height: 8),

            // Header
            Text(
              'Flight Risk Briefing',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.5,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              'Enter a flight number to generate an AI-powered safety briefing.',
              style: TextStyle(
                fontSize: 13,
                color:
                    Theme.of(context).colorScheme.onSurface.withOpacity(0.55),
              ),
            ),
            const SizedBox(height: 24),

            // Search field
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      hintText: 'e.g. KE695, AAL100',
                      prefixIcon: Icon(Icons.flight_takeoff, size: 18),
                    ),
                    onSubmitted: _search,
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 50,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                    ),
                    onPressed: _loading
                        ? null
                        : () => _search(_controller.text),
                    child: _loading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Search'),
                  ),
                ),
              ],
            ),

            // Error
            if (_error != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.critical.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                      color: AppTheme.critical.withOpacity(0.3), width: 0.5),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline,
                        size: 15, color: AppTheme.critical),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _error!,
                        style: const TextStyle(
                            fontSize: 12, color: AppTheme.critical),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            // Stats bar
            if (_stats != null) ...[
              const SizedBox(height: 24),
              _StatsBar(stats: _stats!),
            ],

            // Recent searches
            if (_recent.isNotEmpty) ...[
              const SizedBox(height: 24),
              Text(
                'RECENT SEARCHES',
                style: TextStyle(
                  fontSize: 10,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withOpacity(0.45),
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: _recent
                    .map(
                      (fn) => ActionChip(
                        label: Text(fn,
                            style: const TextStyle(fontSize: 12)),
                        onPressed: () {
                          _controller.text = fn;
                          _search(fn);
                        },
                      ),
                    )
                    .toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}

class _StatsBar extends StatelessWidget {
  final Map<String, dynamic> stats;
  const _StatsBar({required this.stats});

  @override
  Widget build(BuildContext context) {
    final items = <_StatItem>[];

    if (stats['total_events'] != null) {
      items.add(_StatItem(
        label: 'Incidents',
        value: _fmt(stats['total_events']),
        icon: Icons.database,
      ));
    }
    if (stats['airports_covered'] != null) {
      items.add(_StatItem(
        label: 'Airports',
        value: _fmt(stats['airports_covered']),
        icon: Icons.flight_land,
      ));
    }
    if (stats['sources'] != null) {
      items.add(_StatItem(
        label: 'Sources',
        value: _fmt(stats['sources']),
        icon: Icons.source,
      ));
    }

    if (items.isEmpty) return const SizedBox.shrink();

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: items,
        ),
      ),
    );
  }

  String _fmt(dynamic v) {
    final n = (v as num?)?.toInt() ?? 0;
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return n.toString();
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  const _StatItem(
      {required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 18, color: AppTheme.primary),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            color:
                Theme.of(context).colorScheme.onSurface.withOpacity(0.5),
          ),
        ),
      ],
    );
  }
}
