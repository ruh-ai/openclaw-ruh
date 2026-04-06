import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/screens/chat/widgets/code_panel.dart';
import 'package:ruh_app/services/api_client.dart';
import 'package:ruh_app/services/workspace_service.dart';

class _NoopBackendClient implements BackendClient {
  @override
  Future<void> clearAccessToken() async {}

  @override
  Future<void> clearRefreshToken() async {}

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<String?> getRefreshToken() async => null;

  @override
  Future<Response<List<int>>> getBytes(
    String path, {
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
  Future<void> setAccessToken(String token) async {}

  @override
  Future<void> setRefreshToken(String token) async {}

  @override
  Stream<String> streamGet(String path) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamPost(String path, Map<String, dynamic> data) {
    throw UnimplementedError();
  }
}

class FakeWorkspaceService extends WorkspaceService {
  FakeWorkspaceService({required this.files})
    : super(client: _NoopBackendClient());

  final List<WorkspaceFileEntry> files;
  int listCalls = 0;

  @override
  Future<List<WorkspaceFileEntry>> listFiles(String sandboxId) async {
    listCalls += 1;
    return files;
  }
}

void main() {
  testWidgets('CodePanel refreshes the workspace file list on demand', (
    tester,
  ) async {
    final service = FakeWorkspaceService(
      files: const [
        WorkspaceFileEntry(path: 'SOUL.md', size: 128),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 600,
            height: 400,
            child: CodePanel(
              sandboxId: 'sandbox-1',
              service: service,
            ),
          ),
        ),
      ),
    );

    await tester.pump();
    await tester.pump();

    expect(service.listCalls, 1);
    expect(find.text('SOUL.md'), findsWidgets);

    await tester.tap(find.byTooltip('Refresh workspace files'));
    await tester.pump();

    expect(service.listCalls, 2);
  });
}
