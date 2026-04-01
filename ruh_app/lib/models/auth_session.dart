class AppAccess {
  final bool admin;
  final bool builder;
  final bool customer;

  const AppAccess({
    required this.admin,
    required this.builder,
    required this.customer,
  });

  factory AppAccess.fromJson(Map<String, dynamic>? json) {
    return AppAccess(
      admin: json?['admin'] == true,
      builder: json?['builder'] == true,
      customer: json?['customer'] == true,
    );
  }
}

class ActiveOrganization {
  final String id;
  final String name;
  final String slug;
  final String kind;
  final String plan;

  const ActiveOrganization({
    required this.id,
    required this.name,
    required this.slug,
    required this.kind,
    required this.plan,
  });

  factory ActiveOrganization.fromJson(Map<String, dynamic> json) {
    return ActiveOrganization(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      kind: json['kind'] as String? ?? '',
      plan: json['plan'] as String? ?? '',
    );
  }
}

class OrganizationMembership {
  final String id;
  final String organizationId;
  final String organizationName;
  final String organizationSlug;
  final String organizationKind;
  final String organizationPlan;
  final String role;
  final String status;

  const OrganizationMembership({
    required this.id,
    required this.organizationId,
    required this.organizationName,
    required this.organizationSlug,
    required this.organizationKind,
    required this.organizationPlan,
    required this.role,
    required this.status,
  });

  factory OrganizationMembership.fromJson(Map<String, dynamic> json) {
    return OrganizationMembership(
      id: json['id'] as String? ?? '',
      organizationId: json['organizationId'] as String? ?? '',
      organizationName: json['organizationName'] as String? ?? '',
      organizationSlug: json['organizationSlug'] as String? ?? '',
      organizationKind: json['organizationKind'] as String? ?? '',
      organizationPlan: json['organizationPlan'] as String? ?? '',
      role: json['role'] as String? ?? '',
      status: json['status'] as String? ?? '',
    );
  }
}

class AuthUser {
  final String id;
  final String email;
  final String? displayName;
  final String role;
  final String? orgId;

  const AuthUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.role,
    required this.orgId,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String? ?? '',
      email: json['email'] as String? ?? '',
      displayName: json['displayName'] as String?,
      role: json['role'] as String? ?? 'end_user',
      orgId: json['orgId'] as String?,
    );
  }
}

class AuthSession {
  final AuthUser user;
  final String? accessToken;
  final String? refreshToken;
  final String platformRole;
  final List<OrganizationMembership> memberships;
  final ActiveOrganization? activeOrganization;
  final OrganizationMembership? activeMembership;
  final AppAccess appAccess;

  const AuthSession({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
    required this.platformRole,
    required this.memberships,
    required this.activeOrganization,
    required this.activeMembership,
    required this.appAccess,
  });

  bool get hasCustomerAccess => appAccess.customer;

  factory AuthSession.fromJson(
    Map<String, dynamic> json, {
    String? accessToken,
    String? refreshToken,
  }) {
    final userJson = json['user'] is Map<String, dynamic>
        ? json['user'] as Map<String, dynamic>
        : json;
    final membershipsJson = json['memberships'] as List<dynamic>? ?? const [];
    final activeOrganizationJson =
        json['activeOrganization'] as Map<String, dynamic>?;
    final activeMembershipJson =
        json['activeMembership'] as Map<String, dynamic>?;

    return AuthSession(
      user: AuthUser.fromJson(userJson),
      accessToken: json['accessToken'] as String? ?? accessToken,
      refreshToken: json['refreshToken'] as String? ?? refreshToken,
      platformRole: json['platformRole'] as String? ?? 'user',
      memberships: membershipsJson
          .whereType<Map<String, dynamic>>()
          .map(OrganizationMembership.fromJson)
          .toList(),
      activeOrganization: activeOrganizationJson == null
          ? null
          : ActiveOrganization.fromJson(activeOrganizationJson),
      activeMembership: activeMembershipJson == null
          ? null
          : OrganizationMembership.fromJson(activeMembershipJson),
      appAccess: AppAccess.fromJson(json['appAccess'] as Map<String, dynamic>?),
    );
  }
}
