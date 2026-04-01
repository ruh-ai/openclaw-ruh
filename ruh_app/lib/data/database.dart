/// Barrel export for the data layer.
///
/// The offline cache uses shared_preferences (JSON serialization) rather than
/// raw SQLite or drift code-generation. The drift / sqlite3_flutter_libs
/// dependencies in pubspec.yaml are retained for potential future use (e.g.
/// full-text search over messages) but are not exercised by the current cache
/// implementation.
library;

export 'conversation_cache.dart';
