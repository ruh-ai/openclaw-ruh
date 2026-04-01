import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMarketplace } from "../useMarketplace";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof mock>;

beforeEach(() => {
  mockFetch = mock(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ items: [], total: 0 }),
    } as Response),
  );
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("useMarketplace", () => {
  test("returns initial state", () => {
    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000" }),
    );
    expect(result.current.listings).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("fetchListings calls correct URL without params", async () => {
    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000" }),
    );

    await act(async () => {
      await result.current.fetchListings();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toStartWith("http://localhost:8000/api/marketplace/listings?");
  });

  test("fetchListings includes category and search params", async () => {
    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000" }),
    );

    await act(async () => {
      await result.current.fetchListings({ category: "marketing", search: "ads" });
    });

    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("category=marketing");
    expect(calledUrl).toContain("search=ads");
  });

  test("fetchListings includes page and limit params", async () => {
    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000" }),
    );

    await act(async () => {
      await result.current.fetchListings({ page: 2, limit: 10 });
    });

    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("page=2");
    expect(calledUrl).toContain("limit=10");
  });

  test("fetchListings updates listings and total on success", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [{ id: "l1", title: "Agent One" }],
            total: 1,
          }),
      } as Response),
    );

    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000" }),
    );

    await act(async () => {
      await result.current.fetchListings();
    });

    expect(result.current.listings).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(result.current.error).toBeNull();
  });

  test("fetchListings sets error on non-ok response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500 } as Response),
    );

    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000" }),
    );

    await act(async () => {
      await result.current.fetchListings();
    });

    expect(result.current.error).toBe("Failed to fetch listings");
    expect(result.current.listings).toEqual([]);
  });

  test("fetchListings sets error on network failure", async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error("Network down")));

    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000" }),
    );

    await act(async () => {
      await result.current.fetchListings();
    });

    expect(result.current.error).toBe("Network down");
  });

  test("includes Authorization header when accessToken is provided", async () => {
    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000", accessToken: "my-token" }),
    );

    await act(async () => {
      await result.current.fetchListings();
    });

    const callArgs = mockFetch.mock.calls[0] as unknown[];
    const opts = callArgs[1] as { headers: Record<string, string> };
    expect(opts.headers.Authorization).toBe("Bearer my-token");
  });

  test("omits Authorization header when accessToken is null", async () => {
    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000", accessToken: null }),
    );

    await act(async () => {
      await result.current.fetchListings();
    });

    const callArgs = mockFetch.mock.calls[0] as unknown[];
    const opts = callArgs[1] as { headers: Record<string, string> };
    expect(opts.headers.Authorization).toBeUndefined();
  });

  test("getListing returns listing data on success", async () => {
    const listingData = { id: "l1", title: "Test", slug: "test" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(listingData),
      } as Response),
    );

    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000" }),
    );

    let listing: unknown;
    await act(async () => {
      listing = await result.current.getListing("test");
    });

    expect(listing).toEqual(listingData);
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toBe("http://localhost:8000/api/marketplace/listings/test");
  });

  test("getListing returns null on non-ok response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 404 } as Response),
    );

    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000" }),
    );

    let listing: unknown;
    await act(async () => {
      listing = await result.current.getListing("nonexistent");
    });

    expect(listing).toBeNull();
  });

  test("installListing sends POST request", async () => {
    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000", accessToken: "tok" }),
    );

    await act(async () => {
      await result.current.installListing("l1");
    });

    const callArgs = mockFetch.mock.calls[0] as unknown[];
    expect(callArgs[0]).toBe("http://localhost:8000/api/marketplace/listings/l1/install");
    expect((callArgs[1] as { method: string }).method).toBe("POST");
  });

  test("uninstallListing sends DELETE request", async () => {
    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000", accessToken: "tok" }),
    );

    await act(async () => {
      await result.current.uninstallListing("l1");
    });

    const callArgs = mockFetch.mock.calls[0] as unknown[];
    expect(callArgs[0]).toBe("http://localhost:8000/api/marketplace/listings/l1/install");
    expect((callArgs[1] as { method: string }).method).toBe("DELETE");
  });

  test("installListing throws on non-ok response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 403 } as Response),
    );

    const { result } = renderHook(() =>
      useMarketplace({ apiUrl: "http://localhost:8000" }),
    );

    let error: Error | undefined;
    await act(async () => {
      try {
        await result.current.installListing("l1");
      } catch (e) {
        error = e as Error;
      }
    });

    expect(error?.message).toBe("Install failed");
  });
});
