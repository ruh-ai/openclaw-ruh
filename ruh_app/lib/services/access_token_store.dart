import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'logger.dart';

const String accessTokenStorageKey = 'ruh_access_token';

abstract class SecureTokenStore {
  Future<void> write(String key, String value);

  Future<String?> read(String key);

  Future<void> delete(String key);
}

abstract class FallbackTokenStore {
  Future<void> setString(String key, String value);

  Future<String?> getString(String key);

  Future<void> remove(String key);
}

class FlutterSecureTokenStore implements SecureTokenStore {
  FlutterSecureTokenStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const MacOsOptions _macOsOptions = MacOsOptions(
    useDataProtectionKeyChain: false,
  );

  @override
  Future<void> write(String key, String value) {
    return _storage.write(key: key, value: value, mOptions: _macOsOptions);
  }

  @override
  Future<String?> read(String key) {
    return _storage.read(key: key, mOptions: _macOsOptions);
  }

  @override
  Future<void> delete(String key) {
    return _storage.delete(key: key, mOptions: _macOsOptions);
  }
}

class SharedPreferencesTokenStore implements FallbackTokenStore {
  SharedPreferencesTokenStore(this._prefs);

  final SharedPreferences _prefs;

  @override
  Future<void> setString(String key, String value) async {
    await _prefs.setString(key, value);
  }

  @override
  Future<String?> getString(String key) async {
    return _prefs.getString(key);
  }

  @override
  Future<void> remove(String key) async {
    await _prefs.remove(key);
  }
}

class AccessTokenStore {
  AccessTokenStore({
    SecureTokenStore? secureStore,
    Future<FallbackTokenStore> Function()? fallbackStoreFactory,
    bool? allowInsecureFallback,
  }) : _secureStore = secureStore ?? FlutterSecureTokenStore(),
       _fallbackStoreFactory =
           fallbackStoreFactory ??
           (() async => SharedPreferencesTokenStore(
             await SharedPreferences.getInstance(),
           )),
       _allowInsecureFallback = allowInsecureFallback ?? _defaultAllowFallback;

  static bool get _defaultAllowFallback =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.macOS;

  final SecureTokenStore _secureStore;
  final Future<FallbackTokenStore> Function() _fallbackStoreFactory;
  final bool _allowInsecureFallback;

  Future<void> write(String token) async {
    try {
      await _secureStore.write(accessTokenStorageKey, token);
      if (_allowInsecureFallback) {
        final fallbackStore = await _fallbackStoreFactory();
        await fallbackStore.remove(accessTokenStorageKey);
      }
    } catch (error, stackTrace) {
      final fallbackStore = await _fallbackFor(
        'write',
        error: error,
        stackTrace: stackTrace,
      );
      if (fallbackStore == null) rethrow;
      await fallbackStore.setString(accessTokenStorageKey, token);
    }
  }

  Future<String?> read() async {
    try {
      final value = await _secureStore.read(accessTokenStorageKey);
      if (value != null && value.isNotEmpty) {
        return value;
      }
    } catch (error, stackTrace) {
      final fallbackStore = await _fallbackFor(
        'read',
        error: error,
        stackTrace: stackTrace,
      );
      if (fallbackStore == null) rethrow;
      return fallbackStore.getString(accessTokenStorageKey);
    }

    if (!_allowInsecureFallback) {
      return null;
    }

    final fallbackStore = await _fallbackStoreFactory();
    return fallbackStore.getString(accessTokenStorageKey);
  }

  Future<void> clear() async {
    try {
      await _secureStore.delete(accessTokenStorageKey);
    } catch (error, stackTrace) {
      final fallbackStore = await _fallbackFor(
        'delete',
        error: error,
        stackTrace: stackTrace,
      );
      if (fallbackStore == null) rethrow;
      await fallbackStore.remove(accessTokenStorageKey);
      return;
    }

    if (_allowInsecureFallback) {
      final fallbackStore = await _fallbackStoreFactory();
      await fallbackStore.remove(accessTokenStorageKey);
    }
  }

  Future<FallbackTokenStore?> _fallbackFor(
    String operation, {
    required Object error,
    required StackTrace stackTrace,
  }) async {
    if (!_allowInsecureFallback) {
      return null;
    }

    Log.w(
      'AccessTokenStore',
      'Secure token storage failed during $operation. Falling back to shared preferences on macOS debug.',
      error,
    );
    Log.d('AccessTokenStore', stackTrace.toString());
    return _fallbackStoreFactory();
  }
}
