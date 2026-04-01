import { describe, test, expect, mock, beforeEach } from 'bun:test';
import express from 'express';
import request from 'supertest';

// Mock store + sandboxManager before importing app
const mockGetRecord = mock(() => Promise.resolve({
  sandbox_id: 'test-sandbox',
  sandbox_name: 'test',
  sandbox_state: 'started',
  dashboard_url: 'http://localhost:18789',
  signed_url: null,
  standard_url: 'http://localhost:18789',
  preview_token: null,
  gateway_token: 'tok',
  gateway_port: 18789,
  ssh_command: '',
  created_at: new Date().toISOString(),
  approved: false,
}));

const mockDockerExec = mock((_container: string, _cmd: string, _timeout?: number) =>
  Promise.resolve([true, ''] as [boolean, string])
);

const mockBunSpawnSync = mock(() => ({
  exitCode: 0,
  stdout: Buffer.from(''),
  stderr: Buffer.from(''),
}));

// These tests validate the port detection logic in isolation
describe('Preview port detection logic', () => {
  test('parses docker port batch output correctly', () => {
    const stdout = [
      '3000/tcp -> 0.0.0.0:32770',
      '3001/tcp -> 0.0.0.0:32771',
      '8080/tcp -> 0.0.0.0:32772',
      '18789/tcp -> 0.0.0.0:32773',
    ].join('\n');

    const PREVIEW_PORTS = [3000, 3001, 3002, 4173, 5173, 5174, 8000, 8080];
    const portMappings: Record<number, number> = {};

    for (const line of stdout.split('\n')) {
      const match = line.match(/^(\d+)\/tcp\s+->\s+.*:(\d+)/);
      if (match) {
        const containerPort = parseInt(match[1], 10);
        const hostPort = parseInt(match[2], 10);
        if (PREVIEW_PORTS.includes(containerPort) && !isNaN(hostPort)) {
          portMappings[containerPort] = hostPort;
        }
      }
    }

    expect(portMappings).toEqual({
      3000: 32770,
      3001: 32771,
      8080: 32772,
    });
    // 18789 is NOT in PREVIEW_PORTS, should be excluded
    expect(portMappings[18789]).toBeUndefined();
  });

  test('parses bash /dev/tcp probe output correctly', () => {
    const probeOutput = '3000\n8080\n\n';

    const PREVIEW_PORTS = [3000, 3001, 3002, 4173, 5173, 5174, 8000, 8080];
    const activePorts: number[] = [];
    for (const line of probeOutput.split('\n')) {
      const port = parseInt(line.trim(), 10);
      if (!isNaN(port) && PREVIEW_PORTS.includes(port)) {
        activePorts.push(port);
      }
    }

    expect(activePorts).toEqual([3000, 8080]);
  });

  test('empty probe output returns no active ports', () => {
    const probeOutput = '\n';

    const PREVIEW_PORTS = [3000, 3001, 3002, 4173, 5173, 5174, 8000, 8080];
    const activePorts: number[] = [];
    for (const line of probeOutput.split('\n')) {
      const port = parseInt(line.trim(), 10);
      if (!isNaN(port) && PREVIEW_PORTS.includes(port)) {
        activePorts.push(port);
      }
    }

    expect(activePorts).toEqual([]);
  });

  test('filters non-PREVIEW_PORTS from probe output', () => {
    const probeOutput = '22\n80\n3000\n9999\n8080\n';

    const PREVIEW_PORTS = [3000, 3001, 3002, 4173, 5173, 5174, 8000, 8080];
    const activePorts: number[] = [];
    for (const line of probeOutput.split('\n')) {
      const port = parseInt(line.trim(), 10);
      if (!isNaN(port) && PREVIEW_PORTS.includes(port)) {
        activePorts.push(port);
      }
    }

    expect(activePorts).toEqual([3000, 8080]);
  });

  test('handles docker port with no mappings', () => {
    const stdout = '';
    const PREVIEW_PORTS = [3000, 3001, 3002, 4173, 5173, 5174, 8000, 8080];
    const portMappings: Record<number, number> = {};

    for (const line of stdout.split('\n')) {
      const match = line.match(/^(\d+)\/tcp\s+->\s+.*:(\d+)/);
      if (match) {
        const containerPort = parseInt(match[1], 10);
        const hostPort = parseInt(match[2], 10);
        if (PREVIEW_PORTS.includes(containerPort) && !isNaN(hostPort)) {
          portMappings[containerPort] = hostPort;
        }
      }
    }

    expect(portMappings).toEqual({});
  });

  test('handles IPv6 docker port output', () => {
    const stdout = '3000/tcp -> :::32770\n8080/tcp -> [::]:32772\n';
    const PREVIEW_PORTS = [3000, 3001, 3002, 4173, 5173, 5174, 8000, 8080];
    const portMappings: Record<number, number> = {};

    for (const line of stdout.split('\n')) {
      const match = line.match(/^(\d+)\/tcp\s+->\s+.*:(\d+)/);
      if (match) {
        const containerPort = parseInt(match[1], 10);
        const hostPort = parseInt(match[2], 10);
        if (PREVIEW_PORTS.includes(containerPort) && !isNaN(hostPort)) {
          portMappings[containerPort] = hostPort;
        }
      }
    }

    expect(portMappings).toEqual({ 3000: 32770, 8080: 32772 });
  });
});
