import 'package:dio/dio.dart';

/// Converts raw errors into user-friendly messages.
String formatError(dynamic error) {
  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
        return 'Connection timed out. Check your network.';
      case DioExceptionType.receiveTimeout:
        return 'Server took too long to respond. Try again.';
      case DioExceptionType.connectionError:
        return 'Could not reach the server. Is it running?';
      case DioExceptionType.badResponse:
        final code = error.response?.statusCode;
        if (code == 404) return 'Resource not found.';
        if (code == 401 || code == 403) return 'Not authorized.';
        if (code != null && code >= 500) {
          return 'Server error ($code). Try again later.';
        }
        return 'Request failed ($code).';
      default:
        return 'Connection failed. Check your network.';
    }
  }
  if (error is FormatException) {
    return 'Invalid response from server.';
  }
  final msg = error.toString();
  if (msg.contains('SocketException') || msg.contains('Connection refused')) {
    return 'Could not reach the server. Is it running?';
  }
  return 'Something went wrong. Please try again.';
}
