class AppConfig {
  // ── Cloudflare Workers URL ────────────────────────────────────────────────
  // wrangler.toml name = "pilot-briefing"
  // 실제 URL은 Cloudflare 대시보드 Workers & Pages 에서 확인
  // 예: https://pilot-briefing.YOUR_ACCOUNT.workers.dev
  static const String baseUrl =
      'https://pilot-briefing.outinletter.workers.dev';

  static const Duration requestTimeout = Duration(seconds: 20);
}
