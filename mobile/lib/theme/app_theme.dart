import 'package:flutter/material.dart';

class AppTheme {
  static const Color primary   = Color(0xFF8C2020);
  static const Color surface   = Color(0xFFF0EDE6);
  static const Color bg        = Color(0xFFF8F6F1);
  static const Color ink       = Color(0xFF1C1818);
  static const Color ink2      = Color(0xFF3C3838);
  static const Color ink3      = Color(0xFF7A7670);
  static const Color ruleLine  = Color(0xFFCDC9BF);

  // Dark
  static const Color darkBg      = Color(0xFF0D0F14);
  static const Color darkSurface = Color(0xFF141820);
  static const Color darkInk     = Color(0xFFE4DFD4);
  static const Color darkPrimary = Color(0xFFC45050);

  // Severity colors
  static const Color critical = Color(0xFF8C2020);
  static const Color high     = Color(0xFF9A5010);
  static const Color medium   = Color(0xFF806800);
  static const Color low      = Color(0xFF146040);

  static Color riskColor(int score) {
    if (score >= 75) return critical;
    if (score >= 50) return high;
    if (score >= 25) return medium;
    return low;
  }

  static Color severityColor(String sev) {
    switch (sev.toUpperCase()) {
      case 'CRITICAL': return critical;
      case 'HIGH':     return high;
      case 'MEDIUM':   return medium;
      default:         return low;
    }
  }

  static ThemeData light() => ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: ColorScheme.light(
      primary: primary,
      surface: surface,
      onPrimary: Colors.white,
      onSurface: ink,
    ),
    scaffoldBackgroundColor: bg,
    appBarTheme: const AppBarTheme(
      backgroundColor: bg,
      foregroundColor: ink,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: ink,
        fontSize: 17,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.3,
      ),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: ruleLine),
      ),
      margin: const EdgeInsets.symmetric(vertical: 4),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: ruleLine),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: ruleLine),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: primary, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    dividerColor: ruleLine,
  );

  static ThemeData dark() => ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.dark(
      primary: darkPrimary,
      surface: darkSurface,
      onPrimary: Colors.white,
      onSurface: darkInk,
    ),
    scaffoldBackgroundColor: darkBg,
    appBarTheme: const AppBarTheme(
      backgroundColor: darkBg,
      foregroundColor: darkInk,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: darkSurface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: Color(0xFF242830)),
      ),
      margin: const EdgeInsets.symmetric(vertical: 4),
    ),
    dividerColor: const Color(0xFF242830),
  );
}
