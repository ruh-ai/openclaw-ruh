import 'dart:collection';
import 'dart:developer' as dev;

import 'package:flutter/foundation.dart';

/// Log level severity.
enum LogLevel { debug, info, warn, error }

/// A single log entry.
class LogEntry {
  final DateTime timestamp;
  final LogLevel level;
  final String tag;
  final String message;
  final Object? error;
  final StackTrace? stackTrace;

  const LogEntry({
    required this.timestamp,
    required this.level,
    required this.tag,
    required this.message,
    this.error,
    this.stackTrace,
  });

  String get formatted {
    final ts = '${timestamp.hour.toString().padLeft(2, '0')}:'
        '${timestamp.minute.toString().padLeft(2, '0')}:'
        '${timestamp.second.toString().padLeft(2, '0')}.'
        '${timestamp.millisecond.toString().padLeft(3, '0')}';
    final lvl = level.name.toUpperCase().padRight(5);
    final err = error != null ? ' | $error' : '';
    return '[$ts] $lvl [$tag] $message$err';
  }
}

/// Central logger with in-memory ring buffer for debug overlay.
class Log {
  Log._();

  static final List<LogEntry> _entries = [];
  static const int _maxEntries = 500;
  static LogLevel minLevel = kDebugMode ? LogLevel.debug : LogLevel.info;

  /// All stored log entries (newest last).
  static UnmodifiableListView<LogEntry> get entries =>
      UnmodifiableListView(_entries);

  /// Stream of new entries for the debug overlay.
  static final List<void Function(LogEntry)> _listeners = [];

  static void addListener(void Function(LogEntry) listener) {
    _listeners.add(listener);
  }

  static void removeListener(void Function(LogEntry) listener) {
    _listeners.remove(listener);
  }

  static void _log(LogLevel level, String tag, String message,
      [Object? error, StackTrace? stackTrace]) {
    if (level.index < minLevel.index) return;

    final entry = LogEntry(
      timestamp: DateTime.now(),
      level: level,
      tag: tag,
      message: message,
      error: error,
      stackTrace: stackTrace,
    );

    _entries.add(entry);
    if (_entries.length > _maxEntries) {
      _entries.removeAt(0);
    }

    // Print to console
    dev.log(
      entry.formatted,
      name: 'Ruh',
      level: _dartLogLevel(level),
      error: error,
      stackTrace: stackTrace,
    );

    // Notify listeners (debug overlay)
    for (final listener in _listeners) {
      listener(entry);
    }
  }

  static int _dartLogLevel(LogLevel level) {
    switch (level) {
      case LogLevel.debug:
        return 500;
      case LogLevel.info:
        return 800;
      case LogLevel.warn:
        return 900;
      case LogLevel.error:
        return 1000;
    }
  }

  /// Log a debug message.
  static void d(String tag, String message) =>
      _log(LogLevel.debug, tag, message);

  /// Log an info message.
  static void i(String tag, String message) =>
      _log(LogLevel.info, tag, message);

  /// Log a warning.
  static void w(String tag, String message, [Object? error]) =>
      _log(LogLevel.warn, tag, message, error);

  /// Log an error.
  static void e(String tag, String message,
          [Object? error, StackTrace? stackTrace]) =>
      _log(LogLevel.error, tag, message, error, stackTrace);

  /// Clear all entries.
  static void clear() => _entries.clear();
}
