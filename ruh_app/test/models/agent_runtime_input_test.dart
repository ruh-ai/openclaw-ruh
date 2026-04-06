import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/agent.dart';

void main() {
  group('AgentRuntimeInput', () {
    test('fromJson parses all fields including populationStrategy', () {
      final input = AgentRuntimeInput.fromJson({
        'key': 'COMPANY_NAME',
        'label': 'Company Name',
        'description': 'The company this agent works for',
        'required': true,
        'source': 'architect_requirement',
        'value': 'Acme Corp',
        'populationStrategy': 'ai_inferred',
        'inputType': 'text',
        'defaultValue': 'My Company',
        'example': 'Acme Corp',
        'options': ['Acme Corp', 'Globex'],
        'group': 'Behavior',
      });

      expect(input.key, 'COMPANY_NAME');
      expect(input.label, 'Company Name');
      expect(input.required, true);
      expect(input.value, 'Acme Corp');
      expect(input.populationStrategy, 'ai_inferred');
      expect(input.inputType, 'text');
      expect(input.defaultValue, 'My Company');
      expect(input.example, 'Acme Corp');
      expect(input.options, ['Acme Corp', 'Globex']);
      expect(input.group, 'Behavior');
    });

    test('fromJson defaults populationStrategy to user_required', () {
      final input = AgentRuntimeInput.fromJson({
        'key': 'API_KEY',
        'label': 'API Key',
        'description': 'Secret',
        'required': true,
        'value': '',
      });

      expect(input.populationStrategy, 'user_required');
      expect(input.inputType, 'text');
    });

    test('isFilled returns true when value is set', () {
      final input = AgentRuntimeInput(key: 'K', value: 'val');
      expect(input.isFilled, true);
    });

    test('isFilled returns true when defaultValue is set but value is empty', () {
      final input = AgentRuntimeInput(key: 'K', value: '', defaultValue: 'def');
      expect(input.isFilled, true);
    });

    test('isFilled returns false when both value and defaultValue are empty', () {
      final input = AgentRuntimeInput(key: 'K', value: '');
      expect(input.isFilled, false);
    });

    test('isUserRequired returns true for user_required strategy', () {
      final input = AgentRuntimeInput(key: 'K', populationStrategy: 'user_required');
      expect(input.isUserRequired, true);
    });

    test('isUserRequired returns false for ai_inferred strategy', () {
      final input = AgentRuntimeInput(key: 'K', populationStrategy: 'ai_inferred');
      expect(input.isUserRequired, false);
    });

    test('toJson round-trips correctly', () {
      final input = AgentRuntimeInput(
        key: 'K',
        label: 'Label',
        description: 'Desc',
        required: true,
        value: 'val',
        populationStrategy: 'static_default',
        inputType: 'number',
        defaultValue: '42',
        example: '100',
        options: ['a', 'b'],
        group: 'Behavior',
      );

      final json = input.toJson();
      final restored = AgentRuntimeInput.fromJson(json);

      expect(restored.key, input.key);
      expect(restored.populationStrategy, 'static_default');
      expect(restored.inputType, 'number');
      expect(restored.defaultValue, '42');
      expect(restored.options, ['a', 'b']);
    });
  });

  group('Agent.hasMissingRequiredInputs', () {
    test('returns true when user_required input has no value', () {
      final agent = Agent(
        id: '1',
        name: 'Test',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        runtimeInputs: [
          AgentRuntimeInput(
            key: 'API_KEY',
            required: true,
            populationStrategy: 'user_required',
            value: '',
          ),
        ],
      );
      expect(agent.hasMissingRequiredInputs, true);
    });

    test('returns false when user_required input has a value', () {
      final agent = Agent(
        id: '1',
        name: 'Test',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        runtimeInputs: [
          AgentRuntimeInput(
            key: 'API_KEY',
            required: true,
            populationStrategy: 'user_required',
            value: 'sk-123',
          ),
        ],
      );
      expect(agent.hasMissingRequiredInputs, false);
    });

    test('does NOT block on ai_inferred even when empty', () {
      final agent = Agent(
        id: '1',
        name: 'Test',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        runtimeInputs: [
          AgentRuntimeInput(
            key: 'COMPANY',
            required: true,
            populationStrategy: 'ai_inferred',
            value: '',
          ),
        ],
      );
      expect(agent.hasMissingRequiredInputs, false);
    });

    test('does NOT block on static_default even when empty', () {
      final agent = Agent(
        id: '1',
        name: 'Test',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        runtimeInputs: [
          AgentRuntimeInput(
            key: 'LOG_LEVEL',
            required: true,
            populationStrategy: 'static_default',
            value: '',
            defaultValue: 'info',
          ),
        ],
      );
      expect(agent.hasMissingRequiredInputs, false);
    });

    test('returns false when no inputs exist', () {
      final agent = Agent(
        id: '1',
        name: 'Test',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      expect(agent.hasMissingRequiredInputs, false);
    });
  });
}
