import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/services/login_preferences_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('SharedPreferencesLoginPreferencesService', () {
    test('loads a remembered email only when opt-in is enabled', () async {
      SharedPreferences.setMockInitialValues({
        rememberEmailPreferenceKey: true,
        rememberedEmailPreferenceKey: 'prasanjit@ruh.ai',
      });

      final service = SharedPreferencesLoginPreferencesService();
      final preferences = await service.load();

      expect(preferences.rememberEmail, isTrue);
      expect(preferences.email, 'prasanjit@ruh.ai');
    });

    test('returns empty preferences when remember me is disabled', () async {
      SharedPreferences.setMockInitialValues({
        rememberEmailPreferenceKey: false,
        rememberedEmailPreferenceKey: 'prasanjit@ruh.ai',
      });

      final service = SharedPreferencesLoginPreferencesService();
      final preferences = await service.load();

      expect(preferences.rememberEmail, isFalse);
      expect(preferences.email, isNull);
    });

    test('saves and clears remembered email values', () async {
      SharedPreferences.setMockInitialValues({});
      final service = SharedPreferencesLoginPreferencesService();

      await service.save(rememberEmail: true, email: ' prasanjit@ruh.ai ');

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool(rememberEmailPreferenceKey), isTrue);
      expect(
        prefs.getString(rememberedEmailPreferenceKey),
        'prasanjit@ruh.ai',
      );

      await service.save(rememberEmail: false, email: 'prasanjit@ruh.ai');

      expect(prefs.getBool(rememberEmailPreferenceKey), isFalse);
      expect(prefs.getString(rememberedEmailPreferenceKey), isNull);
    });
  });
}
