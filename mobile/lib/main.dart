import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'screens/auth_screen.dart';
import 'screens/inbox_screen.dart';
import 'services/nook_api.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const NookApp());
}

class NookApp extends StatefulWidget {
  const NookApp({super.key});

  @override
  State<NookApp> createState() => _NookAppState();
}

class _NookAppState extends State<NookApp> {
  ThemeMode _themeMode = ThemeMode.system;

  @override
  void initState() {
    super.initState();
    _restoreThemeMode();
  }

  Future<void> _restoreThemeMode() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final savedMode = preferences.getString('appearanceThemeMode');
      final mode = ThemeMode.values.where((item) => item.name == savedMode);
      if (mode.isNotEmpty && mounted) {
        setState(() => _themeMode = mode.first);
      }
    } catch (_) {}
  }

  Future<void> _setThemeMode(ThemeMode mode) async {
    setState(() => _themeMode = mode);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString('appearanceThemeMode', mode.name);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'NOOK',
    debugShowCheckedModeBanner: false,
    theme: nookTheme,
    darkTheme: nookDarkTheme,
    themeMode: _themeMode,
    home: SessionGate(themeMode: _themeMode, onThemeModeChanged: _setThemeMode),
  );
}

class SessionGate extends StatefulWidget {
  const SessionGate({
    super.key,
    required this.themeMode,
    required this.onThemeModeChanged,
  });

  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  final NookApi _api = NookApi();
  bool _loading = true;
  String? _userId;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final token = preferences.getString('authToken');
      if (token != null && token.isNotEmpty) {
        _api.setToken(token);
        final user = await _api.getProfile();
        _userId = user['id']?.toString() ?? user['_id']?.toString();
      }
    } catch (_) {
      _api.setToken(null);
      try {
        final preferences = await SharedPreferences.getInstance();
        await preferences.remove('authToken');
      } catch (_) {}
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _onAuthenticated(Map<String, dynamic> result) async {
    final token = result['token'] as String;
    final user = Map<String, dynamic>.from(result['user'] as Map);
    _api.setToken(token);
    _userId = user['id']?.toString() ?? user['_id']?.toString();
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString('authToken', token);
    if (mounted) setState(() {});
  }

  Future<void> _signOut() async {
    _api.setToken(null);
    _userId = null;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.remove('authToken');
    } catch (_) {}
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_api.token != null && _userId != null) {
      return InboxScreen(
        api: _api,
        userId: _userId!,
        onSignOut: _signOut,
        themeMode: widget.themeMode,
        onThemeModeChanged: widget.onThemeModeChanged,
      );
    }
    return AuthScreen(api: _api, onAuthenticated: _onAuthenticated);
  }
}
