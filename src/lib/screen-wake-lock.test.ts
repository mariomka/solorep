import { describe, expect, it, vi } from "vitest";
import {
  ScreenWakeLockManager,
  type ScreenWakeLockProvider,
  type ScreenWakeLockSentinel,
  type VisibilitySource,
} from "./screen-wake-lock";

class FakeSentinel extends EventTarget implements ScreenWakeLockSentinel {
  released = false;
  readonly release = vi.fn(async () => {
    this.released = true;
    this.dispatchEvent(new Event("release"));
  });
}

class FakeVisibilitySource extends EventTarget implements VisibilitySource {
  visibilityState: DocumentVisibilityState = "visible";

  setVisibility(visibilityState: DocumentVisibilityState): void {
    this.visibilityState = visibilityState;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

function createProvider(...sentinels: FakeSentinel[]): ScreenWakeLockProvider {
  let requestIndex = 0;
  return {
    request: vi.fn(async () => {
      const sentinel = sentinels[requestIndex];
      requestIndex += 1;
      if (sentinel === undefined) {
        throw new Error("No fake sentinel configured");
      }
      return sentinel;
    }),
  };
}

describe("ScreenWakeLockManager", () => {
  it("acquires one lock and reuses it while active", async () => {
    const sentinel = new FakeSentinel();
    const provider = createProvider(sentinel);
    const visibility = new FakeVisibilitySource();
    const manager = new ScreenWakeLockManager(() => provider, visibility);

    await expect(manager.acquire()).resolves.toBe(true);
    await expect(manager.acquire()).resolves.toBe(true);

    expect(provider.request).toHaveBeenCalledExactlyOnceWith("screen");
    expect(manager.isActive()).toBe(true);
  });

  it("releases the lock and stops reacting to visibility", async () => {
    const sentinel = new FakeSentinel();
    const provider = createProvider(sentinel);
    const visibility = new FakeVisibilitySource();
    const manager = new ScreenWakeLockManager(() => provider, visibility);
    await manager.acquire();

    await manager.release();
    visibility.setVisibility("hidden");
    visibility.setVisibility("visible");

    expect(sentinel.release).toHaveBeenCalledOnce();
    expect(provider.request).toHaveBeenCalledOnce();
    expect(manager.isActive()).toBe(false);
  });

  it("waits until the document is visible before requesting", async () => {
    const sentinel = new FakeSentinel();
    const provider = createProvider(sentinel);
    const visibility = new FakeVisibilitySource();
    visibility.visibilityState = "hidden";
    const manager = new ScreenWakeLockManager(() => provider, visibility);

    await expect(manager.acquire()).resolves.toBe(false);
    expect(provider.request).not.toHaveBeenCalled();

    visibility.setVisibility("visible");
    await vi.waitFor(() => expect(manager.isActive()).toBe(true));
    expect(provider.request).toHaveBeenCalledOnce();
  });

  it("reacquires a platform-released lock after returning to visibility", async () => {
    const firstSentinel = new FakeSentinel();
    const secondSentinel = new FakeSentinel();
    const provider = createProvider(firstSentinel, secondSentinel);
    const visibility = new FakeVisibilitySource();
    const manager = new ScreenWakeLockManager(() => provider, visibility);
    await manager.acquire();

    visibility.setVisibility("hidden");
    await firstSentinel.release();
    expect(manager.isActive()).toBe(false);

    visibility.setVisibility("visible");
    await vi.waitFor(() => expect(manager.isActive()).toBe(true));
    expect(provider.request).toHaveBeenCalledTimes(2);
  });

  it("releases a lock that resolves after deactivation", async () => {
    const sentinel = new FakeSentinel();
    let resolveRequest: ((value: ScreenWakeLockSentinel) => void) | undefined;
    const requestPromise = new Promise<ScreenWakeLockSentinel>((resolve) => {
      resolveRequest = resolve;
    });
    const provider: ScreenWakeLockProvider = {
      request: vi.fn(() => requestPromise),
    };
    const visibility = new FakeVisibilitySource();
    const manager = new ScreenWakeLockManager(() => provider, visibility);

    const acquirePromise = manager.acquire();
    await manager.release();
    resolveRequest?.(sentinel);

    await expect(acquirePromise).resolves.toBe(false);
    expect(sentinel.release).toHaveBeenCalledOnce();
    expect(manager.isActive()).toBe(false);
  });

  it("degrades silently when wake lock is unsupported or rejected", async () => {
    const visibility = new FakeVisibilitySource();
    const unsupportedManager = new ScreenWakeLockManager(
      () => undefined,
      visibility,
    );
    const rejectedProvider: ScreenWakeLockProvider = {
      request: vi.fn(async () => {
        throw new Error("Denied");
      }),
    };
    const rejectedManager = new ScreenWakeLockManager(
      () => rejectedProvider,
      visibility,
    );

    await expect(unsupportedManager.acquire()).resolves.toBe(false);
    await expect(rejectedManager.acquire()).resolves.toBe(false);
  });
});
