import 'package:ruh_app/models/auth_session.dart';
import 'package:ruh_app/services/auth_service.dart';
import 'package:ruh_app/services/login_preferences_service.dart';

class FakeAuthService implements AuthService {
  AuthSession? restoreResult;
  Object? restoreError;
  AuthSession? loginResult;
  Object? loginError;
  bool logoutCalled = false;
  bool clearLocalSessionCalled = false;
  String? lastSwitchedOrganizationId;
  String? lastEmail;
  String? lastPassword;

  @override
  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    lastEmail = email;
    lastPassword = password;
    if (loginError != null) {
      throw loginError!;
    }
    if (loginResult == null) {
      throw const AuthException('Missing fake login result');
    }
    return loginResult!;
  }

  @override
  Future<AuthSession?> restoreSession() async {
    if (restoreError != null) {
      throw restoreError!;
    }
    return restoreResult;
  }

  @override
  Future<void> logout() async {
    logoutCalled = true;
  }

  @override
  Future<void> clearLocalSession() async {
    clearLocalSessionCalled = true;
  }

  @override
  Future<AuthSession> switchOrganization({
    required String organizationId,
    required String refreshToken,
  }) async {
    lastSwitchedOrganizationId = organizationId;
    if (loginResult == null) {
      throw const AuthException('Missing fake login result');
    }
    return loginResult!;
  }
}

class FakeLoginPreferencesService implements LoginPreferencesService {
  LoginPreferences loadResult = const LoginPreferences(rememberEmail: false);
  bool? lastRememberEmail;
  String? lastSavedEmail;

  @override
  Future<LoginPreferences> load() async => loadResult;

  @override
  Future<void> save({
    required bool rememberEmail,
    required String email,
  }) async {
    lastRememberEmail = rememberEmail;
    lastSavedEmail = email;
  }
}

AuthSession buildAuthSession({
  bool customerAccess = true,
  String email = 'admin@globex.test',
  String organizationName = 'Globex',
  String role = 'employee',
}) {
  final membership = OrganizationMembership(
    id: 'membership-1',
    organizationId: 'org-1',
    organizationName: organizationName,
    organizationSlug: organizationName.toLowerCase(),
    organizationKind: customerAccess ? 'customer' : 'developer',
    organizationPlan: 'starter',
    role: role,
    status: 'active',
  );

  return AuthSession(
    user: AuthUser(
      id: 'user-1',
      email: email,
      displayName: 'Test User',
      role: customerAccess ? 'end_user' : 'developer',
      orgId: 'org-1',
    ),
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    platformRole: 'user',
    memberships: [membership],
    activeOrganization: ActiveOrganization(
      id: 'org-1',
      name: organizationName,
      slug: organizationName.toLowerCase(),
      kind: customerAccess ? 'customer' : 'developer',
      plan: 'starter',
    ),
    activeMembership: membership,
    appAccess: AppAccess(
      admin: false,
      builder: !customerAccess,
      customer: customerAccess,
    ),
  );
}
