import 'package:dio/dio.dart';

import '../models/auth_session.dart';
import 'api_client.dart';

const String customerAccessRequiredMessage =
    'Customer organization access required';

class AuthException implements Exception {
  final String message;
  final int? statusCode;

  const AuthException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

abstract class AuthService {
  Future<AuthSession> login({required String email, required String password});

  Future<AuthSession?> restoreSession();

  Future<AuthSession> switchOrganization({
    required String organizationId,
    required String refreshToken,
  });

  Future<void> logout();

  Future<void> clearLocalSession();
}

class BackendAuthService implements AuthService {
  BackendAuthService({BackendClient? client}) : _client = client ?? ApiClient();

  final BackendClient _client;

  @override
  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _client.post<Map<String, dynamic>>(
        '/api/auth/login',
        data: {'email': email.trim(), 'password': password},
      );
      final data = response.data;
      if (data == null) {
        throw const AuthException('Login failed');
      }

      final session = await _ensureCustomerAccess(AuthSession.fromJson(data));
      await _persistSessionTokens(session);
      return session;
    } on DioException catch (error) {
      throw _mapException(error, fallbackMessage: 'Login failed');
    }
  }

  @override
  Future<AuthSession> switchOrganization({
    required String organizationId,
    required String refreshToken,
  }) async {
    try {
      final response = await _client.post<Map<String, dynamic>>(
        '/api/auth/switch-org',
        data: {
          'organizationId': organizationId,
          'refreshToken': refreshToken,
        },
      );
      final data = response.data;
      if (data == null) {
        throw const AuthException('Could not switch organization');
      }

      final session = AuthSession.fromJson(data, refreshToken: refreshToken);
      await _persistSessionTokens(session);
      return session;
    } on DioException catch (error) {
      throw _mapException(
        error,
        fallbackMessage: 'Could not switch organization',
      );
    }
  }

  @override
  Future<AuthSession?> restoreSession() async {
    try {
      final response = await _client.get<Map<String, dynamic>>('/api/auth/me');
      final data = response.data;
      if (data == null) {
        await _client.clearAccessToken();
        await _client.clearRefreshToken();
        return null;
      }
      final accessToken = await _client.getAccessToken();
      final refreshToken = await _client.getRefreshToken();
      return AuthSession.fromJson(
        data,
        accessToken: accessToken,
        refreshToken: refreshToken,
      );
    } on DioException catch (error) {
      final statusCode = error.response?.statusCode;
      if (statusCode == 401 || statusCode == 403) {
        await _client.clearAccessToken();
        await _client.clearRefreshToken();
        return null;
      }
      throw _mapException(
        error,
        fallbackMessage: 'Could not restore your session',
      );
    }
  }

  @override
  Future<void> logout() async {
    try {
      await _client.post<void>('/api/auth/logout');
    } on DioException {
      // Clearing the local token is the critical part for native clients.
    } finally {
      await _client.clearAccessToken();
      await _client.clearRefreshToken();
    }
  }

  @override
  Future<void> clearLocalSession() async {
    await _client.clearAccessToken();
    await _client.clearRefreshToken();
  }

  Future<AuthSession> _ensureCustomerAccess(AuthSession session) async {
    if (session.accessToken != null && session.accessToken!.isNotEmpty) {
      await _client.setAccessToken(session.accessToken!);
    }

    if (session.hasCustomerAccess) {
      return session;
    }

    OrganizationMembership? membership;
    for (final candidate in session.memberships) {
      final isEligibleCustomerMembership =
          candidate.organizationKind == 'customer' &&
          candidate.status == 'active' &&
          (candidate.role == 'owner' ||
              candidate.role == 'admin' ||
              candidate.role == 'employee');
      if (isEligibleCustomerMembership) {
        membership = candidate;
        break;
      }
    }
    final refreshToken = session.refreshToken;

    if (membership == null || refreshToken == null || refreshToken.isEmpty) {
      return session;
    }

    return switchOrganization(
      organizationId: membership.organizationId,
      refreshToken: refreshToken,
    );
  }

  AuthException _mapException(
    DioException error, {
    required String fallbackMessage,
  }) {
    final payload = error.response?.data;
    if (payload is Map<String, dynamic>) {
      final message =
          payload['message'] as String? ??
          payload['detail'] as String? ??
          fallbackMessage;
      return AuthException(message, statusCode: error.response?.statusCode);
    }
    return AuthException(
      error.message ?? fallbackMessage,
      statusCode: error.response?.statusCode,
    );
  }

  Future<void> _persistSessionTokens(AuthSession session) async {
    if (session.accessToken != null && session.accessToken!.isNotEmpty) {
      await _client.setAccessToken(session.accessToken!);
    }
    if (session.refreshToken != null && session.refreshToken!.isNotEmpty) {
      await _client.setRefreshToken(session.refreshToken!);
    }
  }
}
