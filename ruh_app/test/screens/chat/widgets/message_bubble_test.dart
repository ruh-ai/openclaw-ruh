import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/providers/chat_provider.dart';
import 'package:ruh_app/screens/chat/widgets/message_bubble.dart';

/// Wraps a widget in a minimal MaterialApp for testing.
Widget _wrap(Widget child) {
  return MaterialApp(home: Scaffold(body: child));
}

void main() {
  group('MessageBubble — user message', () {
    testWidgets('renders right-aligned with correct text', (tester) async {
      await tester.pumpWidget(_wrap(
        const MessageBubble(content: 'Hello agent', isUser: true),
      ));

      // Text is present
      expect(find.text('Hello agent'), findsOneWidget);

      // Aligned to the right
      final align = tester.widget<Align>(find.byType(Align));
      expect(align.alignment, Alignment.centerRight);
    });

    testWidgets('does not show agent avatar or name', (tester) async {
      await tester.pumpWidget(_wrap(
        const MessageBubble(content: 'Hi', isUser: true),
      ));

      // No avatar circle (Row is only used in assistant bubble)
      expect(find.byType(Row), findsNothing);
    });
  });

  group('MessageBubble — assistant message', () {
    testWidgets('renders left-aligned with correct text', (tester) async {
      await tester.pumpWidget(_wrap(
        const MessageBubble(content: 'I can help', isUser: false),
      ));

      expect(find.text('I can help'), findsOneWidget);

      // The outermost Align should be centerLeft
      final aligns = tester.widgetList<Align>(find.byType(Align)).toList();
      expect(aligns.first.alignment, Alignment.centerLeft);
    });

    testWidgets('shows default avatar R when no agentAvatar provided',
        (tester) async {
      await tester.pumpWidget(_wrap(
        const MessageBubble(content: 'Hello', isUser: false),
      ));

      expect(find.text('R'), findsOneWidget);
    });

    testWidgets('shows custom avatar letter', (tester) async {
      await tester.pumpWidget(_wrap(
        const MessageBubble(
          content: 'Hello',
          isUser: false,
          agentAvatar: 'G',
        ),
      ));

      expect(find.text('G'), findsOneWidget);
    });

    testWidgets('shows agent name label when provided', (tester) async {
      await tester.pumpWidget(_wrap(
        const MessageBubble(
          content: 'Hello',
          isUser: false,
          agentName: 'Google Ads Agent',
        ),
      ));

      expect(find.text('Google Ads Agent'), findsOneWidget);
    });
  });

  group('MessageBubble — tool calls', () {
    testWidgets('renders tool call chips when toolCalls provided',
        (tester) async {
      await tester.pumpWidget(_wrap(
        MessageBubble(
          content: 'Running tools',
          isUser: false,
          toolCalls: [
            ToolCall(
                name: 'search_google',
                arguments: {'query': 'flutter testing'}),
            ToolCall(name: 'fetch_url', arguments: {'url': 'https://x.com'}),
          ],
        ),
      ));

      // Tool names should be visible
      expect(find.text('search_google'), findsOneWidget);
      expect(find.text('fetch_url'), findsOneWidget);

      // Tool icons present (build_outlined)
      expect(find.byIcon(Icons.build_outlined), findsNWidgets(2));
    });

    testWidgets('tool call expands on tap to show arguments', (tester) async {
      await tester.pumpWidget(_wrap(
        MessageBubble(
          content: 'Done',
          isUser: false,
          toolCalls: [
            ToolCall(name: 'search', arguments: {'q': 'hello'}),
          ],
        ),
      ));

      // Arguments not visible initially
      expect(find.text('q: hello'), findsNothing);

      // Tap the tool call chip to expand
      await tester.tap(find.text('search'));
      await tester.pumpAndSettle();

      // Arguments now visible
      expect(find.text('q: hello'), findsOneWidget);
    });
  });

  group('MessageBubble — streaming indicator', () {
    testWidgets('shows blinking cursor when isStreaming is true',
        (tester) async {
      await tester.pumpWidget(_wrap(
        const MessageBubble(
          content: 'Thinking',
          isUser: false,
          isStreaming: true,
        ),
      ));

      // The block cursor character ▌
      expect(find.text('\u258C'), findsOneWidget);
    });

    testWidgets('no blinking cursor when isStreaming is false',
        (tester) async {
      await tester.pumpWidget(_wrap(
        const MessageBubble(content: 'Done', isUser: false),
      ));

      expect(find.text('\u258C'), findsNothing);
    });
  });

  group('MessageBubble — plan stripping', () {
    testWidgets('strips <plan> tags from displayed content', (tester) async {
      await tester.pumpWidget(_wrap(
        const MessageBubble(
          content: '<plan>1. Step one\n2. Step two</plan>Working on it',
          isUser: false,
        ),
      ));

      // Plan tag content should not appear as raw text in the message bubble
      expect(find.text('<plan>1. Step one\n2. Step two</plan>Working on it'),
          findsNothing);
      // Stripped text should appear
      expect(find.textContaining('Working on it'), findsWidgets);
    });
  });
}
