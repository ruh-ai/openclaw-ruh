import { describe, expect, test, mock } from "bun:test";

// --- Mocks ---

const mockPush = mock(() => {});

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mock(() => {}), refresh: mock(() => {}) }),
  usePathname: () => "/authenticate",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

mock.module("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

mock.module("@/lib/utils/canonical", () => ({
  generateCanonicalMetadata: () => ({}),
}));

mock.module("@/components/shared/Logo", () => ({
  Logo: () => <div>Logo</div>,
}));

mock.module("@/components/shared/PrimaryButton", () => ({
  PrimaryButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

mock.module("@/app/api/auth", () => ({
  authApi: {
    login: mock(() => Promise.resolve()),
    register: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
  },
}));

mock.module("sonner", () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}));

// --- Auth Mode (logic file) ---

describe("resolveAuthMode", () => {
  test("returns 'external' when a URL is provided", async () => {
    const { resolveAuthMode } = await import("../auth-mode");
    expect(resolveAuthMode("https://auth.ruh.ai")).toBe("external");
  });

  test("returns 'local' when URL is empty string", async () => {
    const { resolveAuthMode } = await import("../auth-mode");
    expect(resolveAuthMode("")).toBe("local");
  });

  test("returns 'local' when URL is undefined", async () => {
    const { resolveAuthMode } = await import("../auth-mode");
    expect(resolveAuthMode(undefined)).toBe("local");
  });

  test("returns 'local' when URL is null", async () => {
    const { resolveAuthMode } = await import("../auth-mode");
    expect(resolveAuthMode(null)).toBe("local");
  });

  test("returns 'local' when URL is whitespace-only", async () => {
    const { resolveAuthMode } = await import("../auth-mode");
    expect(resolveAuthMode("   ")).toBe("local");
  });
});

// --- Interfaces (pure types, skip runtime testing) ---

describe("auth interfaces", () => {
  test("CarouselSlide interface module is importable", async () => {
    // interfaces.ts only exports types — verify it doesn't break on import
    const mod = await import("../interfaces");
    expect(mod).toBeDefined();
  });
});

// --- Auth Layout ---

describe("auth layout", () => {
  test("exports a default layout component", async () => {
    const mod = await import("../layout");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  test("exports metadata", async () => {
    const mod = await import("../layout");
    expect(mod.metadata).toBeDefined();
    expect(mod.metadata.title).toBe("Authentication");
  });
});

// --- Authenticate Page ---

describe("authenticate page", () => {
  test("exports a default page component", async () => {
    const mod = await import("../authenticate/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  test("exports metadata", async () => {
    const mod = await import("../authenticate/page");
    expect(mod.metadata).toBeDefined();
    expect(mod.metadata.title).toBe("Log In & Start Building");
  });
});

// --- AuthButton ---

describe("AuthButton", () => {
  test("exports a component", async () => {
    const { AuthButton } = await import("../_components/AuthButton");
    expect(AuthButton).toBeDefined();
    expect(typeof AuthButton).toBe("function");
  });
});

// --- ImageCarousel ---

describe("ImageCarousel", () => {
  test("exports a component and carousel data", async () => {
    const { ImageCarousel, carouselSlides } = await import(
      "../_components/ImageCarousel"
    );
    expect(ImageCarousel).toBeDefined();
    expect(typeof ImageCarousel).toBe("function");
    expect(Array.isArray(carouselSlides)).toBe(true);
    expect(carouselSlides.length).toBeGreaterThan(0);
  });

  test("each carousel slide has image and title", async () => {
    const { carouselSlides } = await import("../_components/ImageCarousel");
    for (const slide of carouselSlides) {
      expect(typeof slide.image).toBe("string");
      expect(slide.image.length).toBeGreaterThan(0);
      expect(typeof slide.title).toBe("string");
      expect(slide.title.length).toBeGreaterThan(0);
    }
  });
});

// --- LocalAuthForm ---

describe("LocalAuthForm", () => {
  test("exports a component", async () => {
    const { LocalAuthForm } = await import("../_components/LocalAuthForm");
    expect(LocalAuthForm).toBeDefined();
    expect(typeof LocalAuthForm).toBe("function");
  });
});
