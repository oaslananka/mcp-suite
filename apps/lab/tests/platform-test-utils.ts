export function stubProcessPlatform(platform: NodeJS.Platform): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  if (!descriptor) {
    throw new Error("process.platform descriptor is unavailable");
  }

  Object.defineProperty(process, "platform", {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    value: platform,
  });

  return () => Object.defineProperty(process, "platform", descriptor);
}
