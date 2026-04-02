import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/services/access_token_store.dart';

class FakeSecureStore implements SecureTokenStore {
  final Map<String, String> values = {};
  Object? writeError;
  Object? readError;
  Object? deleteError;

  @override
  Future<void> write(String key, String value) async {
    if (writeError != null) throw writeError!;
    values[key] = value;
  }

  @override
  Future<String?> read(String key) async {
    if (readError != null) throw readError!;
    return values[key];
  }

  @override
  Future<void> delete(String key) async {
    if (deleteError != null) throw deleteError!;
    values.remove(key);
  }
}

class FakeFallbackStore implements FallbackTokenStore {
  final Map<String, String> values = {};

  @override
  Future<void> setString(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<String?> getString(String key) async {
    return values[key];
  }

  @override
  Future<void> remove(String key) async {
    values.remove(key);
  }
}

void main() {
  group('AccessTokenStore', () {
    test('uses secure storage when it is available', () async {
      final secureStore = FakeSecureStore();
      final fallbackStore = FakeFallbackStore();
      final store = AccessTokenStore(
        secureStore: secureStore,
        fallbackStoreFactory: () async => fallbackStore,
        allowInsecureFallback: true,
      );

      await store.write('access-123');

      expect(secureStore.values['ruh_access_token'], 'access-123');
      expect(await store.read(), 'access-123');
      expect(fallbackStore.values, isEmpty);
    });

    test('falls back when secure storage write fails on local desktop builds', () async {
      final secureStore = FakeSecureStore()
        ..writeError = Exception('keychain write failed')
        ..readError = Exception('keychain read failed')
        ..deleteError = Exception('keychain delete failed');
      final fallbackStore = FakeFallbackStore();
      final store = AccessTokenStore(
        secureStore: secureStore,
        fallbackStoreFactory: () async => fallbackStore,
        allowInsecureFallback: true,
      );

      await store.write('access-456');

      expect(fallbackStore.values['ruh_access_token'], 'access-456');
      expect(await store.read(), 'access-456');

      await store.clear();

      expect(fallbackStore.values, isEmpty);
    });

    test(
      'keeps tokens available in memory for the current session when persistence is unavailable',
      () async {
        final secureStore = FakeSecureStore()
          ..writeError = Exception('keychain write failed')
          ..readError = Exception('keychain read failed')
          ..deleteError = Exception('keychain delete failed');
        final store = AccessTokenStore(
          secureStore: secureStore,
          allowInsecureFallback: false,
        );

        await store.write('access-789');
        await store.writeRefreshToken('refresh-789');

        expect(await store.read(), 'access-789');
        expect(await store.readRefreshToken(), 'refresh-789');

        await store.clear();
        await store.clearRefreshToken();

        expect(await store.read(), isNull);
        expect(await store.readRefreshToken(), isNull);
      },
    );
  });
}
