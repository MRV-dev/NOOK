import 'package:flutter/material.dart';

const nookLime = Color(0xFFC9E77A);

final nookTheme = ThemeData(
  useMaterial3: true,
  colorScheme: const ColorScheme.light(
    primary: Color(0xFF1D715C),
    onPrimary: Colors.white,
    secondary: Color(0xFFC9E77A),
    surface: Color(0xFFFFFFFF),
    onSurface: Color(0xFF1D2A25),
    onSurfaceVariant: Color(0xFF78857E),
    outline: Color(0xFF89958E),
    outlineVariant: Color(0xFFE7ECE7),
    surfaceContainerHighest: Color(0xFFF2F5F2),
    secondaryContainer: Color(0xFFE2F1E9),
  ),
  scaffoldBackgroundColor: const Color(0xFFF1F5F1),
  appBarTheme: const AppBarTheme(
    backgroundColor: Color(0xFFF1F5F1),
    foregroundColor: Color(0xFF1D2A25),
    centerTitle: false,
    elevation: 0,
    scrolledUnderElevation: 0,
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: const Color(0xFFFFFFFF),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide.none,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: Color(0xFFE7ECE7)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: Color(0xFF1D715C), width: 1.4),
    ),
  ),
  dividerTheme: const DividerThemeData(color: Color(0xFFE7ECE7)),
  bottomSheetTheme: const BottomSheetThemeData(
    backgroundColor: Color(0xFFFFFFFF),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      backgroundColor: const Color(0xFF1D715C),
      foregroundColor: Colors.white,
      minimumSize: const Size.fromHeight(52),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
    ),
  ),
);

final nookDarkTheme = ThemeData(
  useMaterial3: true,
  brightness: Brightness.dark,
  colorScheme: const ColorScheme.dark(
    primary: Color(0xFF287858),
    onPrimary: Colors.white,
    secondary: Color(0xFF78D2AC),
    surface: Color(0xFF18211C),
    onSurface: Color(0xFFE4ECE7),
    onSurfaceVariant: Color(0xFFA2B0A7),
    outline: Color(0xFF53635A),
    outlineVariant: Color(0xFF34423A),
    surfaceContainerHighest: Color(0xFF202A24),
    secondaryContainer: Color(0xFF20392F),
  ),
  scaffoldBackgroundColor: const Color(0xFF101713),
  appBarTheme: const AppBarTheme(
    backgroundColor: Color(0xFF101713),
    foregroundColor: Color(0xFFE4ECE7),
    centerTitle: false,
    elevation: 0,
    scrolledUnderElevation: 0,
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: const Color(0xFF202A24),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide.none,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: Color(0xFF34423A)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: Color(0xFF78D2AC), width: 1.4),
    ),
  ),
  dividerTheme: const DividerThemeData(color: Color(0xFF34423A)),
  bottomSheetTheme: const BottomSheetThemeData(
    backgroundColor: Color(0xFF18211C),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      backgroundColor: const Color(0xFF287858),
      foregroundColor: Colors.white,
      minimumSize: const Size.fromHeight(52),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
    ),
  ),
);
