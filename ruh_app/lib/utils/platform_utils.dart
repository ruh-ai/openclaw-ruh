import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

/// Platform detection helpers for adaptive UI.
class PlatformUtils {
  PlatformUtils._();

  static bool get isMobile =>
      !kIsWeb && (Platform.isIOS || Platform.isAndroid);

  static bool get isDesktop =>
      !kIsWeb && (Platform.isMacOS || Platform.isWindows || Platform.isLinux);

  static bool get isIOS => !kIsWeb && Platform.isIOS;

  static bool get isAndroid => !kIsWeb && Platform.isAndroid;

  static bool get isWeb => kIsWeb;
}
