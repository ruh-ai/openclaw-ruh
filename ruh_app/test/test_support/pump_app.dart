import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:ruh_app/main.dart';

Future<void> pumpRuhApp(
  WidgetTester tester, {
  List<Override> overrides = const [],
}) async {
  SharedPreferences.setMockInitialValues({});

  await tester.pumpWidget(
    ProviderScope(overrides: overrides, child: const RuhApp()),
  );
}
