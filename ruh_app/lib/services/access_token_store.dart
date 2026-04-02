import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'logger.dart';

const String accessTokenStorageKey = 'ruh_access_token';
const String refreshTokenStorageKey = 'ruh_refresh_token';

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
  String? _cachedAccessToken;
  String? _cachedRefreshToken;

  Future<void> write(String token) async {
    _cachedAccessToken = token;
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
      if (fallbackStore == null) return;
      await fallbackStore.setString(accessTokenStorageKey, token);
    }
  }

  Future<String?> read() async {
    final cachedToken = _cachedAccessToken;
    if (cachedToken != null && cachedToken.isNotEmpty) {
      return cachedToken;
    }

    try {
      final value = await _secureStore.read(accessTokenStorageKey);
      if (value != null && value.isNotEmpty) {
        _cachedAccessToken = value;
        return value;
      }
    } catch (error, stackTrace) {
      final fallbackStore = await _fallbackFor(
        'read',
        error: error,
        stackTrace: stackTrace,
      );
      if (fallbackStore == null) {
        return _cachedAccessToken;
      }
      final fallbackValue = await fallbackStore.getString(accessTokenStorageKey);
      if (fallbackValue != null && fallbackValue.isNotEmpty) {
        _cachedAccessToken = fallbackValue;
      }
      return fallbackValue;
    }

    if (!_allowInsecureFallback) {
      return null;
    }

    final fallbackStore = await _fallbackStoreFactory();
    final fallbackValue = await fallbackStore.getString(accessTokenStorageKey);
    if (fallbackValue != null && fallbackValue.isNotEmpty) {
      _cachedAccessToken = fallbackValue;
    }
    return fallbackValue;
  }

  Future<void> clear() async {
    _cachedAccessToken = null;
    try {
      await _secureStore.delete(accessTokenStorageKey);
    } catch (error, stackTrace) {
      final fallbackStore = await _fallbackFor(
        'delete',
        error: error,
        stackTrace: stackTrace,
      );
      if (fallbackStore == null) return;
      await fallbackStore.remove(accessTokenStorageKey);
      return;
    }

    if (_allowInsecureFallback) {
      final fallbackStore = await _fallbackStoreFactory();
      await fallbackStore.remove(accessTokenStorageKey);
    }
  }

  Future<void> writeRefreshToken(String token) async {
    _cachedRefreshToken = token;
    try {
      await _secureStore.write(refreshTokenStorageKey, token);
      if (_allowInsecureFallback) {
        final fallbackStore = await _fallbackStoreFactory();
        await fallbackStore.remove(refreshTokenStorageKey);
      }
    } catch (error, stackTrace) {
      final fallbackStore = await _fallbackFor(
        'write',
        error: error,
        stackTrace: stackTrace,
      );
      if (fallbackStore == null) return;
      await fallbackStore.setString(refreshTokenStorageKey, token);
    }
  }

  Future<String?> readRefreshToken() async {
    final cachedToken = _cachedRefreshToken;
    if (cachedToken != null && cachedToken.isNotEmpty) {
      return cachedToken;
    }

    try {
      final value = await _secureStore.read(refreshTokenStorageKey);
      if (value != null && value.isNotEmpty) {
        _cachedRefreshToken = value;
        return value;
      }
    } catch (error, stackTrace) {
      final fallbackStore = await _fallbackFor(
        'read',
        error: error,
        stackTrace: stackTrace,
      );
      if (fallbackStore == null) {
        return _cachedRefreshToken;
      }
      final fallbackValue = await fallbackStore.getString(refreshTokenStorageKey);
      if (fallbackValue != null && fallbackValue.isNotEmpty) {
        _cachedRefreshToken = fallbackValue;
      }
      return fallbackValue;
    }

    if (!_allowInsecureFallback) {
      return null;
    }

    final fallbackStore = await _fallbackStoreFactory();
    final fallbackValue = await fallbackStore.getString(refreshTokenStorageKey);
    if (fallbackValue != null && fallbackValue.isNotEmpty) {
      _cachedRefreshToken = fallbackValue;
    }
    return fallbackValue;
  }

  Future<void> clearRefreshToken() async {
    _cachedRefreshToken = null;
    try {
      await _secureStore.delete(refreshTokenStorageKey);
    } catch (error, stackTrace) {
      final fallbackStore = await _fallbackFor(
        'delete',
        error: error,
        stackTrace: stackTrace,
      );
      if (fallbackStore == null) return;
      await fallbackStore.remove(refreshTokenStorageKey);
      return;
    }

    if (_allowInsecureFallback) {
      final fallbackStore = await _fallbackStoreFactory();
      await fallbackStore.remove(refreshTokenStorageKey);
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
