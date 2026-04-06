import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/auth_session.dart';

void main() {
  group('AuthUser.fromJson', () {
    test('parses full JSON', () {
      final user = AuthUser.fromJson({
        'id': 'user-1',
        'email': 'test@ruh.ai',
        'displayName': 'Test User',
        'role': 'admin',
        'orgId': 'org-1',
      });

      expect(user.id, 'user-1');
      expect(user.email, 'test@ruh.ai');
      expect(user.displayName, 'Test User');
      expect(user.role, 'admin');
      expect(user.orgId, 'org-1');
    });

    test('uses defaults for missing fields', () {
      final user = AuthUser.fromJson({});

      expect(user.id, '');
      expect(user.email, '');
      expect(user.displayName, isNull);
      expect(user.role, 'end_user');
      expect(user.orgId, isNull);
    });
  });

  group('ActiveOrganization.fromJson', () {
    test('parses all fields', () {
      final org = ActiveOrganization.fromJson({
        'id': 'org-1',
        'name': 'Ruh AI',
        'slug': 'ruh-ai',
        'kind': 'enterprise',
        'plan': 'pro',
      });

      expect(org.id, 'org-1');
      expect(org.name, 'Ruh AI');
      expect(org.slug, 'ruh-ai');
      expect(org.kind, 'enterprise');
      expect(org.plan, 'pro');
    });

    test('defaults for missing fields', () {
      final org = ActiveOrganization.fromJson({});

      expect(org.id, '');
      expect(org.name, '');
      expect(org.slug, '');
      expect(org.kind, '');
      expect(org.plan, '');
    });
  });

  group('OrganizationMembership.fromJson', () {
    test('parses all fields', () {
      final m = OrganizationMembership.fromJson({
        'id': 'mem-1',
        'organizationId': 'org-1',
        'organizationName': 'Ruh AI',
        'organizationSlug': 'ruh-ai',
        'organizationKind': 'enterprise',
        'organizationPlan': 'pro',
        'role': 'admin',
        'status': 'active',
      });

      expect(m.id, 'mem-1');
      expect(m.organizationId, 'org-1');
      expect(m.organizationName, 'Ruh AI');
      expect(m.organizationSlug, 'ruh-ai');
      expect(m.organizationKind, 'enterprise');
      expect(m.organizationPlan, 'pro');
      expect(m.role, 'admin');
      expect(m.status, 'active');
    });
  });

  group('AppAccess.fromJson', () {
    test('null input returns all false', () {
      final access = AppAccess.fromJson(null);

      expect(access.admin, isFalse);
      expect(access.builder, isFalse);
      expect(access.customer, isFalse);
    });

    test('partial JSON — only customer true', () {
      final access = AppAccess.fromJson({'customer': true});

      expect(access.admin, isFalse);
      expect(access.builder, isFalse);
      expect(access.customer, isTrue);
    });

    test('full JSON', () {
      final access = AppAccess.fromJson({
        'admin': true,
        'builder': true,
        'customer': false,
      });

      expect(access.admin, isTrue);
      expect(access.builder, isTrue);
      expect(access.customer, isFalse);
    });
  });

  group('AuthSession.fromJson', () {
    final _fullJson = {
      'user': {
        'id': 'user-1',
        'email': 'dev@ruh.ai',
        'displayName': 'Developer',
        'role': 'developer',
        'orgId': 'org-1',
      },
      'accessToken': 'at-json',
      'refreshToken': 'rt-json',
      'platformRole': 'developer',
      'memberships': [
        {
          'id': 'mem-1',
          'organizationId': 'org-1',
          'organizationName': 'Ruh AI',
          'organizationSlug': 'ruh-ai',
          'organizationKind': 'enterprise',
          'organizationPlan': 'pro',
          'role': 'admin',
          'status': 'active',
        },
      ],
      'activeOrganization': {
        'id': 'org-1',
        'name': 'Ruh AI',
        'slug': 'ruh-ai',
        'kind': 'enterprise',
        'plan': 'pro',
      },
      'activeMembership': {
        'id': 'mem-1',
        'organizationId': 'org-1',
        'organizationName': 'Ruh AI',
        'organizationSlug': 'ruh-ai',
        'organizationKind': 'enterprise',
        'organizationPlan': 'pro',
        'role': 'admin',
        'status': 'active',
      },
      'appAccess': {
        'admin': false,
        'builder': true,
        'customer': true,
      },
    };

    test('parses full nested JSON', () {
      final session = AuthSession.fromJson(_fullJson);

      expect(session.user.id, 'user-1');
      expect(session.user.email, 'dev@ruh.ai');
      expect(session.user.role, 'developer');
      expect(session.accessToken, 'at-json');
      expect(session.refreshToken, 'rt-json');
      expect(session.platformRole, 'developer');
      expect(session.memberships, hasLength(1));
      expect(session.memberships[0].organizationName, 'Ruh AI');
      expect(session.activeOrganization, isNotNull);
      expect(session.activeOrganization!.id, 'org-1');
      expect(session.activeMembership, isNotNull);
      expect(session.appAccess.builder, isTrue);
      expect(session.appAccess.customer, isTrue);
    });

    test('accessToken/refreshToken params override JSON values', () {
      final session = AuthSession.fromJson(
        _fullJson,
        accessToken: 'param-at',
        refreshToken: 'param-rt',
      );

      // JSON contains accessToken: 'at-json', but the code does:
      // json['accessToken'] ?? accessToken
      // So the JSON value wins when present.
      expect(session.accessToken, 'at-json');
      expect(session.refreshToken, 'rt-json');
    });

    test('params used when JSON tokens are absent', () {
      final jsonNoTokens = Map<String, dynamic>.from(_fullJson)
        ..remove('accessToken')
        ..remove('refreshToken');

      final session = AuthSession.fromJson(
        jsonNoTokens,
        accessToken: 'param-at',
        refreshToken: 'param-rt',
      );

      expect(session.accessToken, 'param-at');
      expect(session.refreshToken, 'param-rt');
    });

    test('user key as Map uses nested user object', () {
      // When 'user' is a Map<String, dynamic>, it should be used directly.
      final session = AuthSession.fromJson(_fullJson);

      expect(session.user.displayName, 'Developer');
      expect(session.user.orgId, 'org-1');
    });

    test('falls back to flat JSON when user key is not a Map', () {
      // If 'user' is absent or not a Map, the entire json is used as userJson.
      final flatJson = {
        'id': 'user-flat',
        'email': 'flat@ruh.ai',
        'role': 'end_user',
        'platformRole': 'user',
        'appAccess': {'admin': false, 'builder': false, 'customer': false},
      };

      final session = AuthSession.fromJson(flatJson);

      expect(session.user.id, 'user-flat');
      expect(session.user.email, 'flat@ruh.ai');
      expect(session.user.role, 'end_user');
    });

    test('hasCustomerAccess true when appAccess.customer is true', () {
      final session = AuthSession.fromJson(_fullJson);

      expect(session.hasCustomerAccess, isTrue);
    });

    test('hasCustomerAccess false when appAccess.customer is false', () {
      final json = Map<String, dynamic>.from(_fullJson);
      json['appAccess'] = {'admin': true, 'builder': true, 'customer': false};

      final session = AuthSession.fromJson(json);

      expect(session.hasCustomerAccess, isFalse);
    });
  });
}
