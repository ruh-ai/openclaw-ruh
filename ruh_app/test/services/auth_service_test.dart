import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/services/api_client.dart';
import 'package:ruh_app/services/auth_service.dart';

class FakeBackendClient implements BackendClient {
  dynamic getResponseData;
  dynamic postResponseData;
  Object? getError;
  Object? postError;
  String? storedToken;
  String? storedRefreshToken;
  String? lastGetPath;
  String? lastPostPath;
  Object? lastPostBody;

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    lastGetPath = path;
    if (getError != null) throw getError!;
    return Response<T>(
      data: getResponseData as T,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    lastPostPath = path;
    lastPostBody = data;
    if (postError != null) throw postError!;
    return Response<T>(
      data: postResponseData as T,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<T>> postLongRunning<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    return post<T>(path, data: data, queryParameters: queryParameters);
  }

  @override
  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamPost(String path, Map<String, dynamic> data) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamGet(String path) {
    throw UnimplementedError();
  }

  @override
  Future<void> setAccessToken(String token) async {
    storedToken = token;
  }

  @override
  Future<String?> getAccessToken() async {
    return storedToken;
  }

  @override
  Future<void> clearAccessToken() async {
    storedToken = null;
  }

  @override
  Future<void> setRefreshToken(String token) async {
    storedRefreshToken = token;
  }

  @override
  Future<String?> getRefreshToken() async {
    return storedRefreshToken;
  }

  @override
  Future<void> clearRefreshToken() async {
    storedRefreshToken = null;
  }
}

DioException unauthorizedError(String path) {
  final request = RequestOptions(path: path);
  return DioException(
    requestOptions: request,
    response: Response<void>(requestOptions: request, statusCode: 401),
    type: DioExceptionType.badResponse,
  );
}

void main() {
  group('BackendAuthService', () {
    test('login stores the returned access token', () async {
      final client = FakeBackendClient()
        ..postResponseData = {
          'user': {
            'id': 'user-1',
            'email': 'admin@globex.test',
            'displayName': 'Globex Admin',
            'role': 'end_user',
            'orgId': 'org-1',
          },
          'accessToken': 'access-123',
          'refreshToken': 'refresh-123',
          'platformRole': 'user',
          'memberships': const [],
          'activeOrganization': {
            'id': 'org-1',
            'name': 'Globex',
            'slug': 'globex',
            'kind': 'customer',
            'plan': 'starter',
          },
          'activeMembership': {
            'id': 'membership-1',
            'organizationId': 'org-1',
            'organizationName': 'Globex',
            'organizationSlug': 'globex',
            'organizationKind': 'customer',
            'organizationPlan': 'starter',
            'role': 'admin',
            'status': 'active',
          },
          'appAccess': {'admin': false, 'builder': false, 'customer': true},
        };
      final service = BackendAuthService(client: client);

      final session = await service.login(
        email: 'admin@globex.test',
        password: 'RuhTest123',
      );

      expect(client.lastPostPath, '/api/auth/login');
      expect(client.storedToken, 'access-123');
      expect(client.storedRefreshToken, 'refresh-123');
      expect(session.user.email, 'admin@globex.test');
      expect(session.hasCustomerAccess, isTrue);
    });

    test('login switches into a customer organization when the first session lands on a developer org', () async {
      final client = FakeBackendClient()
        ..postResponseData = {
          'user': {
            'id': 'user-1',
            'email': 'prasanjit@ruh.ai',
            'displayName': 'Prasanjit Ruh',
            'role': 'admin',
            'orgId': 'org-dev',
          },
          'accessToken': 'access-123',
          'refreshToken': 'refresh-123',
          'platformRole': 'platform_admin',
          'memberships': const [
            {
              'id': 'membership-dev',
              'organizationId': 'org-dev',
              'organizationName': 'Acme Dev',
              'organizationSlug': 'acme-dev',
              'organizationKind': 'developer',
              'organizationPlan': 'free',
              'role': 'owner',
              'status': 'active',
            },
            {
              'id': 'membership-customer',
              'organizationId': 'org-customer',
              'organizationName': 'Globex',
              'organizationSlug': 'globex',
              'organizationKind': 'customer',
              'organizationPlan': 'free',
              'role': 'admin',
              'status': 'active',
            },
          ],
          'activeOrganization': {
            'id': 'org-dev',
            'name': 'Acme Dev',
            'slug': 'acme-dev',
            'kind': 'developer',
            'plan': 'free',
          },
          'activeMembership': {
            'id': 'membership-dev',
            'organizationId': 'org-dev',
            'organizationName': 'Acme Dev',
            'organizationSlug': 'acme-dev',
            'organizationKind': 'developer',
            'organizationPlan': 'free',
            'role': 'owner',
            'status': 'active',
          },
          'appAccess': {'admin': true, 'builder': true, 'customer': false},
        };
      final service = BackendAuthService(client: client);

      await service.login(
        email: 'prasanjit@ruh.ai',
        password: 'RuhTest123',
      );

      expect(client.lastPostPath, '/api/auth/switch-org');
      expect(
        client.lastPostBody,
        {'organizationId': 'org-customer', 'refreshToken': 'refresh-123'},
      );
    });

    test(
      'restoreSession rehydrates from /api/auth/me using stored token',
      () async {
        final client = FakeBackendClient()
          ..storedRefreshToken = 'stale-refresh'
          ..storedToken = 'stored-token'
          ..getResponseData = {
            'id': 'user-1',
            'email': 'member@globex.test',
            'displayName': 'Member',
            'role': 'end_user',
            'platformRole': 'user',
            'orgId': 'org-1',
            'memberships': const [],
            'activeOrganization': {
              'id': 'org-1',
              'name': 'Globex',
              'slug': 'globex',
              'kind': 'customer',
              'plan': 'starter',
            },
            'activeMembership': {
              'id': 'membership-1',
              'organizationId': 'org-1',
              'organizationName': 'Globex',
              'organizationSlug': 'globex',
              'organizationKind': 'customer',
              'organizationPlan': 'starter',
              'role': 'employee',
              'status': 'active',
            },
            'appAccess': {'admin': false, 'builder': false, 'customer': true},
          };
        final service = BackendAuthService(client: client);

        final session = await service.restoreSession();

        expect(client.lastGetPath, '/api/auth/me');
        expect(session, isNotNull);
        expect(session!.accessToken, 'stored-token');
        expect(session.refreshToken, 'stale-refresh');
        expect(session.user.email, 'member@globex.test');
      },
    );

    test(
      'restoreSession clears stored token when the backend rejects it',
      () async {
        final client = FakeBackendClient()
          ..storedRefreshToken = 'stale-refresh'
          ..storedToken = 'stale-token'
          ..getError = unauthorizedError('/api/auth/me');
        final service = BackendAuthService(client: client);

        final session = await service.restoreSession();

        expect(session, isNull);
        expect(client.storedToken, isNull);
        expect(client.storedRefreshToken, isNull);
      },
    );

    test(
      'logout clears the local token even if the backend call fails',
      () async {
        final client = FakeBackendClient()
          ..storedRefreshToken = 'refresh-to-clear'
          ..storedToken = 'token-to-clear'
          ..postError = unauthorizedError('/api/auth/logout');
        final service = BackendAuthService(client: client);

        await service.logout();

        expect(client.storedToken, isNull);
        expect(client.storedRefreshToken, isNull);
      },
    );

    test('clearLocalSession clears both access and refresh tokens', () async {
      final client = FakeBackendClient()
        ..storedRefreshToken = 'refresh'
        ..storedToken = 'access';

      final service = BackendAuthService(client: client);

      await service.clearLocalSession();

      expect(client.storedToken, isNull);
      expect(client.storedRefreshToken, isNull);
    });
  });
}
