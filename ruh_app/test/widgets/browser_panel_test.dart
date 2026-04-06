import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/providers/chat_provider.dart';
import 'package:ruh_app/screens/chat/widgets/browser_panel.dart';
import 'package:ruh_app/services/api_client.dart';

class FakeBackendClient implements BackendClient {
  List<int>? bytesResponseData;
  String? lastGetBytesPath;
  int getBytesCalls = 0;

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    getBytesCalls += 1;
    lastGetBytesPath = path;
    return Response<List<int>>(
      data: bytesResponseData,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> postLongRunning<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamPost(String path, Map<String, dynamic> data) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamGet(String path) {
    throw UnimplementedError();
  }

  @override
  Future<void> setAccessToken(String token) async {}

  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<void> clearAccessToken() async {}

  @override
  Future<void> setRefreshToken(String token) async {}

  @override
  Future<String?> getRefreshToken() async => null;

  @override
  Future<void> clearRefreshToken() async {}
}

void main() {
  testWidgets('BrowserPanel requests raw screenshot bytes from the backend', (
    tester,
  ) async {
    final client = FakeBackendClient()
      ..bytesResponseData = base64Decode(
        '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',
      );

    await tester.pumpWidget(
      MaterialApp(
        home: SizedBox(
          width: 600,
          height: 400,
          child: BrowserPanel(
            sandboxId: 'sandbox-1',
            browserState: const BrowserWorkspaceState(),
            client: client,
            pollInterval: Duration(days: 1),
          ),
        ),
      ),
    );

    await tester.pump();

    expect(
      client.lastGetBytesPath,
      '/api/sandboxes/sandbox-1/browser/screenshot',
    );
    expect(client.getBytesCalls, 1);
    expect(find.byType(Image), findsOneWidget);
    expect(find.text('Browser not connected'), findsNothing);

    await tester.tap(find.byTooltip('Refresh browser'));
    await tester.pump();

    expect(client.getBytesCalls, 2);
  });
}
