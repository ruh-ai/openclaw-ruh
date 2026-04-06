import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ruh_app/models/auth_session.dart';
import 'package:ruh_app/providers/auth_provider.dart';
import 'package:ruh_app/screens/settings/settings_screen.dart';
import 'package:ruh_app/services/login_preferences_service.dart';

import '../../test_support/fakes.dart';

/// Pumps SettingsScreen wrapped in the minimal widget + provider tree.
Future<void> pumpSettings(
  WidgetTester tester, {
  AuthSession? session,
}) async {
  SharedPreferences.setMockInitialValues({});

  final authService = FakeAuthService()..restoreResult = session;
  final preferencesService = FakeLoginPreferencesService();

  // Use a tall viewport so ListView renders all children.
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 1.0;

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authServiceProvider.overrideWithValue(authService),
        loginPreferencesServiceProvider.overrideWithValue(preferencesService),
      ],
      child: const MaterialApp(home: SettingsScreen()),
    ),
  );

  // Let async providers (themeModeProvider, authController) settle.
  await tester.pumpAndSettle();
}

void main() {
  group('SettingsScreen', () {
    tearDown(() {
      // Reset view after each test to avoid leaking custom size.
      final binding = TestWidgetsFlutterBinding.ensureInitialized();
      binding.platformDispatcher.clearAllTestValues();
    });

    testWidgets('renders without error (smoke test)', (tester) async {
      await pumpSettings(tester);

      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('Advanced'), findsOneWidget);
      expect(find.text('Save Settings'), findsOneWidget);
    });

    testWidgets('backend URL text field accepts input', (tester) async {
      await pumpSettings(tester);

      // Find the URL TextField by its keyboard type to avoid ambiguity.
      final urlField = find.byWidgetPredicate(
        (w) => w is TextField && w.keyboardType == TextInputType.url,
      );
      expect(urlField, findsOneWidget);

      await tester.enterText(urlField, 'http://192.168.1.10:8000');
      await tester.pump();

      expect(find.text('http://192.168.1.10:8000'), findsOneWidget);
    });

    testWidgets('save button is tappable and shows snackbar', (tester) async {
      await pumpSettings(tester);

      final urlField = find.byWidgetPredicate(
        (w) => w is TextField && w.keyboardType == TextInputType.url,
      );
      await tester.enterText(urlField, 'http://example.com');
      await tester.pump();

      await tester.tap(find.text('Save Settings'));
      await tester.pumpAndSettle();

      expect(find.text('Settings saved'), findsOneWidget);
    });

    testWidgets('displays session info when authenticated', (tester) async {
      final session = buildAuthSession(
        email: 'team@ruh.ai',
        organizationName: 'RuhCorp',
      );
      await pumpSettings(tester, session: session);

      expect(find.text('RuhCorp'), findsWidgets);
      expect(find.text('team@ruh.ai'), findsWidgets);
    });

    testWidgets('shows theme segmented button with three options', (
      tester,
    ) async {
      await pumpSettings(tester);

      expect(find.text('Light'), findsOneWidget);
      expect(find.text('Dark'), findsOneWidget);
      expect(find.text('System'), findsOneWidget);
    });
  });
}
