import 'package:ruh_app/models/agent.dart';
import 'package:ruh_app/models/auth_session.dart';
import 'package:ruh_app/models/conversation.dart';
import 'package:ruh_app/models/marketplace_listing.dart';
import 'package:ruh_app/models/sandbox.dart';
import 'package:ruh_app/services/agent_service.dart';
import 'package:ruh_app/services/auth_service.dart';
import 'package:ruh_app/services/conversation_service.dart';
import 'package:ruh_app/services/login_preferences_service.dart';
import 'package:ruh_app/services/marketplace_service.dart';
import 'package:ruh_app/services/sandbox_service.dart';

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

// ---------------------------------------------------------------------------
// Fake AgentService
// ---------------------------------------------------------------------------

class FakeAgentService implements AgentService {
  List<Agent>? listResult;
  Agent? getResult;
  Agent? launchResult;
  Agent? updateResult;
  WorkspaceMemory? workspaceMemoryResult;
  SandboxHealth? healthResult;
  Object? listError;
  Object? getError;
  Object? launchError;
  Object? deleteError;
  String? lastDeletedId;
  String? lastGetId;

  @override
  Future<List<Agent>> listAgents() async {
    if (listError != null) throw listError!;
    return listResult ?? [];
  }

  @override
  Future<Agent?> getAgent(String id) async {
    lastGetId = id;
    if (getError != null) throw getError!;
    return getResult;
  }

  @override
  Future<Agent> launchAgent(String id) async {
    if (launchError != null) throw launchError!;
    return launchResult!;
  }

  @override
  Future<Agent> updateAgent(String id, Map<String, dynamic> patch) async {
    return updateResult!;
  }

  @override
  Future<void> deleteAgent(String id) async {
    if (deleteError != null) throw deleteError!;
    lastDeletedId = id;
  }

  @override
  Future<WorkspaceMemory> getWorkspaceMemory(String agentId) async {
    return workspaceMemoryResult ?? const WorkspaceMemory();
  }

  @override
  Future<void> updateWorkspaceMemory(String agentId, WorkspaceMemory memory) async {}

  @override
  Future<SandboxHealth> getSandboxHealth(String sandboxId) async {
    if (healthResult != null) return healthResult!;
    return const SandboxHealth(isRunning: true, gatewayStatus: 'healthy');
  }

  @override
  Future<void> restartSandbox(String sandboxId) async {}
}

// ---------------------------------------------------------------------------
// Fake ConversationService
// ---------------------------------------------------------------------------

class FakeConversationService implements ConversationService {
  List<Conversation>? listResult;
  Conversation? createResult;
  List<Message>? messagesResult;

  @override
  Future<List<Conversation>> listConversations(String sandboxId, {int limit = 20}) async {
    return listResult ?? [];
  }

  @override
  Future<Conversation> createConversation(String sandboxId) async {
    return createResult!;
  }

  @override
  Future<List<Message>> getMessages(String sandboxId, String conversationId, {int limit = 50, String? before}) async {
    return messagesResult ?? [];
  }

  @override
  Future<void> renameConversation(String sandboxId, String conversationId, String name) async {}

  @override
  Future<void> deleteConversation(String sandboxId, String conversationId) async {}
}

// ---------------------------------------------------------------------------
// Fake MarketplaceService
// ---------------------------------------------------------------------------

class FakeMarketplaceService implements MarketplaceService {
  MarketplaceListingsResponse? listResult;
  MarketplaceListing? getResult;
  Set<String>? installedIdsResult;
  List<InstalledMarketplaceListing>? installedListingsResult;

  @override
  Future<MarketplaceListingsResponse> listListings({String? search, String? category}) async {
    return listResult ?? const MarketplaceListingsResponse(items: [], total: 0);
  }

  @override
  Future<MarketplaceListing?> getListing(String slug) async {
    return getResult;
  }

  @override
  Future<Set<String>> listInstalledListingIds() async {
    return installedIdsResult ?? {};
  }

  @override
  Future<List<InstalledMarketplaceListing>> listInstalledListings() async {
    return installedListingsResult ?? [];
  }

  @override
  Future<void> installListing(String listingId) async {}
}

// ---------------------------------------------------------------------------
// Fake SandboxService
// ---------------------------------------------------------------------------

class FakeSandboxService implements SandboxService {
  List<SandboxRecord>? listResult;
  SandboxRecord? getResult;
  SandboxHealth? healthResult;
  String? lastDeletedId;

  @override
  Future<List<SandboxRecord>> listSandboxes() async {
    return listResult ?? [];
  }

  @override
  Future<SandboxRecord?> getSandbox(String id) async {
    return getResult;
  }

  @override
  Future<void> deleteSandbox(String id) async {
    lastDeletedId = id;
  }

  @override
  Future<SandboxHealth> getSandboxHealth(String sandboxId) async {
    return healthResult ?? const SandboxHealth(isRunning: true);
  }

  @override
  Future<void> restartSandbox(String sandboxId) async {}

  @override
  Future<List<String>> getWorkspaceFiles(String sandboxId) async => [];

  @override
  Future<String> getWorkspaceFile(String sandboxId, String path) async => '';
}

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

Agent buildAgent({
  String id = 'agent-1',
  String name = 'Test Agent',
  String status = 'active',
  List<String> sandboxIds = const ['sb-1'],
}) {
  final now = DateTime.now();
  return Agent(
    id: id,
    name: name,
    status: status,
    sandboxIds: sandboxIds,
    createdAt: now,
    updatedAt: now,
  );
}

SandboxRecord buildSandboxRecord({
  String sandboxId = 'sb-1',
  String sandboxName = 'test-sandbox',
  String sandboxState = 'running',
}) {
  return SandboxRecord(
    sandboxId: sandboxId,
    sandboxName: sandboxName,
    sandboxState: sandboxState,
    gatewayPort: 18789,
    approved: true,
    createdAt: DateTime.now(),
  );
}

Conversation buildConversation({
  String id = 'conv-1',
  String sandboxId = 'sb-1',
  String name = 'Test Chat',
}) {
  final now = DateTime.now();
  return Conversation(
    id: id,
    sandboxId: sandboxId,
    name: name,
    messageCount: 5,
    createdAt: now,
    updatedAt: now,
  );
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
