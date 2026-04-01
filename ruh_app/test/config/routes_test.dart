import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ruh_app/config/routes.dart';
import 'package:ruh_app/providers/auth_provider.dart';

import '../test_support/fakes.dart';

class FakeAuthController extends AuthController {
  FakeAuthController(this._state);

  final AuthState _state;

  @override
  AuthState build() => _state;
}

void main() {
  group('resolveAuthRedirect', () {
    test('sends bootstrapping sessions to the auth loading route', () {
      const state = AuthState.bootstrapping();

      expect(
        resolveAuthRedirect(authState: state, currentLocation: '/marketplace'),
        '/auth/loading',
      );
    });

    test('redirects unauthenticated users to login with a return url', () {
      const state = AuthState.unauthenticated();

      expect(
        resolveAuthRedirect(
          authState: state,
          currentLocation: '/marketplace?tab=featured',
        ),
        '/login?redirect_url=%2Fmarketplace%3Ftab%3Dfeatured',
      );
    });

    test('sends authenticated customer users away from login', () {
      final state = AuthState.authenticated(
        buildAuthSession(customerAccess: true),
      );

      expect(
        resolveAuthRedirect(
          authState: state,
          currentLocation: '/login?redirect_url=%2Fmarketplace',
        ),
        '/marketplace',
      );
    });

    test(
      'allows authenticated customer users to remain on protected routes',
      () {
        final state = AuthState.authenticated(
          buildAuthSession(customerAccess: true),
        );

        expect(
          resolveAuthRedirect(authState: state, currentLocation: '/settings'),
          isNull,
        );
      },
    );
  });

  testWidgets('desktop shell shows signed-in org and user context', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authControllerProvider.overrideWith(
            () => FakeAuthController(
              AuthState.authenticated(buildAuthSession(customerAccess: true)),
            ),
          ),
        ],
        child: const MaterialApp(
          home: AppShell(
            currentPath: '/',
            child: SizedBox.expand(),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Globex'), findsOneWidget);
    expect(find.text('admin@globex.test'), findsOneWidget);
  });
}
