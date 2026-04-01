import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/main.dart';

void main() {
  testWidgets('App renders without crashing', (WidgetTester tester) async {
    await tester.pumpWidget(const RuhApp());
    expect(find.text('Ruh'), findsOneWidget);
  });
}
