import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/providers/chat_provider.dart';

void main() {
  group('TaskPlan', () {
    group('tryParse', () {
      test('returns null for content with no checkboxes', () {
        expect(TaskPlan.tryParse('Hello world'), isNull);
        expect(TaskPlan.tryParse(''), isNull);
        expect(TaskPlan.tryParse('- just a list item'), isNull);
      });

      test('parses simple checkbox list', () {
        const content = '''
- [ ] Step one
- [ ] Step two
- [ ] Step three
''';
        final plan = TaskPlan.tryParse(content);

        expect(plan, isNotNull);
        expect(plan!.items, hasLength(3));
        expect(plan.items[0].label, 'Step one');
        expect(plan.items[1].label, 'Step two');
        expect(plan.items[2].label, 'Step three');
      });

      test('marks checked items as done', () {
        const content = '''
- [x] Done step
- [ ] Pending step
''';
        final plan = TaskPlan.tryParse(content)!;

        expect(plan.items[0].status, 'done');
        expect(plan.items[1].status, 'active'); // first non-done becomes active
      });

      test('marks the first non-done item as active', () {
        const content = '''
- [x] Completed
- [x] Also done
- [ ] Should be active
- [ ] Still pending
''';
        final plan = TaskPlan.tryParse(content)!;

        expect(plan.items[0].status, 'done');
        expect(plan.items[1].status, 'done');
        expect(plan.items[2].status, 'active');
        expect(plan.items[3].status, 'pending');
      });

      test('parses nested child items with indentation', () {
        const content = '''
- [ ] Parent task
  - [ ] Child task
- [ ] Another parent
''';
        final plan = TaskPlan.tryParse(content)!;

        expect(plan.items, hasLength(2));
        expect(plan.items[0].children, hasLength(1));
        expect(plan.items[0].children[0].label, 'Child task');
        expect(plan.items[1].children, isEmpty);
      });

      test('handles uppercase X for checked items', () {
        const content = '- [X] Done with uppercase X\n- [ ] Pending\n';
        final plan = TaskPlan.tryParse(content)!;

        expect(plan.items[0].status, 'done');
      });
    });

    group('TaskPlan computed properties', () {
      test('totalTasks counts items and children', () {
        final plan = TaskPlan(items: [
          TaskPlanItem(
            label: 'Parent',
            children: [
              TaskPlanItem(label: 'Child 1'),
              TaskPlanItem(label: 'Child 2'),
            ],
          ),
          TaskPlanItem(label: 'Standalone'),
        ]);

        expect(plan.totalTasks, 4); // parent + 2 children + standalone
      });

      test('completedTasks counts done items and done children', () {
        final plan = TaskPlan(items: [
          TaskPlanItem(
            label: 'Parent',
            status: 'done',
            children: [
              TaskPlanItem(label: 'Child done', status: 'done'),
              TaskPlanItem(label: 'Child pending'),
            ],
          ),
          TaskPlanItem(label: 'Pending top-level'),
        ]);

        expect(plan.completedTasks, 2); // parent + done child
      });

      test('currentIndex returns index of first non-done item', () {
        final plan = TaskPlan(items: [
          TaskPlanItem(label: 'Done', status: 'done'),
          TaskPlanItem(label: 'Active', status: 'active'),
          TaskPlanItem(label: 'Pending'),
        ]);

        expect(plan.currentIndex, 1);
      });

      test('currentIndex returns -1 when all items are done', () {
        final plan = TaskPlan(items: [
          TaskPlanItem(label: 'All done', status: 'done'),
        ]);

        expect(plan.currentIndex, -1);
      });
    });
  });

  group('ChatMessage', () {
    test('starts with empty content and not streaming by default', () {
      final msg = ChatMessage(role: 'user', content: 'Hello');
      expect(msg.content, 'Hello');
      expect(msg.isStreaming, isFalse);
      expect(msg.toolCalls, isEmpty);
      expect(msg.steps, isEmpty);
    });

    test('defaults content to empty string', () {
      final msg = ChatMessage(role: 'assistant');
      expect(msg.content, '');
    });
  });

  group('ChatState', () {
    test('copyWith preserves fields not explicitly overridden', () {
      const state = ChatState(
        sandboxId: 'sb-1',
        conversationId: 'conv-1',
        isStreaming: false,
      );

      final updated = state.copyWith(isStreaming: true);

      expect(updated.sandboxId, 'sb-1');
      expect(updated.conversationId, 'conv-1');
      expect(updated.isStreaming, isTrue);
    });

    test('copyWith clears error field when not supplied', () {
      const state = ChatState(sandboxId: 'sb-1', error: 'some error');
      final updated = state.copyWith(isStreaming: false);
      // error is reset to null when not provided (copyWith design)
      expect(updated.error, isNull);
    });
  });

  group('ChatStep', () {
    test('copyWith updates only specified fields', () {
      final step = ChatStep(
        id: 1,
        kind: 'tool',
        label: 'bash',
        status: 'active',
        startedAt: 1000,
      );

      final updated = step.copyWith(status: 'done', elapsedMs: 250);

      expect(updated.id, 1);
      expect(updated.kind, 'tool');
      expect(updated.label, 'bash');
      expect(updated.status, 'done');
      expect(updated.elapsedMs, 250);
    });
  });
}
