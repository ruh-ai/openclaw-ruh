import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Ruh.ai brand theme built on Material 3.
///
/// Colors, typography, and radius scale derived from DESIGN.md.
class RuhTheme {
  RuhTheme._();

  // ── Brand colors ──────────────────────────────────────────────────────

  static const Color primary = Color(0xFFAE00D0);
  static const Color primaryHover = Color(0xFF9400B4);
  static const Color secondary = Color(0xFF7B5AFF);
  static const Color secondaryHover = Color(0xFF6B4BEF);
  static const Color tertiary = Color(0xFF12195E);

  // ── Surfaces ──────────────────────────────────────────────────────────

  static const Color background = Color(0xFFF9F7F9);
  static const Color cardColor = Color(0xFFFFFFFF);
  static const Color sidebar = Color(0xFFFDFBFF);
  static const Color accentLight = Color(0xFFF7E6FA);
  static const Color lightPurple = Color(0xFFFDF4FF);

  // ── Text ──────────────────────────────────────────────────────────────

  static const Color textPrimary = Color(0xFF121212);
  static const Color textSecondary = Color(0xFF4B5563);
  static const Color textTertiary = Color(0xFF827F82);

  // ── Borders ───────────────────────────────────────────────────────────

  static const Color borderDefault = Color(0xFFE5E7EB);
  static const Color borderMuted = Color(0xFFEFF0F3);

  // ── Semantic ──────────────────────────────────────────────────────────

  static const Color success = Color(0xFF22C55E);
  static const Color error = Color(0xFFEF4444);
  static const Color warning = Color(0xFFF59E0B);
  static const Color info = Color(0xFF3B82F6);

  // ── Dark surfaces ─────────────────────────────────────────────────────

  static const Color darkBackground = Color(0xFF121212);
  static const Color darkCard = Color(0xFF1E1E1E);
  static const Color darkSurface = Color(0xFF2A2A2A);
  static const Color darkTextPrimary = Color(0xFFF9F7F9);
  static const Color darkTextSecondary = Color(0xFFA1A1AA);
  static const Color darkBorder = Color(0xFF333333);

  // ── Gradient ──────────────────────────────────────────────────────────

  static const LinearGradient brandGradient = LinearGradient(
    colors: [primary, secondary],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // ── Border radius scale ───────────────────────────────────────────────

  static const double radiusSm = 4;
  static const double radiusMd = 6;
  static const double radiusLg = 8;
  static const double radiusXl = 12;
  static const double radiusXxl = 16;

  // ── Typography helpers ────────────────────────────────────────────────

  static TextTheme _buildTextTheme(Brightness brightness) {
    final Color defaultColor =
        brightness == Brightness.light ? textPrimary : darkTextPrimary;
    final Color secondaryColor =
        brightness == Brightness.light ? textSecondary : darkTextSecondary;

    // Base body/label text — Inter as the closest Google Fonts match for Satoshi.
    final TextStyle base = GoogleFonts.inter(color: defaultColor);

    // Display headings use Sora.
    final TextStyle display = GoogleFonts.sora(color: defaultColor);

    // Accent uses Jost.
    final TextStyle accent = GoogleFonts.jost(color: defaultColor);

    return TextTheme(
      // ── Display / headings (Sora) ──
      displayLarge: display.copyWith(fontSize: 32, fontWeight: FontWeight.bold),
      displayMedium: display.copyWith(fontSize: 28, fontWeight: FontWeight.bold),
      displaySmall: display.copyWith(fontSize: 24, fontWeight: FontWeight.bold),
      headlineLarge: display.copyWith(fontSize: 20, fontWeight: FontWeight.bold),
      headlineMedium:
          display.copyWith(fontSize: 16, fontWeight: FontWeight.bold),
      headlineSmall:
          display.copyWith(fontSize: 14, fontWeight: FontWeight.w600),

      // ── Title (Jost accent) ──
      titleLarge: accent.copyWith(fontSize: 20, fontWeight: FontWeight.w600),
      titleMedium: accent.copyWith(fontSize: 16, fontWeight: FontWeight.w500),
      titleSmall: accent.copyWith(fontSize: 14, fontWeight: FontWeight.w500),

      // ── Body (Inter) ──
      bodyLarge: base.copyWith(fontSize: 16),
      bodyMedium: base.copyWith(fontSize: 14),
      bodySmall: base.copyWith(fontSize: 12, color: secondaryColor),

      // ── Labels ──
      labelLarge: base.copyWith(fontSize: 14, fontWeight: FontWeight.w500),
      labelMedium: base.copyWith(fontSize: 12, fontWeight: FontWeight.w500),
      labelSmall: base.copyWith(
          fontSize: 11, fontWeight: FontWeight.w500, color: secondaryColor),
    );
  }

  // ── Light theme ───────────────────────────────────────────────────────

  static ThemeData light() {
    final ColorScheme colorScheme = ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.light,
      primary: primary,
      secondary: secondary,
      tertiary: tertiary,
      surface: cardColor,
      error: error,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: textPrimary,
      onError: Colors.white,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: background,
      cardColor: cardColor,
      dividerColor: borderDefault,
      textTheme: _buildTextTheme(Brightness.light),
      appBarTheme: AppBarTheme(
        backgroundColor: cardColor,
        foregroundColor: textPrimary,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: cardColor,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusXl),
          side: const BorderSide(color: borderDefault),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: cardColor,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: borderDefault),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: borderDefault),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: primary, width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMd),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: primary,
          side: const BorderSide(color: borderDefault),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMd),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: accentLight,
        selectedColor: primary.withValues(alpha: 0.15),
        labelStyle: GoogleFonts.inter(fontSize: 12, color: textPrimary),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusSm),
        ),
      ),
    );
  }

  // ── Dark theme ────────────────────────────────────────────────────────

  static ThemeData dark() {
    final ColorScheme colorScheme = ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.dark,
      primary: primary,
      secondary: secondary,
      tertiary: tertiary,
      surface: darkCard,
      error: error,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: darkTextPrimary,
      onError: Colors.white,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: darkBackground,
      cardColor: darkCard,
      dividerColor: darkBorder,
      textTheme: _buildTextTheme(Brightness.dark),
      appBarTheme: AppBarTheme(
        backgroundColor: darkCard,
        foregroundColor: darkTextPrimary,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: darkCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusXl),
          side: const BorderSide(color: darkBorder),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: darkSurface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: darkBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: darkBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: primary, width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMd),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: primary,
          side: const BorderSide(color: darkBorder),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMd),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: darkSurface,
        selectedColor: primary.withValues(alpha: 0.25),
        labelStyle: GoogleFonts.inter(fontSize: 12, color: darkTextPrimary),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusSm),
        ),
      ),
    );
  }
}
