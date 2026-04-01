import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ruh_app/providers/auth_provider.dart';
import 'package:ruh_app/services/auth_service.dart';

import '../test_support/fakes.dart';

void main() {
  group('AuthController', () {
    test('refreshSession authenticates customer sessions', () async {
      final authService = FakeAuthService()
        ..restoreResult = buildAuthSession(customerAccess: true);
      final container = ProviderContainer(
        overrides: [authServiceProvider.overrideWithValue(authService)],
      );
      addTearDown(container.dispose);

      await container.read(authControllerProvider.notifier).refreshSession();

      final state = container.read(authControllerProvider);
      expect(state.isAuthenticated, isTrue);
      expect(state.session?.user.email, 'admin@globex.test');
    });

    test('refreshSession fails closed for non-customer access', () async {
      final authService = FakeAuthService()
        ..restoreResult = buildAuthSession(customerAccess: false);
      final container = ProviderContainer(
        overrides: [authServiceProvider.overrideWithValue(authService)],
      );
      addTearDown(container.dispose);

      await container.read(authControllerProvider.notifier).refreshSession();

      final state = container.read(authControllerProvider);
      expect(state.isAuthenticated, isFalse);
      expect(state.errorMessage, customerAccessRequiredMessage);
      expect(authService.clearLocalSessionCalled, isTrue);
    });

    test('login surfaces backend auth failures', () async {
      final authService = FakeAuthService()
        ..loginError = const AuthException('Invalid credentials');
      final container = ProviderContainer(
        overrides: [authServiceProvider.overrideWithValue(authService)],
      );
      addTearDown(container.dispose);

      final result = await container
          .read(authControllerProvider.notifier)
          .login(email: 'wrong@globex.test', password: 'bad-password');

      final state = container.read(authControllerProvider);
      expect(result, isFalse);
      expect(state.isAuthenticated, isFalse);
      expect(state.errorMessage, 'Invalid credentials');
    });

    test('logout clears the authenticated state', () async {
      final authService = FakeAuthService()
        ..loginResult = buildAuthSession(customerAccess: true);
      final container = ProviderContainer(
        overrides: [authServiceProvider.overrideWithValue(authService)],
      );
      addTearDown(container.dispose);

      await container
          .read(authControllerProvider.notifier)
          .login(email: 'admin@globex.test', password: 'RuhTest123');
      await container.read(authControllerProvider.notifier).logout();

      final state = container.read(authControllerProvider);
      expect(state.isAuthenticated, isFalse);
      expect(authService.logoutCalled, isTrue);
    });

    test('switchOrganization delegates to the auth service for the current session', () async {
      final authService = FakeAuthService()
        ..loginResult = buildAuthSession(customerAccess: true);
      final container = ProviderContainer(
        overrides: [authServiceProvider.overrideWithValue(authService)],
      );
      addTearDown(container.dispose);

      await container
          .read(authControllerProvider.notifier)
          .login(email: 'admin@globex.test', password: 'RuhTest123');
      await container
          .read(authControllerProvider.notifier)
          .switchOrganization('org-1');

      expect(authService.lastSwitchedOrganizationId, 'org-1');
    });
  });
}
