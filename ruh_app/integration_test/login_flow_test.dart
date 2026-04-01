import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:ruh_app/main.dart' as app;
import 'package:ruh_app/services/access_token_store.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('customer admin can sign in on the desktop app', (tester) async {
    await _expectBackendListening();
    await AccessTokenStore().clear();

    app.main();
    await tester.pump();

    await _pumpUntilVisible(
      tester,
      find.text('Sign In'),
      description: 'login submit button',
    );

    await tester.enterText(
      find.byType(TextFormField).at(0),
      'admin@globex.test',
    );
    await tester.enterText(find.byType(TextFormField).at(1), 'RuhTest123');
    await tester.tap(find.text('Sign In'));
    await tester.pump();

    await _pumpUntilVisible(
      tester,
      find.byTooltip('Create Agent'),
      description: 'authenticated shell',
    );

    expect(find.text('Ruh Workspace'), findsNothing);
    expect(find.text('Sign In'), findsNothing);
  });
}

Future<void> _expectBackendListening() async {
  try {
    final socket = await Socket.connect(
      InternetAddress.loopbackIPv4,
      8000,
      timeout: const Duration(seconds: 2),
    );
    await socket.close();
  } on Object catch (error) {
    throw TestFailure('Local backend is not listening on port 8000: $error');
  }
}

Future<void> _pumpUntilVisible(
  WidgetTester tester,
  Finder finder, {
  required String description,
  Duration timeout = const Duration(seconds: 30),
  Duration step = const Duration(milliseconds: 200),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(step);
    if (finder.evaluate().isNotEmpty) {
      return;
    }
  }
  throw TestFailure('Timed out waiting for $description');
}
