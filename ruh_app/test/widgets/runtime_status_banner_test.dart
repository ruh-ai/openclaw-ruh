import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/sandbox.dart';
import 'package:ruh_app/screens/chat/widgets/runtime_status_banner.dart';

void main() {
  test('deriveRuntimeStatusSnapshot hides the banner for healthy runtimes', () {
    final snapshot = deriveRuntimeStatusSnapshot(
      healthAsync: const AsyncData(
        SandboxHealth(
          isRunning: true,
          gatewayReachable: true,
          gatewayStatus: 'healthy',
        ),
      ),
    );

    expect(snapshot.label, 'Healthy');
    expect(snapshot.showBanner, isFalse);
  });

  testWidgets('RuntimeStatusBanner renders recovery actions for degraded runtimes', (
    tester,
  ) async {
    final snapshot = deriveRuntimeStatusSnapshot(
      healthAsync: const AsyncData(
        SandboxHealth(
          isRunning: true,
          gatewayReachable: false,
          gatewayStatus: 'unhealthy',
        ),
      ),
      chatError: 'Tool stream stalled',
    );
    var retried = false;
    var refreshed = false;
    var restarted = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: RuntimeStatusBanner(
            snapshot: snapshot,
            onRetryChat: () => retried = true,
            onRefreshStatus: () => refreshed = true,
            onRestartRuntime: () => restarted = true,
          ),
        ),
      ),
    );

    expect(find.text('Runtime degraded'), findsOneWidget);
    expect(find.text('Retry chat'), findsOneWidget);
    expect(find.text('Refresh status'), findsOneWidget);
    expect(find.text('Restart runtime'), findsOneWidget);

    await tester.tap(find.text('Retry chat'));
    await tester.pump();
    await tester.tap(find.text('Refresh status'));
    await tester.pump();
    await tester.tap(find.text('Restart runtime'));
    await tester.pump();

    expect(retried, isTrue);
    expect(refreshed, isTrue);
    expect(restarted, isTrue);
  });
}
