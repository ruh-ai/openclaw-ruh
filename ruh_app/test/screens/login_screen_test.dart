import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ruh_app/providers/auth_provider.dart';
import 'package:ruh_app/screens/auth/login_screen.dart';
import 'package:ruh_app/services/auth_service.dart';
import 'package:ruh_app/services/login_preferences_service.dart';

import '../test_support/fakes.dart';

void main() {
  testWidgets('submits credentials through the auth controller', (
    tester,
  ) async {
    final authService = FakeAuthService()
      ..loginResult = buildAuthSession(customerAccess: true);
    final preferencesService = FakeLoginPreferencesService();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authServiceProvider.overrideWithValue(authService),
          loginPreferencesServiceProvider.overrideWithValue(preferencesService),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pump();

    await tester.enterText(
      find.byType(TextFormField).at(0),
      'admin@globex.test',
    );
    await tester.enterText(find.byType(TextFormField).at(1), 'RuhTest123');
    await tester.tap(find.text('Sign In'));
    await tester.pump();

    expect(authService.lastEmail, 'admin@globex.test');
    expect(authService.lastPassword, 'RuhTest123');
    expect(preferencesService.lastRememberEmail, isFalse);
  });

  testWidgets('shows auth errors returned by the controller', (tester) async {
    final authService = FakeAuthService()
      ..loginError = const AuthException(
        'Customer organization access required',
      );
    final preferencesService = FakeLoginPreferencesService();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authServiceProvider.overrideWithValue(authService),
          loginPreferencesServiceProvider.overrideWithValue(preferencesService),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pump();

    await tester.enterText(find.byType(TextFormField).at(0), 'admin@ruh.test');
    await tester.enterText(find.byType(TextFormField).at(1), 'RuhTest123');
    await tester.tap(find.text('Sign In'));
    await tester.pump();

    expect(find.text('Customer organization access required'), findsOneWidget);
  });

  testWidgets('toggles password visibility from the suffix control', (
    tester,
  ) async {
    final authService = FakeAuthService()
      ..loginResult = buildAuthSession(customerAccess: true);
    final preferencesService = FakeLoginPreferencesService();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authServiceProvider.overrideWithValue(authService),
          loginPreferencesServiceProvider.overrideWithValue(preferencesService),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pump();

    TextField passwordField() => tester.widget<TextField>(find.byType(TextField).last);

    expect(passwordField().obscureText, isTrue);

    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();

    expect(passwordField().obscureText, isFalse);
  });

  testWidgets('prefills remembered email and saves it after successful login', (
    tester,
  ) async {
    final authService = FakeAuthService()
      ..loginResult = buildAuthSession(customerAccess: true);
    final preferencesService = FakeLoginPreferencesService()
      ..loadResult = const LoginPreferences(
        rememberEmail: true,
        email: 'prasanjit@ruh.ai',
      );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authServiceProvider.overrideWithValue(authService),
          loginPreferencesServiceProvider.overrideWithValue(preferencesService),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pump();

    expect(find.text('prasanjit@ruh.ai'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(1), 'RuhTest123');
    await tester.tap(find.text('Sign In'));
    await tester.pump();

    expect(preferencesService.lastRememberEmail, isTrue);
    expect(preferencesService.lastSavedEmail, 'prasanjit@ruh.ai');
  });
}
