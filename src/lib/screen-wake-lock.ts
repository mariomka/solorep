export interface ScreenWakeLockSentinel {
  readonly released: boolean;
  release: () => Promise<void>;
  addEventListener: (
    type: "release",
    listener: () => void,
    options?: AddEventListenerOptions,
  ) => void;
}

export interface ScreenWakeLockProvider {
  request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
}

export interface VisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
}

export class ScreenWakeLockManager {
  private readonly getProvider: () => ScreenWakeLockProvider | undefined;
  private readonly visibilitySource: VisibilitySource | undefined;
  private shouldHoldLock = false;
  private isListeningForVisibility = false;
  private sentinel: ScreenWakeLockSentinel | undefined;
  private pendingRequest: Promise<boolean> | undefined;

  constructor(
    getProvider: () => ScreenWakeLockProvider | undefined,
    visibilitySource: VisibilitySource | undefined,
  ) {
    this.getProvider = getProvider;
    this.visibilitySource = visibilitySource;
  }

  readonly handleVisibilityChange = (): void => {
    const shouldReacquire =
      this.shouldHoldLock &&
      this.visibilitySource?.visibilityState === "visible" &&
      !this.isActive();
    if (shouldReacquire) {
      void this.requestLock();
    }
  };

  async acquire(): Promise<boolean> {
    this.shouldHoldLock = true;
    this.startListeningForVisibility();
    return this.requestLock();
  }

  async release(): Promise<void> {
    this.shouldHoldLock = false;
    this.stopListeningForVisibility();

    const sentinel = this.sentinel;
    this.sentinel = undefined;
    const shouldRelease = sentinel !== undefined && !sentinel.released;
    if (!shouldRelease) {
      return;
    }

    try {
      await sentinel.release();
    } catch {
      // The platform may revoke a lock between the state check and release().
    }
  }

  isActive(): boolean {
    return this.sentinel !== undefined && !this.sentinel.released;
  }

  private startListeningForVisibility(): void {
    const canListen =
      this.visibilitySource !== undefined && !this.isListeningForVisibility;
    if (!canListen) {
      return;
    }

    this.visibilitySource.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.isListeningForVisibility = true;
  }

  private stopListeningForVisibility(): void {
    const shouldStopListening =
      this.visibilitySource !== undefined && this.isListeningForVisibility;
    if (!shouldStopListening) {
      return;
    }

    this.visibilitySource.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.isListeningForVisibility = false;
  }

  private requestLock(): Promise<boolean> {
    if (this.isActive()) {
      return Promise.resolve(true);
    }

    if (this.pendingRequest !== undefined) {
      return this.pendingRequest;
    }

    const provider = this.getProvider();
    const isVisible = this.visibilitySource?.visibilityState === "visible";
    const canRequest =
      this.shouldHoldLock && provider !== undefined && isVisible;
    if (!canRequest) {
      return Promise.resolve(false);
    }

    this.pendingRequest = this.requestNewLock(provider);
    return this.pendingRequest;
  }

  private async requestNewLock(
    provider: ScreenWakeLockProvider,
  ): Promise<boolean> {
    try {
      const sentinel = await provider.request("screen");
      const isVisible = this.visibilitySource?.visibilityState === "visible";
      const shouldKeepLock =
        this.shouldHoldLock && isVisible && !sentinel.released;
      if (!shouldKeepLock) {
        if (!sentinel.released) {
          await sentinel.release();
        }
        return false;
      }

      this.sentinel = sentinel;
      sentinel.addEventListener(
        "release",
        () => {
          const isCurrentSentinel = this.sentinel === sentinel;
          if (isCurrentSentinel) {
            this.sentinel = undefined;
          }
        },
        { once: true },
      );
      return true;
    } catch {
      return false;
    } finally {
      this.pendingRequest = undefined;
    }
  }
}

function getBrowserWakeLockProvider(): ScreenWakeLockProvider | undefined {
  const isNavigatorAvailable = typeof navigator !== "undefined";
  if (!isNavigatorAvailable) {
    return undefined;
  }

  const navigatorWithWakeLock = navigator as unknown as {
    wakeLock?: ScreenWakeLockProvider;
  };
  return navigatorWithWakeLock.wakeLock;
}

const browserVisibilitySource =
  typeof document === "undefined" ? undefined : document;

export const workoutScreenWakeLock = new ScreenWakeLockManager(
  getBrowserWakeLockProvider,
  browserVisibilitySource,
);
