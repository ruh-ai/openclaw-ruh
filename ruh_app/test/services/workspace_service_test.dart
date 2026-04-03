import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/services/workspace_service.dart';

import '../test_support/fake_backend_client.dart';

void main() {
  late FakeBackendClient client;
  late WorkspaceService service;

  setUp(() {
    client = FakeBackendClient();
    service = WorkspaceService(client: client);
  });

  group('listFiles', () {
    test('returns WorkspaceFileEntry list from Map entries', () async {
      client.getResponseData = {
        'files': [
          {'path': 'src/main.dart', 'size': 1024},
        ],
      };

      final files = await service.listFiles('sb1');

      expect(files, hasLength(1));
      expect(files.first.path, 'src/main.dart');
      expect(files.first.size, 1024);
      expect(
        client.lastGetPath,
        '/api/sandboxes/sb1/workspace/files',
      );
    });

    test('returns WorkspaceFileEntry list from plain string entries', () async {
      client.getResponseData = {
        'files': ['src/main.dart'],
      };

      final files = await service.listFiles('sb1');

      expect(files, hasLength(1));
      expect(files.first.path, 'src/main.dart');
      expect(files.first.size, isNull);
    });

    test('returns empty list on error', () async {
      client.getError = Exception('network error');

      final files = await service.listFiles('sb1');

      expect(files, isEmpty);
    });

    test('returns empty list when data is null', () async {
      client.getResponseData = null;

      final files = await service.listFiles('sb1');

      expect(files, isEmpty);
    });
  });

  group('getFileContent', () {
    test('returns file content string', () async {
      client.getResponseData = {'content': 'hello'};

      final content = await service.getFileContent('sb1', 'src/main.dart');

      expect(content, 'hello');
      expect(client.lastGetPath, '/api/sandboxes/sb1/workspace/file');
      expect(client.lastGetQuery?['path'], 'src/main.dart');
    });

    test('returns empty string on error', () async {
      client.getError = Exception('not found');

      final content = await service.getFileContent('sb1', 'src/main.dart');

      expect(content, isEmpty);
    });
  });

  group('getPreviewPorts', () {
    test('returns list of PreviewPort', () async {
      client.getResponseData = {
        'ports': [
          {'port': 3000, 'label': 'web', 'url': 'http://localhost:3000'},
        ],
      };

      final ports = await service.getPreviewPorts('sb1');

      expect(ports, hasLength(1));
      expect(ports.first.port, 3000);
      expect(ports.first.label, 'web');
      expect(ports.first.url, 'http://localhost:3000');
      expect(client.lastGetPath, '/api/sandboxes/sb1/preview/ports');
    });

    test('returns empty list on error', () async {
      client.getError = Exception('timeout');

      final ports = await service.getPreviewPorts('sb1');

      expect(ports, isEmpty);
    });
  });

  group('WorkspaceFileEntry', () {
    test('name returns last path segment', () {
      const entry = WorkspaceFileEntry(path: 'src/lib/main.dart');
      expect(entry.name, 'main.dart');
    });

    test('name returns full path when no separators', () {
      const entry = WorkspaceFileEntry(path: 'main.dart');
      expect(entry.name, 'main.dart');
    });

    test('depth counts path separators', () {
      const entry = WorkspaceFileEntry(path: 'src/lib/main.dart');
      expect(entry.depth, 2);
    });

    test('depth is 0 for empty path', () {
      const entry = WorkspaceFileEntry(path: '');
      expect(entry.depth, 0);
    });

    test('depth is 0 for single segment', () {
      const entry = WorkspaceFileEntry(path: 'main.dart');
      expect(entry.depth, 0);
    });
  });
}
