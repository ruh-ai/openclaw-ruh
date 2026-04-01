import 'package:shared_preferences/shared_preferences.dart';

const String rememberEmailPreferenceKey = 'ruh_login_remember_email';
const String rememberedEmailPreferenceKey = 'ruh_login_saved_email';

class LoginPreferences {
  const LoginPreferences({
    required this.rememberEmail,
    this.email,
  });

  final bool rememberEmail;
  final String? email;
}

abstract class LoginPreferencesService {
  Future<LoginPreferences> load();

  Future<void> save({
    required bool rememberEmail,
    required String email,
  });
}

class SharedPreferencesLoginPreferencesService
    implements LoginPreferencesService {
  SharedPreferencesLoginPreferencesService({
    Future<SharedPreferences> Function()? sharedPreferencesFactory,
  }) : _sharedPreferencesFactory =
           sharedPreferencesFactory ?? SharedPreferences.getInstance;

  final Future<SharedPreferences> Function() _sharedPreferencesFactory;

  @override
  Future<LoginPreferences> load() async {
    final prefs = await _sharedPreferencesFactory();
    final rememberEmail =
        prefs.getBool(rememberEmailPreferenceKey) ?? false;
    final email = prefs.getString(rememberedEmailPreferenceKey)?.trim();

    if (!rememberEmail || email == null || email.isEmpty) {
      return const LoginPreferences(rememberEmail: false);
    }

    return LoginPreferences(rememberEmail: true, email: email);
  }

  @override
  Future<void> save({
    required bool rememberEmail,
    required String email,
  }) async {
    final prefs = await _sharedPreferencesFactory();
    if (!rememberEmail) {
      await prefs.setBool(rememberEmailPreferenceKey, false);
      await prefs.remove(rememberedEmailPreferenceKey);
      return;
    }

    final trimmedEmail = email.trim();
    await prefs.setBool(rememberEmailPreferenceKey, true);
    await prefs.setString(rememberedEmailPreferenceKey, trimmedEmail);
  }
}
