import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/customer_agent_config.dart';
import 'package:ruh_app/providers/agent_provider.dart';
import 'package:ruh_app/providers/chat_provider.dart';
import 'package:ruh_app/screens/chat/widgets/computer_view.dart';
import 'package:ruh_app/services/agent_service.dart';

class FakeAgentService extends AgentService {
  FakeAgentService({required this.config});

  final CustomerAgentConfig config;

  @override
  Future<CustomerAgentConfig> getCustomerConfig(String id) async {
    return config;
  }
}

void main() {
  testWidgets('computer view exposes the agent config tab', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          agentServiceProvider.overrideWithValue(
            FakeAgentService(
              config: CustomerAgentConfig(
                agent: CustomerConfigAgentSummary(
                  id: 'agent-1',
                  name: 'Revenue Copilot',
                  avatar: '🤖',
                  description: 'Optimizes spend.',
                  status: 'active',
                  sandboxIds: const ['sandbox-1'],
                  createdAt: DateTime.parse('2026-04-02T10:00:00.000Z'),
                  updatedAt: DateTime.parse('2026-04-02T11:00:00.000Z'),
                ),
              ),
            ),
          ),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: ComputerView(
              agentId: 'agent-1',
              sandboxId: 'sandbox-1',
              chatState: ChatState(sandboxId: 'sandbox-1'),
              initialTab: 'config',
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('Agent Config'), findsOneWidget);
    expect(find.text('Agent configuration'), findsOneWidget);
  });
}
