import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/auth_session.dart';
import '../services/auth_service.dart';
import '../services/login_preferences_service.dart';
import '../services/logger.dart';

enum AuthStatus { bootstrapping, submitting, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final AuthSession? session;
  final String? errorMessage;

  const AuthState._({required this.status, this.session, this.errorMessage});

  const AuthState.bootstrapping() : this._(status: AuthStatus.bootstrapping);

  const AuthState.submitting() : this._(status: AuthStatus.submitting);

  const AuthState.authenticated(AuthSession session)
    : this._(status: AuthStatus.authenticated, session: session);

  const AuthState.unauthenticated([String? errorMessage])
    : this._(status: AuthStatus.unauthenticated, errorMessage: errorMessage);

  bool get isLoading =>
      status == AuthStatus.bootstrapping || status == AuthStatus.submitting;

  bool get isAuthenticated =>
      status == AuthStatus.authenticated && session != null;

  bool get hasCustomerAccess => session?.appAccess.customer == true;
}

final authServiceProvider = Provider<AuthService>((ref) {
  return BackendAuthService();
});

final loginPreferencesServiceProvider = Provider<LoginPreferencesService>((ref) {
  return SharedPreferencesLoginPreferencesService();
});

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

class AuthController extends Notifier<AuthState> {
  bool _bootstrapScheduled = false;
  bool _isRestoring = false;

  AuthService get _service => ref.read(authServiceProvider);

  @override
  AuthState build() {
    if (!_bootstrapScheduled) {
      _bootstrapScheduled = true;
      Future.microtask(refreshSession);
    }
    return const AuthState.bootstrapping();
  }

  Future<void> refreshSession() async {
    if (_isRestoring) return;
    _isRestoring = true;
    state = const AuthState.bootstrapping();

    try {
      final session = await _service.restoreSession();

      if (session == null) {
        state = const AuthState.unauthenticated();
        return;
      }

      if (!session.hasCustomerAccess) {
        await _service.clearLocalSession();
        state = const AuthState.unauthenticated(customerAccessRequiredMessage);
        return;
      }

      state = AuthState.authenticated(session);
    } on AuthException catch (error) {
      state = AuthState.unauthenticated(error.message);
    } catch (error, stackTrace) {
      Log.e('Auth', 'Failed to restore native session', error, stackTrace);
      state = const AuthState.unauthenticated('Could not restore your session');
    } finally {
      _isRestoring = false;
    }
  }

  Future<bool> login({required String email, required String password}) async {
    state = const AuthState.submitting();

    try {
      final session = await _service.login(email: email, password: password);
      if (!session.hasCustomerAccess) {
        await _service.clearLocalSession();
        state = const AuthState.unauthenticated(customerAccessRequiredMessage);
        return false;
      }

      state = AuthState.authenticated(session);
      return true;
    } on AuthException catch (error) {
      state = AuthState.unauthenticated(error.message);
      return false;
    } catch (error, stackTrace) {
      Log.e('Auth', 'Failed native login', error, stackTrace);
      state = const AuthState.unauthenticated('Login failed');
      return false;
    }
  }

  Future<void> logout() async {
    await _service.logout();
    state = const AuthState.unauthenticated();
  }

  Future<bool> updateProfile({String? displayName}) async {
    try {
      final updatedSession = await _service.updateProfile(
        displayName: displayName,
      );
      if (!updatedSession.hasCustomerAccess) {
        return false;
      }
      state = AuthState.authenticated(updatedSession);
      return true;
    } on AuthException {
      return false;
    } catch (error, stackTrace) {
      Log.e('Auth', 'Failed profile update', error, stackTrace);
      return false;
    }
  }

  Future<bool> switchOrganization(String organizationId) async {
    final session = state.session;
    final refreshToken = session?.refreshToken;

    if (session == null || refreshToken == null || refreshToken.isEmpty) {
      return false;
    }

    try {
      final nextSession = await _service.switchOrganization(
        organizationId: organizationId,
        refreshToken: refreshToken,
      );
      if (!nextSession.hasCustomerAccess) {
        await _service.clearLocalSession();
        state = const AuthState.unauthenticated(customerAccessRequiredMessage);
        return false;
      }

      state = AuthState.authenticated(nextSession);
      return true;
    } on AuthException {
      return false;
    } catch (error, stackTrace) {
      Log.e('Auth', 'Failed organization switch', error, stackTrace);
      return false;
    }
  }
}

String? resolveAuthRedirect({
  required AuthState authState,
  required String currentLocation,
}) {
  final uri = Uri.parse(currentLocation);
  final path = uri.path;
  final isLogin = path == '/login';
  final isAuthLoading = path == '/auth/loading';

  if (authState.isLoading) {
    if (isAuthLoading) return null;
    return '/auth/loading';
  }

  if (!authState.isAuthenticated || !authState.hasCustomerAccess) {
    if (isLogin) return null;

    final redirectTarget = uri.toString();
    return '/login?redirect_url=${Uri.encodeComponent(redirectTarget)}';
  }

  if (isLogin) {
    final target = uri.queryParameters['redirect_url'];
    if (target != null && target.isNotEmpty) {
      return target;
    }
    return '/';
  }

  if (isAuthLoading) {
    return '/';
  }

  return null;
}
