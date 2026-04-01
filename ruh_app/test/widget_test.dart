import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/providers/auth_provider.dart';

import 'test_support/fakes.dart';
import 'test_support/pump_app.dart';

void main() {
  testWidgets('App renders the login flow without crashing', (
    WidgetTester tester,
  ) async {
    final authService = FakeAuthService();

    await pumpRuhApp(
      tester,
      overrides: [authServiceProvider.overrideWithValue(authService)],
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Ruh Workspace'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
  });
}
